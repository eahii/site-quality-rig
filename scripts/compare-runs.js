'use strict';
/* Two run records in, one difference report out — and a refusal when the two runs were not
   asking the same question.

   A record (scripts/run-checks.js --record) is the battery's verdict table in machine-readable
   form. Comparing two of them answers what a single table cannot: did anything move between
   these two runs, and was it the site or the machine?

   The refusal is the load-bearing part. Two runs made with different checker arguments, a
   different engine set, a different scope in the environment, or a different checker subset
   measured different things; any difference between them is a difference in the question, not
   in the answer. Reporting that as a clean diff would be worse than printing nothing, so those
   exit 2 and name the axis. A record whose compared fields are missing is refused for the same
   reason: a tool that speaks over a record it cannot read is worse than one that stops.

   Scope hides in two places and both of them refuse. Arguments are compared as a normalized
   set of flag=value pairs, so `--engines chromium --shots 0` and `--shots 0 --engines=chromium`
   are one question asked twice, while a different flag set is two questions. The scope knobs
   checks/lib/site.js reads from the environment (PAGES, SITE_ROOT, RIG_VIEWPORTS and the rest)
   leave no trace in argv at all — a run over one page and a run over six can be typed
   identically — which is why run-checks records them and why they are compared here.

   Environment differences — node, playwright, OS, sha, tree cleanliness — never refuse: they
   are printed as context, because they are usually the explanation for a real difference.

   A checker-level difference is a change in verdict, in ok/total, or in exit code. Exit code
   is in that list because a checker that prints PASS and exits non-zero is exactly the kind of
   disagreement this repo exists to catch. Stamps and per-checker durations are printed as
   notes and never counted: a slower run is not a different verdict, and a stamp that moved
   with the sha is not news. Leg 3 of the control asserts that, because "never counted" is a
   promise that a one-line edit could break into a false red on every real pair.

   Checkers are matched by name, not by position, so a reordered CHECKS list does not read as
   seven differences — leg 6 asserts that too. What this comparison cannot see at all is
   documented where it matters most — scripts/measure-repeatability.js, which is built on the
   function below.

   Usage: node scripts/compare-runs.js <a.json> <b.json>
          node scripts/compare-runs.js --control      (self-test: six legs, see runControl) */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { gitSha } = require('../checks/lib/report');

const SCHEMA = 1;
const REPO = path.resolve(__dirname, '..');

const ENV_FIELDS = [
  ['sha', (r) => r.sha],
  ['dirty', (r) => r.dirty],
  ['node', (r) => r.node],
  ['playwright', (r) => r.playwrightVersion],
  ['os', (r) => `${r.os && r.os.platform}/${r.os && r.os.release}`],
];

/* Tree cleanliness is not knowable without git, and unknown is not clean: null, never false.

   runs/ is excluded, and that exclusion is the whole point of the field rather than a detail.
   `git status --porcelain` counts untracked files, records are untracked until a human commits
   them, so without the exclusion every record after the first would report a dirty tree caused
   by nothing but the previous record — the flag would answer a question about itself instead
   of about the source. What it counts, then: any modification, staging or untracked file
   anywhere outside runs/. What it does not count: anything inside runs/, and anything git
   itself ignores (dist/, shots/, node_modules/).

   It lives in this module because scripts/run-checks.js runs the whole battery on require and
   cannot export anything, and because this is the other file that has to know what `dirty`
   means. */
function gitDirty() {
  try {
    const out = execSync("git status --porcelain -- ':!runs'", { cwd: REPO, stdio: ['ignore', 'pipe', 'ignore'] });
    return out.toString().trim().length > 0;
  } catch { return null; }
}

const cells = (c) => `${c.ok === null || c.ok === undefined ? '-' : c.ok}/${c.total === null || c.total === undefined ? '-' : c.total}`;

/* A record this tool cannot trust is a refusal, not a best effort: duplicate checker names
   have no single counterpart under name matching, a record from a future schema may mean
   something different by the same field, and a checker entry missing the fields this tool
   compares would compare as SAME while carrying no verdict at all. */
function shapeProblem(rec, side) {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return `${side} is not a record object`;
  if (rec.schemaVersion !== SCHEMA) return `${side} is schemaVersion ${JSON.stringify(rec.schemaVersion)}; this tool reads ${SCHEMA}`;
  if (!Array.isArray(rec.checkers) || !rec.checkers.length) return `${side} carries no checkers[]`;
  const names = rec.checkers.map((c) => c && c.name);
  if (names.some((n) => typeof n !== 'string' || !n)) return `${side} has a checker with no name`;
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) return `${side} lists "${dup}" twice; checkers are matched by name, so a repeated name has no single counterpart`;
  for (const c of rec.checkers) {
    if (typeof c.verdict !== 'string' || !c.verdict) return `${side}: checker "${c.name}" carries no verdict`;
    if (!('ok' in c) || !('total' in c)) return `${side}: checker "${c.name}" carries no ok/total`;
    if (typeof c.exitCode !== 'number') return `${side}: checker "${c.name}" carries no exit code`;
  }
  return null;
}

