'use strict';
/* Negative control for checks/measure-viewports.js — two defects on index.html:

     1. an in-flow 150vw block appended to <body>. At the 320x568 cell that is a 480px-wide
        element in a 320px viewport, unclipped by any ancestor, so it fires both readings the
        checker takes of the same fact: documentElement.scrollWidth against the viewport, and
        the named offender list. Two readings because either alone can be gamed — a masked
        root hides the first, a clipping ancestor hides the second.
     2. .call-link shrunk to 20x20 with its min-width/min-height/padding zeroed and overflow
        hidden -> the mobile tap-target law fires and names it.

   .call-link is not an arbitrary victim: it is the element contracts/fold-contract.json
   declares as `contact_affordance`, so the defect lands on a contracted element rather than
   on decoration.

   Honest limit, recorded rather than hidden: the contract's contact-affordance leg itself
   does NOT fire here. That leg asks whether the affordance is rendered, and a 20x20 box is
   still rendered — it is the tap-target law that catches this defect. Firing the rendered
   leg needs a display:none fixture, which would then be invisible to the tap-target law.
   One defect, one row; the other leg stays unarmed and is listed as such in docs/CONTROLS.md. */

const F = require('../fixture');

F.build(__dirname, {
  html: {
    'dist/index.html': F.injectBody('<div class="control-overflow" style="width:150vw;height:8px"></div>'),
  },
  css: {
    'dist/index.html':
      '.call-link{width:20px!important;height:20px!important;min-width:0!important;'
      + 'min-height:0!important;padding:0!important;overflow:hidden!important}',
  },
});
