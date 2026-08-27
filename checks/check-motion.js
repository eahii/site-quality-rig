/* The three degradation paths, run in both engines across three cells.

   A. prefers-reduced-motion: reduce
        every rendered interactive element's computed transitionDuration matches
        /^0s(, 0s)*$/; no running keyframe animation; no smooth scroll-behavior; the page is
        fully painted (a reveal that never fires under `reduce` is the classic
        invisible-page bug).
   B. scripts removed (route-level): the page must be fully painted from HTML+CSS alone —
        no element left at opacity 0 / visibility hidden by a reveal class.
        Deviation, stated: Playwright's javaScriptEnabled:false also kills page.evaluate, so
        the ASSERTION path removes the site's scripts via request interception + inline-
        script stripping while leaving the JS engine on. Any class a stripped script would
        have set on <html> never lands, which is exactly the state a real JS-off browser is
        in. Leg C is the honest real-js-off leg, kept precisely because this one is not.
   C. real javaScriptEnabled:false: no assertion can run inside the page, so this leg is
        pixel-based — the first view must not be a flat plate (greyscale stdev ~ 0 means
        "nothing painted"). */
const { chromium, webkit } = require('playwright');
const sharp = require('sharp');
const path = require('path');
const S = require('./lib/site');
const { serve } = require('./lib/serve');
const { report } = require('./lib/report');

/* Page files are nested (services/index.html), so a file name is not a safe path segment.
   Flattened for screenshot names; without this the shot write lands in a directory that
   does not exist and the cell reports THREW. */
const slugOf = (f) => f.replace(/[\\/\\\\]/g, '-').replace(/\.html$/, '');

/* Three legs per cell is three page loads, so the matrix is deliberately narrower than the
   rig's default viewport set: the narrowest phone, the common phone, and a short laptop —
   the cell where a hero that fails to collapse eats the whole first view. */
const CELLS = [
  { w: 320, h: 568, label: 'se1' },
  { w: 390, h: 844, label: 'iphone-pro' },
  { w: 1280, h: 640, label: 'laptop-720' },
];
const CAP = 12;
const DEFAULT_REVEAL_PATTERN = 'rv-|reveal|fade';

/* Emitting a capped list without saying so is how a checker under-reports a defect it did
   find. Every truncation prints its own remainder. */
function capped(list, total) {
  const out = list.slice(0, CAP);
  if (total > out.length) out.push(`... and ${total - out.length} more`);
  return out;
}

function motionProbe({ revealPattern, cap }) {
  const cssPath = (el) => {
    if (!el || el.nodeType !== 1) return '?';
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && parts.length < 4; n = n.parentElement) {
      if (n.id) { parts.unshift('#' + n.id); break; }
      let s = n.tagName.toLowerCase();
      const c = (n.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean)[0];
      if (c) s += '.' + c;
      parts.unshift(s);
    }
    return parts.join('>');
  };
  /* Anchored at the start of each class TOKEN, not tested against the whole class
     attribute: the contract declares a naming prefix, and a bare substring test would let
     an unrelated token such as `services` satisfy a pattern of `rv` — which is exactly the
     way the zero-node guard below would be talked out of firing. */
  const rx = new RegExp('^(?:' + revealPattern + ')', 'i');
  const hasReveal = (el) => (el.getAttribute('class') || '').trim().split(/\s+/).some((t) => t && rx.test(t));
  const INTERACTIVE = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[tabindex]:not([tabindex="-1"]),[data-cta],.cta';
  const shown = (el) => {
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getBoundingClientRect().width > 0;
  };

  const interactive = [...document.querySelectorAll(INTERACTIVE)].filter(shown);
  const slowTransitions = interactive
    .map((el) => ({ path: cssPath(el), d: getComputedStyle(el).transitionDuration }))
    .filter((x) => !/^0s(,\s*0s)*$/.test(x.d));

  const running = [...document.querySelectorAll('body *')].filter((el) => {
    const cs = getComputedStyle(el);
    if (cs.animationName === 'none') return false;
    return !/^0s(,\s*0s)*$/.test(cs.animationDuration) && cs.animationPlayState !== 'paused';
  });

  /* unpainted content: an element carrying text or an image that renders at ~0 opacity or is
     hidden is a reveal that never resolved. Opacity must be ACCUMULATED over ancestors — the
     usual reveal puts the class on a wrapper, and reading the leaf's own opacity (which is 1)
     is exactly how this check ends up measuring nothing. */
  const effOpacity = (el) => {
    let o = 1, hiddenBy = null;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const c = getComputedStyle(n);
      if (c.visibility === 'hidden') hiddenBy = hiddenBy || cssPath(n);
      o *= parseFloat(c.opacity);
    }
    return { o, hiddenBy };
  };
  const unpainted = [];
  let unpaintedTotal = 0;
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none') continue;
    let skip = false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (getComputedStyle(n).display === 'none') { skip = true; break; }
      if (n.hasAttribute('hidden') || n.getAttribute('aria-hidden') === 'true' || n.hasAttribute('inert')) { skip = true; break; }
    }
    if (skip) continue;
    const hasOwnText = [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
    const isMedia = el.tagName === 'IMG' || el.tagName === 'PICTURE' || el.tagName === 'VIDEO';
    if (!hasOwnText && !isMedia) continue;
    const { o, hiddenBy } = effOpacity(el);
    if (o >= 0.99 && !hiddenBy) continue;
    unpaintedTotal++;
    if (unpainted.length >= cap) continue;
    const revealish = (() => {
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) if (hasReveal(n)) return cssPath(n);
      return null;
    })();
    unpainted.push(`${cssPath(el)} effective-opacity=${o.toFixed(2)}${hiddenBy ? ` visibility:hidden via ${hiddenBy}` : ''}${revealish ? ` [reveal class on ${revealish}]` : ''}`);
  }

  return {
    interactiveSelector: INTERACTIVE,
    interactiveCount: interactive.length,
    revealNodes: [...document.querySelectorAll('*')].filter(hasReveal).length,
    transitions: slowTransitions.slice(0, cap).map((t) => `transitionDuration "${t.d}" on ${t.path} (must match /^0s(, 0s)*$/ under reduce)`),
    transitionsTotal: slowTransitions.length,
    animations: running.slice(0, cap).map((el) => `${cssPath(el)} ${getComputedStyle(el).animationName} ${getComputedStyle(el).animationDuration}`),
    animationsTotal: running.length,
    unpainted,
    unpaintedTotal,
    scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    htmlClass: document.documentElement.className,
    textNodes: (document.body.innerText || '').replace(/\s+/g, ' ').trim().length,
  };
}

