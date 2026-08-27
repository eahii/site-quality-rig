'use strict';
/* Runs every checker against its own negative-control fixture and asserts that it FAILS.
   A gate that has never gone red is decorative; this runner is what makes "these gates fire"
   a checkable claim rather than a sentence in a README.

   Each control does three things in order:

     1. SETUP — controls/<name>/setup.js rebuilds the fixture from the real dist/ and injects
        one targeted defect. The builder throws if a mutation changed nothing.
     2. BASELINE — the same checker, with the SAME arguments, pointed at the pristine dist/.
        It must exit 0.
     3. MUTATED — the same checker pointed at the fixture. It must exit 1, and its output must
        contain the checker's real failing line for this defect.

   Steps 2 and 3 together are what upgrade "the checker went red" into "the checker went red
   BECAUSE OF THIS DEFECT". Exit-code-only judging, which is what this harness was ported
   from, cannot tell those apart: a checker that is red for an unrelated reason, a checker
   whose contract slot rotted, and a checker that genuinely caught the injected defect all
   exit 1. So does a checker whose fixture was never mutated at all, if the site was already
   broken.

   Browser controls run a NARROWED matrix (chromium, one page, the cells the defect is aimed
   at). The receipt is that the assertion can fire in this repo — the full matrix runs green
   separately under `npm test`.

   Usage: node controls/run-controls.js [name ...]      (no names = all seven) */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const REPO = path.join(HERE, '..');
const PRISTINE = path.join(REPO, 'dist');
const rel = (p) => path.relative(REPO, p).replace(/\\/g, '/') || '.';

/* A control is: a fixture, an instrument invocation, and the line the instrument must print.
   `args(root)` is written once and called twice — with the pristine dist for the baseline and
   with the fixture for the mutated run — so the two runs cannot drift apart by an edit to one
   of them. `expect` holds VERBATIM fragments captured from real runs, never guesses: an
   unrelated red must not be able to satisfy a control. */
