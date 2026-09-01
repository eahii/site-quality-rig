'use strict';
/* Judge the judge: how often does checks/check-contrast.js agree with a truth it did not
   produce, and when it disagrees, in which direction.

   The rig's other receipts say the gates fire. That is a claim about the harness. This one is a
   claim about the instrument: a gate that goes red on command can still be wrong about every
   page it grades green. So the specimens are built with a known answer (meta-eval/gen-cases.js),
   the answer is computed by an implementation that shares no code with the instrument
   (meta-eval/lib/wcag.js), and what is reported is an agreement rate with a denominator and a
   confusion direction — never a score.

   HOW THE VERDICTS ARE READ, and why it is done the hard way. check-contrast.js prints FAILING
   rows only. A specimen that does not appear in the output is either a specimen that passed or a
   specimen that was never measured, and those two produce byte-identical output. Every block
   therefore carries a canary at about 1.04:1, far under every floor, which MUST print. The
   canary's row is the positive evidence that the block was measured; only against that evidence
   does the specimen's absence mean PASS. A block whose canary is missing is UNUSABLE, and
   unusable is reported as its own number, never folded into either column.

   Three further refusals, all of them loud, because a meta-evaluation that guesses is worth less
   than none:

     the elision line     check-contrast.js:335-336 caps a cell at 40 printed rows and appends
                          "... and N more failing nodes". A cell carrying it has lost rows this
                          accounting depends on, so the whole cell is refused rather than read.
     a missing cell       every carrier cell holds canaries, so a cell that printed no failing
                          row at all did not measure the blocks. The test is per scope, not on
                          the tally: every engine x viewport x carrier seen in the output must
                          appear as a FAIL cell. The tally is checked separately and against the
                          number the instrument can actually print — EXPECTED_OK_ROWS below.
     an unrecognised row  a failing row this parser cannot classify stops the run. Silently
                          skipping one is how a specimen's real verdict gets dropped.

   The floor, the pixel size and the weight in each printed row are checked against the manifest
   too: they are the instrument's own report of what it saw, and a specimen that rendered at a
   different size than it was authored at is a different specimen. The floor check has one
   declared escape hatch, --sabotage-floors, and it exists because without it the control that
   raises the instrument's floors could never come out green: every row the sabotaged instrument
   prints carries the raised floor, which is exactly what this check is built to reject. The
   remap must be DECLARED on the command line, it is recorded in the JSON, and the check stays
   fully armed against every floor the declaration does not name.

   A failing row on a node that is not a specimen or a canary — a carrier page's own text going
   red — is neither refused nor dropped: it is collected, counted and printed as an off-specimen
   row. On a baseline run there should be none, and one blocks the clean stamp. Under a declared
   floor remap they are expected (the raised floor applies to the whole page, not just the
   blocks), so they print and are counted without blocking. Either way they are visible, because
   a carrier going red silently is how the 40-row cap gets overrun without anyone noticing.

   FIRST RUN 2026-09-01 at 83704ec, chromium and chromium+webkit: refusals 0, Part A 30/30
   agree, Part B 24/24 measured with 0 cell-inconsistent, off-specimen rows 0. The records are
   under meta-eval/runs/; the UNVERIFIED-UNTIL-BROWSER-PHASE markers this header used to point
   at were retired the same day, each replaced by what the run showed at that line.

   Usage: node meta-eval/run-meta-eval.js [--checker PATH] [--engines chromium]
                                          [--labels FILE] [--json FILE]
                                          [--sabotage-floors 3=4,4.5=5.5] [--self-test] */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const S = require('../checks/lib/site');
const { gitSha } = require('../checks/lib/report');
const F = require('../controls/fixture');
const W = require('./lib/wcag');
const { wilson, fmtInterval, confusion } = require('./lib/stats');

const HERE = __dirname;
const REPO = S.REPO;
const CASES = path.join(HERE, 'cases', 'cases.json');
const CASE_SITE = path.join(HERE, 'dist');
const DEFAULT_CHECKER = 'checks/check-contrast.js';

/* ------------------------------------------------------------------------------ parsing ---- */

/* Shapes taken from the source, not from a run: report.js:24 prints `FAIL  <scope>` followed by
   each problem indented eight spaces, and check-contrast.js:324 formats the ratio row. The
   finish expression is the one scripts/run-checks.js:143 uses, copied rather than imported
   because that file exports nothing — if one of them changes, both must. */
const FAIL_HEAD = /^FAIL {2}(.+)$/;
const PROB_LINE = /^ {8}(.*)$/;
const FINISH = /^(\S+): (\d+)\/(\d+) cells OK\s+[-—]+\s+(PASS|FAIL)\s+\[(.*)\]\s*$/;
const CELL_SCOPE = /^(\S+) (\S+) (\S+) \[(\d+) nodes \(([^)]*)\), (\d+) unpainted, (\d+) unresolvable\]$/;
const RATIO_ROW = /^([\d.]+):1 < ([\d.]+) \(min ([\d.]+), (\d+)px\/(\d+)\) (\S+) "(.*)"$/;
const ELISION = /^\.\.\. and (\d+) more failing nodes$/;
const REGISTER_ROW = /^REGISTER /;
const UNRESOLVABLE_ROW = /^UNRESOLVABLE COLOUR /;
const NOTHING_MEASURED = /^NO TEXT NODES MEASURED/;
const CASE_TOKEN = /\b(spec|canary)-([a-z]\d{2})\b/;

