'use strict';
/* The mirror image of controls/run-controls.js.

   That runner proves each checker CAN go red. This one proves three documented limits are
   real: cases where a genuine defect is injected and the checker stays GREEN, on purpose,
   because the defect sits outside what the instrument looks at.

   WHERE THOSE THREE ARE WRITTEN DOWN, stated exactly, because a suite about honest
   documentation is the last place that may round its own scope up. ONE of them —
   viewport-clip — is a bullet of README's "What this does not catch". The other two are the
   flip sides of two design choices README presents only as strengths: the matrix's reach
   (README: "a matrix that stops at 1920 structurally cannot see a defect whose own threshold
   is 1920") and the worst-decile grade. Neither cost is a README bullet. They are stated as
   limits in docs/CONTROLS.md and in the case headers beside this file, and nowhere else. So
   this suite executes ONE bullet of that README section, plus two limits the README does not
   currently admit to — not three README bullets.

   Why a suite for that at all. A limits section is the part of a document nobody can check.
   It is also the part most worth checking: a limit that has quietly stopped being true is a
   checker that got better and a document that got dishonest, and a limit that was never true
   is worse. Prose cannot tell those apart. A run can.

   THE PROBLEM WITH A MISS, and the whole design of this file: a green run is the weakest
   evidence there is. An injection whose selector rotted, a fixture that was never mutated, a
   page that failed to load — all of them produce exactly the green this suite is looking for.
   So a miss is never credited alone. Every case is pinned between two runs that cannot both be
   satisfied by an accident:

     (a) BASELINE — the checker on the pristine dist/, identical argv. Must exit 0. Without it
         a green mutated run says nothing, because the site might be green for its own reasons.
     (b) MISS     — the checker on the mutated copy, the SAME argv. One `args(root)` builder
         per case serves every leg of that case, so (a) and (b) cannot drift apart by an edit
         to one of them: they differ in the root they are handed and in nothing else. Must
         ALSO exit 0.
     (c) PROOF    — independent evidence that the defect injected in (b) is real: the same
         instrument, under a scope where it CAN see the defect, going red with the row this
         defect produces matched by verbatim substring. A red for the wrong reason fails the
         leg, exactly as in run-controls.js.

   Leg (c) is what stops this suite from being a machine for manufacturing green. Two of the
   three cases prove the defect on a TWIN fixture — same colours, one geometric declaration
   changed — because check-contrast.js's cells are a module constant with no knob to widen. The
   third does the stronger thing: the same bytes, the same argv, one environment variable, and
   the checker goes red. Where the proof leg changes the scope like that, the pristine build is
   run under the SAME scope first (c0) — otherwise a red at an unvisited cell could be the
   cell's fault rather than the defect's. Where the proof scope equals the baseline scope, leg
   (a) already is that run and no second one is taken.

   WHAT A FAILURE HERE MEANS. If leg (b) goes RED, the checker caught a defect this repo's
   documentation says it cannot catch. That is not a broken fixture: it is a false sentence in
   the README, and the documentation is what has to change. The failure text says so, because
   the reflex on a red is to fix the test.

   Vacuity is guarded the way the negative controls guard it — fixtures are built from the real
   dist/ by controls/fixture.js, which throws when a mutation changes zero bytes — plus three
   checks this suite needs and that one does not, because "green" is its expected outcome:

     * the SCOPE witness. The baseline's and the miss's finish lines must be identical once
       `root=` is stripped, so a miss that silently measured fewer cells is not credited as a
       miss. Leg (a) additionally has to carry the scope the case declares, so the case cannot
       quietly become a different case if the default matrix is edited.
     * the COUPLING witness, for the two TWIN cases. The miss page and the proof page are read
       back off disk and the miss's declared token is substituted for the proof's; the result
       must equal the proof page byte for byte. That is the runtime form of the sentence
       "geometry is the only thing that changed". Without it a neutralised miss fixture — a
       legible colour, a defect that never landed — would sail through as a demonstrated limit,
       because a page with no defect in it is green for the most boring reason there is, and
       the proof twin would still go red on its own.
     * the ENVIRONMENT is scrubbed before every child. Every knob these two checkers read
       (SITE_ROOT, PAGES, WIP, ENGINES, RIG_VIEWPORTS, SHOTS, SHOT_LABELS, OUT_DIR,
       FOLD_CONTRACT — resolved at checks/lib/site.js:24-26, where a CLI flag beats an
       environment variable which beats the default) is deleted, and only what a leg sets
       itself is put back. Otherwise an ambient RIG_VIEWPORTS would narrow the between-cells
       baseline AND its miss together — the scope witness cannot see that, because both legs
       shrink by the same amount — and the twelve-cell walk-past the case exists to demonstrate
       would never have run.

   These are the makeable ones, not all of them, and no fraction of anything is claimed. "Whole
   families of quality are out of scope" cannot be demonstrated by a fixture, and nothing here
   pretends otherwise.

   Usage: node controls/known-miss/run-known-miss.js [name ...]      (no names = all three) */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { gitSha } = require('../../checks/lib/report');