const CONTROLS = [
  {
    name: 'links',
    defect: 'declared page directory removed (parity + cascading dead links) - dead anchor - dead page link - href="#" - second h1',
    script: 'checks/check-links.js',
    args: (root) => ['--root', root],
    expect: [
      'site.json declares references/index.html, which is not in the build',
      'dead anchor #no-such-anchor',
    ],
  },
  {
    name: 'viewports',
    defect: 'in-flow 150vw block (h-overflow + named unclipped offender) - the contract\'s contact affordance shrunk to 20x20 (tap target)',
    script: 'checks/measure-viewports.js',
    args: (root) => ['--root', root, '--engines', 'chromium', '--viewports', '320x568', '--pages', 'index.html', '--shots', '0'],
    expect: [
      'h-overflow 160px (documentElement.scrollWidth 480 > 320)',
      'tap targets <44px: body>header.site-head>div.head-inner>a.call-link 20x20',
    ],
  },
  {
    name: 'harden',
    defect: 'nowrap on all three .stat-label (longest-content spill) - .process forced to 290px fixed columns (breaks at N+1, holds at N-1)',
    script: 'checks/check-harden.js',
    args: (root) => [
      '--root', root, '--engines', 'chromium',
      '--pages', 'index.html,services/index.html,maintenance-plans/index.html',
      '--viewports', '1280x640,1440x900', '--shots', '0',
    ],
    expect: [
      'h-overflow 225px',
      'chromium laptop-720 services/index.html grid process-steps N+1',
    ],
  },
  {
    name: 'motion',
    defect: 'infinite animation outranking the reduce guard by specificity - .rv hidden in base CSS (un-gated reveal state)',
    script: 'checks/check-motion.js',
    args: (root) => ['--root', root, '--engines', 'chromium', '--pages', 'index.html', '--shots', '0'],
    expect: [
      'running animation under reduce: #hero-title control-spin 2s',
      'not painted with scripts removed: #figures-title effective-opacity=0.00',
    ],
  },
  {
    name: 'contrast',
    defect: 'hero h1 recoloured to a near-white oklch() over the light hero ground',
    script: 'checks/check-contrast.js',
    args: (root) => ['--root', root, '--engines', 'chromium', '--pages', 'index.html'],
    expect: [
      '< 3.0 (min 1.11,',
      '#hero-title "Elevators that stay in service."',
    ],
  },
  {
    name: 'hero',
    defect: '.car-tip pushed 8px off the drill line - the exact defect class the instrument was written for',
    script: 'checks/check-hero.js',
    args: (root) => ['--root', root, '--cells', '390x844', '--shots', '0', '--engines', 'chromium'],
    expect: [
      'frame 1: rail / frame / tip are not on one centerline',
      'spread 8.00px > 0.5px (rail 195.00, frame 195.00, tip 187.00',
    ],
  },
  {
    /* Deploy is a table entry, not a bypass. It needs an ORIGIN rather than a directory, so
       its two runs are two origins instead of two --root values: the baseline is the healthy
       fixture origin (scripts/serve-fixture.js, which sends the contract's headers and mocks
       the submit endpoint), the mutated run is controls/deploy/run.js, which serves a mutated
       copy plainly. Stated deviation: the baseline argv is not the mutated argv here, because
       for a deploy gate the origin IS the thing under test. */
    name: 'deploy',
    defect: 'declared page 404 - robots meta stripped - every contracted header absent - form endpoint absent - byte drift under --require-current',
    setup: null,
    baseline: { script: 'checks/check-deploy.js', args: ['--local', '--require-current'] },
    mutated: { script: 'controls/deploy/run.js', args: [], wantCode: 0 },
    expect: [
      'HTTP 404, expected 200',
      'served body carries no <meta name="robots"',
    ],
    /* --negative inverts the checker's exit code, so 0 means "the assertions fired". The
       exit code alone would also be 0 if the child had crashed before asserting anything,
       hence the line check. */
    judge: (out) => (/negative control fired/.test(out) ? null : 'check-deploy did not print its "negative control fired" line'),
  },
];

/* One spawn helper for every child, with a real try/catch: a fixture builder that throws its
   vacuity guard must be REPORTED, not allowed to abort the whole run — the other six controls
   still have something to prove. code === null means the child died on a signal or never
   started, which is an infrastructure failure and not a verdict about the gate. */
