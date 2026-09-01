'use strict';
/* The whole battery, in one command: build, then every checker in turn, then one table.

   Sequential on purpose. The checkers each launch browsers and each serve their own root on
   an ephemeral port; run in parallel they contend for CPU, and a tap-target or fold
   measurement taken on a starved machine is a flaky red that teaches people to re-run until
   green. A slow honest gate beats a fast unreliable one.

   Output is streamed, not captured-then-printed: a battery that goes quiet for ten minutes
   is a battery nobody waits for. The summary is rebuilt from each checker's own finish()
   stamp, so the table can never claim a denominator the checker did not print.

   Every argument is forwarded to every checker, so `npm test -- --engines chromium
   --shots 0` narrows the whole battery at once. This runner's own three flags are the
   exception: --only, --record and --record-to are consumed here and never forwarded, because
   a checker handed a flag it does not know either rejects it or, worse, ignores it silently.
   --record takes no value in either spelling: a path handed to it would otherwise fall
   through to the checkers as a positional and poison the record's own argv, which is the key
   two records are compared on. So it is an error naming --record-to, not a silent drop.

   --record is opt-in and adds files, never lines: without it, what this prints is what it has
   always printed, byte for byte. The printed stamps are this repo's receipts and they may not
   vary with a flag. The record is the same run in machine-readable form -- verdicts,
   denominators, per-checker wall time, and the environment it happened in, including whether
   the working tree was dirty (scripts/compare-runs.js gitDirty, which is where the exact
   meaning of that flag is written down), which no printed stamp says. Beside it goes a
   .stdout.txt with the run's whole stdout, so a later diff has the rows and not only the
   counts.

   The record also carries the scope knobs read from the environment, because a run narrowed by
   PAGES or SITE_ROOT leaves no trace in argv and would otherwise compare as apples to apples
   against a full one. `engines` is the set the checkers will resolve, not proof that any of
   them launched a browser: a --only links run records chromium+webkit and launches nothing.

   Records land in runs/ and this script never overwrites one it did not name: a colliding
   default name takes a -2 suffix. --record-to writes exactly where it is pointed, which is
   how scripts/measure-repeatability.js collects a series. Committing a record is a human
   decision; nothing here commits anything. A record that cannot be written is reported on
   stderr and changes no exit code: an opt-in recorder that turns a green battery red would be
   a gate nobody trusts.

   --only runs a named subset. Its battery line, its record and its record's FILENAME all say
   partial, because a subset that can pass for the full battery is a false receipt waiting to
   be quoted — and the filename is the string that gets committed and linked. An unknown name
   is an error, never a silent skip.

   Usage: node scripts/run-checks.js [--only name,name] [--record | --record-to FILE]
                                     [checker args...] */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const S = require('../checks/lib/site');
const { gitSha } = require('../checks/lib/report');
const { gitDirty } = require('./compare-runs');

const REPO = path.resolve(__dirname, '..');
const RAW = process.argv.slice(2);

const PASSTHROUGH = [];
let only = null;
let recordTo = null;
let record = false;
for (let i = 0; i < RAW.length; i++) {
  const a = RAW[i];
  const eq = a.startsWith('--') ? a.indexOf('=') : -1;
  const key = a.startsWith('--') ? (eq < 0 ? a.slice(2) : a.slice(2, eq)) : null;
  if (key !== 'only' && key !== 'record' && key !== 'record-to') { PASSTHROUGH.push(a); continue; }
  if (key === 'record') {
    /* A value here is always a mistake, and a silently dropped one is the worst kind: the
       record would land at the default path while the value went to the checkers as a
       positional. Both spellings are caught, and the message names the flag that does take
       a path. */
    const stray = eq >= 0 ? a.slice(eq + 1) : (RAW[i + 1] !== undefined && !RAW[i + 1].startsWith('--') ? RAW[i + 1] : null);
    if (stray !== null) {
      console.log(`--record takes no value; the record's name is derived from the run. Did you mean --record-to ${stray}?`);
      console.log(`(if ${JSON.stringify(stray)} is a checker argument, put it before --record)`);
      process.exit(2);
    }
    record = true; continue;
  }
  /* Value in either spelling, and a missing value is an error rather than a default: "run
     everything" and "record nowhere" are already what happens with no flag at all. */
  const v = eq < 0 ? (RAW[i + 1] !== undefined && !RAW[i + 1].startsWith('--') ? RAW[++i] : null) : a.slice(eq + 1);
  if (!v) { console.log(`--${key} needs a value`); process.exit(2); }
  if (key === 'only') only = v;
  else { record = true; recordTo = path.resolve(REPO, v); }
}

