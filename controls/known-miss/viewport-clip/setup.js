'use strict';
/* KNOWN MISS — checks/check-contrast.js, the rect filter.
   Documented limit: README "What this does not catch" — *"Contrast skips text that does not
   fit the viewport"* — and the checker's own header, check-contrast.js:25-27.

   The mechanism, in the source rather than in prose:

     check-contrast.js:113  .filter((r) => r.width >= 2 && r.height >= 2 && r.top >= 0
                                        && r.left >= 0 && r.bottom <= vh && r.right <= vw)
     check-contrast.js:117  if (!rects.length) continue;

   A text rect that is not wholly inside the cell is dropped, and a node whose every rect was
   dropped is skipped by `continue` — not counted as measured, not counted as unpainted, not
   counted at all. The cells are a module constant, check-contrast.js:35-39: 320x568, 390x844
   and 1280x640.

   THE DEFECT (both fixtures carry it, byte for byte the same colours): a marquee-style ticker
   line, #f2f2f2 on its own #ffffff ground at 20px/400. That pair measures 1.12:1 against this
   node's 4.5:1 floor — a heading-sized near-white-on-white line, the same defect class the
   existing negative control injects into the hero, where the checker catches it every time.

   THE ONLY DIFFERENCE between the two fixtures is one declaration:

     miss/   .km-ticker-line{white-space:nowrap}   text rect 1683.97 x 24 CSS px
     proof/  .km-ticker-line{white-space:normal}   text wraps to the wrapper's width

   Measured in chromium at all three of the checker's cells: the nowrap rect is 1683.97px wide,
   so `r.right <= vw` is false at 320, at 390 and at 1280 — 0 of 1 rects survive the filter in
   every cell. The wrapped twin keeps 3 of 6 rects at 320x568, 3 of 5 at 390x844 and 2 of 2 at
   1280x640, and is graded. Colour identical, geometry different, verdict different: that is
   the whole case.

   Provenance of those rect figures, stated rather than implied: they were taken with a
   throwaway probe that replicates check-contrast.js:112-117 in the page, NOT with a script in
   this repo, and no artifact here witnesses them. They are why this fixture is shaped the way
   it is. What the suite reproduces on demand is the verdict pair — miss green, twin red.

   The wrapper carries overflow:hidden, which is how a real ticker band is built and which also
   keeps this fixture from adding document-level horizontal overflow — the defect stays a
   contrast defect and does not leak into a different checker's territory.

   Honest limit of this case, stated because the mirror suite is worth nothing if it flatters
   itself: the proof leg is a TWIN, not the same bytes re-measured under a wider scope. The
   contrast checker's cells are a constant with no CLI or env knob (unlike measure-viewports.js,
   which is why the between-cells case can do the stronger thing). So what is proven here is
   "these colours ARE a failure this instrument prints, and geometry is the only thing that
   changed" — not "this exact rect would fail if the filter let it through". */

const path = require('path');
const F = require('../../fixture');

const TEXT = 'Serviced today, running tomorrow. Lift maintenance for every building we look after. '.repeat(2);

const MARKUP = `<section class="km-ticker"><p class="km-ticker-line">${TEXT}</p></section>`;

/* Everything except the white-space declaration, so the two fixtures cannot drift apart in
   anything but their geometry. */
const GROUND = `
.km-ticker{overflow:hidden;width:100%;margin:0;padding:0}
.km-ticker-line{display:inline-block;margin:0;padding:0;font-size:20px;line-height:1.4;color:#f2f2f2;background:#ffffff}`;

const fixture = (name, whiteSpace) => F.build(path.join(__dirname, name), {
  html: { 'dist/index.html': F.injectBody(MARKUP) },
  css: { 'dist/index.html': `${GROUND}\n.km-ticker-line{white-space:${whiteSpace}}` },
});

fixture('miss', 'nowrap');
fixture('proof', 'normal');