function runNode(script, args) {
  try {
    /* stdio is spelled out because execFileSync lets the child's stderr through to this
       process by default, which would print every stack trace twice — once by the child and
       once by the report below. */
    const out = execFileSync(process.execPath, [path.join(REPO, script), ...args], {
      cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (e) {
    const out = `${e.stdout || ''}${e.stderr || ''}`.trim() || String(e.message || e);
    return { code: typeof e.status === 'number' ? e.status : null, out };
  }
}

const finishLine = (out) => (out.split('\n').find((l) => /cells OK/.test(l)) || '(no finish line printed)').trim();
const echo = (script, args) => `$ node ${script}${args.map((a) => ' ' + (a.startsWith(REPO) ? rel(a) : a)).join('')}`;

const only = process.argv.slice(2);
const unknown = only.filter((n) => !CONTROLS.some((c) => c.name === n));
if (unknown.length) {
  console.log(`unknown control(s): ${unknown.join(', ')}\nknown: ${CONTROLS.map((c) => c.name).join(', ')}`);
  process.exit(2);
}

const selected = CONTROLS.filter((c) => !only.length || only.includes(c.name));
const failed = [];
const crashed = [];
let fired = 0;

for (const c of selected) {
  const dir = path.join(HERE, c.name);
  const fixture = path.join(dir, 'dist');
  const baseline = c.baseline || { script: c.script, args: c.args(PRISTINE) };
  const mutated = c.mutated || { script: c.script, args: c.args(fixture) };
  const wantCode = mutated.wantCode === undefined ? 1 : mutated.wantCode;

  console.log(`\n${'='.repeat(78)}\n== ${c.name}\n== defect: ${c.defect}\n${'='.repeat(78)}`);

  // 1 -- fixture
  const setupScript = c.setup === null ? null : `controls/${c.name}/setup.js`;
  if (setupScript) {
    if (!fs.existsSync(path.join(REPO, setupScript))) {
      console.log(`MISSING SETUP ${setupScript}`);
      failed.push(`${c.name} (no setup.js)`);
      continue;
    }
    const s = runNode(setupScript, []);
    console.log(s.out.trim());
    if (s.code !== 0) {
      /* A vacuity-guard throw lands here. It is a failed-to-fail, not a crash: the fixture
         builder did its job, and what it is telling us is that this control can no longer
         prove anything. */
      console.log(`!! ${c.name}: the fixture could not be built, so this control proves nothing`);
      failed.push(`${c.name} (fixture guard)`);
      continue;
    }
  }

  // 2 -- baseline must be green on the pristine build
  const b = runNode(baseline.script, baseline.args);
  console.log(`baseline (pristine dist) ${echo(baseline.script, baseline.args)}`);
  console.log(`  -> ${finishLine(b.out)}  exit=${b.code}`);
  if (b.code === null) {
    console.log(`!! ${c.name}: the baseline run CRASHED (infrastructure) — no verdict about the gate`);
    console.log(b.out.trim());
    crashed.push(`${c.name} (baseline)`);
    continue;
  }
  if (b.code !== 0) {
    console.log(`!! ${c.name}: the baseline is NOT green, so a red mutated run would prove nothing about the injected defect`);
    console.log(b.out.trim());
    failed.push(`${c.name} (baseline not green)`);
    continue;
  }

  // 3 -- mutated must fail, with the expected line
  const m = runNode(mutated.script, mutated.args);
  console.log(`\nmutated ${echo(mutated.script, mutated.args)}`);
  console.log(m.out.trim());
  console.log(`exit=${m.code}`);

  if (m.code === null) {
    console.log(`!! ${c.name}: CRASHED (infrastructure) — the child died on a signal or never started, which is not a verdict about the gate`);
    crashed.push(c.name);
    continue;
  }
  if (m.code !== wantCode) {
    console.log(`!! ${c.name} did NOT fail on its negative control (exit ${m.code}, expected ${wantCode})`);
    failed.push(`${c.name} (exit ${m.code})`);
    continue;
  }
  const missing = c.expect.filter((s) => !m.out.includes(s));
  if (missing.length) {
    /* Red for the wrong reason is not a fired control. */
    console.log(`!! ${c.name} failed, but not with the line this defect produces — missing: ${missing.map((s) => JSON.stringify(s)).join(', ')}`);
    failed.push(`${c.name} (wrong failing line)`);
    continue;
  }
  const verdict = c.judge ? c.judge(m.out) : null;
  if (verdict) {
    console.log(`!! ${c.name}: ${verdict}`);
    failed.push(`${c.name} (${verdict})`);
    continue;
  }

  fired++;
  console.log(`FIRED  ${c.name}: baseline exit 0 on ${rel(PRISTINE)}, mutated exit ${m.code} (expected ${wantCode}), matched ${c.expect.map((s) => JSON.stringify(s)).join(' + ')}`);
}

console.log(`\n${'='.repeat(78)}`);
if (!failed.length && !crashed.length) {
  console.log(`${fired}/${selected.length} controls fired`);
} else {
  const parts = [];
  if (failed.length) parts.push(`${failed.length} control(s) failed to fail: ${failed.join(', ')}`);
  if (crashed.length) parts.push(`${crashed.length} crashed: ${crashed.join(', ')}`);
  console.log(`${fired}/${selected.length} controls fired — ${parts.join(' / ')}`);
}
process.exitCode = failed.length || crashed.length ? 1 : 0;