function parseRun(stdout) {
  const cells = [];
  const strays = [];
  let current = null;
  let finish = null;
  for (const raw of String(stdout).split('\n')) {
    const line = raw.replace(/\r$/, '');
    const head = FAIL_HEAD.exec(line);
    if (head) {
      const m = CELL_SCOPE.exec(head[1]);
      current = m
        ? { scope: head[1], engine: m[1], cell: m[2], page: m[3], nodes: Number(m[4]), registers: m[5], unpainted: Number(m[6]), unresolvable: Number(m[7]), rows: [] }
        : { scope: head[1], engine: null, cell: null, page: null, rows: [] };
      (current.engine ? cells : strays).push(current);
      continue;
    }
    const prob = PROB_LINE.exec(line);
    if (prob) {
      if (current) current.rows.push(prob[1]);
      continue;
    }
    current = null;
    const fin = FINISH.exec(line);
    if (fin) finish = { name: fin[1], ok: Number(fin[2]), total: Number(fin[3]), verdict: fin[4], stamp: fin[5] };
  }
  return { cells, strays, finish };
}

/* One printed row, classified. `unknown` is a class of its own and is never treated as noise:
   the caller refuses on it. */
function classifyRow(row) {
  const elided = ELISION.exec(row);
  if (elided) return { kind: 'elision', dropped: Number(elided[1]) };
  const m = RATIO_ROW.exec(row);
  if (m) {
    const token = CASE_TOKEN.exec(m[6]);
    return {
      kind: 'ratio',
      p10: Number(m[1]),
      floor: Number(m[2]),
      min: Number(m[3]),
      sizePx: Number(m[4]),
      weight: Number(m[5]),
      cssPath: m[6],
      text: m[7],
      role: token ? token[1] : null,
      caseId: token ? token[2] : null,
    };
  }
  if (UNRESOLVABLE_ROW.test(row)) {
    const token = CASE_TOKEN.exec(row);
    return { kind: 'unresolvable', role: token ? token[1] : null, caseId: token ? token[2] : null, row };
  }
  if (REGISTER_ROW.test(row)) return { kind: 'register', row };
  if (NOTHING_MEASURED.test(row)) return { kind: 'nothing-measured', row };
  return { kind: 'unknown', row };
}

/* ------------------------------------------------------------------------------ accounting - */

/* The number of PASSING rows the instrument prints on a run of this shape, and it is not zero.
   check-contrast.js:356-359 always emits `contract registers [..., dead-selector guard NOT
   EVALUATED]` with an empty problem list whenever the run measured fewer than all declared pages
   — which this one always does, because the carriers are four of site.json's six — and
   report.js:29 counts every row into "N/M cells OK". So the producible finish line here is
   `1/M cells OK`, and an accounting rule demanding 0/M would refuse every correct run, including
   the baseline the sabotage control has to clear first. What actually proves the cells were
   measured is the per-scope check below, not this tally. */
const EXPECTED_OK_ROWS = 1;

/* A DECLARED remap of the floors the instrument is expected to print, for the sabotage control
   only: `3=4,4.5=5.5` says a row the manifest grades against 3.0 must print 4.0. Empty by
   default, so an undeclared floor change is still a refusal. */
function parseFloorMap(raw) {
  const map = new Map();
  const text = String(raw || '').trim();
  if (!text || text === 'true') return map;
  for (const part of text.split(',')) {
    const m = /^([\d.]+)=([\d.]+)$/.exec(part.trim());
    if (!m) throw new Error(`--sabotage-floors: ${JSON.stringify(part)} is not <floor>=<floor>`);
    map.set(Number(m[1]), Number(m[2]));
  }
  return map;
}

