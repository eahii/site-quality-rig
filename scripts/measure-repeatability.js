'use strict';
/* Runs the battery N times and asks whether it says the same thing twice.

   A gate nobody can reproduce is a gate nobody can quote. Every number this repo prints is a
   single run, and a single run cannot tell a stable measurement from a lucky one. This script
   produces the missing denominator: N runs with the same arguments, every run compared to run 1
   through the pure function in scripts/compare-runs.js.

   Each run rebuilds the site first, because scripts/run-checks.js builds on every invocation.
   So this measures build-plus-battery repeatability, and a nondeterministic build would show up
   here as a checker flip. That is deliberate rather than sloppy — a gate that only reproduces
   against a frozen build is not the gate anyone runs — but it does mean a flip names a run, not
   a component, and the build is the first place to look.

   WHAT A FLIP IS, AND WHAT IT CANNOT BE. The comparison sees three fields per checker: the
   verdict, the ok/total counts, and the exit code. So a flip is a checker changing its mind
   about the same source between two runs. That is a real and useful class — it is what a
   float-rounding red or a timing-dependent cell looks like from outside — but it is not "the
   runs were identical", and this script must never be quoted as saying that. What it cannot
   see, as concretely as this file can put it:

     - a passing cell that drifts is invisible to the counts, and invisible in the logs too. No
       checker prints a per-cell measured value; what reaches stdout is aggregates, note/warn
       lines and FAIL rows. So a measurement that moves run to run and stays inside its
       threshold changes no count and prints no row. This is the largest blind spot, and it
       cannot be closed from this file: it would take the checkers printing per-cell values.
     - compensating flips are invisible to the counts. If one cell goes red while another goes
       green inside one checker, ok, total, verdict and exit code are all unchanged. Two runs
       that disagree about WHICH cells failed compare as identical here. A diff of the two
       .stdout.txt files does see it, because failing rows are printed.
     - the same cell failing for a DIFFERENT reason is invisible to the counts. checks/lib/
       report.js counts a row as failed once, whatever it holds, so run A failing on one message
       and run B on another moves nothing this compares. Log-visible, again.
     - a note or warn appearing or disappearing is invisible to the RECORD: notes are not
       recorded and not compared, though checkers print them on green runs and they carry
       warnings this repo treats as meaningful. Log-visible.
     - wall time is recorded per checker and deliberately not compared. A slower run is not a
       different verdict.

   So "0 flips" means: across N runs, no checker changed verdict, denominator, ok-count or exit
   code. It does not mean the runs were identical, and the line this prints says flips, never
   "identical", for that reason. The denominator it prints is the number of comparisons actually
   made — checkers x three fields x (N-1) — and not the cell count, which is a denominator of
   something this script never compared.

   The verdict word is PASS only when the runs agreed AND every one of them was green. A red
   gate can be perfectly repeatable, and that is a real measurement, but it may not be spelled
   the way a green one is: it prints REPEATABLY-RED and exits non-zero, because the line is
   built to be quoted.

   Records land in runs/repeatability-<sha>-<UTC>/run-<i>.json with their logs beside them, so
   the series is re-readable after the terminal is gone. Committing one is a human decision.

   Usage: node scripts/measure-repeatability.js --runs N [checker args...]
          npm run test:repeat -- --runs 3 --engines chromium */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { gitSha } = require('../checks/lib/report');
const { compareRecords } = require('./compare-runs');

const REPO = path.resolve(__dirname, '..');
const RAW = process.argv.slice(2);
const FIELDS = 3;

let runs = null;
const rest = [];
for (let i = 0; i < RAW.length; i++) {
  const a = RAW[i];
  const eq = a.startsWith('--') ? a.indexOf('=') : -1;
  const key = a.startsWith('--') ? (eq < 0 ? a.slice(2) : a.slice(2, eq)) : null;
  if (key === 'runs') { runs = Number(eq < 0 ? RAW[++i] : a.slice(eq + 1)); continue; }
  rest.push(a);
}

if (!Number.isInteger(runs) || runs < 2) {
  console.log('usage: node scripts/measure-repeatability.js --runs N [checker args...]\n       N must be an integer >= 2 — one run cannot disagree with itself');
  process.exit(2);
}
/* Every spelling of both flags, because a guard that reads as exhaustive and is not is worse
   than no guard: the series names one record per run and a caller's own would collide. */
if (rest.some((a) => /^--record(-to)?(=|$)/.test(a))) {
  console.log('--record / --record-to are supplied by this script, one per run; passing your own would put the series in one file');
  process.exit(2);
}

const d = new Date();
const p = (n) => String(n).padStart(2, '0');
const stamp = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
/* Sanitized for the same reason run-checks.js sanitizes it: GIT_SHA can hold a ref name, and a
   slash in a directory name silently writes the series somewhere else. */
const dir = path.join(REPO, 'runs', `repeatability-${String(gitSha()).replace(/[^A-Za-z0-9+._-]/g, '_')}-${stamp}`);
if (fs.existsSync(dir)) { console.log(`${path.relative(REPO, dir)} already exists — refusing to write a second series into it`); process.exit(2); }
fs.mkdirSync(dir, { recursive: true });