async function stripScripts(ctx) {
  await ctx.route('**/*', async (route) => {
    const req = route.request();
    if (req.resourceType() === 'script') return route.abort();
    if (req.resourceType() !== 'document') return route.continue();
    const res = await route.fetch();
    const body = (await res.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    /* The rewritten body is shorter than the fetched one, so the original content-length
       must not survive. Deleting the key beats assigning undefined — a header value that is
       not a string is a fulfil-time throw, and it would surface as every cell THREW. */
    const headers = { ...res.headers() };
    delete headers['content-length'];
    return route.fulfill({ response: res, body, headers });
  });
}

async function settleFrameOne(page) {
  await page.evaluate(async () => {
    const step = Math.max(200, window.innerHeight - 100);
    for (let y = 0; y <= document.body.scrollHeight; y += step) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 25)); }
    window.scrollTo(0, 0);
  });
}

(async () => {
  const rep = report('motion');
  const rootDir = S.root();
  const { built, missing, wip } = S.pages(rootDir);
  const withShots = S.shots();
  const fold = S.loadContract('fold-contract.json', 'FOLD_CONTRACT');
  const declaredPattern = fold.json.motion && fold.json.motion.reveal_class_pattern;
  const revealPattern = declaredPattern || DEFAULT_REVEAL_PATTERN;
  /* A page that carries no scroll reveal at all is a real shape, but it is only ever a
     DECLARATION here — never inferred from finding nothing, which is the exact reading a
     renamed reveal class also produces. */
  const revealOptional = new Set((fold.json.motion && fold.json.motion.reveal_optional_pages) || []);
  const wipMeta = wip ? { wip: 'NOT-GREEN' } : {};

  console.log(`motion: root=${rootDir} pages=${built.length} reveal-pattern=/${revealPattern}/i reveal-optional=[${[...revealOptional].join(' ') || 'none'}] contract=${fold.path} status=${fold.json.status}`);

  if (!fold.filled) rep.fail('fold-contract', `UNFILLED (status=${fold.json.status}) — the reveal pattern this checker measures against is not a declaration yet`);
  for (const t of fold.todos) rep.fail('fold-contract slot', `TODO slot: ${t}`);
  if (!declaredPattern) {
    rep.fail('fold-contract motion', `motion.reveal_class_pattern not declared in ${fold.path} — falling back to /${DEFAULT_REVEAL_PATTERN}/i, which is a guess about this site's naming, not a contract`);
  }
  for (const p of missing) {
    if (wip) rep.note(`PENDING page ${p.file} not built — --wip run, not a green run`);
    else rep.fail(`page-missing ${p.file}`, `declared in site.json but absent from ${rootDir}`);
  }
  if (!built.length) { rep.fail('pages', 'nothing to measure'); return rep.finish({ root: S.rootLabel(rootDir), ...wipMeta }); }

  const srv = await serve(rootDir);
  const out = withShots ? S.outDir() : null;

  for (const engName of S.engines()) {
    const type = { chromium, webkit }[engName];
    if (!type) { rep.fail(`engine ${engName}`, 'unknown engine'); continue; }
    let browser;
    try { browser = await type.launch(); }
    catch (e) { rep.fail(`engine ${engName}`, `launch failed: ${e.message.split('\n')[0]}`); continue; }

    for (const v of CELLS) {
      /* --- A: reduced motion ------------------------------------------------------- */
      const rm = await browser.newContext({ viewport: { width: v.w, height: v.h }, reducedMotion: 'reduce', deviceScaleFactor: 1 });
      const rmPage = await rm.newPage();
      for (const pg of built) {
        const scope = `${engName} ${v.label} ${pg.file} reduced-motion`;
        const coverScope = `${engName} ${v.label} ${pg.file} reveal-coverage`;
        try {
          await rmPage.goto(srv.url + pg.file, { waitUntil: 'networkidle', timeout: 20000 });
          await rmPage.evaluate(() => document.fonts.ready);
          await settleFrameOne(rmPage);
          await rmPage.waitForTimeout(400);
          const m = await rmPage.evaluate(motionProbe, { revealPattern, cap: CAP });
          const probs = [];
          if (!m.interactiveCount) probs.push(`NO-ELEMENTS-MEASURED: the transition sweep matched 0 rendered interactive elements (${m.interactiveSelector}) — a zero-duration assertion over an empty set is not a pass`);
          probs.push(...capped(m.transitions, m.transitionsTotal));
          probs.push(...capped(m.animations.map((a) => `running animation under reduce: ${a}`), m.animationsTotal));
          if (m.scrollBehavior === 'smooth') probs.push('html{scroll-behavior:smooth} still active under reduce');
          probs.push(...capped(m.unpainted.map((u) => `not painted under reduce: ${u}`), m.unpaintedTotal));
          if (!m.textNodes) probs.push('page renders no text under reduce');
          rep.row(scope, probs);
          /* Measured off leg A's load, reported as its own row: whether the site names any
             reveal at all is a fact about the page, and folding it into the reduce row
             would file it under a heading it is not about. */
          rep.row(coverScope, revealOptional.has(pg.file)
            ? (m.revealNodes
              ? [`${m.revealNodes} node(s) now match /${revealPattern}/i on ${pg.file}, which motion.reveal_optional_pages declares reveal-free — stale declaration: remove the entry so this page is measured like every other`]
              : [])
            : (m.revealNodes
              ? []
              : [`reveal pattern present in contract but 0 matching nodes — /${revealPattern}/i matched no class token on ${pg.file}, so every reveal assertion on this page measured an empty set. Add the page to motion.reveal_optional_pages to declare it reveal-free, or fix the class names.`]));
        } catch (e) {
          rep.fail(scope, `THREW: ${e.message.split('\n')[0]}`);
          rep.fail(coverScope, 'not measured — the reduced-motion load for this cell threw');
        }
      }
      await rm.close();

      /* --- B: scripts removed ------------------------------------------------------ */
      const nj = await browser.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: 1 });
      await stripScripts(nj);
      const njPage = await nj.newPage();
      for (const pg of built) {
        const scope = `${engName} ${v.label} ${pg.file} scripts-removed`;
        try {
          await njPage.goto(srv.url + pg.file, { waitUntil: 'load', timeout: 20000 });
          await njPage.waitForTimeout(500);
          const m = await njPage.evaluate(motionProbe, { revealPattern, cap: CAP });
          const probs = capped(m.unpainted.map((u) => `not painted with scripts removed: ${u}`), m.unpaintedTotal);
          if (!m.textNodes) probs.push('page renders no text with scripts removed');
          rep.row(scope, probs);
        } catch (e) { rep.fail(scope, `THREW: ${e.message.split('\n')[0]}`); }
      }
      await nj.close();

      /* --- C: real JS-off, pixel evidence ------------------------------------------ */
      const off = await browser.newContext({ viewport: { width: v.w, height: v.h }, javaScriptEnabled: false, deviceScaleFactor: 1 });
      const offPage = await off.newPage();
      for (const pg of built) {
        const scope = `${engName} ${v.label} ${pg.file} js-disabled`;
        try {
          await offPage.goto(srv.url + pg.file, { waitUntil: 'load', timeout: 20000 });
          await offPage.waitForTimeout(600);
          const buf = await offPage.screenshot({ caret: 'hide' });
          let saved = null;
          if (withShots) {
            saved = path.join(out, `jsoff-${engName}-${slugOf(pg.file)}-${v.w}x${v.h}.png`);
            await sharp(buf).toFile(saved);
          }
          const st = await sharp(buf).greyscale().stats();
          const sd = st.channels[0].stdev;
          rep.row(scope, sd < 3
            ? [`first view is a flat plate with JS off (greyscale stdev ${sd.toFixed(2)} < 3) — nothing painted${saved ? `; shot ${path.basename(saved)}` : ''}`]
            : []);
        } catch (e) { rep.fail(scope, `THREW: ${e.message.split('\n')[0]}`); }
      }
      await off.close();
    }
    await browser.close();
  }
  await srv.close();
  rep.finish({ root: S.rootLabel(rootDir), engines: S.engines().join('+'), cells: CELLS.length, ...wipMeta });
})();
