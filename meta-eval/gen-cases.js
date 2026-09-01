'use strict';
/* Builds the specimen set the meta-evaluation measures: a manifest (cases/cases.json), one
   stylesheet (cases/specimens.css) and one markup fragment per carrier page (cases/blocks/*.html).

   Nothing here is random. Every colour is found by an exhaustive deterministic search and every
   layout number is a constant in this file, so two runs of this script on two machines produce
   byte-identical output and a manifest can be diffed against the run that quoted it.

   Two kinds of specimen, and they answer different questions.

   PART A — solid grounds, analytic truth. A hex pair has exactly one contrast ratio, computed
   here by meta-eval/lib/wcag.js, which shares no code with the instrument. Every Part A target
   sits near one of the two floors (4.5 normal, 3.0 large) at +-0.05 and +-0.10, plus wider
   offsets and two far anchors — never AT a floor, because a specimen whose truth depends on the
   tie-break rule measures the tie-break rule rather than the instrument. On a solid ground the
   instrument's own worst-decile reduction is a no-op (every background sample is the same
   pixel), so instrument and yardstick should agree exactly and 100% is the pass bar.

   PART B — grounds with no analytic truth: gradients, a radial, a translucent plate over a
   gradient, stripe patterns. There is no single ratio for text over a gradient, which is the
   whole reason the instrument samples pixels and takes a decile instead of walking the DOM for
   a background colour. These carry truth: null and label: pending, and are answered by a human
   labelling pass (gen-labeling-sheet.js), never by this file.

   THE BLOCK CONTRACT, and why each clause is load-bearing against check-contrast.js:

     fixed pixel size, wholly inside 320x568   check-contrast.js:113 keeps only text rects that
       fit entirely inside the viewport cell. An oversized specimen is not measured and not
       reported: it silently disappears, which reads exactly like a pass.
     self-contained styling                    the carrier page's stylesheet may not reach the
       specimen. Every declaration is !important over an `all: initial` reset, so a carrier rule
       cannot move a colour, a size or a box without saying so.
     unique first class per text node          check-contrast.js:62-73 builds its printed path
       from the FIRST class of each element, and truncates the quoted text at 40 characters
       (:96, :122). The class is therefore the only reliable join key between a printed row and
       a case; the text is not. Uniqueness is asserted against the carrier pages' own markup too,
       not only against the generated set — the namespace is shared with whatever the site
       already ships.
     id-free painted text                      BECAUSE the class is the join key, the text does
       not have to be one, and must not be: a Part B specimen is photographed and shown to a
       blind annotator, so anything painted into it is painted into the evidence. Every specimen
       in a text class carries the SAME neutral string and every canary carries the same word.
       That is safe against merging for the same reason it is safe against joining —
       check-contrast.js:298 dedups on `path|text|docTop`, and the path carries the unique class.
       (Corrected 2026-09-01: these strings used to be `Specimen sample ${id}` / `Sample ${id}` /
       `canary ${id}`. See METHOD.md, "the sheet is blind and the picture is not", and its
       resolution beside it.)
     a canary in every block                   ~1.04:1 white-on-white, far below every floor, so
       it MUST appear in the failing rows. The checker prints failing rows only: without the
       canary, "this specimen passed" and "this specimen was never measured" produce identical
       output. The canary's row is the positive evidence that the block was measured at all.

   Usage: node meta-eval/gen-cases.js */

const fs = require('fs');
const path = require('path');
const W = require('./lib/wcag');

const HERE = __dirname;
const OUT = path.join(HERE, 'cases');

/* The seed the labelling sheet shuffles Part B with. Recorded in the manifest so a sheet can be
   regenerated in the same order months later. */
const LABELING_SEED = 20260901;

/* check-contrast.js:42 caps a cell's printed failing rows at 40 and appends an elision line. The
   cap is mirrored here to do the arithmetic, not to be relied on: run-meta-eval.js refuses to
   account any cell whose output carries the elision line rather than assuming this sum held. */
const MAX_PROBLEMS = 40;
const MAX_BLOCKS_PER_PAGE = 15;
const NAMED_REGISTERS = 2;

/* 272px leaves room inside a 320px cell for a classic scrollbar and the centring margins; the
   84px block height is what keeps a block fully visible in at least one scroll band at all three
   of the checker's cells (the arithmetic is in METHOD.md). */
