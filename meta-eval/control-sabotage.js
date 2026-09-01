'use strict';
/* The negative control for the meta-evaluation itself.

   The meta-eval reports an agreement rate. An agreement rate that cannot fall is decoration in
   exactly the way an all-green gate is decoration: 100% agreement and "this comparison is wired
   to agree" print the same number. So the instrument is damaged on purpose, in one constant, and
   the meter has to move by a PREDICTED amount — the prediction being written from the manifest
   before the run, not read off the result.

   Two sabotages, because one of them provably cannot move Part A and saying so is the point.

   floor (the default). check-contrast.js:322 chooses 3.0 for large text and 4.5 otherwise; the
   copy chooses 4.0 and 5.5. Every Part A specimen whose analytic ratio sits between its real
   floor and the raised one must flip from PASS to FAIL, and nothing else may move. The predicted
   flip set is computed from cases.json, and the control requires the observed disagreement set to
   equal it exactly — same ids, same count, all in the false-fail direction. A drop of "about the
   right size" is not evidence; a drop naming the right nine cases is.

   Two things this sabotage needs from the harness it drives, and both are declared rather than
   assumed. run-meta-eval.js cross-checks the floor printed in every specimen row against the
   manifest, which a raised-floor instrument fails by construction — so the sabotaged child is
   given --sabotage-floors, the exact remap this control performed, and the cross-check stays
   armed against every floor that declaration does not name. And a raised floor applies to the
   whole carrier page, not only to the injected blocks, so the carrier's own faint text prints
   rows too; those arrive as off-specimen rows, which the child counts and prints without
   refusing. The baseline is given neither, and a single off-specimen row there fails it.

   worst-decile. check-contrast.js:41 reports the 10th-percentile pixel ratio; the copy reports
   the 90th. This is the sabotage the meta-evaluation was first specified with, and on Part A it
   CANNOT do anything: a solid ground makes every background sample the same pixel, so the sorted
   ratio list is constant and p10 and p90 are the same number. That is the same argument that
   makes 100% the pass bar for Part A, which turns this variant into a pre-registered test of the
   argument itself:

     Part A verdicts must be IDENTICAL to the baseline. If they move, the solid-ground claim in
     METHOD.md is wrong and this control has found a real defect in the meta-evaluation's design.
     Part B verdicts must move on at least one case, since a gradient is where a decile means
     something.

   FIRST RUN 2026-09-01 at 83704ec, chromium, floor variant: baseline clean at 30/30, sabotaged
   21/30, and the observed flip set equalled the pre-registered prediction exactly (9 cases, all
   false-fail). The record is under meta-eval/runs/. The worst-decile variant has still only been
   dry-run, and Part A cannot move under it by construction — a solid ground makes every decile
   the same pixel.

   Usage: node meta-eval/control-sabotage.js [--sabotage floor|worst-decile] [--dry-run]
                                             [--engines chromium]

   --engines is forwarded to both nested runs. --dry-run writes and removes the sabotaged copy
   without launching anything, which is the only part of this file a browserless machine can
   exercise. */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const S = require('../checks/lib/site');

const REPO = S.REPO;
const HERE = __dirname;
const INSTRUMENT = 'checks/check-contrast.js';
/* The copy must live in checks/ and nowhere else: checks/lib/site.js derives the repo root from
   its own directory two levels up, so a copy anywhere else would resolve site.json and the
   contracts against the wrong tree and fail for a reason that has nothing to do with the
   sabotage. Dot-prefixed, removed in a finally, and never committed. */
const SABOTAGED = 'checks/.check-contrast.sabotaged.js';
const MARKER = '/* SABOTAGED COPY written by meta-eval/control-sabotage.js — safe to delete */';

const SABOTAGES = {
  floor: {
    find: 'const floor = n.large ? 3.0 : 4.5;',
    replace: 'const floor = n.large ? 4.0 : 5.5;',
    describes: 'both AA floors raised by 1.0 (large 3.0 -> 4.0, normal 4.5 -> 5.5)',
    newFloor: { 3: 4.0, 4.5: 5.5 },
    partA: 'must-move',
  },
  'worst-decile': {
    find: 'const WORST_DECILE = 0.10;',
    replace: 'const WORST_DECILE = 0.90;',
    describes: 'the reported pixel moves from the 10th percentile to the 90th',
    partA: 'must-not-move',
  },
};

const rel = (p) => path.relative(REPO, p).replace(/\\/g, '/');

/* The remap, in the spelling run-meta-eval.js's --sabotage-floors parses, derived from the same
   object the prediction is derived from so the two can never drift apart. */
const floorDeclaration = (spec) => Object.entries(spec.newFloor || {}).map(([from, to]) => `${from}=${to}`).join(',');

/* controls/fixture.js's rule, applied to source instead of markup: a mutation that changed
   nothing, or changed more than the one thing it names, invalidates the control. Counting is the
   whole guard — a find-string that silently matched twice would damage two behaviours and the
   prediction below would be about neither. */