function account(manifest, parsed, opts = {}) {
  const refusals = [];
  const offSpecimen = [];
  const floorMap = opts.floorMap || new Map();
  const expectFloor = (f) => (floorMap.has(f) ? floorMap.get(f) : f);
  const byId = new Map(manifest.cases.map((c) => [c.id, c]));
  const observations = new Map(manifest.cases.map((c) => [c.id, []]));

  if (!parsed.finish) {
    refusals.push('the checker printed no finish line — there is no denominator to read, so nothing is counted');
  } else {
    if (parsed.finish.ok !== EXPECTED_OK_ROWS) {
      refusals.push(`the finish line says ${parsed.finish.ok} of ${parsed.finish.total} cells OK; exactly ${EXPECTED_OK_ROWS} is producible here `
        + '(the dead-selector summary row a --pages run always adds), so any other number means a carrier cell printed no failing row or a row this parser never saw');
    }
    if (parsed.cells.length + parsed.finish.ok !== parsed.finish.total) {
      refusals.push(`parsed ${parsed.cells.length} failing cells and the finish line says ${parsed.finish.total - parsed.finish.ok} — the output does not add up, so it is not read`);
    }
  }
  for (const s of parsed.strays) {
    refusals.push(`a failing row is not a page cell: "${s.scope}" — the run failed for a reason this accounting does not model`);
  }

  /* The real coverage test. Every carrier page carries canaries in every cell, so a carrier that
     is silent for one engine/viewport pair was not measured there — and silence is exactly what a
     passing page looks like. The engine and viewport sets are taken from the output rather than
     from a constant, because check-contrast.js owns its own cell matrix; what is asserted is that
     the matrix is COMPLETE over the carriers, which is what the accounting depends on. */
  const seenEngines = [...new Set(parsed.cells.map((c) => c.engine))];
  const seenViewports = [...new Set(parsed.cells.map((c) => c.cell))];
  for (const engine of seenEngines) {
    for (const viewport of seenViewports) {
      for (const carrier of manifest.carriers) {
        if (!parsed.cells.some((c) => c.engine === engine && c.cell === viewport && c.page === carrier.file)) {
          const n = carrier.cases.length;
          refusals.push(`${engine} ${viewport} ${carrier.file} printed no failing row — it carries ${n} canar${n === 1 ? 'y' : 'ies'} that must fail, so this cell measured nothing rather than passing`);
        }
      }
    }
  }

  for (const cell of parsed.cells) {
    const rows = cell.rows.map(classifyRow);
    const unknown = rows.filter((r) => r.kind === 'unknown');
    for (const u of unknown) refusals.push(`${cell.scope}: unrecognised failing row ${JSON.stringify(u.row)}`);
    if (rows.some((r) => r.kind === 'elision')) {
      const n = rows.find((r) => r.kind === 'elision').dropped;
      refusals.push(`${cell.scope}: ${n} failing rows were elided at the ${manifest.cap.maxProblems}-row cap — this cell is refused, not guessed`);
      continue;
    }
    if (rows.some((r) => r.kind === 'nothing-measured')) {
      refusals.push(`${cell.scope}: the checker measured no text node at all`);
      continue;
    }

    const carrier = manifest.carriers.find((c) => c.file === cell.page);
    if (!carrier) continue;
    const failedSpec = new Map();
    const firedCanary = new Set();
    const noVerdict = new Set();
    for (const r of rows) {
      /* A register-coverage row means a ground the contract names lost its measured nodes. The
         injected blocks are supposed to be inert with respect to that — flow content after the
         footer, matching no register selector, overlaying nothing — so this row is evidence the
         injection changed what the instrument could reach, and the run is not read past it. */
      if (r.kind === 'register') {
        refusals.push(`${cell.scope}: ${r.row} — the injected blocks were supposed to leave register coverage untouched`);
        continue;
      }
      if (r.kind === 'unresolvable') {
        /* The instrument said it could not certify this node. Booking a verdict for it anyway —
           which the pass-inference below would do, since no ratio row exists for it — would tally
           a specimen the engine refused as a confident PASS, in the false-pass direction. So the
           id is parked here and the cell contributes nothing for it. */
        if (r.caseId) { noVerdict.add(r.caseId); refusals.push(`${cell.scope}: the engine refused the colour on ${r.role}-${r.caseId} — that specimen has no verdict in this cell`); }
        else refusals.push(`${cell.scope}: ${r.row}`);
        continue;
      }
      if (r.kind !== 'ratio') continue;
      if (!r.caseId) {
        /* A carrier page's own text went red. Not a specimen, so it carries no verdict — but it
           is not noise either: these rows count against the 40-row cap and are the first sign a
           carrier has stopped being green underneath the measurement. */
        offSpecimen.push({ cell: cell.scope, path: r.cssPath, p10: r.p10, floor: r.floor });
        continue;
      }
      const c = byId.get(r.caseId);
      if (!c) { refusals.push(`${cell.scope}: row names ${r.role}-${r.caseId}, which is not in the manifest`); continue; }
      if (c.page !== cell.page) {
        refusals.push(`${cell.scope}: row names ${r.role}-${r.caseId}, whose block is on ${c.page} — the join key is not unique across the measured pages`);
        continue;
      }
      if (r.role === 'canary') { firedCanary.add(r.caseId); continue; }
      /* The instrument's own report of what it rendered. A specimen graded at a size or weight
         it was not authored at is a different specimen, and the ratio underneath it is about
         something else. */
      if (r.sizePx !== Math.round(c.sizePx) || r.weight !== c.weight) {
        refusals.push(`${cell.scope}: ${c.id} was authored ${c.sizePx}px/${c.weight} and measured ${r.sizePx}px/${r.weight}`);
      }
      const want = expectFloor(c.floor);
      const wantFromRendered = expectFloor(W.floorFor(r.sizePx, r.weight));
      if (r.floor !== want || r.floor !== wantFromRendered) {
        refusals.push(`${cell.scope}: ${c.id} was graded against ${r.floor}, expected ${want}`
          + `${floorMap.size ? ` under the declared floor remap (manifest floor ${c.floor})` : ''}`);
      }
      failedSpec.set(r.caseId, { p10: r.p10, min: r.min });
    }
    /* One observation per case per cell, and exactly one. The canary is what separates "passed"
       from "never measured", so a block whose canary did not print is unusable here — including
       when the specimen itself printed a row, because a half-measured block is evidence its
       geometry or its occlusion went wrong, which is evidence about the ratio too. METHOD.md
       states this rule without an exception; this loop is that rule. */
    for (const id of carrier.cases) {
      const at = `${cell.engine} ${cell.cell}`;
      const hit = failedSpec.get(id);
      if (!firedCanary.has(id)) {
        if (hit) refusals.push(`${cell.scope}: ${id} printed a failing row but its canary did not — the block was only half measured, so neither half is read`);
        observations.get(id).push({ cell: at, verdict: null, p10: null, min: null });
        continue;
      }
      if (noVerdict.has(id)) { observations.get(id).push({ cell: at, verdict: null, p10: null, min: null }); continue; }
      observations.get(id).push(hit
        ? { cell: at, verdict: 'fail', p10: hit.p10, min: hit.min }
        : { cell: at, verdict: 'pass', p10: null, min: null });
    }
  }

  const results = manifest.cases.map((c) => {
    const obs = observations.get(c.id) || [];
    const usable = obs.filter((o) => o.verdict !== null);
    const verdicts = [...new Set(usable.map((o) => o.verdict))];
    const ratios = [...new Set(usable.filter((o) => o.p10 !== null).map((o) => o.p10))];
    return {
      id: c.id,
      part: c.part,
      page: c.page,
      truth: c.truth,
      floor: c.floor,
      analyticRatio: c.analyticRatio === undefined ? null : c.analyticRatio,
      cellsSeen: obs.length,
      cellsUsable: usable.length,
      verdict: usable.length === 0 ? null : verdicts.length === 1 ? verdicts[0] : 'inconsistent',
      printedRatios: ratios,
      ratioSpread: ratios.length > 1 ? Math.max(...ratios) - Math.min(...ratios) : 0,
    };
  });

  return { refusals, results, offSpecimen };
}