const BLOCK = {
  widthPx: 272,
  padXPx: 16,
  groundHeightPx: 56,
  canaryHeightPx: 28,
  gapPx: 12,
  specLineHeightPx: 32,
  canaryLineHeightPx: 20,
  plateInsetPx: 8,
  containerPadPx: 24,
};
BLOCK.blockHeightPx = BLOCK.groundHeightPx + BLOCK.canaryHeightPx;

/* Worst-case average advance width in em for the fallback stack, used to prove at generation
   time that no specimen string can reach the edge of its ground. A string that overflows would
   put part of its rect over the carrier page's background and quietly change what was measured,
   so this is asserted rather than eyeballed. The bound is deliberately generous: Liberation Sans
   and Arial average nearer 0.5em on mixed-case text. */
const ADVANCE_EM = 0.62;

const FONT_STACK = 'Arial, Helvetica, sans-serif';

/* index.html is not a carrier. It carries a sticky hero over a 250svh pin spacer, which is a
   second layer for the occlusion test at check-contrast.js:104 to trip over; the five content
   pages are plain flow. Four of them carry the 54 blocks, filled to at most 15 per page — so
   15 + 15 + 15 + 9, not four full pages. */
const CARRIERS = [
  'services/index.html',
  'maintenance-plans/index.html',
  'about/index.html',
  'contact/index.html',
];

/* The one site-specific string in the whole meta-evaluation, and it is data rather than code for
   the same reason the contract's selectors are: pointing this at another site means replacing
   this line, never editing a script.

   Why it exists. The fixture's header is `position: sticky; top: 0`, so it covers the top band
   of the viewport at every scroll position. check-contrast.js:104-111 rejects any text rect
   whose three hit-test points land on something else, and a specimen block is fully inside the
   viewport in essentially one scroll band only — if that band happens to put it under the
   header, the block is occluded in every band the checker visits and is never measured. The
   canary would report that honestly, but the case would be spent. A static header on the carrier
   copies costs nothing measured: the header's own text is still collected in the first band.

   The alternative, rejected: lift the specimen container above the header with a z-index. That
   trades the specimen's occlusion for the header's and puts the instrument's own coverage rows
   at risk, to buy nothing. */
const CARRIER_NEUTRALISE_CSS = '.site-head { position: static !important; }';

/* One constant string per text class, carrying no case id — see the block contract above. The
   lengths are within one character of the id-bearing strings they replace, so no text rect
   changed size enough to move a specimen inside its ground; the fit assertion in main() is what
   actually holds the line. */
const TEXT_CLASSES = {
  normal: { key: 'normal', sizePx: 16, weight: 400, text: 'Sample specimen text' },
  large: { key: 'large', sizePx: 24, weight: 400, text: 'Sample text' },
  largeBold: { key: 'largeBold', sizePx: 19, weight: 700, text: 'Sample text' },
};

/* The canary is excluded from the photographed frame, so this string is not evidence today. It is
   id-free anyway: a future frame that included the canary strip must not be able to leak a join
   key, and the cheapest way to guarantee that is for the key never to be painted. */
const CANARY_TEXT = 'canary';
for (const c of Object.values(TEXT_CLASSES)) c.floor = W.floorFor(c.sizePx, c.weight);

/* The canary: two greys one step apart at the top of the ramp. Its ratio is computed, never
   asserted from memory, and the generator refuses to emit if it ever stops being far under
   every floor. */
const CANARY = { fg: '#fafafa', bg: '#ffffff' };
CANARY.ratio = W.ratioHex(CANARY.fg, CANARY.bg);

/* --------------------------------------------------------------- deterministic colour search */

/* Offsets around whichever floor the text class gets. -1.55 rather than -1.50 so the normal-text
   row never lands on 3.00 either: 4.50 and 3.00 are both floors somewhere in this file, and a
   target sitting on one of them makes the case about the comparison operator. */
const OFFSETS = [-1.55, -0.50, -0.10, -0.05, 0.05, 0.10, 0.50, 1.55];
const ABSOLUTE_TARGETS = [1.25, 14.00];
const GROUNDS = ['#ffffff', '#000000', '#767676'];

/* An error budget rather than an error minimum. The 8-bit cube can hit any of these targets to
   about 1e-7, but the colour that does it is an arbitrary saturated one, and a page of neon
   specimens invites the reader to wonder whether the hue is what is being tested. So: among the
   colours landing within 0.002 of the target — twenty times tighter than the +-0.04 the offsets
   need, and five times tighter than the tolerance asserted below — take the least chromatic.
   Ratio is a function of luminance alone, so this costs nothing that is being measured. */