const HERE = __dirname;
const REPO = path.join(HERE, '..', '..');
const PRISTINE = path.join(REPO, 'dist');
const rel = (p) => path.relative(REPO, p).replace(/\\/g, '/') || '.';

/* `expect` fragments are VERBATIM from real runs of these fixtures, never guesses — the same
   rule run-controls.js states: an unrelated red must not be able to satisfy a proof leg.
   `sameLine` says the fragments are two halves of ONE printed row and must co-occur on it.
   `scope` is the part of leg (a)'s finish-line stamp the case is ABOUT — a contrast case that
   silently measured one cell instead of three, or a matrix case that measured one cell instead
   of twelve, is not the case its header describes, however green it came back.
   `twin` names the one token that may differ between the miss page and the proof page; a case
   whose proof leg re-runs the miss fixture itself has no twin and needs none. */
const CASES = [
  {
    name: 'viewport-clip',
    script: 'checks/check-contrast.js',
    limit: 'README "What this does not catch": contrast skips text that does not fit the viewport'
      + ' — the rect filter at check-contrast.js:113, the skip at :117, the three cells at :35-39',
    defect: 'a marquee ticker line, #f2f2f2 on #ffffff at 20px/400 = 1.12:1 against a 4.5:1 floor,'
      + ' on a text rect 1683.97px wide — wider than all three cells (320, 390, 1280)',
    args: (root) => ['--root', root, '--engines', 'chromium', '--pages', 'index.html'],
    scope: 'engines=chromium cells=3 pages=1',
    twin: { miss: 'white-space:nowrap', proof: 'white-space:normal' },
    proof: {
      fixture: 'proof',
      why: 'the same colours on a wrapped twin — one declaration different, white-space:normal,'
        + ' so every rect fits a cell and the node is graded',
      expect: [
        '1.12:1 < 4.5 (min 1.12, 20px/400)',
        'html.js>body>section.km-ticker>p.km-ticker-line',
      ],
      sameLine: true,
    },
  },
  {
    name: 'between-cells',
    script: 'checks/measure-viewports.js',
    limit: 'the viewport matrix is a list of twelve cells, not a range — checks/lib/site.js:64-82,'
      + ' resolved at :84-92; everything between two adjacent widths is unmeasured',
    defect: 'an in-flow 150vw block gated to 480-700px, a band inside the 414 -> 768 gap;'
      + ' display:none outside it, so `rendered` (measure-viewports.js:53-61) rejects it at every cell',
    args: (root) => ['--root', root, '--engines', 'chromium', '--pages', 'index.html', '--shots', '0'],
    scope: 'engines=chromium cells=12 pages=1',
    proof: {
      fixture: 'miss',
      env: { RIG_VIEWPORTS: '600x800' },
      why: 'the SAME fixture and the SAME argv, one in-gap cell added through the checker\'s own'
        + ' env knob (checks/lib/site.js:85) — nothing about the build changed',
      expect: [
        'h-overflow 300px (documentElement.scrollWidth 900 > 600)',
        'overflowing (unclipped): html.js>body>div.km-gap-band[0..900]',
      ],
      /* Two rows of one FAIL block, not one row: the scrollWidth reading and the offender list
         are separate lines (measure-viewports.js:263 and :265), so they cannot be required to
         co-occur. Same stated limitation as the viewports negative control. */
      sameLine: false,
    },
  },
  {
    name: 'sub-decile',
    script: 'checks/check-contrast.js',
    limit: 'the grade is the 10th-percentile pixel — WORST_DECILE at check-contrast.js:41, read at'
      + ' :189, compared at :323; a region under a tenth of the sampled pixels cannot move it',
    defect: '#333333 caption with a #0b0b0b stripe under 4% of its box = 3.79% of sampled pixels;'
      + ' 1.56:1 over the stripe, 12.63:1 over the rest, graded 12.63:1',
    args: (root) => ['--root', root, '--engines', 'chromium', '--pages', 'index.html'],
    scope: 'engines=chromium cells=3 pages=1',
    twin: { miss: '#0b0b0b 0 4%,rgba(0,0,0,0) 4%', proof: '#0b0b0b 0 60%,rgba(0,0,0,0) 60%' },
    proof: {
      fixture: 'proof',
      why: 'the same colours with the stripe widened to 60% of the box = 60.19% of sampled pixels,'
        + ' which is above the decile the grade reads',
      expect: [
        '1.56:1 < 4.5 (min 1.56, 13px/400)',
        'html.js>body>section.km-band>p.km-caption',
      ],
      sameLine: true,
    },
  },
];

