'use strict';
/* Negative control for checks/check-harden.js — one CSS regression per hardening case, each
   on the page that actually carries the case.

   1. LONGEST-CONTENT case (index.html): white-space:nowrap on ALL THREE .stat-label
      elements.

      Why all three, measured rather than assumed: .stats is `repeat(3, 1fr)` with an auto
      minimum (the fixture leaves it auto on purpose, so a label that no longer fits breaks
      the layout where it actually broke). Measured in chromium on this fixture, as
      documentElement.scrollWidth against the viewport:

        labels nowrapped   1280x640      1440x900
        1                  1280 (+0)     1440 (+0)     absorbed by the siblings
        2                  1365 (+85)    1445 (+5)     fires, but grazes the threshold
        3                  1505 (+225)   1585 (+145)   fires with room to spare

      One nowrapped label is absorbed: its column grows, the other two give the width back,
      and the document does not move at all — box-level overflow only, invisible to a
      document-level assertion. Three leave nothing to absorb it. Two would technically fire
      at both cells, but +5px at 1440 is close enough to the noise floor that a font
      substitution could erase it, and a control that only fires on one machine is not a
      control. At 320 and 390 the .stats grid is still a single column, so the same injection
      moves the document +13px and 0px there — which is the other reason this control runs the
      wide cells.

   2. GRID N+1 / N-1 case (services/index.html): .process forced to one implicit row of
      fixed-width columns — grid-template-columns:none, grid-auto-flow:column,
      grid-auto-columns:290px.

      The 290px is DERIVED from this fixture, not carried over from anywhere: .process
      measures 1168px of content box at both 1280x640 and 1440x900 (the .wrap is capped at
      78rem and gutter-padded, so it is the same width at both), and the grid gap is 1px.
      Four tracks: 4x290 + 3 gaps = 1163px, fits inside 1168. Five tracks: 5x290 + 4 = 1454px,
      which puts the last item ~230px past the right edge of a 1280 viewport and ~150px past
      1440. Three tracks: 872px, comfortably inside.

      So the discriminating cells are 1280x640 and 1440x900: the `grid process-steps N+1` row
      is RED and the `N-1` row is GREEN at both, which is precisely the assertion — a grid
      drawn for four meets five. The narrow cells cannot discriminate (a 290px fixed track
      overflows a 320px viewport at any item count), which is why they are not in this
      control's matrix. A fixed track was chosen over a percentage one for the same reason:
      percentage tracks at 320px squeeze the item text until it spills its own box, and the
      spill row would then be red at every item count — noise that would drown the signal.

   Both pages keep every other declared hardening slot intact, so the run still exercises
   card-title, plan-name and card-grid and the coverage assertions stay satisfied — a control
   that fails a coverage row would be red for a reason that is not its defect. */

const F = require('../fixture');

F.build(__dirname, {
  css: {
    'dist/index.html': '.stat-label{white-space:nowrap!important}',
    'dist/services/index.html':
      '.process{grid-template-columns:none!important;grid-auto-flow:column!important;'
      + 'grid-auto-columns:290px!important}',
  },
});