const records = [];
for (let i = 1; i <= runs; i++) {
  const file = path.join(dir, `run-${i}.json`);
  console.log(`\n${'#'.repeat(78)}\n## run ${i}/${runs} -> ${path.relative(REPO, file)}\n${'#'.repeat(78)}`);
  const r = spawnSync(process.execPath, [path.join(REPO, 'scripts/run-checks.js'), '--record-to', file, ...rest], { cwd: REPO, stdio: 'inherit' });
  if (!fs.existsSync(file)) {
    /* No record means the battery never got past the build. Comparing the runs that did
       happen would quietly narrow N, so the series is abandoned instead. */
    console.log(`\nrun ${i} wrote no record (exit ${r.status}) — the series is incomplete and proves nothing about repeatability`);
    if (!fs.readdirSync(dir).length) fs.rmdirSync(dir);
    process.exit(1);
  }
  records.push({ i, rec: JSON.parse(fs.readFileSync(file, 'utf8')), exit: r.status });
}

const first = records[0].rec;
const totals = first.checkers.map((c) => c.total);
const cellTotal = totals.some((t) => t === null || t === undefined) ? null : totals.reduce((a, b) => a + b, 0);

/* A run's own battery verdict is not a repeatability result and is never folded into the flip
   count — but it decides the verdict word below, because two identically crashed runs have zero
   flips by construction and would otherwise print PASS. */
const batteryOf = ({ rec, exit }) => ({
  green: exit === 0 && !!rec.battery && rec.battery.pass === true,
  red: (rec.battery && rec.battery.red) || [],
  exit,
});

console.log(`\n${'='.repeat(78)}\n== repeatability: every run against run 1\n${'='.repeat(78)}`);
const b1 = batteryOf(records[0]);
console.log(`run 1  baseline           battery exit ${b1.exit}${b1.green ? '' : `  — NOT GREEN (${b1.red.join(', ') || 'no verdict printed'})`}`);
let flips = 0;
let refused = 0;
for (const { i, rec, exit } of records.slice(1)) {
  const { refusal, differences } = compareRecords(first, rec);
  if (refusal) {
    refused++;
    console.log(`run ${i}  REFUSED  ${refusal}`);
    continue;
  }
  flips += differences.length;
  const detail = differences.map((x) => `${x.name} ${x.kind} ${x.from} -> ${x.to}`).join('; ');
  console.log(`run ${i}  ${differences.length} flip(s)  battery exit ${exit}${detail ? `  ${detail}` : ''}`);
}

console.log(`\nnote  ${runs} runs make ${runs - 1} comparison${runs === 2 ? '' : 's'}; each run is compared to run 1, never to its neighbour, so a drift across the series cannot hide in pairwise steps`);
console.log('note  a flip is a checker changing verdict, ok/total or exit code — see this file\'s header for what that cannot see');
/* The cell count is a note and not a denominator: it is run 1's, it was never the thing
   compared, and it is only known to hold for the rest of the series when nothing flipped. */
if (cellTotal === null) console.log('note  run 1 printed no complete cell count (a checker reported no denominator), so this series has no cell total');
else if (flips || refused) console.log(`note  run 1 measured ${cellTotal} cells; the other runs may differ, which is what the lines above are about`);
else console.log(`note  run 1 measured ${cellTotal} cells, and with 0 flips no other run's denominators differ from it`);

const batteries = records.map(batteryOf);
const allGreen = batteries.every((b) => b.green);
const redNames = [...new Set(batteries.flatMap((b) => b.red))];
const compared = runs - 1 - refused;
const verdict = flips || refused ? 'FAIL' : allGreen ? 'PASS' : 'REPEATABLY-RED';

if (refused) console.log(`\n!! ${refused} of ${runs - 1} comparisons were refused: the runs in this series are not comparable to each other, so the flip count below is not a measurement of anything`);
if (!allGreen) console.log(`\n!! the battery was not green in every run of this series (${redNames.join(', ') || 'no verdict printed'}). Repeatability of a red gate is a real measurement, and it is reported as one — but it is not a green receipt and this line does not say PASS.`);

const n = first.checkers.length;
/* Every run's own answer, not run 1's on behalf of the series: if the tree changed underneath
   the runs, the stamp says so rather than asserting the state of the first one. */
const dirties = [...new Set(records.map(({ rec }) => String(rec.dirty)))];
const meta = {
  sha: gitSha(),
  dirty: dirties.length === 1 ? dirties[0] : `mixed(${dirties.join('->')})`,
  battery: allGreen ? 'green' : `red(${redNames.join(',') || `exit ${batteries.map((b) => b.exit).join(',')}`})`,
  engines: first.engines,
  partial: first.partial,
  node: first.node,
  series: path.relative(REPO, dir),
  'as-of': new Date().toISOString(),
};
const line = Object.entries(meta).map(([k, v]) => `${k}=${v}`).join(' ');
console.log(`\nrepeatability: ${flips} flips / ${compared * n * FIELDS} checker-field comparisons (${n} checker${n === 1 ? '' : 's'} x ${FIELDS} fields x ${compared} comparison${compared === 1 ? '' : 's'}) — ${verdict}  [${line}]`);
process.exit(verdict === 'PASS' ? 0 : 1);