/* Flags sorted and spelled one way, positionals left in their order because their meaning IS
   their order. The value rule is checks/lib/site.js parseArgs: a following token that is not
   itself a flag is the value, otherwise the flag stands alone. Same rule, same meaning — a key
   built by a different rule than the checkers parse by would refuse honest pairs. */
function argvKey(list) {
  const argv = (Array.isArray(list) ? list : []).map(String);
  const flags = [];
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { positional.push(a); continue; }
    const eq = a.indexOf('=');
    if (eq >= 0) { flags.push(`${a.slice(2, eq)}=${a.slice(eq + 1)}`); continue; }
    const next = argv[i + 1];
    flags.push(`${a.slice(2)}=${next !== undefined && !next.startsWith('--') ? argv[++i] : 'true'}`);
  }
  return [...flags.sort(), ...positional].join(' ');
}

const scopeKey = (r) => Object.entries(r.scopeEnv && typeof r.scopeEnv === 'object' ? r.scopeEnv : {})
  .map(([k, v]) => `${k}=${v}`).sort().join(' ');

function comparability(a, b) {
  if (argvKey(a.argv) !== argvKey(b.argv)) {
    const show = (r) => (Array.isArray(r.argv) ? r.argv : []).join(' ') || '(none)';
    return `checker arguments differ: "${show(a)}" vs "${show(b)}"`;
  }
  if (scopeKey(a) !== scopeKey(b)) return `scope environment differs: "${scopeKey(a) || '(none)'}" vs "${scopeKey(b) || '(none)'}"`;
  if (String(a.engines) !== String(b.engines)) return `engine sets differ: ${a.engines} vs ${b.engines}`;
  if (Boolean(a.partial) !== Boolean(b.partial)) return `one record is a partial battery and the other is not (partial ${Boolean(a.partial)} vs ${Boolean(b.partial)})`;
  const na = a.checkers.map((c) => c.name);
  const nb = b.checkers.map((c) => c.name);
  const onlyA = na.filter((n) => !nb.includes(n));
  const onlyB = nb.filter((n) => !na.includes(n));
  if (onlyA.length || onlyB.length) {
    return `checker sets differ:${onlyA.length ? ` only in a: ${onlyA.join(', ')}` : ''}${onlyB.length ? ` only in b: ${onlyB.join(', ')}` : ''}`;
  }
  return null;
}

/* The whole comparison, as a pure function over two parsed records. The CLI below and
   measure-repeatability both call this and nothing else. */
function compareRecords(a, b) {
  const empty = { differences: [], env: [], notes: [] };
  const bad = shapeProblem(a, 'a') || shapeProblem(b, 'b');
  if (bad) return { refusal: bad, ...empty };
  const incomparable = comparability(a, b);
  if (incomparable) return { refusal: incomparable, ...empty };

  const byName = new Map(b.checkers.map((c) => [c.name, c]));
  const differences = [];
  const notes = [];
  for (const x of a.checkers) {
    const y = byName.get(x.name);
    if (x.verdict !== y.verdict) differences.push({ name: x.name, kind: 'verdict', from: x.verdict, to: y.verdict });
    if (cells(x) !== cells(y)) differences.push({ name: x.name, kind: 'cells', from: cells(x), to: cells(y) });
    if (x.exitCode !== y.exitCode) differences.push({ name: x.name, kind: 'exit', from: x.exitCode, to: y.exitCode });
    const stamp = (c) => (c.stamp ? `"${c.stamp}"` : '(no stamp printed)');
    if (x.stamp !== y.stamp) notes.push(`${x.name}: stamp ${stamp(x)} -> ${stamp(y)}`);
    notes.push(`${x.name}: ${x.durationMs} ms -> ${y.durationMs} ms`);
  }
  if (a.checkers.map((c) => c.name).join(',') !== b.checkers.map((c) => c.name).join(',')) {
    notes.push('the records list the same checkers in a different order; matched by name');
  }

  const env = [];
  for (const [field, read] of ENV_FIELDS) {
    if (String(read(a)) !== String(read(b))) env.push({ field, from: read(a), to: read(b) });
  }
  return { refusal: null, differences, env, notes };
}