/* Every environment knob the two checkers in this suite consult, resolved at
   checks/lib/site.js:24-26 — CLI flag, then environment variable, then default. Each leg pins
   its scope in argv, so an ambient value can only do harm here, and the sharpest harm is
   silent: RIG_VIEWPORTS=320x568 in the caller's shell narrows between-cells' baseline and its
   miss by the same amount, the scope witness sees two matching lines, and the twelve-cell
   walk-past the case is named after never happens. Scrubbed, then only a leg's own env put
   back. (SITE_ROOT is on the list even though --root always wins: a knob that this suite never
   wants to inherit does not need to be reachable to be worth deleting.) */
const CHECKER_ENV_KNOBS = [
  'SITE_ROOT', 'PAGES', 'WIP', 'ENGINES', 'RIG_VIEWPORTS', 'SHOTS', 'SHOT_LABELS', 'OUT_DIR',
  'FOLD_CONTRACT',
];

/* One spawn helper for every child, with a real try/catch: a fixture builder that throws its
   vacuity guard must be REPORTED, not allowed to abort the whole run. code === null means the
   child died on a signal or never started — infrastructure, not a verdict about the limit. */
function runNode(script, args, env) {
  const childEnv = { ...process.env };
  for (const k of CHECKER_ENV_KNOBS) delete childEnv[k];
  try {
    const out = execFileSync(process.execPath, [path.join(REPO, script), ...args], {
      cwd: REPO,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...childEnv, ...(env || {}) },
    });
    return { code: 0, out };
  } catch (e) {
    const out = `${e.stdout || ''}${e.stderr || ''}`.trim() || String(e.message || e);
    return { code: typeof e.status === 'number' ? e.status : null, out };
  }
}

/* The twin cases stand on one sentence — "the colours are identical and geometry is the only
   thing that changed" — and that sentence was enforced by nothing but the setup script's good
   intentions until this function existed. Substituting the declared token in the miss page must
   reproduce the proof page exactly. Anything else means the twins drifted, and the drift could
   be the very thing that made the miss green. */