const ERR_BUDGET = 0.002;

/* Nearest 8-bit colour to a wanted relative luminance, over the whole cube. The b channel is
   found by binary search in the linearisation table (monotone), so the scan is 65536 pairs
   rather than 16.7M triples. Ties are broken towards the least chromatic colour and then towards
   the lowest (r,g,b), so the manifest is reproducible byte for byte. */
function nearestColour(wantLum, bgRgb, target) {
  const L = W.SRGB_LINEAR;
  let best = null;
  const beats = (a, b) => {
    const aOk = a.err <= ERR_BUDGET;
    const bOk = b.err <= ERR_BUDGET;
    if (aOk !== bOk) return aOk;
    if (aOk && a.spread !== b.spread) return a.spread < b.spread;
    if (Math.abs(a.err - b.err) > 1e-12) return a.err < b.err;
    return a.order < b.order;
  };
  const consider = (r, g, b) => {
    const rgb = [r, g, b];
    const cand = {
      rgb,
      err: Math.abs(W.contrastRatio(rgb, bgRgb) - target),
      spread: Math.max(r, g, b) - Math.min(r, g, b),
      order: (r << 16) | (g << 8) | b,
    };
    if (best === null || beats(cand, best)) best = cand;
  };
  for (let r = 0; r < 256; r++) {
    const pr = W.COEFF[0] * L[r];
    if (pr > wantLum) { consider(r, 0, 0); break; }
    for (let g = 0; g < 256; g++) {
      const pg = pr + W.COEFF[1] * L[g];
      if (pg > wantLum) { consider(r, g, 0); break; }
      const needLin = (wantLum - pg) / W.COEFF[2];
      let lo = 0;
      let hi = 255;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (L[mid] < needLin) lo = mid + 1; else hi = mid;
      }
      consider(r, g, lo);
      if (lo > 0) consider(r, g, lo - 1);
    }
  }
  return best;
}

/* One (ground, direction) pair per target: the first in a fixed rotation that can carry the
   target inside the error budget. Rotation leads so the set spans light, dark and mid grounds by
   construction rather than by whichever search happened to land closest; the budget overrides it
   because a mid-grey ground tops out near 4.6:1, and near that ceiling the 8-bit lattice is too
   coarse to place a +-0.05 offset honestly. */
function chooseGround(target, index) {
  const candidates = [];
  for (let g = 0; g < GROUNDS.length; g++) {
    const bgHex = GROUNDS[(index + g) % GROUNDS.length];
    const bg = W.parseHex(bgHex);
    const lb = W.relativeLuminance(bg);
    const dirs = index % 2 === 0 ? ['dark', 'light'] : ['light', 'dark'];
    for (let d = 0; d < dirs.length; d++) {
      const dir = dirs[d];
      const wantLum = dir === 'dark' ? (lb + 0.05) / target - 0.05 : target * (lb + 0.05) - 0.05;
      if (wantLum < 0 || wantLum > 1) continue;
      const hit = nearestColour(wantLum, bg, target);
      if (!hit) continue;
      candidates.push({ bgHex, dir, rank: g * 2 + d, fg: W.toHex(hit.rgb), err: hit.err });
    }
  }
  candidates.sort((a, b) => {
    const aOk = a.err <= ERR_BUDGET;
    const bOk = b.err <= ERR_BUDGET;
    if (aOk !== bOk) return aOk ? -1 : 1;
    if (aOk) return a.rank - b.rank;
    return Math.abs(a.err - b.err) > 1e-9 ? a.err - b.err : a.rank - b.rank;
  });
  if (!candidates.length) throw new Error(`no ground can carry a ratio of ${target}`);
  return candidates[0];
}

/* --------------------------------------------------------------------------- the case tables */