/* ------------------------------------------------------------------ self-test ------- */

/* One synthetic record, mutated per leg. Synthetic on purpose: this control tests the
   comparison, and a fixture read off disk would make a red leg ambiguous between a broken
   comparison and a broken fixture.

   Four checkers, because leg 2 mutates one per axis this tool counts and leaves the fourth
   alone. The untouched one is not filler: without it, a comparison that named every checker
   would satisfy leg 2. */
function synthetic(overrides = []) {
  const base = {
    schemaVersion: SCHEMA,
    date: '2026-09-01T00:00:00.000Z',
    sha: 'aaaaaaa',
    dirty: false,
    node: 'v20.20.2',
    playwrightVersion: '1.62.1',
    os: { platform: 'linux', release: '6.6.0' },
    argv: ['--engines', 'chromium'],
    scopeEnv: {},
    engines: 'chromium',
    partial: false,
    wallMs: 260000,
    checkers: [
      { name: 'links', script: 'checks/check-links.js', verdict: 'PASS', ok: 40, total: 40, stamp: 'sha=aaaaaaa root=dist', exitCode: 0, durationMs: 900 },
      { name: 'viewports', script: 'checks/measure-viewports.js', verdict: 'PASS', ok: 348, total: 348, stamp: 'sha=aaaaaaa engines=chromium', exitCode: 0, durationMs: 120000 },
      { name: 'contrast', script: 'checks/check-contrast.js', verdict: 'PASS', ok: 71, total: 71, stamp: 'sha=aaaaaaa engines=chromium', exitCode: 0, durationMs: 40000 },
      { name: 'motion', script: 'checks/check-motion.js', verdict: 'PASS', ok: 96, total: 96, stamp: 'sha=aaaaaaa engines=chromium', exitCode: 0, durationMs: 30000 },
    ],
    battery: { pass: true, red: [], partial: false },
  };
  const rec = JSON.parse(JSON.stringify(base));
  for (const patch of overrides) patch(rec);
  return rec;
}

const at = (rec, name) => rec.checkers.find((c) => c.name === name);