function writeSabotagedCopy(name) {
  const spec = SABOTAGES[name];
  const src = fs.readFileSync(path.join(REPO, INSTRUMENT), 'utf8');
  const hits = src.split(spec.find).length - 1;
  if (hits !== 1) {
    throw new Error(`${INSTRUMENT} contains ${hits} occurrences of ${JSON.stringify(spec.find)} — exactly 1 is required, `
      + 'so this control would damage nothing or damage more than it names');
  }
  const target = path.join(REPO, SABOTAGED);
  if (fs.existsSync(target) && !fs.readFileSync(target, 'utf8').includes(MARKER)) {
    throw new Error(`${SABOTAGED} exists and is not a copy this script wrote — refusing to overwrite it`);
  }
  /* The marker goes at the END so every line number in the copy still matches the instrument it
     was made from. */
  fs.writeFileSync(target, `${src.replace(spec.find, spec.replace)}\n${MARKER}\n`);
  return target;
}

/* Exit code 1 is the normal outcome for the sabotaged run — the verdict is read from the JSON
   record, not from the code. */
function runMetaEval(checker, jsonPath, extra) {
  const args = [path.join(HERE, 'run-meta-eval.js'), '--checker', checker, '--json', jsonPath, ...extra];
  const r = spawnSync(process.execPath, args, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status === null) return { crashed: true, out: `${r.stdout || ''}${r.stderr || ''}`.trim(), signal: r.signal };
  if (!fs.existsSync(jsonPath)) return { crashed: true, out: `${r.stdout || ''}${r.stderr || ''}`.trim(), signal: null };
  return { crashed: false, code: r.status, out: r.stdout || '', record: JSON.parse(fs.readFileSync(jsonPath, 'utf8')) };
}

/* Written from the manifest, before anything runs. A raised floor can only turn PASS into FAIL,
   and only for a specimen whose analytic ratio lies between the two floors. */
function predictFlips(manifest, spec) {
  return manifest.cases
    .filter((c) => c.part === 'A' && c.truth === 'pass' && c.analyticRatio < spec.newFloor[c.floor])
    .map((c) => c.id)
    .sort();
}