function partACases() {
  const out = [];
  let index = 0;
  for (const cls of [TEXT_CLASSES.normal, TEXT_CLASSES.large, TEXT_CLASSES.largeBold]) {
    const targets = [...OFFSETS.map((o) => Number((cls.floor + o).toFixed(2))), ...ABSOLUTE_TARGETS];
    for (const target of targets) {
      const id = `a${String(out.length + 1).padStart(2, '0')}`;
      const ground = chooseGround(target, index++);
      const analytic = W.ratioHex(ground.fg, ground.bgHex);
      out.push({
        id,
        part: 'A',
        textClass: cls.key,
        sizePx: cls.sizePx,
        weight: cls.weight,
        floor: cls.floor,
        groundKind: 'solid',
        background: ground.bgHex,
        bg: ground.bgHex,
        fg: ground.fg,
        direction: ground.dir,
        align: 'left',
        targetRatio: target,
        analyticRatio: analytic,
        ratioError: Math.abs(analytic - target),
        printedRatio: analytic.toFixed(2),
        truth: analytic >= cls.floor ? 'pass' : 'fail',
        label: null,
        text: cls.text,
      });
    }
  }
  return out;
}

/* Part B is a hand-written table, not a search: the point of these grounds is that no formula
   says what they should score. `intent` is the author's expectation of how a reader will find
   them and exists only to prove the set spans easy, borderline and hopeless — it is NOT truth,
   it is NOT shown to the labeller (gen-labeling-sheet.js emits none of it), and it is never
   compared against anything. */
const B_TABLE = [
  { kind: 'linear', bg: 'linear-gradient(90deg,#0b0b0b 0%,#f5f5f5 100%)', fg: '#ffffff', align: 'left', cls: 'normal', intent: 'clearly-readable' },
  { kind: 'linear', bg: 'linear-gradient(90deg,#0b0b0b 0%,#f5f5f5 100%)', fg: '#ffffff', align: 'right', cls: 'normal', intent: 'clearly-unreadable' },
  { kind: 'linear', bg: 'linear-gradient(90deg,#0b0b0b 0%,#f5f5f5 100%)', fg: '#ffffff', align: 'center', cls: 'large', intent: 'borderline' },
  { kind: 'linear', bg: 'linear-gradient(90deg,#f5f5f5 0%,#0b0b0b 100%)', fg: '#111111', align: 'left', cls: 'normal', intent: 'clearly-readable' },
  { kind: 'linear', bg: 'linear-gradient(90deg,#f5f5f5 0%,#0b0b0b 100%)', fg: '#111111', align: 'right', cls: 'normal', intent: 'clearly-unreadable' },
  { kind: 'linear', bg: 'linear-gradient(90deg,#f5f5f5 0%,#0b0b0b 100%)', fg: '#111111', align: 'center', cls: 'largeBold', intent: 'borderline' },
  { kind: 'linear-vertical', bg: 'linear-gradient(180deg,#1d3557 0%,#a8dadc 100%)', fg: '#ffffff', align: 'center', cls: 'normal', intent: 'borderline' },
  { kind: 'linear-vertical', bg: 'linear-gradient(180deg,#1d3557 0%,#a8dadc 100%)', fg: '#f1faee', align: 'left', cls: 'large', intent: 'clearly-readable' },
  { kind: 'linear-vertical', bg: 'linear-gradient(180deg,#1d3557 0%,#a8dadc 100%)', fg: '#457b9d', align: 'right', cls: 'normal', intent: 'clearly-unreadable' },
  { kind: 'radial', bg: 'radial-gradient(circle at 50% 50%,#ffffff 0%,#111111 100%)', fg: '#111111', align: 'center', cls: 'normal', intent: 'clearly-readable' },
  { kind: 'radial', bg: 'radial-gradient(circle at 50% 50%,#ffffff 0%,#111111 100%)', fg: '#111111', align: 'left', cls: 'normal', intent: 'clearly-unreadable' },
  { kind: 'radial', bg: 'radial-gradient(circle at 50% 50%,#ffffff 0%,#111111 100%)', fg: '#ffffff', align: 'left', cls: 'large', intent: 'borderline' },
  { kind: 'plate-over-linear', bg: 'linear-gradient(90deg,#112233 0%,#cfd8dc 100%)', plate: 0.55, fg: '#111111', align: 'center', cls: 'normal', intent: 'clearly-readable' },
  { kind: 'plate-over-linear', bg: 'linear-gradient(90deg,#112233 0%,#cfd8dc 100%)', plate: 0.35, fg: '#333333', align: 'left', cls: 'normal', intent: 'clearly-unreadable' },
  { kind: 'plate-over-linear', bg: 'linear-gradient(90deg,#112233 0%,#cfd8dc 100%)', plate: 0.75, fg: '#6b6b6b', align: 'center', cls: 'normal', intent: 'borderline' },
  { kind: 'plate-over-linear', bg: 'linear-gradient(90deg,#112233 0%,#cfd8dc 100%)', plate: 0.35, fg: '#ffffff', align: 'left', cls: 'largeBold', intent: 'borderline' },
  { kind: 'stripes', bg: 'repeating-linear-gradient(90deg,#111111 0 6px,#eeeeee 6px 12px)', fg: '#ffffff', align: 'left', cls: 'normal', intent: 'clearly-unreadable' },
  { kind: 'stripes', bg: 'repeating-linear-gradient(90deg,#111111 0 6px,#eeeeee 6px 12px)', fg: '#111111', align: 'center', cls: 'normal', intent: 'clearly-unreadable' },
  { kind: 'stripes', bg: 'repeating-linear-gradient(45deg,#2b2b2b 0 8px,#6f6f6f 8px 16px)', fg: '#ffffff', align: 'center', cls: 'large', intent: 'clearly-readable' },
  { kind: 'stripes', bg: 'repeating-linear-gradient(45deg,#2b2b2b 0 8px,#6f6f6f 8px 16px)', fg: '#cccccc', align: 'left', cls: 'normal', intent: 'borderline' },
  { kind: 'linear', bg: 'linear-gradient(90deg,#0b0b0b 0%,#f5f5f5 100%)', fg: '#767676', align: 'center', cls: 'large', intent: 'borderline' },
  { kind: 'linear', bg: 'linear-gradient(90deg,#f5f5f5 0%,#0b0b0b 100%)', fg: '#ffffff', align: 'right', cls: 'largeBold', intent: 'clearly-readable' },
  { kind: 'radial', bg: 'radial-gradient(circle at 50% 50%,#ffffff 0%,#111111 100%)', fg: '#888888', align: 'center', cls: 'normal', intent: 'borderline' },
  { kind: 'stripes', bg: 'repeating-linear-gradient(90deg,#111111 0 6px,#eeeeee 6px 12px)', fg: '#ffd166', align: 'center', cls: 'large', intent: 'borderline' },
];

