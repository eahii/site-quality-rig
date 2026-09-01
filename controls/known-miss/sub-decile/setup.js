'use strict';
/* KNOWN MISS — checks/check-contrast.js, the worst-decile grade.
   The checker grades a text node on the 10th-percentile pixel of its own rect, never the mean:

     check-contrast.js:41   const WORST_DECILE = 0.10;
     check-contrast.js:189  p10: ratios[Math.floor(ratios.length * WORST_DECILE)]
     check-contrast.js:323  if (m.p10 < floor) { ... }

   README states that choice as a strength, and it is one — *"the worst decile rather than the
   mean, because a mean passes text laid over a bright patch of a dark surface"*. Every
   percentile is also a blind spot below itself, and that half is nowhere in the README. A
   region of unreadable text smaller than a tenth of the sampled pixels structurally cannot
   move `ratios[floor(0.10 * n)]`: the sorted array's low end is patch pixels, and the index
   the grade reads sits above them. This case is that half, made executable.

   THE DEFECT (both fixtures, same colours, same 13px/400 caption): a dark #0b0b0b stripe under
   the left edge of the line. Measured with this repo's own maths — sRGB relative luminance,
   check-contrast.js:158-163:

     #333333 on #ffffff   12.63:1   passes the 4.5:1 floor
     #333333 on #0b0b0b    1.56:1   fails it outright

   THE ONLY DIFFERENCE between the fixtures is the stripe's width, as a percentage of the
   caption's own box:

     miss/    4%  ->   104 of 2743 sampled pixels   (3.79%)  ->  p10 = 12.63:1  GREEN
     proof/  60%  ->  1651 of 2743 sampled pixels  (60.19%)  ->  p10 =  1.56:1  RED

   THE MEASURED BOUNDARY, because a case built on a threshold owes the threshold. A sweep of
   2/4/6/8/10/12/15/20/60% stripes over this same caption gave patch shares of
   1.90 / 3.79 / 5.69 / 8.06 / 9.95 / 11.85 / 14.69 / 19.91 / 60.19 percent of sampled pixels,
   and the p10 verdict flipped between the 10% stripe (9.95% of samples, still graded 12.63:1)
   and the 12% stripe (11.85%, graded 1.56:1). The flip is at the constant, not near it. Shares
   rather than counts, because the sample count is not stable: check-contrast.js:173 derives the
   stride from the rect's area, and a rect whose sub-pixel top lands on the other side of a
   `ceil` samples 13 rows instead of 12 and flips the stride from 1 to 2 (2743 samples vs 742,
   observed at 1280x640) — while the patch SHARE moved by 0.03 percentage points, which is why
   the case is stated in shares.

   Provenance of the sweep, stated rather than implied: it was measured with a throwaway probe
   that replicates check-contrast.js:165-193 in the page, NOT with a script in this repo, and
   no artifact here witnesses it. What this repo reproduces on demand is the pair — 4% green,
   60% red, both through the real instrument. Treat the boundary as the reason those two
   fractions were chosen, not as a receipt this repo hands you.

   Honest about size, because the mirror suite must not flatter itself: 4% of this caption is
   about 8.5 CSS px, roughly one character sitting on the dark stripe. That is a small defect,
   and calling it a scandal would be dishonest. The claim is the threshold, not the severity:
   below a tenth of the rect this instrument cannot see a region at ANY contrast, including
   1.56:1 — and the proof fixture shows the identical colours going red the moment the region
   is large enough for the grade to reach it. */

const path = require('path');
const F = require('../../fixture');

const MARKUP = '<section class="km-band"><p class="km-caption">Certificates issued the same day.</p></section>';

const GROUND = `
.km-band{width:100%;margin:0;padding:0}
.km-caption{display:inline-block;margin:0;padding:0;white-space:nowrap;font-size:13px;line-height:1.4;color:#333333;background-color:#ffffff}`;

/* The stripe is a percentage of the caption's own box, never a pixel width: the fixture
   renders in a system font stack whose metrics differ from machine to machine, and a pixel
   stripe would be a different share of the rect on a machine whose caption measures wider. */
const fixture = (name, pct) => F.build(path.join(__dirname, name), {
  html: { 'dist/index.html': F.injectBody(MARKUP) },
  css: {
    'dist/index.html':
      `${GROUND}\n.km-caption{background-image:linear-gradient(to right,#0b0b0b 0 ${pct}%,rgba(0,0,0,0) ${pct}%)}`,
  },
});

fixture('miss', 4);
fixture('proof', 60);