function main() {
  const name = String(S.flag('sabotage', 'META_EVAL_SABOTAGE', 'floor'));
  const spec = SABOTAGES[name];
  if (!spec) {
    console.log(`unknown sabotage ${JSON.stringify(name)}\nknown: ${Object.keys(SABOTAGES).join(', ')}`);
    process.exit(2);
  }
  const manifestPath = path.join(HERE, 'cases', 'cases.json');
  if (!fs.existsSync(manifestPath)) {
    console.log(`no manifest at ${rel(manifestPath)} — run node meta-eval/gen-cases.js first`);
    process.exit(2);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const predicted = spec.partA === 'must-move' ? predictFlips(manifest, spec) : [];
  /* Forwarded, not assumed. The usage line has always advertised --engines; passing extra = []
     meant the child fell back to S.engines()'s chromium+webkit default, so the documented
     invocation quietly ran twice the browser cells it named. */
  const engines = S.flag('engines', 'ENGINES', null);
  const shared = engines ? ['--engines', String(engines)] : [];
  const declared = floorDeclaration(spec);

  console.log(`${'='.repeat(78)}\n== meta-eval control: ${name}\n== sabotage: ${spec.describes}\n${'='.repeat(78)}`);
  console.log(`instrument ${INSTRUMENT} -> ${SABOTAGED}, one replacement: ${JSON.stringify(spec.find)} -> ${JSON.stringify(spec.replace)}`);
  console.log(`engines: ${engines ? `${engines} (forwarded to both nested runs)` : 'not narrowed — the nested runs use run-meta-eval.js\'s own default'}`);
  if (spec.partA === 'must-move') {
    console.log(`prediction (written from ${rel(manifestPath)}, before the run): ${predicted.length} Part A case(s) flip PASS -> FAIL, all false-fail: ${predicted.join(' ')}`);
    console.log(`the sabotaged run is given --sabotage-floors ${declared}; the baseline is not, and its floor cross-check stays fully armed`);
  } else {
    console.log('prediction (pre-registered): Part A does not move at all — a solid ground makes p10 and p90 the same pixel — and at least one Part B case does');
  }

  const target = writeSabotagedCopy(name);
  const dryRun = !!S.flag('dry-run', 'META_EVAL_DRY_RUN', false);
  if (dryRun) {
    console.log(`wrote ${rel(target)} (--dry-run: no browser was launched, nothing is credited)`);
    fs.rmSync(target);
    console.log(`removed ${rel(target)}`);
    return 0;
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-eval-control-'));
  const failures = [];
  try {
    /* Baseline first, and it has to be CLEAN, not merely present: a sabotaged run that disagrees
       proves nothing if the unsabotaged one disagreed too. */
    const base = runMetaEval(INSTRUMENT, path.join(tmp, 'baseline.json'), shared);
    console.log(`\nbaseline ${INSTRUMENT}`);
    if (base.crashed) {
      console.log(`!! ${name}: the baseline meta-eval CRASHED (${base.signal || 'no record written'}) — infrastructure, not a verdict\n${base.out}`);
      return 1;
    }
    console.log(base.out.trim());
    if (!base.record.clean) {
      console.log(`!! ${name}: the baseline meta-eval is not clean (${base.record.refusals.length} refusal(s), `
        + `${base.record.partA.unusable} unusable, ${base.record.partA.disagree} disagreeing), so a moved meter would prove nothing`);
      return 1;
    }

    const sab = runMetaEval(SABOTAGED, path.join(tmp, 'sabotaged.json'),
      declared ? [...shared, '--sabotage-floors', declared] : shared);
    console.log(`\nsabotaged ${SABOTAGED}`);
    if (sab.crashed) {
      console.log(`!! ${name}: the sabotaged meta-eval CRASHED (${sab.signal || 'no record written'}) — infrastructure, not a verdict\n${sab.out}`);
      return 1;
    }
    console.log(sab.out.trim());

    if (sab.record.refusals.length) failures.push(`the sabotaged run refused ${sab.record.refusals.length} thing(s); a control that cannot read its own run credits nothing`);
    /* Expected under a raised floor, and worth printing rather than swallowing: these are the
       carrier's own nodes going red, and they spend the same 40-row budget the canaries do. */
    if (sab.record.offSpecimen && sab.record.offSpecimen.length) {
      console.log(`\nthe sabotaged instrument also failed ${new Set(sab.record.offSpecimen.map((o) => o.path)).size} carrier node(s) `
        + `over ${sab.record.offSpecimen.length} row(s) — expected: the raised floor applies to the whole page`);
    }
    if (sab.record.partA.usable !== base.record.partA.usable) {
      failures.push(`Part A usable moved ${base.record.partA.usable} -> ${sab.record.partA.usable}; the sabotage was supposed to change verdicts, not coverage`);
    }

    if (spec.partA === 'must-move') {
      const observed = sab.record.partA.disagreeIds.slice().sort();
      if (JSON.stringify(observed) !== JSON.stringify(predicted)) {
        failures.push(`predicted flips ${JSON.stringify(predicted)} but observed ${JSON.stringify(observed)}`);
      }
      if (sab.record.partA.falsePass !== 0) failures.push(`${sab.record.partA.falsePass} false-pass(es); a raised floor can only produce false fails`);
      if (sab.record.partA.agree !== base.record.partA.agree - predicted.length) {
        failures.push(`agreement went ${base.record.partA.agree} -> ${sab.record.partA.agree}, expected ${base.record.partA.agree - predicted.length}`);
      }
    } else {
      const moved = Object.keys(base.record.partB.verdicts)
        .filter((id) => sab.record.partB.verdicts[id] !== undefined && sab.record.partB.verdicts[id] !== base.record.partB.verdicts[id]);
      if (sab.record.partA.agree !== base.record.partA.agree || sab.record.partA.disagreeIds.length) {
        failures.push('Part A MOVED under a worst-decile sabotage. That contradicts the solid-ground argument this design rests on — '
          + 'it is a finding about METHOD.md, not a passed control');
      }
      if (!moved.length) failures.push('no Part B verdict moved; the decile has no effect this control can see');
      else console.log(`\nPart B verdicts moved on ${moved.length} case(s): ${moved.join(' ')}`);
    }

    console.log(`\n${'='.repeat(78)}`);
    if (failures.length) {
      console.log(`meta-eval control ${name}: DID NOT FIRE\n  ${failures.join('\n  ')}`);
      return 1;
    }
    const verdictLine = `FIRED  meta-eval control ${name}: baseline clean at ${base.record.partA.agree}/${base.record.partA.usable}, `
      + `sabotaged ${sab.record.partA.agree}/${sab.record.partA.usable}`
      + `${spec.partA === 'must-move' ? `, exactly the ${predicted.length} predicted case(s) flipped, all false-fail` : ', Part A unmoved as pre-registered'}`;
    console.log(verdictLine);
    /* The two records above live in a temp dir the finally below removes, so a fired control
       would otherwise leave no receipt a commit can carry. Persisted only on FIRED: a control
       that did not fire has nothing to certify, and its output is its diagnosis. */
    const receipt = path.join(REPO, 'meta-eval/runs', `sabotage-${name}.json`);
    fs.writeFileSync(receipt, `${JSON.stringify({
      control: name, date: new Date().toISOString(), verdict: verdictLine,
      prediction: predicted, baseline: base.record, sabotaged: sab.record,
    }, null, 2)}\n`);
    console.log(`receipt: meta-eval/runs/sabotage-${name}.json`);
    return 0;
  } finally {
    /* The copy is removed whatever happened. A stray sabotaged checker left in checks/ is inert
       — nothing enumerates that directory — but a repo whose brand is measurement honesty does
       not leave a damaged instrument lying next to the real one. */
    fs.rmSync(path.join(REPO, SABOTAGED), { force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`removed ${SABOTAGED}`);
  }
}

if (require.main === module) process.exit(main());

module.exports = { SABOTAGES, predictFlips, writeSabotagedCopy, floorDeclaration, SABOTAGED, MARKER };
