'use strict';
/* The DEPLOY gate, not the build gate. Every other checker in this battery reads the built
   site off local disk and structurally cannot see the one failure mode that exists only in
   transit: an origin that serves something other than what was built, that lost a noindex
   mechanism on the way out, or whose submit endpoint is dead.

   Against a running origin, for every page in site.json:
     1. HTTP 200
     2. every response header contracts/deploy-contract.json declares, with its declared
        value — read from the contract file, never hardcoded here
     3. the in-body <meta name="robots" ... > the contract declares (the second, independent
        noindex mechanism: the header is the host's, the tag is the build's, and they fail in
        different ways — both must survive)
     4. served bytes vs the local built file. Reported as a loud STALE note by default, not a
        failure: a deployed origin is routinely older than the local build while work is in
        flight, and an instrument that fails on honest drift teaches people to stop running
        it. --require-current escalates drift to a failing row — that is the post-deploy mode,
        the one that answers "is the live origin THIS build".

   Then the submit endpoint the contract describes, three probes:
     a. valid POST                    -> 200 {ok:true, demo:true}   (demo:false would mean a
                                         real delivery fired from an instrument: a failure)
     b. POST missing a required field -> 400 (server-side validation; client-side is not a
                                         contract)
     c. POST with the honeypot filled -> 200, silent, no error leaked
   Probes are paced apart against a remote origin, because a deployed endpoint is normally
   rate-limited and this leg spends three of its budget.

   Usage — there is NO default origin, on purpose. An instrument that probes a URL nobody
   named is an instrument that can hit a stranger's host:
     node checks/check-deploy.js --local                 # spawn the fixture origin, probe it
     node checks/check-deploy.js --url https://origin    # probe a real deployment
     node checks/check-deploy.js --url ... --require-current   # drift = FAIL (post-deploy)
     node checks/check-deploy.js --local --root DIR      # compare against another build dir
     --root    the built site directory the served bytes are compared against, and the
               directory --local serves (default: <repo>/dist). site.json and the contract
               are always read from the repo, never from --root, so a control can point
               --root at a mutated copy while the contract stays pinned.
     --strict  escalate the warn-tier finding (byte drift) to a failing row, same as
               --require-current, which is the named alias for exactly that escalation.

   Known limit: redirects are NOT followed (redirect: 'manual'). A 301 to a canonical host is
   reported as a non-200. That is deliberate — following a redirect lets an origin answer for
   a URL other than the one declared, which is the failure this gate exists to catch — but it
   means an origin that legitimately redirects must be probed at its final host.

   In --local mode the byte-identity leg is near-vacuous: the server is serving the very
   directory the bytes are compared against, so it can only fail if the response is corrupted
   in flight. What makes that leg evidence is the negative control — a mutated copy of the
   build served on an ephemeral local port, probed with
   `--url http://127.0.0.1:<port> --negative --require-current`. --negative INVERTS the exit
   code: 0 only when the run failed, 1 loudly when the control passed, because a control that
   passes has proven the assertions are vacuous. */

const fs = require('fs');
const path = require('path');
const T = require('./lib/static');
const { report, gitSha } = require('./lib/report');

const argv = process.argv.slice(2);
const args = T.parseArgs();
const flag = (n) => argv.includes(n);
const value = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);

const STRICT = args.strict;
const LOCAL = flag('--local');
const rawUrl = value('--url');
const URL_ARG = rawUrl && !rawUrl.startsWith('--') ? rawUrl : null;
const NEGATIVE = flag('--negative');
const REQUIRE_CURRENT = flag('--require-current');
const ESCALATE_DRIFT = REQUIRE_CURRENT || STRICT;
/* static.js defaults --root to the repo; in this battery --root is the built site itself. */
const DIST = args.root === T.REPO ? path.join(T.REPO, 'dist') : args.root;
const CONTRACT = path.join(T.REPO, 'contracts', 'deploy-contract.json');

const USAGE = `check-deploy: name an origin — there is no default.

  node checks/check-deploy.js --local              serve <repo>/dist via scripts/serve-fixture.js and probe it
  node checks/check-deploy.js --url <origin>       probe a running deployment

  --require-current   byte drift against the local build becomes a failing row
  --strict            same escalation, battery-wide spelling
  --negative          invert the exit code (negative-control mode)
  --root <dir>        built site directory to compare against / serve (default <repo>/dist)`;

