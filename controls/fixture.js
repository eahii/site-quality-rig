'use strict';
/* The control-fixture builder.

   Every negative control starts from the REAL built site — `dist/`, the bytes the checkers
   measure in a normal run — copies it to a throwaway tree under the control's own directory,
   and injects ONE targeted defect into the copy. That makes the receipt strictly stronger
   than a hand-written broken page: the checker is proven to fail on the markup that actually
   ships, not on a lookalike that could quietly stop resembling it.

   The two guards below are the whole point of this file:

     1. a mutation that changes ZERO bytes THROWS. A control whose injection pattern rotted
        would rebuild a fixture identical to the real site, the checker would pass, and the
        run would read as "the gate is fine" — the most invisible failure mode a control
        harness has.
     2. a removal whose target is not there THROWS, for the same reason: deleting nothing
        proves nothing.

   Known limit of guard 1, and the reason the runner adds two more checks: for a CSS
   injection the guard can only see that bytes changed, not that the selector still matches
   anything. `.stat-label` could be renamed tomorrow and this file would still report a
   successful mutation. That hole is closed in run-controls.js by baseline-green comparison
   and by matching the checker's real failing line, not merely its exit code.

   Fixture trees are never committed — .gitignore ignores every controls/<name>/dist tree.

   Usage from a control's setup.js:

     require('../fixture').build(__dirname, {
       css:    { 'dist/index.html': '.thing{white-space:nowrap!important}' },
       html:   { 'dist/index.html': F.injectBody('<a href="#">…</a>') },
       remove: ['dist/references'],
     }); */

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');

/* Inject a <style> just before </head> — the standard shape for a CSS-regression defect. */
const injectStyle = (css) => (s) => {
  if (!s.includes('</head>')) throw new Error('no </head> in this page — the style injection has nowhere to land');
  return s.replace('</head>', `<style data-negative-control>${css}</style></head>`);
};

/* Inject markup just before </body> — the standard shape for a markup defect. */
const injectBody = (html) => (s) => {
  if (!s.includes('</body>')) throw new Error('no </body> in this page — the markup injection has nowhere to land');
  return s.replace('</body>', `${html}</body>`);
};

function build(dir, opts = {}) {
  const dist = path.join(REPO, 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    throw new Error('dist/ is not built — run `npm run build` before the controls');
  }

  const target = path.join(dir, 'dist');
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(dist, target, { recursive: true });

  const applied = [];
  const mutate = (file, fn, kind) => {
    const p = path.join(dir, file);
    if (!fs.existsSync(p)) {
      throw new Error(`fixture: ${file} is not present in the built site — this control would inject its defect into a page that does not exist`);
    }
    const before = fs.readFileSync(p, 'utf8');
    const after = fn(before);
    if (after === before) {
      throw new Error(`fixture: mutation for ${file} changed nothing — the injection pattern no longer matches the real markup, so this control would pass vacuously`);
    }
    fs.writeFileSync(p, after);
    applied.push(`${file} (${kind})`);
  };

  for (const [file, fn] of Object.entries(opts.html || {})) mutate(file, fn, 'markup');
  for (const [file, css] of Object.entries(opts.css || {})) mutate(file, injectStyle(css), 'style');

  for (const f of opts.remove || []) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) {
      throw new Error(`fixture: cannot remove ${f} — not present, so this deletion-control would pass vacuously`);
    }
    fs.rmSync(p, { recursive: true });
    applied.push(`${f} (removed)`);
  }

  if (opts.extra) opts.extra(target);

  console.log(`fixture ${path.basename(dir)}: ${path.relative(REPO, dist)} -> ${path.relative(REPO, target)}, mutated ${applied.join(', ') || '(nothing)'}`);
  return target;
}

module.exports = { build, injectStyle, injectBody, REPO };