function summarise(manifest, results, labels) {
  const A = results.filter((r) => r.part === 'A');
  const B = results.filter((r) => r.part === 'B');

  const aUsable = A.filter((r) => r.verdict !== null);
  const aUnusable = A.filter((r) => r.verdict === null);
  const aInconsistent = aUsable.filter((r) => r.verdict === 'inconsistent');
  const pairs = aUsable.filter((r) => r.verdict !== 'inconsistent').map((r) => ({ truth: r.truth, verdict: r.verdict }));
  const conf = confusion(pairs);
  /* An inconsistent case is a disagreement, not an exclusion: the truth does not depend on the
     viewport, so a case that came out PASS in one cell and FAIL in another is wrong in at least
     one of them. */
  const agree = conf.agree;
  const partA = {
    cases: A.length,
    usable: aUsable.length,
    unusable: aUnusable.length,
    unusableIds: aUnusable.map((r) => r.id),
    inconsistent: aInconsistent.length,
    inconsistentIds: aInconsistent.map((r) => r.id),
    agree,
    disagree: aUsable.length - agree,
    disagreeIds: [...aInconsistent.map((r) => r.id), ...aUsable.filter((r) => r.verdict !== 'inconsistent' && r.verdict !== r.truth).map((r) => r.id)].sort(),
    falsePass: conf.falsePass,
    falseFail: conf.falseFail,
    truePass: conf.truePass,
    trueFail: conf.trueFail,
    wilson: wilson(agree, aUsable.length),
  };

  /* Only failing cases print a ratio, so this delta covers half the set by construction. Said
     here rather than left for a reader to notice: the instrument's public output carries no
     number for a node it passed. */
  const deltas = A.filter((r) => r.verdict === 'fail' && r.printedRatios.length === 1 && r.analyticRatio !== null)
    .map((r) => ({ id: r.id, delta: Math.abs(r.printedRatios[0] - r.analyticRatio) }));
  partA.ratioDelta = deltas.length ? { n: deltas.length, max: Math.max(...deltas.map((d) => d.delta)), worst: deltas.sort((x, y) => y.delta - x.delta)[0].id } : null;
  partA.unstable = A.filter((r) => r.ratioSpread > 0).map((r) => r.id);

  /* Three buckets, and the print block names all three, because `measured N/24` next to a silent
     remainder is a denominator that is not the thing counted. An inconsistent Part B case is a
     case the instrument graded differently in different cells; there is no human label to compare
     it against, so it cannot join the agreement tally, but it is a finding about the instrument
     and it blocks the clean stamp exactly as its Part A counterpart does. */
  const bUsable = B.filter((r) => r.verdict !== null && r.verdict !== 'inconsistent');
  const bInconsistent = B.filter((r) => r.verdict === 'inconsistent');
  const partB = {
    cases: B.length,
    usable: bUsable.length,
    unusable: B.filter((r) => r.verdict === null).length,
    unusableIds: B.filter((r) => r.verdict === null).map((r) => r.id),
    inconsistent: bInconsistent.length,
    inconsistentIds: bInconsistent.map((r) => r.id),
    verdicts: Object.fromEntries(bUsable.map((r) => [r.id, r.verdict])),
    labelled: 0,
    unsure: 0,
    agree: null,
    checkerPassHumanStrained: null,
    checkerFailHumanFine: null,
    wilson: null,
  };

  if (labels) {
    const judged = bUsable.map((r) => ({ id: r.id, verdict: r.verdict, label: labels.labels[r.id] }))
      .filter((r) => r.label !== undefined);
    partB.labelled = judged.length;
    partB.unsure = judged.filter((r) => r.label === 'unsure').length;
    const decided = judged.filter((r) => r.label === 'acceptable' || r.label === 'not acceptable');
    if (decided.length) {
      /* "acceptable" is the human's PASS. The asymmetry that matters is named rather than
         summed: the instrument passing text a reader found hard is the direction that ships. */
      const c = confusion(decided.map((r) => ({ truth: r.label === 'acceptable' ? 'pass' : 'fail', verdict: r.verdict })));
      partB.agree = c.agree;
      partB.decided = c.n;
      partB.checkerPassHumanStrained = c.falsePass;
      partB.checkerFailHumanFine = c.falseFail;
      partB.wilson = wilson(c.agree, c.n);
    }
  }

  return { partA, partB };
}

/* ------------------------------------------------------------------------------ driver ----- */

function loadManifest() {
  if (!fs.existsSync(CASES)) {
    console.log(`no manifest at ${path.relative(REPO, CASES)} — run node meta-eval/gen-cases.js first`);
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(CASES, 'utf8'));
}

/* controls/fixture.js throws if any of these mutations changes zero bytes, which is what stops a
   rotted injection from producing a case site with no cases in it. */
