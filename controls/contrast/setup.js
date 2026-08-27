'use strict';
/* Negative control for checks/check-contrast.js — one defect on index.html: the hero h1
   recoloured to a near-white oklch() over the hero's own light ground.

   The fixture paints #hero on --paper, oklch(0.985 0.004 106). The injected colour sits
   0.035 of lightness below it, which lands the pair at roughly 1.1:1 — far under the 3.0:1
   floor the h1 gets for being large text. A near-white-on-white heading is also the most
   common real instance of this defect: a token swapped for its inverse-surface twin.

   Written in oklch on purpose. The checker resolves every foreground colour through a real
   2D canvas rather than parsing the string, so an oklch value exercises the resolution path
   end to end — and a colour the engine refuses comes back as an UNRESOLVABLE COLOUR failure
   instead of a silent 1:1, which is the other thing this control demonstrates is live. */

const F = require('../fixture');

F.build(__dirname, {
  css: {
    'dist/index.html': '#hero h1{color:oklch(0.95 0.01 106)!important}',
  },
});
