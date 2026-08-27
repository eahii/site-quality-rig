'use strict';
/* Negative control for checks/check-links.js — five defects in one build, each mapped to a
   named assertion:

     1. dist/references/ removed while site.json still declares references/index.html
        -> the page-parity row fails, AND every page that links /references/ now carries a
           dead link. One deletion, two independent assertions: parity is about the manifest,
           the dead links are about the markup, and a checker that only had one of them would
           still call the site fine.
     2. <a href="#no-such-anchor">   -> dead same-page fragment
     3. <a href="/no-such-page/">    -> dead page link
     4. <a href="#">                 -> placeholder link with no target
     5. a second <h1>                -> "2 <h1> element(s) -- exactly 1 required"

   2-5 are appended to index.html rather than edited into the existing markup: a control must
   be able to say exactly which bytes it added, and an in-place edit of real copy cannot. */

const F = require('../fixture');

F.build(__dirname, {
  remove: ['dist/references'],
  html: {
    'dist/index.html': F.injectBody(
      '<a href="#no-such-anchor">Dead fragment (negative control)</a>'
      + '<a href="/no-such-page/">Dead page link (negative control)</a>'
      + '<a href="#">Placeholder link (negative control)</a>'
      + '<h1>Second h1 (negative control)</h1>'
    ),
  },
});