function partBCases() {
  return B_TABLE.map((row, i) => {
    const cls = TEXT_CLASSES[row.cls];
    const id = `b${String(i + 1).padStart(2, '0')}`;
    return {
      id,
      part: 'B',
      textClass: cls.key,
      sizePx: cls.sizePx,
      weight: cls.weight,
      floor: cls.floor,
      groundKind: row.kind,
      background: row.bg,
      plateAlpha: row.plate === undefined ? null : row.plate,
      fg: row.fg,
      align: row.align,
      designIntent: row.intent,
      truth: null,
      label: 'pending',
      text: cls.text,
    };
  });
}

/* ------------------------------------------------------------------------------ emit */

/* The join key run-meta-eval.js reads out of a printed path, restated here because generation is
   where a collision can still be prevented. Uniqueness among the generated keys is not enough:
   the key is matched against the FIRST class of whatever element the instrument printed, and the
   carrier pages have classes of their own. The fixture already ships `spec-list`, which misses
   this pattern only because `lis` is not a letter followed by two digits. A carrier class that
   did match with a live id would silently attribute a carrier row to a specimen. */
const CASE_TOKEN = /\b(?:spec|canary)-[a-z]\d{2}\b/g;

function scanCarriers(files) {
  const roots = [path.join(HERE, '..', 'dist'), path.join(HERE, '..', 'fixture')];
  const scanned = [];
  for (const file of files) {
    const found = roots.map((r) => path.join(r, file)).find((p) => fs.existsSync(p));
    if (!found) continue;
    const hits = [...new Set(fs.readFileSync(found, 'utf8').match(CASE_TOKEN) || [])];
    if (hits.length) {
      throw new Error(`${file} already carries ${hits.join(', ')} — a carrier class matching the join-key pattern `
        + 'would attribute that page\'s own failing row to a specimen');
    }
    scanned.push(file);
  }
  return scanned;
}

const slug = (file) => file.replace(/\/index\.html$/, '').replace(/\.html$/, '').replace(/[^A-Za-z0-9]+/g, '-');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function blockHtml(c) {
  const inner = `<p class="${c.specClass}">${esc(c.text)}</p>`;
  const body = c.plateAlpha === null || c.plateAlpha === undefined
    ? inner
    : `<div class="mev-plate mev-plate-${c.id}">${inner}</div>`;
  return [
    `  <div class="mev-block" data-case="${c.id}">`,
    `    <div class="mev-ground mev-ground-${c.id}">${body}</div>`,
    `    <div class="mev-canary"><p class="${c.canaryClass}">${CANARY_TEXT}</p></div>`,
    '  </div>',
  ].join('\n');
}