function coupling(c, missRoot, proofRoot) {
  const page = 'index.html';
  if (!c.twin) {
    return { ok: true, line: `coupling: the proof leg re-runs the miss fixture itself — one page, nothing to couple` };
  }
  const missText = fs.readFileSync(path.join(missRoot, page), 'utf8');
  const proofText = fs.readFileSync(path.join(proofRoot, page), 'utf8');
  const hits = missText.split(c.twin.miss).length - 1;
  if (hits !== 1) {
    return {
      ok: false,
      line: `coupling: the miss page carries ${hits} occurrence(s) of ${JSON.stringify(c.twin.miss)}, expected exactly 1`
        + ' — the token this case declares as its only difference is not what the fixture contains',
    };
  }
  if (missText.split(c.twin.miss).join(c.twin.proof) !== proofText) {
    return {
      ok: false,
      line: `coupling: substituting ${JSON.stringify(c.twin.miss)} -> ${JSON.stringify(c.twin.proof)} in the miss page`
        + ' does NOT reproduce the proof page — the twins differ in more than the declared token, so the red'
        + ' below is not evidence about the green above',
    };
  }
  return {
    ok: true,
    line: `coupling: the proof page IS the miss page with ${JSON.stringify(c.twin.miss)} -> ${JSON.stringify(c.twin.proof)}`
      + `, ${missText.length} -> ${proofText.length} bytes, nothing else differs`,
  };
}

const finishLine = (out) => (out.split('\n').find((l) => /cells OK/.test(l)) || '(no finish line printed)').trim();
/* The root label is the one part of the stamp that MUST differ between a baseline and its
   miss — they are two directories by construction. Everything else in the line (the ok/total,
   the engines, the cell and page counts) must be identical, or the two runs did not measure
   the same thing and the miss is not comparable to the baseline it is credited against. */
const scopeOf = (line) => line.replace(/root=\S+\s*/, '');
const envEcho = (env) => Object.entries(env || {}).map(([k, v]) => `${k}=${v} `).join('');
const echo = (script, args, env) =>
  `$ ${envEcho(env)}node ${script}${args.map((a) => ' ' + (a.startsWith(REPO) ? rel(a) : a)).join('')}`;

const only = process.argv.slice(2);
const unknown = only.filter((n) => !CASES.some((c) => c.name === n));
if (unknown.length) {
  console.log(`unknown case(s): ${unknown.join(', ')}\nknown: ${CASES.map((c) => c.name).join(', ')}`);
  process.exit(2);
}

const selected = CASES.filter((c) => !only.length || only.includes(c.name));

/* Printed even when nothing was set, because "no ambient knob leaked into this run" is part of
   what the receipt below asserts, and a line that appears only on trouble cannot say it. */
const ambient = CHECKER_ENV_KNOBS.filter((k) => process.env[k] !== undefined);
console.log(`environment: ${CHECKER_ENV_KNOBS.length} checker knobs dropped from every child`
  + ` (${ambient.length} of ${CHECKER_ENV_KNOBS.length} were set in this shell${ambient.length ? `: ${ambient.join(', ')}` : ''});`
  + ' each leg pins its own scope in argv');

const failed = [];
const crashed = [];
let demonstrated = 0;
let legsRun = 0;
let legsPassed = 0;