function runControl() {
  const stamp = `[sha=${gitSha()} dirty=${gitDirty()} as-of=${new Date().toISOString()}]`;
  const legs = [];
  const line = (n, what, got, ok) => console.log(`leg ${n}  ${what.padEnd(42)}-> ${got}  ${ok ? 'PASS' : 'FAIL'}`);

  /* Leg 1 is the baseline, and it runs first for the same reason controls/run-controls.js
     demands a green baseline before it credits a red: a comparison that reports differences
     between two identical records would make every leg below it meaningless. */
  const one = compareRecords(synthetic(), synthetic());
  const oneOk = !one.refusal && one.differences.length === 0;
  line(1, 'two identical records', `refusal=${one.refusal || 'none'}, ${one.differences.length} difference(s)`, oneOk);
  if (!oneOk) console.log('!! leg 1: identical records must compare as identical; everything this tool says rests on that');
  legs.push({ ok: oneOk, credited: true });

  /* Every leg below asserts something a one-line edit could delete. They are here because a
     blinding pass found three advertised behaviours — the refusal, name matching, and "stamps
     and durations are never counted" — that could all be removed with the control still
     reporting every leg green. An unguarded guarantee is a decorative one. */
  const rest = [];

  /* One mutation per axis, each on its own checker, and the assertion is on name AND kind.
     Both halves were earned: an earlier version of this leg flipped verdict and exit code
     together on one checker and asserted names only, and it stayed green with the verdict
     comparison deliberately disabled — the exit-code difference kept naming the same checker.
     A leg that survives the blinding of an axis is not a control for that axis. */
  rest.push(() => {
    const two = compareRecords(synthetic(), synthetic([
      (r) => { at(r, 'viewports').ok = 347; },
      (r) => { at(r, 'contrast').verdict = 'FAIL'; },
      (r) => { at(r, 'links').exitCode = 1; },
    ]));
    const named = two.differences.map((d) => `${d.name}:${d.kind}`).sort();
    const want = ['contrast:verdict', 'links:exit', 'viewports:cells'];
    const ok = !two.refusal && named.join(', ') === want.join(', ');
    line(2, 'one count, one verdict, one exit', named.join(', ') || '(nothing)', ok);
    if (!ok) console.log(`!! leg 2: ${two.refusal ? `refused (${two.refusal})` : `expected exactly ${want.join(', ')}`} — a difference report that misses an axis, or names an unchanged checker, is worse than none`);
    return ok;
  });

  /* Noise only: a stamp, a duration, and two environment fields. All four are things that
     differ between any two real runs, so counting one of them would make every honest pair
     read DIFFERENT. The leg asserts both halves — that nothing was counted, and that the
     tool did see them and filed them as notes and env rather than ignoring the fields. */
  rest.push(() => {
    const three = compareRecords(synthetic(), synthetic([
      (r) => { at(r, 'motion').stamp = 'sha=bbbbbbb engines=chromium'; },
      (r) => { at(r, 'motion').durationMs = 31234; },
      (r) => { r.sha = 'bbbbbbb'; r.node = 'v22.22.2'; },
    ]));
    const envNamed = three.env.map((e) => e.field).sort().join(', ');
    const sawStamp = three.notes.some((n) => n.startsWith('motion: stamp '));
    const ok = !three.refusal && three.differences.length === 0 && envNamed === 'node, sha' && sawStamp;
    line(3, 'stamp, duration and environment only', `${three.differences.length} difference(s), env: ${envNamed || '(none)'}, stamp note: ${sawStamp}`, ok);
    if (!ok) console.log('!! leg 3: a stamp, a duration or an environment field was counted as a checker difference (or was not seen at all) — either way the report cannot be trusted on a real pair, where all four always differ');
    return ok;
  });

  /* The refusal, which had no coverage at all until a blinding pass deleted it and this
     control stayed green. Eight pairs, one per axis that makes two records answer different
     questions — including the three shape defects, which are refusals for the same reason. */
  rest.push(() => {
    const pairs = [
      ['argv', synthetic(), synthetic([(r) => { r.argv = ['--engines', 'chromium', '--shots', '0']; }])],
      ['scope env', synthetic(), synthetic([(r) => { r.scopeEnv = { PAGES: 'index.html' }; }])],
      ['engines', synthetic(), synthetic([(r) => { r.engines = 'chromium+webkit'; }])],
      ['partial', synthetic(), synthetic([(r) => { r.partial = true; }])],
      ['checker set', synthetic(), synthetic([(r) => { r.checkers = r.checkers.filter((c) => c.name !== 'motion'); }])],
      ['schema', synthetic(), synthetic([(r) => { r.schemaVersion = SCHEMA + 1; }])],
      ['duplicate name', synthetic(), synthetic([(r) => { at(r, 'motion').name = 'links'; }])],
      ['missing verdict', synthetic(), synthetic([(r) => { delete at(r, 'contrast').verdict; }])],
    ];
    /* A throw is not a refusal. With the guard removed, some of these pairs reach a checker
       that has no counterpart and die there; a control that exits on a stack trace instead of
       naming the axis that went silent is a weaker control than one that reports it. */
    const refusalOf = (a, b) => { try { return compareRecords(a, b).refusal; } catch { return null; } };
    const silent = pairs.filter(([, a, b]) => !refusalOf(a, b)).map(([why]) => why);
    const ok = silent.length === 0;
    line(4, `${pairs.length} pairs that must refuse`, `${pairs.length - silent.length}/${pairs.length} refused`, ok);
    if (!ok) console.log(`!! leg 4: compared without refusing on ${silent.join(', ')} — a difference reported across that axis is a difference in the question, not in the site`);
    return ok;
  });

  /* The other half of the refusal, and the reason it is normalized rather than string-equal:
     over-refusal is the safe direction but it is not a free one. Reordering two flags between
     two invocations is something a human does without noticing, and being told the two runs
     "measured different things" would be false. */
  rest.push(() => {
    const pairs = [
      ['--engines=chromium', synthetic(), synthetic([(r) => { r.argv = ['--engines=chromium']; }])],
      ['flags reordered', synthetic([(r) => { r.argv = ['--engines', 'chromium', '--shots', '0']; }]), synthetic([(r) => { r.argv = ['--shots', '0', '--engines', 'chromium']; }])],
    ];
    const wrong = pairs.filter(([, a, b]) => {
      const c = compareRecords(a, b);
      return c.refusal || c.differences.length;
    }).map(([why]) => why);
    const ok = wrong.length === 0;
    line(5, `${pairs.length} pairs spelled differently, same scope`, `${pairs.length - wrong.length}/${pairs.length} compared`, ok);
    if (!ok) console.log(`!! leg 5: refused (or reported a difference) on ${wrong.join(', ')} — those two argument lists name the same scope, so the refusal message would be false`);
    return ok;
  });

  /* Name matching, which the header promises and which position matching would silently
     satisfy on every pair whose checkers happen to be in the same order — i.e. every real
     pair. Reversing the list is what makes the promise testable. */
  rest.push(() => {
    const six = compareRecords(synthetic(), synthetic([
      (r) => { at(r, 'viewports').ok = 347; },
      (r) => { r.checkers.reverse(); },
    ]));
    const named = six.differences.map((d) => `${d.name}:${d.kind}`).sort().join(', ');
    const sawOrder = six.notes.some((n) => n.includes('different order'));
    const ok = !six.refusal && named === 'viewports:cells' && sawOrder;
    line(6, 'checkers reordered, one count changed', `${named || '(nothing)'}, order note: ${sawOrder}`, ok);
    if (!ok) console.log('!! leg 6: a reordered checker list must produce exactly the one real difference; matching by position instead would name three unchanged checkers');
    return ok;
  });

  for (const [i, leg] of rest.entries()) {
    if (!oneOk) {
      console.log(`leg ${i + 2}  NOT CREDITED (leg 1 was not clean, so an answer here proves nothing)`);
      legs.push({ ok: false, credited: false });
      continue;
    }
    legs.push({ ok: leg(), credited: true });
  }

  const credited = legs.filter((l) => l.credited);
  const passed = credited.filter((l) => l.ok).length;
  const skipped = legs.length - credited.length;
  console.log(`\ncompare-runs control: ${passed}/${credited.length} credited legs PASS${skipped ? ` (${skipped} not credited)` : ''} — ${passed === legs.length ? 'PASS' : 'FAIL'}  ${stamp}`);
  process.exit(passed === legs.length ? 0 : 1);
}

