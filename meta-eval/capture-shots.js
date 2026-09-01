'use strict';
/* Photographs the Part B specimens for the blind labelling sheet.
 *
 * THE CAPTURE VIEWPORT IS 1280x640 (the checker's `laptop-720` cell), DECLARED HERE AND IN
 * METHOD.md. It is one of check-contrast.js's own three cells rather than a viewport invented for
 * photography: the picture a person judges should be a picture of something the instrument
 * actually measured, and a viewport outside the checker's matrix would be a picture of nothing
 * that was graded.
 *
 * WHAT THE EXIT CODE GATES, stated first because two of the three things this script prints are
 * RECORDED OBSERVATIONS and only one of them is a gate. Nonzero comes from exactly two conditions:
 *
 *   the layout-box guard          every `.mev-ground` must measure the authored 272x56. A box that
 *     does not is a specimen that is not the specimen the manifest describes.
 *   the same-viewport repeatability control
 *     two captures of the whole set at the SAME viewport must be pixel-identical. A camera that
 *     does not repeat cannot photograph evidence, and every other number here would be noise.
 *
 * The cross-viewport raster profile below is NOT a gate and never fails this script. It is a
 * measurement written to the record.
 *
 * WHY A VIEWPORT NEEDS DECLARING AT ALL, given the block contract. Every block is fixed-pixel
 * (272x56 ground, `all: initial` + !important over it), so the LAYOUT is expected to be
 * viewport-independent. The layout is; the raster is not, and the difference is the point. A box
 * that does not move can still land on a different device-pixel grid, so --verify (on by default)
 * captures the whole set a second time at 320x568 (`se1`, the narrowest cell in the matrix, and
 * the rig's contractual floor) and compares the two rasters pixel by pixel through sharp.
 *
 * The expected result is that they are NOT identical, and 0/24 identical is the state this set has
 * been in since it was first measured — the boxes share a size and a fractional y phase differs, so
 * antialiasing lands differently, and on a stripe pattern or a translucent plate that is a large
 * per-channel delta rather than a rounding one. Nothing about that is a failure: it is the fact
 * that makes the labels' scope worth stating, and METHOD.md states it (a Part B label is made from
 * the capture viewport's picture, and cross-cell agreement is carried by the checker's own verdict
 * consensus, not by the raster). What the per-case numbers are FOR is that scoping decision.
 *
 * WHAT "RENDERED AT ITS AUTHORED BOX" IS ASSERTED ON, and it is NOT the PNG's height. Playwright
 * clips an element shot to the device rows its box touches, so a 56 CSS px box whose document y is
 * fractional produces 57 rows — a fact about where the box sits, not about how big it is. The
 * assertion is therefore on the layout box itself, read in-page as
 * `getBoundingClientRect()` plus `window.scrollY` (captureAll below) rather than through
 * Playwright's `boundingBox()`, because the document-space y is what the sub-pixel phase is
 * computed from. It also catches the converse case the pixel test would wave through: a box of
 * 271.6x55.8 that rasterises to a plausible-looking 272x56. The PNG's own dimensions and the box's
 * fractional offset are both recorded as data beside it.
 *
 * WHAT IS IN THE FRAME, and this one is load-bearing. The photographed element is `.mev-ground`,
 * the specimen's own painted ground and its single line — NOT the enclosing `.mev-block`, which
 * also carries the canary strip. Two independent reasons, either sufficient:
 *
 *   the canary is a measurement device, not a specimen. It is unreadable ON PURPOSE, and the
 *     question the sheet asks is "could you comfortably read this text?" — a deliberately
 *     illegible second line in the frame answers that question for the wrong text.
 *   nothing outside the specimen's own ground was designed to be looked at, and a frame is the
 *     cheapest place to enforce that.
 *
 * (Corrected 2026-09-01: the first reason used to be that the canary's text was literally
 * `canary b11` — the case id, painted at 1.04:1, invisible to an eye and trivially recoverable by
 * raising a PNG's contrast. gen-cases.js no longer paints any id, into the canary or the specimen,
 * so that reason is retired rather than quietly kept. The frame is unchanged: the remaining
 * reasons were each sufficient on their own.)
 *
 * The instrument still measures the canary; it is simply not photographed.
 *
 * Usage: node meta-eval/capture-shots.js [--out DIR] [--json FILE] [--verify 0]
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const sharp = require('sharp');
const S = require('../checks/lib/site');
const { serve } = require('../checks/lib/serve');
const { gitSha } = require('../checks/lib/report');
const { buildCaseSite, CASE_SITE } = require('./run-meta-eval');

const HERE = __dirname;
const REPO = S.REPO;
const CASES = path.join(HERE, 'cases', 'cases.json');

/* Both are cells of check-contrast.js's own matrix (check-contrast.js:35-39). CAPTURE is what the
   labelling sheet shows; VERIFY exists only to prove one shot stands for all three. */