const CHECKS = [
  ['links', 'checks/check-links.js', []],
  ['viewports', 'checks/measure-viewports.js', []],
  ['contrast', 'checks/check-contrast.js', []],
  ['motion', 'checks/check-motion.js', []],
  ['harden', 'checks/check-harden.js', []],
  ['hero', 'checks/check-hero.js', []],
  /* --local spawns the fixture origin from scripts/serve-fixture.js. The gate has no
     default URL by design, so the battery must name one or the checker prints usage. */
  ['deploy', 'checks/check-deploy.js', ['--local']],
];

const SELECTED = (() => {
  if (only === null) return CHECKS;
  const names = only.split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = names.filter((n) => !CHECKS.some((c) => c[0] === n));
  if (!names.length || unknown.length) {
    console.log(`${unknown.length ? `unknown checker(s): ${unknown.join(', ')}` : '--only named no checker'}\nknown: ${CHECKS.map((c) => c[0]).join(', ')}`);
    process.exit(2);
  }
  return CHECKS.filter((c) => names.includes(c[0]));
})();

/* The engine set the checkers will resolve for themselves, asked through their own helper so
   the record cannot drift from what actually ran. The filename says `full` when nothing
   narrowed the set; the record always names the resolved engines, so a run made with an
   explicit --engines chromium,webkit still compares against one made with no flag. */
const ENGINES = S.engines();
const ENGINES_NARROWED = S.ARGS.flags.engines !== undefined || process.env.ENGINES !== undefined;

/* The installed playwright first, the lockfile pin only as a fallback, and the fallback says
   so: node_modules is what drove the browsers, and a machine whose install has drifted from
   the lock would otherwise have its record overstate what ran. */
function playwrightVersion() {
  try { return require(path.join(REPO, 'node_modules/playwright/package.json')).version; }
  catch { /* not installed — fall through to the pin */ }
  try { return `${require(path.join(REPO, 'package-lock.json')).packages['node_modules/playwright'].version} (lock pin, not installed)`; }
  catch { return null; }
}

/* The scope knobs checks/lib/site.js and the checkers read from the environment. Every one of
   them changes WHAT gets measured while leaving argv untouched, which is the whole reason they
   are recorded: two runs typed identically, one of them under PAGES=index.html, are not two
   measurements of the same thing. Unset names are omitted rather than recorded as undefined,
   so a plain run records {} and compares clean against another plain run. */
const SCOPE_ENV = [
  'SITE_ROOT', 'PAGES', 'WIP', 'RIG_VIEWPORTS', 'ENGINES', 'SHOTS', 'SHOT_LABELS', 'OUT_DIR',
  'HERO_CELLS', 'STRICT', 'FOLD_CONTRACT', 'HERO_CONTRACT', 'HARNESS_SLOTS',
];
const scopeEnv = () => Object.fromEntries(SCOPE_ENV.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]));

/* The one line every checker ends on: "name: N/M cells OK — PASS|FAIL [stamp]". */
const FINISH = /^(\S+): (\d+)\/(\d+) cells OK\s+[-—]+\s+(PASS|FAIL)\s+\[(.*)\]\s*$/;

const transcript = [];
function say(s) {
  const line = `${s}\n`;
  process.stdout.write(line);
  if (record) transcript.push(line);
}

function run(script, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(REPO, script), ...args, ...PASSTHROUGH], {
      cwd: REPO,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let pending = '';
    let finish = null;
    /* Decoded, then buffered by line, not by chunk: a finish stamp that straddled two reads
       would be invisible to a per-chunk match and the table would report UNSTAMPED for a
       checker that printed its stamp perfectly well — and an em dash split across a chunk
       boundary would land mangled in the transcript. */
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      if (record) transcript.push(chunk);
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines) {
        const m = line.match(FINISH);
        if (m) finish = { ok: m[2], total: m[3], verdict: m[4], stamp: m[5] };
      }
    });
    child.on('close', (code) => {
      const m = pending.match(FINISH);
      if (m) finish = { ok: m[2], total: m[3], verdict: m[4], stamp: m[5] };
      resolve({ code: code === null ? 1 : code, finish });
    });
  });
}

/* One verdict expression, used by the table and by the record, so the two cannot disagree. */
const verdictOf = (r) => (r.finish ? r.finish.verdict : r.code === 0 ? 'UNSTAMPED' : 'ERROR');

/* Every component of a record's name is sanitized, the sha included: GIT_SHA is the documented
   way to stamp a tarball checkout, ref-shaped values with slashes are the normal CI spelling
   (demo/failing-gate being this repo's own), and an unsanitized one writes outside runs/. */
const safe = (s) => String(s).replace(/[^A-Za-z0-9+._-]/g, '_');

