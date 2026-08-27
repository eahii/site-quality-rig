'use strict';
/* Counts the failure-emit sites in checks/ and, given a control-run log, how many of them
   the controls actually printed. docs/CONTROLS.md quotes its armed/unarmed numbers from
   this script rather than from a reading, so a reader can re-run it and disagree.

   An EMIT SITE is one place in the source that can put a line inside a failing row:
   `p.push(…)`, `probs.push(…)`, `endProbs.push(…)` — the three message accumulators the
   checkers use — and `<report>.fail(scope, …)`. Data accumulators (offender paths, samples)
   are excluded: their strings are interpolated into an enclosing message, they are not rows.

   A site is PROBEABLE when its message starts with literal text at least 8 characters long,
   which is what can be searched for in a run log. Sites whose message starts with an
   interpolation, or with a conditional, or whose literal head is too short to be a safe
   probe, are counted in the census and reported as unprobeable — the centreline message the
   hero control fires is one of them, so "unprobeable" is not "unimportant".

   Both directions of error, stated so the numbers can be read honestly:
     - PRINTED is a ceiling. Several sites share a probe ("response header ", "nav toggle ",
       "MISSING SELECTOR "), so one of them printing marks every site that shares it. Read the
       printed list and check it against the run, do not just take the number.
     - PRINTED is also measured against whatever log you pass. Feed it the failure rows only
       (`grep -E '^(FAIL |        )' log > rows`) or a probe can be satisfied by a note line
       or by the runner's own echo of the fragments it matched.

   checks/lib/ is out of scope: it reports rows, it does not decide them.

   Usage:
     npm run test:controls > /tmp/controls.txt 2>&1
     grep -E '^(FAIL |        )' /tmp/controls.txt > /tmp/rows.txt
     node scripts/count-emit-sites.js /tmp/rows.txt      # census + printed/not-printed lists
     node scripts/count-emit-sites.js                    # census only */

const fs = require('fs');
const path = require('path');

const CHECKS = path.join(__dirname, '..', 'checks');
const MIN_PROBE = 8;

/* Reads the literal run at `i` if an argument starts with a string or template literal.
   Returns the text up to the first ${ (templates) or to the closing quote (strings), or
   null when the argument is not a literal at all. */
function literalAt(src, i) {
  while (i < src.length && /\s/.test(src[i])) i++;
  const q = src[i];
  if (q !== '"' && q !== "'" && q !== '`') return null;
  let out = '';
  for (let j = i + 1; j < src.length; j++) {
    const ch = src[j];
    if (ch === '\\') { out += src[j + 1] === 'n' ? ' ' : src[j + 1]; j++; continue; }
    if (ch === q) break;
    if (q === '`' && ch === '$' && src[j + 1] === '{') break;
    if (ch === '\n') break;
    out += ch;
  }
  return out;
}

/* Skips one argument, honouring quotes, template interpolation and nesting, and returns the
   index just past the top-level comma that ends it. */
function skipArg(src, i) {
  let depth = 0;
  let quote = null;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (quote) {
      if (ch === '\\') { j++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if ('([{'.includes(ch)) { depth++; continue; }
    if (')]}'.includes(ch)) { if (!depth) return -1; depth--; continue; }
    if (ch === ',' && !depth) return j + 1;
  }
  return -1;
}

function sitesIn(file) {
  const src = fs.readFileSync(file, 'utf8');
  const lineOf = (idx) => src.slice(0, idx).split('\n').length;
  const found = [];
  const add = (idx, probe) => found.push({ line: lineOf(idx), probe: probe === null ? null : probe.trim() });

  for (const m of src.matchAll(/\b(?:p|probs|endProbs)\.push\(/g)) {
    add(m.index, literalAt(src, m.index + m[0].length));
  }
  for (const m of src.matchAll(/\b\w+\.fail\(/g)) {
    const after = skipArg(src, m.index + m[0].length);
    add(m.index, after < 0 ? null : literalAt(src, after));
  }
  return found.sort((a, b) => a.line - b.line);
}

const logPath = process.argv[2];
const log = logPath ? fs.readFileSync(logPath, 'utf8') : null;

const files = fs.readdirSync(CHECKS).filter((f) => f.endsWith('.js')).sort();
let sites = 0;
let probeable = 0;
let printed = 0;
const hits = [];
const misses = [];

console.log('file                        sites  probeable  printed');
for (const f of files) {
  const all = sitesIn(path.join(CHECKS, f));
  const usable = all.filter((s) => s.probe !== null && s.probe.length >= MIN_PROBE);
  const hit = logPath ? usable.filter((s) => log.includes(s.probe)) : [];
  sites += all.length;
  probeable += usable.length;
  printed += hit.length;
  if (logPath) {
    for (const s of usable) (log.includes(s.probe) ? hits : misses).push(`checks/${f}:${s.line}  ${s.probe}`);
  }
  console.log(`${f.padEnd(26)} ${String(all.length).padStart(5)}  ${String(usable.length).padStart(9)}  ${String(hit.length).padStart(7)}`);
}

console.log(`\n${sites} failure-emit sites; ${probeable} carry a literal prefix of ${MIN_PROBE}+ characters and can be probed; ${sites - probeable} cannot.`);
if (logPath) {
  console.log(`${printed} probeable site(s) appear in ${logPath}; ${probeable - printed} do not.`);
  console.log('\nprinted by that run:');
  for (const h of hits) console.log(`  ${h}`);
  console.log('\nnot printed by that run:');
  for (const m of misses) console.log(`  ${m}`);
}
