'use strict';
/* KNOWN MISS — checks/measure-viewports.js, the discreteness of the viewport matrix.
   Documented limit: the matrix is a LIST, not a range. checks/lib/site.js:64-82 holds the
   twelve default cells

     320x568  360x800  390x844  414x896  768x1024  1024x768
     1280x640  1280x800  1440x900  1512x860  1920x1080  2560x1440

   and checks/lib/site.js:84-92 resolves it. Everything between two adjacent widths is
   unmeasured. README makes the opposite half of this argument out loud — *"The matrix runs to
   2560px wide because a matrix that stops at 1920 structurally cannot see a defect whose own
   threshold is 1920"* — and the same sentence, read the other way round, is this case: a
   defect whose whole width band falls between two cells is invisible for exactly the same
   reason, and no width the matrix visits can find it.

   THE DEFECT: an in-flow 150vw block, the same shape the existing viewports negative control
   injects at 320x568, where the checker catches it — here gated to a band the matrix never
   visits:

     .km-gap-band{display:none}
     @media (min-width:480px) and (max-width:700px){.km-gap-band{display:block;width:150vw;...}}

   Outside 480-700px the element is display:none, and measure-viewports.js:53-61 (`rendered`)
   rejects a display:none element before the offender list is built, so every one of the twelve
   cells sees a healthy page. Inside the band it is 150vw wide and unclipped, which fires both
   readings the checker takes of the same fact (documentElement.scrollWidth at :263, the named
   offender list at :265).

   WHY THIS GAP. 414 (iphone-plus) -> 768 (ipad-portrait) is a 354px hole; it is not the
   default list's widest — 1920 -> 2560 is 640px and 1512 -> 1920 is 408px — so nothing here
   depends on picking the biggest one. It was picked because a split-view and small-tablet band
   is where a real layout most often has a breakpoint nobody tested, and because the pristine
   build is green at 600x800, which the proof leg needs: the runner runs the UNMUTATED build at
   the proof cell first, so the red that follows is attributable to the injected block rather
   than to a cell the fixture was never healthy at.

   The chosen band is 220px wide with 66px of clearance below (480 vs 414) and 68px above (700
   vs 768). That margin is deliberate: `vw` units and a media query resolve against slightly
   different widths when a classic scrollbar is present, and a band that ended exactly at a
   cell would make this case depend on which of the two a browser used.

   THE PROOF is the strongest shape available in this repo: the SAME fixture, the SAME checker,
   the same argv — only the cell list changed, through the checker's own documented knob
   (RIG_VIEWPORTS, checks/lib/site.js:85; the runner sets the environment variable rather than
   the --viewports flag so that the argv the two legs are given stays identical). An unlisted
   cell resolves through checks/lib/site.js:90 as `{w,h,label:'600x800',mobile:w<1024}`, so the
   proof run is a real cell of this instrument and not a special mode. */

const path = require('path');
const F = require('../../fixture');

F.build(path.join(__dirname, 'miss'), {
  html: {
    'dist/index.html': F.injectBody('<div class="km-gap-band"></div>'),
  },
  css: {
    'dist/index.html':
      '.km-gap-band{display:none}'
      + '@media (min-width:480px) and (max-width:700px){'
      + '.km-gap-band{display:block;width:150vw;height:8px;background:#c8102e}}',
  },
});
