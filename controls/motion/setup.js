'use strict';
/* Negative control for checks/check-motion.js — two defects on index.html, one per leg:

   1. an infinite 2s keyframe animation on #hero h1.

      The fixture's stylesheet carries the standard reduce guard,
      `@media (prefers-reduced-motion: reduce) { *,*::before,*::after { animation-duration:0s
      !important } }`. The injected rule is also !important, and `#hero h1` (one id, one type)
      outranks `*` (zero specificity), so the declared duration survives the guard and the
      animation keeps running under reduce. That is the real-world shape of this bug: nobody
      writes an animation that ignores the guard on purpose, they write a more specific
      selector and never notice it outranks the blanket rule. Leg A fires: "running animation
      under reduce".

   2. .rv forced to opacity:0 in BASE css.

      The fixture gates its reveal on the scripted branch — `.js .rv { opacity: 0 }` — so a
      page rendered without scripts paints in full. Dropping the `.js` gate is the classic
      reveal-authoring bug: the hidden state ships unconditionally and the content is invisible
      to anything that never runs the observer. It is !important, so `.js .rv-in{opacity:1}`
      cannot restore it either. Legs A and B both fire: "not painted under reduce" and "not
      painted with scripts removed", reported with the accumulated ancestor opacity that makes
      the wrapper, not the leaf, the offender.

   Leg C (real JS-off, pixel evidence) is NOT fired by this fixture and is not claimed to be:
   the hero carries no reveal class, so the first view still paints and the greyscale stdev
   stays well above the flat-plate threshold. Recorded as unarmed in docs/CONTROLS.md. */

const F = require('../fixture');

F.build(__dirname, {
  css: {
    'dist/index.html':
      '@keyframes control-spin{to{transform:rotate(1turn)}}'
      + '#hero h1{animation:control-spin 2s linear infinite!important;animation-duration:2s!important}'
      + '.rv{opacity:0!important}',
  },
});