/* ------------------------------------------------------------------- cli ------------ */

function readRecord(file, side) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { console.log(`cannot read ${side} (${file}): ${e.message}`); process.exit(2); }
}

/* Relative inside the repo, absolute outside it: a path spelled ../../../.. names nothing a
   reader can act on, and these lines are meant to be quoted. */
function label(p) {
  const abs = path.resolve(p);
  const rel = path.relative(REPO, abs);
  return rel.startsWith('..') ? abs : rel;
}

function main(argv) {
  if (argv[0] === '--control') return runControl();
  if (argv.length !== 2) {
    console.log('usage: node scripts/compare-runs.js <a.json> <b.json>\n       node scripts/compare-runs.js --control');
    process.exit(2);
  }
  const [fa, fb] = argv;
  const a = readRecord(fa, 'a');
  const b = readRecord(fb, 'b');
  const { refusal, differences, env, notes } = compareRecords(a, b);

  const head = (side, file, rec) => `${side}  ${label(file)}  ${rec && rec.date}  ${rec && rec.wallMs} ms`;
  console.log(head('a', fa, a));
  console.log(head('b', fb, b));

  if (refusal) {
    console.log(`\nrefused: ${refusal}`);
    console.log('these two runs measured different things, so any difference between them is a difference in the question, not in the site.');
    process.exit(2);
  }

  if (env.length) {
    console.log('\nenvironment (informational — never a verdict about the site):');
    for (const e of env) console.log(`  ${e.field}: ${e.from} -> ${e.to}`);
  }

  if (notes.length) {
    console.log('\nnotes (informational — stamps and wall time, never counted as differences):');
    for (const n of notes) console.log(`  ${n}`);
  }

  /* The partial marker travels with every line a reader might lift on its own, here and in
     run-checks.js: a subset that can pass for the full battery is a false receipt. */
  const partial = a.partial ? ` (partial: ${a.checkers.map((c) => c.name).join(', ')})` : '';
  console.log(`\ncheckers (${a.checkers.length}${a.partial ? ', partial battery' : ''}):`);
  if (!differences.length) console.log('  no verdict, denominator or exit-code difference');
  for (const d of differences) console.log(`  ${d.name}: ${d.kind} ${d.from} -> ${d.to}`);

  const logs = [fa, fb].map((f) => `${path.resolve(f).replace(/\.json$/, '')}.stdout.txt`);
  const missing = logs.filter((f) => !fs.existsSync(f));
  console.log(`\nrow-level detail lives in the logs, not here: diff ${logs.map(label).join(' ')}`);
  if (missing.length) console.log(`  (${missing.map(label).join(', ')} not present — a record kept without its log cannot show which rows moved)`);

  const names = [...new Set(differences.map((d) => d.name))];
  const n = a.checkers.length;
  console.log(`\ncompare: ${differences.length} difference(s) across ${n} checker${n === 1 ? '' : 's'} — ${names.length ? `DIFFERENT (${names.join(', ')})` : 'SAME'}${partial}`);
  process.exit(names.length ? 1 : 0);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { compareRecords, gitDirty, SCHEMA };
