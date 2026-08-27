'use strict';
/* Negative control for checks/check-hero.js — one defect on index.html:
   `.car-tip{margin-left:-8px!important}`.

   This is a replay of the defect class the instrument exists for: a hero in which the moving
   element's tip sat a few px off the line it travels on, while a battery that measured
   overflow, contrast, tap targets and fold height stayed green — because none of those
   assert WHERE the tip is. That is the engineering reason a geometry contract exists.
   (Unverifiable-from-here provenance: the defect was found in a private project of my own,
   and nothing about that history can be reproduced from this repo. What is reproducible here
   is the paragraph below.)

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