/* Every declaration carries !important EXCEPT colour and the reset, and that exception is the
   most load-bearing line in this file.

   check-contrast.js:151-155 reads the background by screenshotting the page with every glyph
   made transparent, and it does that by injecting `*,*::before,*::after{color:transparent
   !important; -webkit-text-fill-color:transparent !important; ...}`. That selector has
   specificity (0,0,0). An important colour declaration at ANY higher specificity outranks it —
   important-vs-important is settled by specificity, not by source order — so the glyphs would
   stay painted in the plate and the instrument would sample its own text as the background.
   `all: initial !important` on the reset would do the same thing, because `all` includes colour.

   So: the reset is plain, colour is plain, and everything a carrier stylesheet could plausibly
   move (box, background, font metrics) is important. This is also a limit of the instrument
   worth stating out loud, and METHOD.md states it: a real site whose CSS forces a text colour
   with !important above `*` is a site check-contrast.js measures wrongly rather than refuses to
   measure. Reasoned from the source and the cascade, not yet observed in a run. */
function baseCss() {
  return [
    '/* generated by meta-eval/gen-cases.js — do not edit by hand.',
    '   colour and the `all: initial` reset are deliberately NOT !important: an important colour',
    '   declaration outranks the transparent-glyph plate check-contrast.js injects at `*`, and the',
    '   instrument would then sample painted glyphs as the background. */',
    '.mev-cases, .mev-cases * { all: initial; box-sizing: border-box !important; }',
    `.mev-cases { display: block !important; width: ${BLOCK.widthPx}px !important; margin-left: auto !important; margin-right: auto !important;`
      + ` padding-top: ${BLOCK.containerPadPx}px !important; padding-bottom: ${BLOCK.containerPadPx}px !important;`
      + ` font-family: ${FONT_STACK} !important; }`,
    `.mev-cases .mev-block { display: block !important; width: ${BLOCK.widthPx}px !important; margin-bottom: ${BLOCK.gapPx}px !important; }`,
    `.mev-cases .mev-ground { display: block !important; width: ${BLOCK.widthPx}px !important; height: ${BLOCK.groundHeightPx}px !important;`
      + ` padding: ${(BLOCK.groundHeightPx - BLOCK.specLineHeightPx) / 2}px ${BLOCK.padXPx}px !important; }`,
    `.mev-cases .mev-plate { display: block !important; width: 100% !important; height: ${BLOCK.specLineHeightPx}px !important;`
      + ` padding-left: ${BLOCK.plateInsetPx}px !important; padding-right: ${BLOCK.plateInsetPx}px !important; }`,
    `.mev-cases .mev-canary { display: block !important; width: ${BLOCK.widthPx}px !important; height: ${BLOCK.canaryHeightPx}px !important;`
      + ` padding: ${(BLOCK.canaryHeightPx - BLOCK.canaryLineHeightPx) / 2}px ${BLOCK.padXPx}px !important; background: ${CANARY.bg} !important; }`,
    `.mev-cases p { display: block !important; margin: 0 !important; padding: 0 !important; white-space: nowrap !important;`
      + ` font-family: ${FONT_STACK} !important; }`,
    `.mev-cases .mev-canary p { color: ${CANARY.fg}; font-size: 16px !important; font-weight: 400 !important;`
      + ` line-height: ${BLOCK.canaryLineHeightPx}px !important; text-align: left !important; }`,
  ].join('\n');
}

function caseCss(c) {
  const lines = [`.mev-cases .mev-ground-${c.id} { background: ${c.background} !important; }`];
  if (c.plateAlpha !== null && c.plateAlpha !== undefined) {
    lines.push(`.mev-cases .mev-plate-${c.id} { background: rgba(255,255,255,${c.plateAlpha}) !important; }`);
  }
  lines.push(`.mev-cases .${c.specClass} { color: ${c.fg}; font-size: ${c.sizePx}px !important;`
    + ` font-weight: ${c.weight} !important; line-height: ${BLOCK.specLineHeightPx}px !important; text-align: ${c.align} !important; }`);
  return lines.join('\n');
}