const CAPTURE = { w: 1280, h: 640, label: 'laptop-720' };
const VERIFY = { w: 320, h: 568, label: 'se1' };

const rel = (p) => path.relative(REPO, p).replace(/\\/g, '/');

/* One page load per carrier, then one element screenshot per case on it. The selector is asserted
   to match exactly once before anything is captured: `.mev-ground-<id>` is generated to be unique,
   and a shot of the wrong element would be a picture the label then belongs to. */
async function captureAll(browser, baseUrl, cases, v) {
  const ctx = await browser.newContext({
    viewport: { width: v.w, height: v.h }, deviceScaleFactor: 1, reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  const shots = new Map();
  const boxes = new Map();
  const byPage = new Map();
  for (const c of cases) {
    if (!byPage.has(c.page)) byPage.set(c.page, []);
    byPage.get(c.page).push(c);
  }
  for (const [file, list] of byPage) {
    await page.goto(baseUrl + file, { waitUntil: 'networkidle', timeout: 20000 });
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
    for (const c of list) {
      const sel = `.mev-ground-${c.id}`;
      const n = await page.locator(sel).count();
      if (n !== 1) throw new Error(`${sel} matches ${n} elements on ${file} — exactly 1 is required, or the shot is of an unknown box`);
      const el = page.locator(sel);
      await el.scrollIntoViewIfNeeded();
      await page.waitForTimeout(60);
      boxes.set(c.id, await page.evaluate((s) => {
        const r = document.querySelector(s).getBoundingClientRect();
        return { x: r.x, y: r.y + window.scrollY, w: r.width, h: r.height };
      }, sel));
      shots.set(c.id, await el.screenshot());
    }
  }
  await ctx.close();
  return { shots, boxes };
}

const rawOf = (buf) => sharp(buf).raw().toBuffer({ resolveWithObject: true })
  .then(({ data, info }) => ({ data, w: info.width, h: info.height, ch: info.channels }));

/* Pixel content, not file bytes: two PNGs of the same raster can differ in their encoding. */
async function comparePixels(a, b) {
  const [x, y] = await Promise.all([rawOf(a), rawOf(b)]);
  if (x.w !== y.w || x.h !== y.h || x.ch !== y.ch) {
    return { identical: false, geometry: `${x.w}x${x.h}x${x.ch} vs ${y.w}x${y.h}x${y.ch}`, differingPixels: null, maxChannelDelta: null };
  }
  let differing = 0;
  let worst = 0;
  for (let i = 0; i < x.data.length; i += x.ch) {
    let d = 0;
    for (let k = 0; k < x.ch; k++) d = Math.max(d, Math.abs(x.data[i + k] - y.data[i + k]));
    if (d) { differing++; if (d > worst) worst = d; }
  }
  return { identical: differing === 0, geometry: null, differingPixels: differing, maxChannelDelta: worst, pixels: x.w * x.h };
}

async function main() {
  if (!fs.existsSync(CASES)) {
    console.log(`no manifest at ${rel(CASES)} — run node meta-eval/gen-cases.js first`);
    return 2;
  }
  const manifest = JSON.parse(fs.readFileSync(CASES, 'utf8'));
  const partB = manifest.cases.filter((c) => c.part === 'B');
  if (!partB.length) { console.log('the manifest holds no Part B cases — nothing to photograph'); return 2; }

  const outDir = path.resolve(REPO, String(S.flag('out', 'META_EVAL_SHOTS', path.join(HERE, 'labeling', 'shots'))));
  const jsonOut = path.resolve(REPO, String(S.flag('json', 'META_EVAL_SHOT_JSON', path.join(HERE, 'runs', 'shot-capture.json'))));
  const doVerify = String(S.flag('verify', 'META_EVAL_VERIFY_VIEWPORT', '1')) !== '0';

  buildCaseSite(manifest);
  const wantW = manifest.block.widthPx;
  const wantH = manifest.block.groundHeightPx;
  console.log(`capture: ${partB.length} Part B specimens, element .mev-ground-<id> (${wantW}x${wantH} authored), `
    + `viewport ${CAPTURE.w}x${CAPTURE.h} (${CAPTURE.label})${doVerify ? `, verified against ${VERIFY.w}x${VERIFY.h} (${VERIFY.label})` : ', verification SKIPPED'}`);

  const srv = await serve(CASE_SITE);
  const browser = await chromium.launch();
  let cap;
  let again = null;
  let alt = null;
  try {
    cap = await captureAll(browser, srv.url, partB, CAPTURE);
    if (doVerify) {
      again = await captureAll(browser, srv.url, partB, CAPTURE);
      alt = await captureAll(browser, srv.url, partB, VERIFY);
    }
  } finally {
    await browser.close();
    await srv.close();
  }

  fs.mkdirSync(outDir, { recursive: true });
  const rows = [];
  for (const c of partB) {
    const buf = cap.shots.get(c.id);
    const box = cap.boxes.get(c.id);
    const meta = await sharp(buf).metadata();
    const row = {
      id: c.id,
      groundKind: c.groundKind,
      /* The layout box is what "rendered at its authored size" means. pngWidth/pngHeight are the
         device rows and columns that box touched, which is a fact about its fractional origin. */
      box: { w: box.w, h: box.h, x: box.x, y: box.y },
      subPixelPhase: { x: +(box.x % 1).toFixed(6), y: +(box.y % 1).toFixed(6) },
      pngWidth: meta.width,
      pngHeight: meta.height,
      bytes: buf.length,
    };
    if (box.w !== wantW || box.h !== wantH) {
      row.authoredBox = `${wantW}x${wantH}`;
      row.boxMismatch = true;
    }
    if (again) row.repeatability = await comparePixels(buf, again.shots.get(c.id));
    if (alt) {
      row.viewportIndependence = await comparePixels(buf, alt.shots.get(c.id));
      const b2 = alt.boxes.get(c.id);
      row.altBox = { w: b2.w, h: b2.h, x: b2.x, y: b2.y };
      row.altSubPixelPhase = { x: +(b2.x % 1).toFixed(6), y: +(b2.y % 1).toFixed(6) };
    }
    fs.writeFileSync(path.join(outDir, `${c.id}.png`), buf);
    rows.push(row);
  }

  const mismatched = rows.filter((r) => r.boxMismatch);
  const pngSizes = [...new Set(rows.map((r) => `${r.pngWidth}x${r.pngHeight}`))];
  console.log(`wrote ${rows.length} shot(s) to ${rel(outDir)}/<id>.png`);
  console.log(mismatched.length
    ? `BOX MISMATCH on ${mismatched.length}: ${mismatched.map((r) => `${r.id} ${r.box.w}x${r.box.h}`).join(' ')} — authored ${wantW}x${wantH}`
    : `every layout box is ${wantW}x${wantH}, the authored ground; PNG raster ${pngSizes.join(' / ')} `
      + `(a 56px box on a fractional y touches 57 device rows — position, not size)`);

  let independence = null;
  let repeatFailures = null;
  if (alt) {
    const rep = rows.map((r) => r.repeatability);
    const repSame = rep.filter((r) => r.identical).length;
    repeatFailures = rep.length - repSame;
    /* GATED. A camera that does not repeat cannot photograph evidence, and every number printed
       under it would be noise attributable to nothing. */
    console.log(`repeatability control (GATED): ${repSame}/${rep.length} specimens are pixel-identical across two captures at the SAME ${CAPTURE.w}x${CAPTURE.h} viewport`
      + `${repeatFailures === 0 ? ' — the camera repeats, so every raster below is a fact about the page rather than about the capture' : ' — FAILED: the camera itself is not repeatable, and nothing below can be attributed'}`);

    const cmp = rows.map((r) => ({ id: r.id, pixels: r.pngWidth * r.pngHeight, ...r.viewportIndependence }));
    const same = cmp.filter((r) => r.identical);
    const diff = cmp.filter((r) => !r.identical);
    const phases = [...new Set(rows.map((r) => `${r.subPixelPhase.y}/${r.altSubPixelPhase.y}`))];
    independence = {
      gated: false,
      note: 'a recorded observation, not a check: identical rasters across two viewports are not expected, '
        + 'and this script\'s exit code is unaffected by this block. See METHOD.md, "what a Part B label is scoped to".',
      captureViewport: `${CAPTURE.w}x${CAPTURE.h}`,
      verifyViewport: `${VERIFY.w}x${VERIFY.h}`,
      compared: cmp.length,
      identicalRasters: same.length,
      repeatableAtCaptureViewport: `${repSame}/${rep.length}`,
      sameLayoutBox: rows.filter((r) => r.altBox.w === r.box.w && r.altBox.h === r.box.h).length,
      differing: diff.map((r) => ({ id: r.id, geometry: r.geometry, differingPixels: r.differingPixels, maxChannelDelta: r.maxChannelDelta })),
    };
    /* NOT a gate, and worded so it cannot be lifted out and quoted as one: "0/24 identical" is the
       expected state, not a failure. A fixed-size box on a fractional-y device-pixel phase
       antialiases differently, and on stripes and translucent plates that is a large per-channel
       delta rather than a rounding one. */
    console.log(`cross-viewport raster profile (RECORDED, not gated — identical rasters are NOT expected): `
      + `${independence.sameLayoutBox}/${cmp.length} specimens carry the SAME LAYOUT BOX at ${CAPTURE.w}x${CAPTURE.h} and ${VERIFY.w}x${VERIFY.h}, `
      + `and ${same.length}/${cmp.length} rasterise identically`);
    for (const d of diff) {
      console.log(`  differs ${d.id}: ${d.geometry ? `geometry ${d.geometry}` : `${d.differingPixels} of ${d.pixels} pixels differ, worst channel delta ${d.maxChannelDelta}`}`);
    }
    console.log(diff.length
      ? `  sub-pixel y phase (capture/verify), distinct values across the set: ${phases.join(' ')} — same box size, different device-pixel grid. `
        + 'This is why a Part B label is scoped to the capture viewport and cross-cell agreement is carried by the checker\'s verdict consensus (METHOD.md).'
      : '  one shot therefore stands for all three of the checker\'s cells — measured here, not assumed from the block contract');
  }

  fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
  fs.writeFileSync(jsonOut, `${JSON.stringify({
    schemaVersion: 1,
    date: new Date().toISOString(),
    sha: gitSha(),
    root: S.rootLabel(CASE_SITE),
    element: '.mev-ground-<id>',
    captureViewport: `${CAPTURE.w}x${CAPTURE.h} (${CAPTURE.label})`,
    gates: {
      note: 'the only two conditions that make this script exit nonzero',
      layoutBoxMismatches: mismatched.length,
      repeatabilityFailures: repeatFailures,
    },
    outDir: rel(outDir),
    shots: rows,
    viewportIndependence: independence,
  }, null, 2)}\n`);
  console.log(`record: ${rel(jsonOut)}`);
  /* Two gates and no others. The cross-viewport profile above is data. */
  const failed = mismatched.length > 0 || repeatFailures > 0;
  console.log(`gates: layout box ${mismatched.length ? `FAIL (${mismatched.length})` : 'OK'}, `
    + `same-viewport repeatability ${repeatFailures === null ? 'SKIPPED (--verify 0)' : repeatFailures ? `FAIL (${repeatFailures})` : 'OK'} `
    + `— ${failed ? 'FAIL' : 'PASS'}`);
  return failed ? 1 : 0;
}

if (require.main === module) {
  main().then((code) => { process.exitCode = code; }, (e) => {
    console.log(`capture-shots FAILED: ${e.message}`);
    process.exitCode = 2;
  });
}

module.exports = { CAPTURE, VERIFY, comparePixels };