function buildCaseSite(manifest) {
  const html = {};
  const css = {};
  const sheet = fs.readFileSync(path.join(HERE, 'cases', 'specimens.css'), 'utf8');
  for (const carrier of manifest.carriers) {
    const fragment = fs.readFileSync(path.join(HERE, 'cases', 'blocks', `${carrier.slug}.html`), 'utf8');
    html[`dist/${carrier.file}`] = F.injectBody(fragment);
    css[`dist/${carrier.file}`] = `${manifest.carrierNeutraliseCss}\n${sheet}`;
  }
  return F.build(HERE, { html, css });
}

/* A nonzero exit is the EXPECTED outcome — every carrier page carries canaries that fail on
   purpose — so the exit code is recorded and not judged; what is judged is the finish line and
   the rows. */
function runChecker(checker, manifest, engines) {
  /* --root is passed REPO-RELATIVE, and the reason is the record rather than the run. The child is
     spawned with cwd = REPO and checks/lib/site.js:29 resolves --root against cwd, so
     `meta-eval/dist` and the absolute path address the same directory and the checker's own stamp
     reads `meta-eval/dist` either way. What changes is `checkerArgs` in the JSON: an absolute path
     there stamps THIS machine's home directory into a record meant to be diffed against a run on
     another one. The comparability-key argv scripts/run-checks.js records is a different argument
     and is not touched by this. */
  const args = [
    '--root', path.relative(REPO, CASE_SITE).replace(/\\/g, '/'),
    '--pages', manifest.carriers.map((c) => c.file).join(','),
    '--engines', engines.join(','),
  ];
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.resolve(REPO, checker), ...args], {
    cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    args, durationMs: Date.now() - t0,
    code: r.status, signal: r.signal,
    stdout: r.stdout || '', stderr: r.stderr || '',
  };
}