function recordPath(dirty) {
  if (recordTo) return recordTo;
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
  /* `full` is only ever a claim about the engine set, so the checker subset is spelled out
     beside it: a one-checker run whose filename says full is the exact masquerade --only is
     marked against everywhere else. Unknown cleanliness is not clean, and gets its own word. */
  const engines = ENGINES_NARROWED ? ENGINES.join('+') : 'full';
  const label = safe(only === null ? engines : `${engines}-only-${SELECTED.map((c) => c[0]).join('+')}`);
  const clean = dirty === null ? '-dirty-unknown' : dirty ? '-dirty' : '';
  const base = path.join(REPO, 'runs', `${stamp}-${safe(gitSha())}${clean}-${label}`);
  let file = `${base}.json`;
  for (let n = 2; fs.existsSync(file); n++) file = `${base}-${n}.json`;
  return file;
}

function writeRecord(startedAt, wallMs, results, red) {
  const dirty = gitDirty();
  const rec = {
    schemaVersion: 1,
    date: startedAt.toISOString(),
    sha: gitSha(),
    dirty,
    node: process.version,
    playwrightVersion: playwrightVersion(),
    os: { platform: os.platform(), release: os.release() },
    argv: PASSTHROUGH.slice(),
    scopeEnv: scopeEnv(),
    engines: ENGINES.join('+'),
    partial: only !== null,
    wallMs,
    checkers: results.map((r) => ({
      name: r.name,
      script: r.script,
      verdict: verdictOf(r),
      ok: r.finish ? Number(r.finish.ok) : null,
      total: r.finish ? Number(r.finish.total) : null,
      stamp: r.finish ? r.finish.stamp : null,
      exitCode: r.code,
      durationMs: r.durationMs,
    })),
    /* partial is repeated inside battery{} rather than left to the sibling key above: this
       object is the one a reader lifts on its own, and a green `pass` with no partial marker
       beside it is a full-battery claim. */
    battery: { pass: red.length === 0, red: red.map((r) => r.name), partial: only !== null },
  };
  const file = recordPath(dirty);
  const log = `${file.replace(/\.json$/, '')}.stdout.txt`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(rec, null, 2)}\n`);
  fs.writeFileSync(log, transcript.join(''));
  return { file, log };
}

(async () => {
  const startedAt = new Date();
  const t0 = Date.now();
  const build = await run('scripts/build.js', []);
  if (build.code !== 0) {
    console.error('\nbuild failed — the battery measures the BUILT site, so there is nothing to check.');
    /* No record: a battery that never ran has no verdicts, and a record of nothing would
       compare cleanly against another record of nothing. */
    if (record) console.error('no record written — the build failed before any checker ran.');
    process.exit(build.code);
  }

  const results = [];
  for (const [name, script, args] of SELECTED) {
    say(`\n${'='.repeat(78)}\n== ${name}  (node ${script}${[...args, ...PASSTHROUGH].map((a) => ' ' + a).join('')})\n${'='.repeat(78)}`);
    const t = Date.now();
    const { code, finish } = await run(script, args);
    results.push({ name, script, code, finish, durationMs: Date.now() - t });
  }

  const w = (s, n) => String(s).padEnd(n);
  say(`\n${'='.repeat(78)}\n== battery summary\n${'='.repeat(78)}`);
  say(`${w('checker', 12)}${w('verdict', 9)}${w('cells', 12)}stamp`);
  for (const r of results) {
    /* A checker that exited without printing a finish stamp is reported as UNSTAMPED, never
       folded into PASS: the table's whole job is to refuse to speak for a checker that did
       not report its own denominator. */
    if (!r.finish) say(`${w(r.name, 12)}${w(verdictOf(r), 9)}${w('-', 12)}exit ${r.code}, printed no finish line`);
    else say(`${w(r.name, 12)}${w(r.finish.verdict, 9)}${w(`${r.finish.ok}/${r.finish.total}`, 12)}${r.finish.stamp}`);
  }

  const red = results.filter((r) => r.code !== 0 || !r.finish || r.finish.verdict !== 'PASS');
  const partial = only === null ? '' : ` (partial: ${results.map((r) => r.name).join(', ')})`;
  say(red.length
    ? `\nbattery: ${results.length - red.length}/${results.length} checkers PASS — FAIL (${red.map((r) => r.name).join(', ')})${partial}`
    : `\nbattery: ${results.length}/${results.length} checkers PASS${partial}`);

  /* Written, then named — the pointer is not part of the run it points at, so it stays out of
     the .stdout.txt. */
  if (record) {
    try {
      const { file, log } = writeRecord(startedAt, Date.now() - t0, results, red);
      /* Relative when the record is in the repo, absolute when --record-to pointed outside it:
         a path spelled ../../../.. names nothing a reader can act on. */
      const rel = path.relative(REPO, file);
      console.log(`record: ${rel.startsWith('..') ? file : rel}  (+ ${path.basename(log)})`);
    } catch (e) {
      /* The battery above ran and its verdict stands. An unwritable runs/ is a fact about the
         disk, not about the site, and it may not change what this process exits with. */
      console.error(`record NOT written: ${e.message}`);
      console.error('the battery ran and the verdict above stands; only the recording failed.');
    }
  }
  process.exit(red.length ? 1 : 0);
})();