for (const c of selected) {
  const dir = path.join(HERE, c.name);
  const missRoot = path.join(dir, 'miss', 'dist');
  const proofRoot = path.join(dir, c.proof.fixture, 'dist');
  const proofEnv = c.proof.env || null;

  console.log(`\n${'='.repeat(78)}\n== ${c.name}  (${c.script})\n== limit:  ${c.limit}\n== defect: ${c.defect}\n${'='.repeat(78)}`);

  // fixtures
  const setupScript = `controls/known-miss/${c.name}/setup.js`;
  if (!fs.existsSync(path.join(REPO, setupScript))) {
    console.log(`MISSING SETUP ${setupScript}`);
    failed.push(`${c.name} (no setup.js)`);
    continue;
  }
  const s = runNode(setupScript, []);
  console.log(s.out.trim());
  if (s.code !== 0) {
    console.log(`!! ${c.name}: the fixture could not be built, so this case proves nothing`);
    failed.push(`${c.name} (fixture guard)`);
    continue;
  }

  /* Before a single browser starts: the two fixtures must differ in exactly the declared
     token. A miss whose defect was neutralised is green for a reason that has nothing to do
     with the limit, and its untouched twin would still go red — so this is checked first and
     the case is abandoned if it does not hold. */
  const cp = coupling(c, missRoot, proofRoot);
  console.log(cp.line);
  if (!cp.ok) {
    console.log(`!! ${c.name}: the miss fixture and the proof fixture are not the twins this case claims — a green miss here would not be a demonstrated limit`);
    failed.push(`${c.name} (twin coupling broken)`);
    continue;
  }

  // (a) baseline — pristine, identical argv, must be green
  legsRun++;
  const a = runNode(c.script, c.args(PRISTINE));
  console.log(`\n(a) BASELINE  the pristine build, must be GREEN\n    ${echo(c.script, c.args(PRISTINE))}`);
  console.log(`    -> ${finishLine(a.out)}  exit=${a.code}`);
  if (a.code === null) {
    console.log(`!! ${c.name}: the baseline run CRASHED (infrastructure) — no verdict about the limit`);
    console.log(a.out.trim());
    crashed.push(`${c.name} (baseline)`);
    continue;
  }
  if (a.code !== 0) {
    console.log(`!! ${c.name}: the baseline is NOT green, so a green mutated run would prove nothing — the site is already failing for its own reasons`);
    console.log(a.out.trim());
    failed.push(`${c.name} (baseline not green)`);
    continue;
  }
  /* Green is not enough: it has to be green over the scope this case is about. Checked on (a)
     only, because the scope witness below ties (b) to (a). */
  if (!finishLine(a.out).includes(c.scope)) {
    console.log(`!! ${c.name}: the baseline is green but did not measure this case's scope — expected ${JSON.stringify(c.scope)} in its finish line`);
    console.log(`   got: ${finishLine(a.out)}`);
    failed.push(`${c.name} (baseline measured the wrong scope)`);
    continue;
  }
  legsPassed++;

  // (b) miss — same argv, mutated copy, must ALSO be green
  legsRun++;
  const b = runNode(c.script, c.args(missRoot));
  console.log(`\n(b) MISS      the same argv against the mutated copy, must ALSO be GREEN\n    ${echo(c.script, c.args(missRoot))}`);
  console.log(`    -> ${finishLine(b.out)}  exit=${b.code}`);
  if (b.code === null) {
    console.log(`!! ${c.name}: the miss run CRASHED (infrastructure) — no verdict about the limit`);
    console.log(b.out.trim());
    crashed.push(`${c.name} (miss)`);
    continue;
  }
  if (b.code !== 0) {
    /* The whole point of the suite, and the one failure that must not be "fixed" in the
       fixture. */
    console.log(`!! ${c.name}: the checker CAUGHT this defect — it went RED where the documentation says it is blind.`);
    console.log('   This is not a broken fixture. The documented limit is WRONG, and the sentence in');
    console.log('   README / docs/CONTROLS.md that claims it is what has to be corrected. Do not soften');
    console.log('   the defect until the gate goes quiet again.');
    console.log(b.out.trim());
    failed.push(`${c.name} (limit is wrong — the checker caught it)`);
    continue;
  }
  legsPassed++;

  const sameScope = scopeOf(finishLine(a.out)) === scopeOf(finishLine(b.out));
  console.log(`    witness: baseline and miss measured the same scope — ${sameScope ? 'yes' : 'NO'}  ${scopeOf(finishLine(b.out))}`);
  if (!sameScope) {
    console.log(`!! ${c.name}: the miss did not measure what the baseline measured, so the two are not comparable`);
    console.log(`   baseline: ${finishLine(a.out)}\n   miss:     ${finishLine(b.out)}`);
    failed.push(`${c.name} (miss measured a different scope)`);
    continue;
  }

  // (c0) proof-scope baseline — only when the proof leg changes the scope
  const scopeChanged = !!proofEnv;
  if (scopeChanged) {
    legsRun++;
    const c0 = runNode(c.script, c.args(PRISTINE), proofEnv);
    console.log(`\n(c0) PROOF-SCOPE BASELINE  the pristine build under the proof leg's scope, must be GREEN\n    ${echo(c.script, c.args(PRISTINE), proofEnv)}`);
    console.log(`    -> ${finishLine(c0.out)}  exit=${c0.code}`);
    if (c0.code !== 0) {
      console.log(`!! ${c.name}: the pristine build is not green at the proof leg's scope, so a red there would not be attributable to the injected defect`);
      console.log(c0.out.trim());
      failed.push(c0.code === null ? `${c.name} (proof-scope baseline crashed)` : `${c.name} (proof-scope baseline not green)`);
      continue;
    }
    legsPassed++;
  }

  // (c) proof — the defect is real
  legsRun++;
  const cc = runNode(c.script, c.args(proofRoot), proofEnv);
  console.log(`\n(c) PROOF     the injected defect is real: ${c.proof.why}\n    ${echo(c.script, c.args(proofRoot), proofEnv)}`);
  console.log(cc.out.trim());
  console.log(`    exit=${cc.code}`);
  if (cc.code === null) {
    console.log(`!! ${c.name}: the proof run CRASHED (infrastructure) — the child died on a signal or never started, which is not a verdict about the defect`);
    crashed.push(`${c.name} (proof)`);
    continue;
  }
  if (cc.code !== 1) {
    console.log(`!! ${c.name}: the proof leg did NOT go red (exit ${cc.code}, expected 1) — the injected defect is unproven, so the green above is worth nothing and this case is VACUOUS`);
    failed.push(`${c.name} (proof exit ${cc.code})`);
    continue;
  }
  const missing = c.proof.expect.filter((x) => !cc.out.includes(x));
  if (missing.length) {
    console.log(`!! ${c.name}: the proof leg is red, but not with the line this defect produces — missing: ${missing.map((x) => JSON.stringify(x)).join(', ')}`);
    failed.push(`${c.name} (proof red for the wrong reason)`);
    continue;
  }
  if (c.proof.sameLine && !cc.out.split('\n').some((l) => c.proof.expect.every((x) => l.includes(x)))) {
    console.log(`!! ${c.name}: every expected fragment appears, but no single row carries them all — this defect prints them on one row, so they were satisfied by unrelated rows`);
    failed.push(`${c.name} (fragments on different rows)`);
    continue;
  }
  legsPassed++;

  demonstrated++;
  console.log(`\nDEMONSTRATED  ${c.name}: baseline exit 0 on ${rel(PRISTINE)}, miss exit 0 on ${rel(missRoot)}`
    + ` (the documented limit holds), proof exit 1 matching ${c.proof.expect.map((x) => JSON.stringify(x)).join(' + ')}`
    + `${c.proof.sameLine ? ' on one row' : ''}`);
}

console.log(`\n${'='.repeat(78)}`);
const stamp = `[sha=${gitSha()} engines=chromium legs=${legsPassed}/${legsRun}]`;
if (!failed.length && !crashed.length) {
  console.log(`${demonstrated}/${selected.length} documented misses demonstrated (each: baseline green, miss green, defect proven red)  ${stamp}`);
} else {
  const parts = [];
  if (failed.length) parts.push(`${failed.length} case(s) failed: ${failed.join(', ')}`);
  if (crashed.length) parts.push(`${crashed.length} crashed: ${crashed.join(', ')}`);
  console.log(`${demonstrated}/${selected.length} documented misses demonstrated  ${stamp} — ${parts.join(' / ')}`);
}
process.exitCode = failed.length || crashed.length ? 1 : 0;
