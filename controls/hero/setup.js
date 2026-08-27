'use strict';
/* Negative control for checks/check-hero.js — one defect on index.html:
   `.car-tip{margin-left:-8px!important}`.

   This is the replay of the defect the instrument exists for. The origin project's hero
   shipped for weeks with the moving element's tip sitting 3px left of the line it travels on
   — a leftover negative margin from a narrower shape. It passed two reviewers and every gate
   that was green at the time, because nothing in the battery ever asserted WHERE the tip was.

   .car-tip in this fixture is centred by `left:50%; transform:translateX(-50%)` and carries
   no margin, so the injected -8px is the entire offset: rail, frame and tip all measure a
   centre of 195.00 at 390x844, and the tip alone moves to 187.00. Spread 8.00px against a
   0.5px tolerance.

   The defect is horizontal only, deliberately: it must move the centreline assertion without
   touching anything else. Three of the four rows go red (frame-1 centreline, end-state
   climax, reduced-motion frame 1) and `frame1 ground-contact` stays GREEN, because the tip's
   bottom edge still meets the ground. That ground-contact leg therefore has no control of its
   own and is recorded as unarmed in docs/CONTROLS.md rather than counted as fired. */

const F = require('../fixture');

F.build(__dirname, {
  css: {
    'dist/index.html': '.car-tip{margin-left:-8px!important}',
  },
});