function main() {
  const manifest = loadManifest();
  const checker = String(S.flag('checker', 'META_EVAL_CHECKER', DEFAULT_CHECKER));
  const engines = S.engines();
  const jsonOut = S.flag('json', 'META_EVAL_JSON', null);
  const labelsPath = S.flag('labels', 'META_EVAL_LABELS', path.join(HERE, 'labeling', 'labels.json'));
  const labelsFile = path.resolve(REPO, String(labelsPath));
  const labels = fs.existsSync(labelsFile) ? JSON.parse(fs.readFileSync(labelsFile, 'utf8')) : null;
  const declaredFloors = String(S.flag('sabotage-floors', 'META_EVAL_SABOTAGE_FLOORS', ''));
  const floorMap = parseFloorMap(declaredFloors);

  buildCaseSite(manifest);
  const run = runChecker(checker, manifest, engines);
  if (run.code === null) {
    console.log(`the checker died on ${run.signal || 'no signal'} without a verdict — infrastructure, not a measurement`);
    if (run.stderr.trim()) console.log(run.stderr.trim());
    process.exit(2);
  }

  const parsed = parseRun(run.stdout);
  const { refusals, results, offSpecimen } = account(manifest, parsed, { floorMap });
  const { partA, partB } = summarise(manifest, results, labels);

  /* Relative inside the repo, absolute outside it — a pointer spelled ../../../.. names nothing
     a reader can act on (same rule as scripts/run-checks.js). */
  const rel = (p) => { const r = path.relative(REPO, p).replace(/\\/g, '/'); return r.startsWith('..') ? p : r; };
  console.log(`meta-eval contrast: checker=${checker} root=${S.rootLabel(CASE_SITE)} engines=${engines.join('+')} `
    + `cases=${manifest.counts.total} (A ${manifest.counts.partA}, B ${manifest.counts.partB}) carriers=${manifest.carriers.length}`);
  if (floorMap.size) {
    console.log(`declared floor remap ${declaredFloors} — the instrument under test is EXPECTED to print these floors; `
      + 'this run is a sabotage run and its agreement number is not a measurement of the shipped instrument');
  }
  console.log(`checker exit ${run.code} in ${(run.durationMs / 1000).toFixed(1)}s — a nonzero exit is expected here: every block carries a failing canary`);
  if (parsed.finish) console.log(`checker finish: ${parsed.finish.name}: ${parsed.finish.ok}/${parsed.finish.total} cells OK — ${parsed.finish.verdict}  [${parsed.finish.stamp}]`);

  for (const r of refusals) console.log(`REFUSED  ${r}`);
  /* The tallies still print when something was refused — hiding them would lose the part that
     was readable — but they may not be quoted without this line beside them. */
  if (refusals.length) console.log(`\n${refusals.length} refusal(s) above: the tallies below cover only what could be read, and this run is NOT clean`);

  if (offSpecimen.length) {
    const paths = [...new Set(offSpecimen.map((o) => o.path))];
    console.log(`\noff-specimen rows ${offSpecimen.length} over ${paths.length} distinct node(s) — carrier text that failed, carrying no case id:`);
    for (const p of paths.slice(0, 8)) console.log(`    ${p}`);
    if (paths.length > 8) console.log(`    … and ${paths.length - 8} more`);
    console.log(floorMap.size
      ? '  expected under the declared floor remap (it applies to the whole page, not only the blocks); counted, not folded into any tally'
      : '  NOT expected on a baseline run: a carrier page has gone red underneath the measurement, and these rows count against the 40-row cap');
  }

  console.log('\nPART A — solid grounds, analytic truth from meta-eval/lib/wcag.js');
  console.log(`  usable       ${partA.usable}/${partA.cases} cases${partA.unusable ? ` (unusable: ${partA.unusableIds.join(' ')})` : ''}`);
  console.log(`  agreement    ${partA.agree}/${partA.usable}${partA.usable ? ` = ${fmtInterval(partA.wilson)}` : ''}`);
  console.log(`  confusion    true-pass ${partA.truePass}  true-fail ${partA.trueFail}  false-pass ${partA.falsePass}  false-fail ${partA.falseFail}`
    + `${partA.inconsistent ? `  inconsistent-across-cells ${partA.inconsistent} (${partA.inconsistentIds.join(' ')})` : ''}`);
  if (partA.disagree) console.log(`  disagreed    ${partA.disagreeIds.join(' ')}`);
  console.log(`  ratio delta  ${partA.ratioDelta
    ? `max |printed p10 - analytic| ${partA.ratioDelta.max.toFixed(3)} over ${partA.ratioDelta.n} failing cases (worst ${partA.ratioDelta.worst}); the printed value is rounded to 2dp, a passing case prints none`
    : 'no failing case printed a ratio'}`);

  console.log('\nPART B — gradients, plates and stripes; no analytic truth');
  console.log(`  measured     ${partB.usable}/${partB.cases} cases${partB.unusable ? ` (unusable: ${partB.unusableIds.join(' ')})` : ''}`
    + `${partB.inconsistent ? ` (inconsistent across cells, excluded from the tally: ${partB.inconsistentIds.join(' ')})` : ''}`);
  if (!labels) {
    console.log(`  labels       none at ${rel(labelsFile)} — no agreement number is computed until a labelling pass exists`);
  } else {
    console.log(`  labels       ${partB.labelled} from ${JSON.stringify(labels.annotator || 'unnamed annotator')} (${partB.unsure} unsure, excluded)`);
    console.log(`  agreement    ${partB.agree === null ? 'no decided label' : `${partB.agree}/${partB.decided} = ${fmtInterval(partB.wilson)}`}`);
    console.log(`  direction    checker PASS where the reader was strained ${partB.checkerPassHumanStrained}  (the direction that ships)`);
    console.log(`               checker FAIL where the reader was fine     ${partB.checkerFailHumanFine}`);
  }

  /* An off-specimen row is expected under a declared remap and nowhere else, so it blocks the
     clean stamp only when nothing was declared. Part B inconsistency blocks it either way: a
     verdict that depends on the viewport is a defect whichever run produced it. */
  const clean = refusals.length === 0 && partA.unusable === 0 && partA.disagree === 0
    && partB.unusable === 0 && partB.inconsistent === 0
    && (floorMap.size > 0 || offSpecimen.length === 0);
  const stamp = Object.entries({
    sha: gitSha(),
    checker,
    root: S.rootLabel(CASE_SITE),
    engines: engines.join('+'),
    pages: manifest.carriers.length,
    partA: `${partA.agree}/${partA.usable}`,
    partB: `${partB.usable}/${partB.cases}`,
    unusable: partA.unusable + partB.unusable,
    labels: partB.labelled,
    refused: refusals.length,
    offSpecimen: offSpecimen.length,
    ...(floorMap.size ? { sabotageFloors: declaredFloors } : {}),
  }).map(([k, v]) => `${k}=${v}`).join(' ');
  /* Deliberately not the "N/M cells OK" wording every checker ends on: this is not a checker,
     and a line that matched scripts/run-checks.js's finish expression could be lifted into a
     battery summary as though a gate had reported it. */
  console.log(`\nmeta-eval: ${partA.agree}/${partA.usable} Part A cases agree — ${clean ? 'PASS' : 'FAIL'}  [${stamp}]`);

  if (jsonOut) {
    const file = path.resolve(REPO, String(jsonOut));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify({
      schemaVersion: 1,
      date: new Date().toISOString(),
      sha: gitSha(),
      checker,
      engines: engines.join('+'),
      checkerExit: run.code,
      checkerArgs: run.args,
      sabotageFloors: declaredFloors || null,
      finish: parsed.finish,
      clean,
      refusals,
      offSpecimen,
      partA,
      partB,
      cases: results,
    }, null, 2)}\n`);
    console.log(`record: ${rel(file)}`);
  }

  process.exit(clean ? 0 : 1);
}

/* The one part of this file a browserless machine can exercise: the parser, against rows written
   BY HAND from the format strings in check-contrast.js:324 and report.js:24. These lines were
   never printed by a run and are not evidence that one happened — they are a fixture for the
   regexes above, and the browser phase is what replaces them with real output.

   A hand-written fixture can be wrong in a way a real run never is, and this one already was: it
   ended on `0/2 cells OK`, which the instrument structurally cannot print on a --pages run
   (check-contrast.js:356-359 always adds one passing summary row, and report.js:29 counts it).
   The accounting rule built on that line refused every correct run. Every finish line below is
   now written with that row included — the reason EXPECTED_OK_ROWS exists and is named. */
function selfTest() {
  const sample = [
    '',
    'FAIL  chromium se1 services/index.html [40 nodes (base:38 footer-inverse:2), 4 unpainted, 0 unresolvable]',
    '        1.04:1 < 4.5 (min 1.04, 16px/400) div.mev-block>div.mev-canary>p.canary-a01 "canary"',
    '        2.95:1 < 4.5 (min 2.95, 16px/400) div.mev-block>div.mev-ground>p.spec-a01 "Sample specimen text"',
    '        1.04:1 < 4.5 (min 1.04, 16px/400) div.mev-block>div.mev-canary>p.canary-a02 "canary"',
    'FAIL  chromium iphone-pro about/index.html [20 nodes (base:20), 2 unpainted, 0 unresolvable]',
    '        1.04:1 < 4.5 (min 1.04, 16px/400) div.mev-block>div.mev-canary>p.canary-b01 "canary b01"',
    '        ... and 7 more failing nodes',
    'note  warn: dead-selector guard not evaluated — measured 4 of 6 declared pages',
    '',
    'contrast: 1/3 cells OK — FAIL  [sha=abc1234 root=meta-eval/dist engines=chromium cells=3 pages=4]',
  ].join('\n');

  const bad = [];
  let asserted = 0;
  const eq = (got, want, what) => {
    asserted++;
    const g = JSON.stringify(got);
    const w = JSON.stringify(want);
    console.log(`${what}: ${g}`);
    if (g !== w) bad.push(`${what} = ${g}, want ${w}`);
  };

  const parsed = parseRun(sample);
  eq(parsed.cells.length, 2, 'cells parsed');
  eq(parsed.strays.length, 0, 'stray FAIL rows');
  eq([parsed.cells[0].engine, parsed.cells[0].cell, parsed.cells[0].page], ['chromium', 'se1', 'services/index.html'], 'first cell scope');
  eq(parsed.cells[0].nodes, 40, 'first cell node count');
  eq(parsed.cells[0].rows.length, 3, 'first cell rows');
  eq(parsed.finish, { name: 'contrast', ok: 1, total: 3, verdict: 'FAIL', stamp: 'sha=abc1234 root=meta-eval/dist engines=chromium cells=3 pages=4' }, 'finish line');

  const spec = classifyRow(parsed.cells[0].rows[1]);
  eq([spec.kind, spec.role, spec.caseId, spec.p10, spec.floor, spec.sizePx, spec.weight], ['ratio', 'spec', 'a01', 2.95, 4.5, 16, 400], 'specimen row');
  const canary = classifyRow(parsed.cells[0].rows[0]);
  eq([canary.kind, canary.role, canary.caseId], ['ratio', 'canary', 'a01'], 'canary row');
  eq(classifyRow(parsed.cells[1].rows[1]).kind, 'elision', 'elision row');
  eq(classifyRow('REGISTER footer-inverse (.site-foot) present in DOM but 0 nodes measured — a coverage hole is not a pass').kind, 'register', 'register row');
  eq(classifyRow('UNRESOLVABLE COLOUR lab(50% 0 0) on div.x>p.spec-b04 "Sample text"').caseId, 'b04', 'unresolvable row case');
  eq(classifyRow('something nobody wrote a shape for').kind, 'unknown', 'unknown row');

  /* The join key is the class in the printed path, never the quoted text: the text is truncated
     at 40 characters by check-contrast.js:96 and two specimens can share one. */
  eq(CASE_TOKEN.exec('div.mev-cases>div.mev-block>div.mev-ground>p.spec-b24')[2], 'b24', 'join key from a full path');

  /* The accounting rule the whole design rests on, exercised on a three-case toy manifest: a
     printed specimen row is a FAIL, a fired canary with no specimen row is a PASS, and a block
     whose canary never printed is UNUSABLE rather than either. */
  const toy = {
    cap: { blocksPerPage: 3, maxProblems: 40 },
    carriers: [{ file: 'p.html', slug: 'p', cases: ['a01', 'a02', 'a03'] }],
    cases: [
      { id: 'a01', part: 'A', page: 'p.html', truth: 'fail', floor: 4.5, sizePx: 16, weight: 400, analyticRatio: 2.95 },
      { id: 'a02', part: 'A', page: 'p.html', truth: 'pass', floor: 4.5, sizePx: 16, weight: 400, analyticRatio: 5.0 },
      { id: 'a03', part: 'A', page: 'p.html', truth: 'pass', floor: 4.5, sizePx: 16, weight: 400, analyticRatio: 6.05 },
    ],
  };
  const CANARY_A01 = '        1.04:1 < 4.5 (min 1.04, 16px/400) div.mev-block>div.mev-canary>p.canary-a01 "canary"';
  const CANARY_A02 = '        1.04:1 < 4.5 (min 1.04, 16px/400) div.mev-block>div.mev-canary>p.canary-a02 "canary"';
  const SPEC_A01 = '        2.95:1 < 4.5 (min 2.95, 16px/400) div.mev-block>div.mev-ground>p.spec-a01 "Sample specimen text"';
  /* One passing summary row plus the failing cells — the shape report.js can actually print. */
  const FINISH = (fails) => `\ncontrast: 1/${fails + 1} cells OK — FAIL  [sha=abc1234 root=meta-eval/dist engines=chromium cells=1 pages=1]`;
  const cell = (rows) => ['FAIL  chromium se1 p.html [6 nodes (base:6), 0 unpainted, 0 unresolvable]', ...rows, FINISH(1)].join('\n');

  const toyOut = cell([CANARY_A01, SPEC_A01, CANARY_A02]);
  const booked = account(toy, parseRun(toyOut));
  eq(booked.refusals, [], 'toy accounting refusals');
  eq(booked.results.map((r) => [r.id, r.verdict]), [['a01', 'fail'], ['a02', 'pass'], ['a03', null]], 'toy verdicts');
  eq(booked.offSpecimen, [], 'toy off-specimen rows');
  const toySummary = summarise(toy, booked.results, null);
  eq([toySummary.partA.usable, toySummary.partA.agree, toySummary.partA.unusable, toySummary.partA.unusableIds], [2, 2, 1, ['a03']], 'toy Part A tally');
  eq(toySummary.partA.ratioDelta.max < 0.005, true, 'toy ratio delta within printing precision');

  /* The finish tally, against the number the instrument can produce rather than against zero.
     `0/N` was the rule this file shipped with, and it refused every correct run. */
  eq(/exactly 1 is producible/.test(account(toy, parseRun(toyOut.replace('1/2 cells OK', '0/1 cells OK'))).refusals[0]), true, 'the old 0/N rule is itself refused now');
  eq(/exactly 1 is producible/.test(account(toy, parseRun(toyOut.replace('1/2 cells OK', '2/3 cells OK'))).refusals[0]), true, 'a second OK cell is refused');

  /* Coverage is per scope, not per tally: a carrier that printed nothing in some engine/viewport
     pair measured nothing there, and silence is what a passing page looks like. */
  const twoCarriers = {
    ...toy,
    carriers: [{ file: 'p.html', slug: 'p', cases: ['a01', 'a02'] }, { file: 'q.html', slug: 'q', cases: ['a03'] }],
    cases: toy.cases.map((c) => (c.id === 'a03' ? { ...c, page: 'q.html' } : c)),
  };
  eq(/q\.html printed no failing row — it carries 1 canary/.test(account(twoCarriers, parseRun(toyOut)).refusals.join('\n')), true, 'a silent carrier cell is refused');

  /* A cell that hit the 40-row cap is refused, not read: the rows this accounting needs may be
     the ones that were dropped. */
  const cappedBooked = account(toy, parseRun(cell([CANARY_A01, '        ... and 12 more failing nodes'])));
  eq(cappedBooked.refusals.length, 1, 'elided cell refusal count');
  eq(/12 failing rows were elided/.test(cappedBooked.refusals[0]), true, 'elided cell refusal names the drop');
  eq(cappedBooked.results.every((r) => r.verdict === null), true, 'an elided cell yields no verdicts');

  /* A register-coverage row means the injection reached something it was supposed to leave
     alone, so it refuses rather than being counted as one more failing node. */
  eq(account(toy, parseRun(cell([CANARY_A01, SPEC_A01,
    '        REGISTER footer-inverse (.site-foot) present in DOM but 0 nodes measured — a coverage hole is not a pass',
  ]))).refusals.length, 1, 'register-coverage row refusal');

  /* An UNRESOLVABLE row must not leave the specimen to the pass-inference below it: the engine
     said it could not certify that node, and booking it PASS would tally a refusal as a
     false-pass — the direction that ships. */
  const unresolved = account(toy, parseRun(cell([CANARY_A01, CANARY_A02,
    '        UNRESOLVABLE COLOUR lab(50% 0 0) on div.mev-ground>p.spec-a01 "Sample specimen text" — instrument cannot certify this node',
  ])));
  eq(unresolved.refusals.length, 1, 'unresolvable specimen refusal count');
  eq(unresolved.results.map((r) => r.verdict), [null, 'pass', null], 'an unresolvable specimen gets no verdict, not a pass');

  /* A specimen row without its canary is a half-measured block. METHOD.md says such a block is
     unusable with no exception, so the printed FAIL is not banked either. */
  const halfBlock = account(toy, parseRun(cell([SPEC_A01, CANARY_A02])));
  eq(/a01 printed a failing row but its canary did not/.test(halfBlock.refusals.join('\n')), true, 'half-measured block refusal');
  eq(halfBlock.results.map((r) => [r.id, r.verdict, r.cellsSeen]), [['a01', null, 1], ['a02', 'pass', 1], ['a03', null, 1]], 'a half-measured block books one null, not a fail plus a null');

  /* The floor cross-check, and the one declared way past it. Undeclared: refuse. Declared by the
     sabotage control: expected, and still armed against any floor the declaration does not name. */
  const raised = cell([CANARY_A01, '        2.95:1 < 5.5 (min 2.95, 16px/400) div.mev-block>div.mev-ground>p.spec-a01 "Sample specimen text"', CANARY_A02]);
  eq(/a01 was graded against 5.5, expected 4.5$/.test(account(toy, parseRun(raised)).refusals[0]), true, 'an undeclared raised floor is refused');
  eq(account(toy, parseRun(raised), { floorMap: parseFloorMap('3=4,4.5=5.5') }).refusals, [], 'a declared raised floor is accepted');
  eq(/expected 5.5 under the declared floor remap/.test(
    account(toy, parseRun(cell([CANARY_A01, SPEC_A01, CANARY_A02])), { floorMap: parseFloorMap('4.5=5.5') }).refusals[0]), true,
  'the check stays armed inside a declared remap');

  /* A failing row on a node that is not a case is counted and named, never dropped: those rows
     eat the same 40-row budget the canaries do. */
  const off = account(toy, parseRun(cell([CANARY_A01, SPEC_A01, CANARY_A02,
    '        5.07:1 < 5.5 (min 5.07, 13px/400) ul.field-list>li.small "Answered within one working day"',
  ])));
  eq(off.refusals, [], 'an off-specimen row is not a refusal');
  eq(off.offSpecimen.map((o) => o.path), ['ul.field-list>li.small'], 'an off-specimen row is collected by path');

  if (bad.length) {
    console.log(`\nrun-meta-eval parser self-test: ${bad.length} of ${asserted} assertions FAILED\n  ${bad.join('\n  ')}`);
    process.exitCode = 1;
  } else {
    console.log(`\nrun-meta-eval parser self-test: ${asserted}/${asserted} assertions OK — PASS (hand-written rows, not a run)`);
  }
}

if (require.main === module) {
  if (process.argv.includes('--self-test')) selfTest();
  else main();
}

/* buildCaseSite is exported so meta-eval/capture-shots.js photographs the SAME tree this file
   measures, built by the same call rather than by a second copy of the injection that could drift
   from it. CASE_SITE travels with it for the same reason. */
module.exports = { parseRun, classifyRow, account, summarise, parseFloorMap, buildCaseSite, CASE_SITE, EXPECTED_OK_ROWS };