if (LOCAL === Boolean(URL_ARG)) {
  console.log(USAGE);
  process.exit(2);
}

const rel = (p) => path.relative(T.REPO, p).replace(/\\/g, '/') || '.';
const sleep = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const r = report('deploy');

/* Remote origins are paced; the local fixture has no rate limiter to respect. */
const PAGE_PACE_MS = LOCAL ? 0 : 300;
const FORM_PACE_MS = LOCAL ? 0 : 2000;
/* Honest instrument data — never a fabricated person. */
const PROBE_VALUE = 'site-quality-rig deploy probe';

function contractProblems(c) {
  const probs = [];
  if (!c.required_headers || typeof c.required_headers !== 'object') probs.push('required_headers missing — the header leg would assert nothing');
  if (!('byte_identity' in c)) probs.push('byte_identity missing — declare true, or false to declare the origin is not expected to match the build');
  if (!('form' in c)) probs.push('form missing — declare the endpoint, or null to declare this origin has none');
  if (/TODO/.test(JSON.stringify(c))) probs.push('carries a TODO slot — fill it or remove the key; a placeholder value asserts nothing');
  if (c.status !== 'FILLED') probs.push(`status is ${JSON.stringify(c.status)}, not "FILLED" — an unfilled contract asserts nothing`);
  return probs;
}

async function checkPages(base, contract) {
  const site = T.readJson(path.join(T.REPO, 'site.json'), null);
  if (!site || !Array.isArray(site.pages)) {
    r.fail('site.json', 'missing or carries no pages[] at the repo root — there is nothing to probe');
    return { pages: 0, drift: 0 };
  }
  const required = contract.required_headers || {};
  const robotsToken = contract.robots_meta || null;
  if (!robotsToken) r.note('contract declares no robots_meta — the in-body noindex mechanism is not asserted by this run');
  /* Declaration, not a skip: the run says out loud which leg it is not exercising. */
  if (contract.byte_identity === false) r.note('byte identity DECLARED OFF (byte_identity: false) — the contract states this origin is not expected to serve the built bytes verbatim');
  let drift = 0;

  for (const p of site.pages) {
    const url = base + p.path;
    const scope = `${p.file} (${url})`;
    const probs = [];
    let res;
    try {
      res = await fetch(url, { redirect: 'manual' });
    } catch (e) {
      r.fail(scope, `request failed: ${e.message}`);
      continue;
    }

    if (res.status !== 200) {
      const redirect = res.status >= 300 && res.status < 400 ? ` -> ${res.headers.get('location') || '(no Location)'}, not followed` : '';
      probs.push(`HTTP ${res.status}${redirect}, expected 200`);
    }

    for (const [key, want] of Object.entries(required)) {
      const got = res.headers.get(key.toLowerCase());
      if (got === null) probs.push(`response header ${key} absent — the contract declares "${want}"`);
      else if (got.trim() !== want) probs.push(`response header ${key} is "${got}" — the contract declares "${want}"`);
    }

    const body = await res.text();
    if (robotsToken && !new RegExp(`<meta[^>]+name=["']robots["'][^>]+${escapeRe(robotsToken)}`, 'i').test(body)) {
      probs.push(`served body carries no <meta name="robots" ... ${robotsToken}> — the build's own noindex mechanism did not survive the deploy`);
    }

    if (contract.byte_identity !== false) {
      const local = path.join(DIST, p.file);
      if (!fs.existsSync(local)) {
        probs.push(`no local ${rel(local)} to compare against — run \`node scripts/build.js\` first`);
      } else {
        const localBytes = fs.readFileSync(local);
        const servedBytes = Buffer.from(body, 'utf8');
        if (!servedBytes.equals(localBytes)) {
          drift++;
          const line = `served bytes != ${rel(local)} (${servedBytes.length} B served vs ${localBytes.length} B local)`;
          if (ESCALATE_DRIFT) probs.push(`${line} — the origin is not this build`);
          else r.note(`warn: STALE ${p.file}: ${line} — the origin is not local HEAD ${gitSha()}; honest drift, reported not failed. --require-current escalates it.`);
        }
      }
    }

    r.row(scope, probs);
    await sleep(PAGE_PACE_MS);
  }
  return { pages: site.pages.length, drift };
}

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON body — asserted by the caller */ }
  return { status: res.status, json };
}