function main() {
  const cases = [...partACases(), ...partBCases()];

  if (!(CANARY.ratio < Math.min(W.FLOOR_LARGE, W.FLOOR_NORMAL))) {
    throw new Error(`canary ${CANARY.fg} on ${CANARY.bg} is ${CANARY.ratio.toFixed(3)}:1, which is not under every floor`);
  }
  if (cases.length > CARRIERS.length * MAX_BLOCKS_PER_PAGE) {
    throw new Error(`${cases.length} cases need more than ${CARRIERS.length} carriers at ${MAX_BLOCKS_PER_PAGE} blocks each`);
  }

  const seen = new Set();
  for (const c of cases) {
    c.specClass = `spec-${c.id}`;
    c.canaryClass = `canary-${c.id}`;
    for (const k of [c.id, c.specClass, c.canaryClass]) {
      if (seen.has(k)) throw new Error(`duplicate join key ${k} — the printed row could not be attributed to one case`);
      seen.add(k);
    }
    /* Overflow would put part of the text rect over the carrier's own background. Asserted, not
       eyeballed: the failure is silent in every printed row. */
    const innerPx = BLOCK.widthPx - 2 * BLOCK.padXPx - (c.plateAlpha ? 2 * BLOCK.plateInsetPx : 0);
    const estimate = c.text.length * ADVANCE_EM * c.sizePx;
    if (estimate > innerPx) {
      throw new Error(`${c.id}: "${c.text}" is about ${Math.round(estimate)}px at ${c.sizePx}px, wider than the ${innerPx}px ground`);
    }
    if (c.part === 'A') {
      if (c.analyticRatio === c.floor) throw new Error(`${c.id} sits exactly on its ${c.floor} floor`);
      if (Math.abs(c.analyticRatio - c.floor) < 0.04) {
        throw new Error(`${c.id}: ${c.analyticRatio.toFixed(4)} is under 0.04 from its ${c.floor} floor — too close to read as a designed offset`);
      }
      if (c.ratioError > 0.01) {
        throw new Error(`${c.id}: search reached ${c.analyticRatio.toFixed(4)} against a target of ${c.targetRatio} (off by ${c.ratioError.toFixed(4)})`);
      }
    }
  }

  const carriers = CARRIERS.map((file, i) => ({
    file,
    slug: slug(file),
    cases: cases.slice(i * MAX_BLOCKS_PER_PAGE, (i + 1) * MAX_BLOCKS_PER_PAGE).map((c) => c.id),
  })).filter((c) => c.cases.length);
  for (const carrier of carriers) for (const id of carrier.cases) cases.find((c) => c.id === id).page = carrier.file;

  const worstCaseRows = MAX_BLOCKS_PER_PAGE * 2 + NAMED_REGISTERS + 1;
  if (worstCaseRows >= MAX_PROBLEMS) {
    throw new Error(`${MAX_BLOCKS_PER_PAGE} blocks can print ${worstCaseRows} rows in one cell, at or over the ${MAX_PROBLEMS} cap`);
  }

  const scanned = scanCarriers(carriers.map((c) => c.file));

  fs.mkdirSync(path.join(OUT, 'blocks'), { recursive: true });
  const css = [baseCss(), ...cases.map(caseCss)].join('\n');
  fs.writeFileSync(path.join(OUT, 'specimens.css'), `${css}\n`);
  for (const carrier of carriers) {
    const blocks = carrier.cases.map((id) => blockHtml(cases.find((c) => c.id === id)));
    const html = `<div class="mev-cases" data-meta-eval="cases" data-page="${carrier.file}">\n${blocks.join('\n')}\n</div>\n`;
    fs.writeFileSync(path.join(OUT, 'blocks', `${carrier.slug}.html`), html);
  }

  const manifest = {
    schemaVersion: 1,
    generatedBy: 'meta-eval/gen-cases.js',
    instrument: 'checks/check-contrast.js',
    labelingSeed: LABELING_SEED,
    fontStack: FONT_STACK,
    advanceEmBound: ADVANCE_EM,
    block: BLOCK,
    canary: { ...CANARY, text: CANARY_TEXT, note: 'fails every floor by design; its printed row is the evidence that the block was measured' },
    carrierNeutraliseCss: CARRIER_NEUTRALISE_CSS,
    textClasses: TEXT_CLASSES_MANIFEST(),
    cap: {
      maxProblems: MAX_PROBLEMS,
      blocksPerPage: MAX_BLOCKS_PER_PAGE,
      worstCaseRowsPerCell: worstCaseRows,
      terms: `${MAX_BLOCKS_PER_PAGE} canaries + ${MAX_BLOCKS_PER_PAGE} specimens + ${NAMED_REGISTERS} named-register coverage rows + 1 base-register row`,
    },
    carriers,
    carrierJoinKeyScan: {
      scanned,
      note: scanned.length === carriers.length
        ? 'every carrier page was read and carries no class matching the spec-/canary- join-key pattern'
        : `only ${scanned.length} of ${carriers.length} carrier pages were found under dist/ or fixture/ — the rest could not be scanned for join-key collisions`,
    },
    counts: {
      total: cases.length,
      partA: cases.filter((c) => c.part === 'A').length,
      partB: cases.filter((c) => c.part === 'B').length,
    },
    cases,
  };
  fs.writeFileSync(path.join(OUT, 'cases.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function TEXT_CLASSES_MANIFEST() {
  return Object.fromEntries(Object.values(TEXT_CLASSES).map((c) => [c.key, { sizePx: c.sizePx, weight: c.weight, floor: c.floor }]));
}

if (require.main === module) {
  const m = main();
  const rel = (p) => path.relative(path.join(HERE, '..'), p).replace(/\\/g, '/');
  const A = m.cases.filter((c) => c.part === 'A');
  const B = m.cases.filter((c) => c.part === 'B');

  console.log(`cases: ${m.counts.total} (Part A ${m.counts.partA} solid-ground, Part B ${m.counts.partB} no-analytic-truth)`);
  for (const key of Object.keys(m.textClasses)) {
    const t = m.textClasses[key];
    const a = A.filter((c) => c.textClass === key);
    const b = B.filter((c) => c.textClass === key);
    console.log(`  ${key.padEnd(10)} ${t.sizePx}px/${t.weight} floor ${t.floor.toFixed(1)}  A:${a.length} B:${b.length}`);
  }

  const ratios = A.map((c) => c.analyticRatio).sort((x, y) => x - y);
  const worstErr = Math.max(...A.map((c) => c.ratioError));
  const nearest = Math.min(...A.map((c) => Math.abs(c.analyticRatio - c.floor)));
  console.log(`Part A analytic ratios: ${ratios[0].toFixed(4)} .. ${ratios[ratios.length - 1].toFixed(4)}, `
    + `${A.filter((c) => c.truth === 'pass').length} expected PASS / ${A.filter((c) => c.truth === 'fail').length} expected FAIL`);
  console.log(`  worst search error ${worstErr.toFixed(4)} (assert <= 0.0100); closest approach to a floor ${nearest.toFixed(4)} (assert >= 0.0400)`);
  console.log(`  grounds used: ${[...new Set(A.map((c) => c.bg))].join(' ')}`);
  console.log(`Part B grounds: ${[...new Set(B.map((c) => c.groundKind))].join(', ')}; `
    + `intent spread ${['clearly-readable', 'borderline', 'clearly-unreadable'].map((i) => `${i}:${B.filter((c) => c.designIntent === i).length}`).join(' ')}`);
  console.log(`canary ${m.canary.fg} on ${m.canary.bg} = ${m.canary.ratio.toFixed(4)}:1 — under every floor`);

  console.log(`cap arithmetic: ${m.cap.blocksPerPage} blocks/page -> worst case ${m.cap.worstCaseRowsPerCell} rows in one cell `
    + `(${m.cap.terms}) against check-contrast.js MAX_PROBLEMS ${m.cap.maxProblems}`);
  for (const c of m.carriers) console.log(`  ${c.file.padEnd(28)} ${c.cases.length} blocks  ${c.cases[0]}..${c.cases[c.cases.length - 1]}`);
  console.log(`join-key scan: ${m.carrierJoinKeyScan.note}`);
  console.log(`wrote ${rel(path.join(OUT, 'cases.json'))}, ${rel(path.join(OUT, 'specimens.css'))}, `
    + `${m.carriers.length} fragment(s) under ${rel(path.join(OUT, 'blocks'))}`);
}

module.exports = { main, BLOCK, CARRIERS, MAX_BLOCKS_PER_PAGE, MAX_PROBLEMS, LABELING_SEED };