async function checkForm(base, form) {
  const url = base + form.path;
  const required = form.required || [];
  const filled = Object.fromEntries(required.map((k) => [k, PROBE_VALUE]));

  const valid = await postJson(url, filled);
  {
    const probs = [];
    if (valid.status !== 200) probs.push(`HTTP ${valid.status}, expected 200`);
    if (!valid.json || valid.json.ok !== true) probs.push(`body ${JSON.stringify(valid.json)} — expected {ok:true, ...}`);
    else if (valid.json.demo !== true) probs.push(`demo flag is ${JSON.stringify(valid.json.demo)} — a real delivery may have fired from an instrument probe; the endpoint must answer demo:true`);
    r.row(`form valid POST (${url})`, probs);
  }
  await sleep(FORM_PACE_MS);

  const missing = await postJson(url, { probe: 'required fields omitted on purpose' });
  {
    const probs = [];
    if (missing.status !== 400) probs.push(`HTTP ${missing.status}, expected 400 — server-side validation of [${required.join(', ')}] is the contract; client-side validation is not`);
    r.row(`form missing-required POST (${url})`, probs);
  }
  await sleep(FORM_PACE_MS);

  if (!form.honeypot) {
    r.note('contract declares no honeypot field — the silent-drop probe is not exercised by this run');
    return 2;
  }
  const honey = await postJson(url, { ...filled, [form.honeypot]: PROBE_VALUE });
  {
    const probs = [];
    if (honey.status !== 200) probs.push(`HTTP ${honey.status}, expected a silent 200`);
    if (!honey.json || honey.json.ok !== true) probs.push(`body ${JSON.stringify(honey.json)} — a filled honeypot must answer a silent {ok:true}, so a bot never learns it was caught`);
    else if (honey.json.error) probs.push(`honeypot leaked an error: ${honey.json.error}`);
    r.row(`form honeypot POST (${url})`, probs);
  }
  return 3;
}

(async () => {
  const contract = T.readJson(CONTRACT, null);
  if (!contract) {
    r.fail(`contract ${rel(CONTRACT)}`, 'missing — the checker refuses to probe an origin blind');
    return r.finish({ contract: rel(CONTRACT) });
  }
  const shape = contractProblems(contract);
  if (shape.length) {
    r.row(`contract ${rel(CONTRACT)}`, shape);
    return r.finish({ contract: rel(CONTRACT) });
  }

  if ((LOCAL || contract.byte_identity !== false) && !fs.existsSync(DIST)) {
    r.fail(rel(DIST), 'no built site at this path — run `node scripts/build.js` first');
    return r.finish({ root: rel(DIST) });
  }

  let fixture = null;
  let base;
  if (LOCAL) {
    const { startFixtureServer } = require('../scripts/serve-fixture');
    fixture = await startFixtureServer({ root: DIST });
    base = fixture.url.replace(/\/+$/, '');
    r.note('--local: byte identity is near-vacuous here — this run serves the very directory it compares against. The negative control (a mutated copy served on an ephemeral port, probed with --negative) is what makes that leg evidence.');
  } else {
    base = String(URL_ARG).replace(/\/+$/, '');
  }

  let probes = 0;
  try {
    const { pages, drift } = await checkPages(base, contract);
    if (!contract.form) r.note('form endpoint DECLARED ABSENT (form: null) — this origin states it has no submit endpoint, so no POST is made');
    else probes = await checkForm(base, contract.form);

    r.note(`origin=${base} build=${rel(DIST)} pages=${pages} form-probes=${probes} drift=${drift}${REQUIRE_CURRENT ? ' MODE=require-current' : ''}${NEGATIVE ? ' MODE=negative-control' : ''}`);
    const bad = r.finish({
      origin: LOCAL ? 'local-fixture' : base,
      root: rel(DIST),
      pages,
      drift,
      form: contract.form ? `${probes}-probes` : 'declared-absent',
      strict: STRICT,
    });

    if (NEGATIVE) {
      process.exitCode = 0;
      if (!bad) {
        console.log('\n!! NEGATIVE CONTROL PASSED — the assertions are vacuous. That is a defect in check-deploy.js, not a green.');
        process.exitCode = 1;
      } else {
        console.log(`\nnegative control fired: ${bad} cell(s) failed against an origin known to be broken — the assertions are live. exit 0.`);
      }
    }
  } finally {
    if (fixture) await fixture.close();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
