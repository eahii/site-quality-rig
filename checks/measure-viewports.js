/* Viewport matrix: {engines} x {viewport cells} x {every page site.json declares}.
   Measures structure, horizontal overflow, interactive hygiene, nav affordance, desktop-nav
   wrap and the declared first view.

   The composition of the first view is NOT written into this file. It lives in
   contracts/fold-contract.json, and the checker refuses to invent one — an instrument that
   carries a particular site's selectors inside it is no longer identity-neutral, and every
   later site inherits the first site's idea of what a hero is.

   Governing law:
     - a check that cannot find its element FAILS with MISSING SELECTOR — never skips
     - a declared page with no file is a FAIL row (page-missing), not a silent absence
     - an unfilled contract slot is a FAIL row, not a skipped assertion
     - a skip exists only where the contract declares one

   Usage:  node checks/measure-viewports.js [--root dist] [--wip] [--engines chromium]
           [--viewports 390x844,1280x640] [--pages index.html] [--shots 0]
*/
const { chromium, webkit } = require('playwright');
const path = require('path');

const { serve } = require('./lib/serve');
const S = require('./lib/site');
const { report } = require('./lib/report');

/* Page files can be nested (services/index.html), so a file name is not a safe path
   segment. Flattened for screenshot names; without this the shot write lands in a
   directory that does not exist and the cell reports THREW. */
const slugOf = (f) => f.replace(/[\\/]/g, '-').replace(/\.html$/, '');

/* ---------------------------------------------------------------- in-page probe ------ */
function rigProbe(o) {
  const cssPath = (el) => {
    if (!el || el.nodeType !== 1) return '?';
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && parts.length < 4; n = n.parentElement) {
      if (n.id) { parts.unshift('#' + n.id); break; }
      let s = n.tagName.toLowerCase();
      const cls = (n.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean)[0];
      if (cls) s += '.' + cls;
      parts.unshift(s);
    }
    return parts.join('>');
  };
  const cs = (el) => getComputedStyle(el);
  const rect = (el) => {
    const b = el.getBoundingClientRect();
    return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, width: b.width, height: b.height };
  };
  /* Truncation is never silent: the caller prints "... and N more" from `total`. */
  const capped = (arr, n) => ({ shown: arr.slice(0, n), total: arr.length });
  const rendered = (el) => {
    if (!el) return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const c = cs(n);
      if (c.display === 'none' || c.visibility === 'hidden') return false;
      if (n.hasAttribute('hidden') || n.getAttribute('aria-hidden') === 'true' || n.hasAttribute('inert')) return false;
    }
    const b = el.getBoundingClientRect();
    return b.width > 0 && b.height > 0;
  };
  const accName = (el) => {
    const a = (el.getAttribute('aria-label') || '').trim();
    if (a) return a;
    if (el.labels && el.labels.length) {
      const t = [...el.labels].map((l) => l.textContent || '').join(' ').replace(/\s+/g, ' ').trim();
      if (t) return t;
    }
    const lb = el.getAttribute('aria-labelledby');
    if (lb) {
      const t = lb.split(/\s+/).map((id) => (document.getElementById(id) || {}).textContent || '').join(' ').replace(/\s+/g, ' ').trim();
      if (t) return t;
    }
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (t) return t;
    const img = el.querySelector('img[alt]');
    if (img && img.alt.trim()) return img.alt.trim();
    const st = el.querySelector('svg title, svg > desc');
    if (st && st.textContent.trim()) return st.textContent.trim();
    for (const k of ['value', 'title']) { const v = (el.getAttribute(k) || '').trim(); if (v) return v; }
    return '';
  };
  const usable = (sel) => sel && !/TODO/.test(sel);
  const q = (sel) => (usable(sel) ? document.querySelector(sel) : null);

  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;

  /* Root-level overflow-x masking is reported separately from the offenders below: it is
     the standard way a real overflow bug is hidden from exactly this measurement. */
  const rootMask = [document.documentElement, document.body]
    .filter((n) => ['hidden', 'clip'].includes(cs(n).overflowX))
    .map((n) => n.tagName.toLowerCase());
  const clippedBy = (el) => {
    for (let n = el.parentElement; n && n !== document.documentElement && n !== document.body; n = n.parentElement) {
      if (['hidden', 'auto', 'scroll', 'clip'].includes(cs(n).overflowX)) return true;
    }
    return false;
  };
  const offenders = capped([...document.querySelectorAll('body *')]
    .filter((el) => {
      if (!rendered(el)) return false;
      const b = el.getBoundingClientRect();
      if (!(b.width > 0)) return false;
      if (!(b.right > vw + 1 || b.left < -1)) return false;
      return !clippedBy(el);
    })
    .map((el) => `${cssPath(el)}[${Math.round(el.getBoundingClientRect().left)}..${Math.round(el.getBoundingClientRect().right)}]`), 6);

  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
    .filter(rendered)
    .map((h) => ({ level: +h.tagName[1], text: (h.textContent || '').replace(/\s+/g, ' ').trim(), path: cssPath(h) }));

  const INTERACTIVE = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[tabindex]:not([tabindex="-1"])';
  const interactive = [...document.querySelectorAll(INTERACTIVE)].filter(rendered);
  /* An inline link sitting in a run of prose cannot be 44px tall without breaking the line
     box it belongs to, so the tap-target law exempts it. */
  const inlineExempt = (el) => {
    if (cs(el).display !== 'inline') return false;
    const p = el.parentElement;
    return !!p && [...p.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
  };
  /* Whole CSS pixels, not raw ones: WebKit holds layout rects as float32, so a 44px-tall
     control ~4000px down the document measures 43.999755859375 — in 6 of 12 identical runs,
     green in the other 6. A quarter of a thousandth of a pixel is far below the resolution
     of a physical tap-target law, and rounding is also what keeps the printed number and
     the verdict from contradicting each other. */
  const tapFails = capped(interactive
    .filter((el) => !inlineExempt(el))
    .map((el) => { const r = rect(el); return { path: cssPath(el), w: Math.round(r.width), h: Math.round(r.height) }; })
    .filter((r) => r.w < 44 || r.h < 44)
    .map((r) => `${r.path} ${r.w}x${r.h}`), 8);

  const nameless = capped(interactive
    .filter((el) => !accName(el))
    .map((el) => `${el.tagName.toLowerCase()} ${cssPath(el)}`), 8);

  const hrefless = capped([...document.querySelectorAll('a')].filter(rendered)
    .filter((a) => { const h = (a.getAttribute('href') || '').trim(); return !h || h === '#'; })
    .map((a) => cssPath(a)), 8);

  /* Anything that presents as a call to action must BE one. The contract's own cta
     selector is unioned with a class-name net, so a button-shaped div named .cta-box is
     audited even when the contract never mentioned it. */
  const ctaSel = [o.selectors.cta, '[class*="cta"]', '[class*="btn"]'].filter(usable).join(',');
  const ctaHits = [...new Set([...document.querySelectorAll(ctaSel)])].filter(rendered);
  /* a wrapper named .cta-row is a container, not a CTA — judge only the leaves of the match
     set, or the instrument fails correct markup for its class name */
  const ctas = ctaHits.filter((el) => !ctaHits.some((other) => other !== el && el.contains(other))).map((el) => ({
    el,
    path: cssPath(el),
    tag: el.tagName.toLowerCase(),
    href: (el.getAttribute('href') || '').trim(),
    name: accName(el),
    tabindex: el.getAttribute('tabindex'),
    disabled: el.disabled === true,
    ...rect(el),
  }));

  const headerEl = q(o.selectors.header);
  const toggleEl = q(o.selectors.nav_toggle);
  const dnavEl = q(o.selectors.desktop_nav);
  const contactEl = usable(o.selectors.contact_affordance) ? (headerEl ? headerEl.querySelector(o.selectors.contact_affordance) : null) : 'SKIP';

  /* Desktop nav labels: one line each, all the same height.
     Range.getClientRects() returns one rect per line box, so this counts LINES rather
     than guessing from box height — the links carry min-heights, which makes a height
     threshold meaningless. */
  const navLines = (el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    const tops = new Set([...r.getClientRects()]
      .filter((x) => x.width > 0.5 && x.height > 0.5)
      .map((x) => Math.round(x.top)));
    return tops.size || 1;
  };
  const dnavItems = dnavEl && rendered(dnavEl)
    ? [...dnavEl.querySelectorAll('a')].filter(rendered).map((a) => ({
        path: cssPath(a),
        text: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30),
        lines: navLines(a),
        height: a.getBoundingClientRect().height,
      }))
    : null;

  const toggle = toggleEl ? {
    path: cssPath(toggleEl), tag: toggleEl.tagName.toLowerCase(), shown: rendered(toggleEl),
    name: accName(toggleEl), ariaExpanded: toggleEl.getAttribute('aria-expanded'),
    controls: toggleEl.getAttribute('aria-controls'),
    controlsFound: !!(toggleEl.getAttribute('aria-controls') && document.getElementById(toggleEl.getAttribute('aria-controls'))),
    href: (toggleEl.getAttribute('href') || '').trim(),
    ...rect(toggleEl),
  } : null;

  /* Same-page fragments only; the cross-page link audit belongs to the link checker. */
  const unresolved = [...new Set([...document.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute('href')))]
    .filter((h) => h && h !== '#' && h !== '#top' && !document.querySelector(`[id="${CSS.escape(h.slice(1))}"]`));

  let comp = null;
  if (o.composition) {
    const probe = (sel) => {
      if (!usable(sel)) return { sel, todo: true };
      const el = document.querySelector(sel);
      if (!el) return { sel, missing: true };
      return { sel, path: cssPath(el), rendered: rendered(el), ...rect(el) };
    };
    comp = {
      name: o.composition.name,
      /* 'exact' = designed fitted fold (the plus/minus tolerance edge law); 'flowing' = a
         content page with no designed fold edge — declared in the contract with a dated
         why, so the edge assertion is skipped by DECLARATION, never by a missing
         selector. */
      edge: o.composition.fold_edge || 'exact',
      elements: (o.composition.elements || []).map(probe),
      last: o.composition.last_in_fold ? probe(o.composition.last_in_fold) : null,
      never: (o.composition.never_in_fold || []).map(probe),
    };
  }

  /* Runs last, after every measurement above: focusing an element moves focus and can
     scroll the document, and a number the fold contract reads must not be taken from a
     page this probe has already disturbed. */
  const savedY = window.scrollY;
  const notFocusable = [];
  const focusTargets = ctas.concat(toggleEl && rendered(toggleEl) ? [{ el: toggleEl, path: cssPath(toggleEl) }] : []);
  for (const c of focusTargets) {
    try { c.el.focus({ preventScroll: true }); } catch { /* non-focusable element type */ }
    if (document.activeElement !== c.el && !c.el.contains(document.activeElement)) notFocusable.push(c.path);
  }
  try { document.activeElement.blur(); } catch { /* body */ }
  window.scrollTo(0, savedY);

  return {
    vw, vh,
    docScrollW: document.documentElement.scrollWidth,
    bodyScrollW: document.body ? document.body.scrollWidth : 0,
    rootMask, offenders,
    h1s: document.querySelectorAll('h1').length,
    headings, unresolved, tapFails, nameless, hrefless,
    lang: document.documentElement.lang,
    ctas: ctas.map(({ el, ...r }) => r),
    notFocusable: [...new Set(notFocusable)],
    header: headerEl ? { path: cssPath(headerEl), rendered: rendered(headerEl), ...rect(headerEl) } : null,
    toggle,
    desktopNavShown: dnavEl ? rendered(dnavEl) : null,
    dnavItems,
    contact: contactEl === 'SKIP' ? 'SKIP' : (contactEl ? rendered(contactEl) : null),
    comp,
  };
}

/* ---------------------------------------------------------------- verdict ------------ */
function verdict(m, cell) {
  const p = [];
  const px = (n) => `${Math.round(n)}px`;
  const listOf = (c, sep = ', ') =>
    c.shown.join(sep) + (c.total > c.shown.length ? `${sep}... and ${c.total - c.shown.length} more` : '');

  if (!m.header) p.push('MISSING SELECTOR header = FAIL');
  else if (!m.header.rendered) p.push('header not rendered');
  if (!m.toggle) p.push('MISSING SELECTOR nav_toggle = FAIL (mobile nav affordance must exist in the DOM at every width)');

  if (m.docScrollW > m.vw) p.push(`h-overflow ${px(m.docScrollW - m.vw)} (documentElement.scrollWidth ${m.docScrollW} > ${m.vw})`);
  if (m.bodyScrollW > m.vw) p.push(`h-overflow on body ${px(m.bodyScrollW - m.vw)}`);
  if (m.offenders.total) p.push(`overflowing (unclipped): ${listOf(m.offenders, ' ')}`);
  if (m.rootMask.length) p.push(`overflow-x masked at root <${m.rootMask.join('><')}> — masking hides the very bug this row measures`);

  if (m.h1s !== 1) p.push(`${m.h1s} h1 elements (exactly 1 required)`);
  if (!m.headings.length) p.push('heading outline empty');
  const empty = m.headings.filter((h) => !h.text);
  if (empty.length) p.push(`empty heading text: ${empty.map((h) => h.path).join(', ')}`);
  let prev = 0;
  for (const h of m.headings) {
    if (prev && h.level > prev + 1) p.push(`heading level skip h${prev}->h${h.level} at ${h.path}`);
    prev = h.level;
  }
  if (cell.lang && m.lang !== cell.lang) p.push(`html lang="${m.lang}" (site.json declares "${cell.lang}")`);
  if (m.unresolved.length) p.push(`dead same-page fragments: ${m.unresolved.join(', ')}`);

  if (!m.ctas.length) p.push('MISSING SELECTOR cta = FAIL (no call-to-action element matched)');
  for (const c of m.ctas) {
    const realLink = c.tag === 'a' && c.href && c.href !== '#';
    const realButton = c.tag === 'button';
    if (!realLink && !realButton) p.push(`CTA ${c.path} is <${c.tag}${c.href ? ` href="${c.href}"` : ''}> — not a real a[href]/button`);
    if (c.disabled) p.push(`CTA ${c.path} disabled`);
    if (c.tabindex === '-1') p.push(`CTA ${c.path} tabindex=-1 (not keyboard reachable)`);
    if (!c.name) p.push(`CTA ${c.path} has no accessible name`);
  }
  if (m.notFocusable.length) p.push(`not focusable: ${m.notFocusable.join(', ')}`);
  if (m.nameless.total) p.push(`interactive without accessible name: ${listOf(m.nameless)}`);
  if (m.hrefless.total) p.push(`<a> without usable href: ${listOf(m.hrefless)}`);
  if (cell.mobile && m.tapFails.total) p.push(`tap targets <44px: ${listOf(m.tapFails)}`);

  /* The nav affordance flips at the contract's own breakpoint, and the toggle is anchored
     to the header's trailing edge rather than to a fixed coordinate. */
  if (m.toggle) {
    const want = m.vw < cell.navBreakpoint;
    if (want !== m.toggle.shown) p.push(`nav toggle ${m.toggle.shown ? 'shown' : 'hidden'} at ${m.vw}px (expected ${want ? 'shown' : 'hidden'} below ${cell.navBreakpoint}px)`);
    if (m.toggle.shown) {
      const tw = Math.round(m.toggle.width), th = Math.round(m.toggle.height);
      if (tw < 44 || th < 44) p.push(`nav toggle ${tw}x${th} < 44px`);
      if (!m.toggle.name) p.push('nav toggle has no accessible name');
      if (m.header) {
        if (m.toggle.right > m.header.right + 1) p.push(`nav toggle overruns header trailing edge by ${px(m.toggle.right - m.header.right)}`);
        const gap = m.header.right - m.toggle.right;
        if (gap > cell.trailingTolerance) p.push(`nav toggle ${px(gap)} from header trailing edge (> ${cell.trailingTolerance}px) — not anchored`);
      }
      if (m.toggle.tag === 'button') {
        if (m.toggle.ariaExpanded === null) p.push('nav toggle <button> without aria-expanded');
        if (!m.toggle.controls) p.push('nav toggle <button> without aria-controls');
        else if (!m.toggle.controlsFound) p.push(`nav toggle aria-controls="${m.toggle.controls}" resolves to nothing`);
      } else if (!['summary', 'a'].includes(m.toggle.tag)) {
        p.push(`nav toggle is <${m.toggle.tag}> — must be button, summary, or a[href#target]`);
      } else if (m.toggle.tag === 'a' && !m.toggle.href) p.push('nav toggle <a> without href');
      if (m.desktopNavShown === true && m.vw < cell.navBreakpoint) p.push(`desktop nav still shown under ${cell.navBreakpoint}px alongside the toggle`);
    } else if (m.desktopNavShown === false) p.push('no nav affordance visible at all (toggle hidden and desktop nav hidden)');
  }
  /* Desktop nav must never wrap. A wrap of this kind starts only past the width at which
     the nav's container stops growing, so it is invisible to any matrix that stops below
     the bug's own threshold — it reaches the reviewer's ultrawide monitor first. Two
     readings, because either alone can be gamed: no label may occupy more than one line
     box, and every item must be the same height. */
  if (m.dnavItems && m.dnavItems.length) {
    const wrapped = m.dnavItems.filter((i) => i.lines > 1);
    for (const i of wrapped) p.push(`desktop nav item "${i.text}" wrapped to ${i.lines} lines (${px(i.height)})`);
    const hs = m.dnavItems.map((i) => i.height);
    const spread = Math.max(...hs) - Math.min(...hs);
    if (spread > 1) p.push(`desktop nav items have unequal heights (spread ${px(spread)}) — a label wrapped`);
  }

  if (m.contact !== 'SKIP' && m.contact !== true) {
    p.push(m.contact === null ? 'MISSING SELECTOR contact_affordance in header = FAIL' : 'header contact affordance not rendered');
  }

  if (m.comp) {
    const tol = cell.tolerance;
    for (const e of m.comp.elements) {
      if (e.todo) { p.push(`fold contract slot unfilled: ${e.sel}`); continue; }
      if (e.missing) { p.push(`MISSING SELECTOR ${e.sel} (declared first-view element) = FAIL`); continue; }
      if (!e.rendered) { p.push(`first-view element ${e.sel} not rendered`); continue; }
      if (e.top < -1) p.push(`first-view element ${e.sel} above viewport by ${px(-e.top)}`);
      if (e.bottom > m.vh + 1) p.push(`first-view element ${e.sel} cut by fold: ${px(e.bottom - m.vh)}`);
    }
    const last = m.comp.last;
    if (m.comp.edge === 'flowing') {
      /* A flowing band that still declares last_in_fold is a contradiction: it claims both
         that no fold edge exists and that a named element lands on one. */
      if (last) p.push(`fold contract: composition "${m.comp.name}" declares fold_edge:"flowing" AND last_in_fold ${last.sel} — contradictory contract`);
    } else if (!last) p.push('fold contract declares no last_in_fold');
    else if (last.todo) p.push(`fold contract slot unfilled: ${last.sel}`);
    else if (last.missing) p.push(`MISSING SELECTOR ${last.sel} (last_in_fold) = FAIL`);
    else {
      const gap = last.bottom - m.vh;
      if (Math.abs(gap) > tol) p.push(`fold contract: ${last.sel} bottom ${gap > 0 ? '+' : ''}${Math.round(gap)}px vs fold (tolerance ${tol}px)`);
    }
    for (const e of m.comp.never) {
      if (e.todo || e.missing) continue;
      if (e.top < m.vh - 1) p.push(`below-fold block ${e.sel} bleeds into first view by ${px(m.vh - e.top)}`);
    }
  }
  return p;
}

/* ---------------------------------------------------------------- driver -------------- */
(async () => {
  const rep = report('viewports');
  const rootDir = S.root();
  const { site, declared, built, missing, wip } = S.pages(rootDir);
  const fold = S.loadContract('fold-contract.json', 'FOLD_CONTRACT');
  const sel = fold.json.selectors || {};
  /* `page` may name one file or a whole set — a contract that could only cover one page
     would leave every other declared page measured but uncontracted. */
  const foldPages = [].concat(fold.json.page || []);

  const declaredLang = typeof site.lang === 'string' ? site.lang.trim() : '';

  console.log(`viewports: root=${rootDir} pages declared=${declared.length} built=${built.length} contract=${fold.path} status=${fold.json.status}`);

  if (!fold.filled) {
    rep.fail('fold-contract', `UNFILLED (status=${fold.json.status}) — composition assertions cannot run, so this run cannot be green`);
  }
  for (const t of fold.todos) rep.fail('fold-contract slot', `TODO slot: ${t}`);

  /* The expected html lang is the manifest's, never a checker default: a rig that assumes
     a language silently passes a site shipped in the wrong one. Recorded once here rather
     than once per cell, because the defect is in site.json, not in any cell. */
  if (!declaredLang) {
    rep.fail('site.json lang', 'site.json declares no "lang" — the html lang assertion has nothing to assert against and does not run');
  }

  for (const p of missing) {
    if (wip) rep.note(`warn: PENDING page ${p.file} (${p.label}) not built — --wip run, NOT a green run`);
    else rep.fail(`page-missing ${p.file}`, `declared in site.json (${p.label}) but absent from ${rootDir}`);
  }
  const wipMeta = wip ? { wip: 'NOT-GREEN' } : {};
  if (!built.length) {
    rep.fail('pages', 'no declared page exists in the root — nothing to measure');
    return rep.finish({ root: S.rootLabel(rootDir), ...wipMeta });
  }

  const srv = await serve(rootDir);
  const shots = S.shots();
  const shotLabels = new Set(S.shotLabels());
  const out = shots ? S.outDir() : null;
  const cells = S.viewports();
  const tolerance = fold.json.tolerance_px ?? 2;
  const trailingTolerance = sel.nav_toggle_trailing_tolerance_px ?? 40;
  const navBreakpoint = sel.nav_breakpoint_px ?? 1024;

  for (const engName of S.engines()) {
    const type = { chromium, webkit }[engName];
    if (!type) { rep.fail(`engine ${engName}`, 'unknown engine'); continue; }
    let browser;
    try { browser = await type.launch(); }
    catch (e) { rep.fail(`engine ${engName}`, `launch failed: ${e.message.split('\n')[0]}`); continue; }

    for (const v of cells) {
      const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      for (const pg of built) {
        const scope = `${engName} ${v.label} ${v.w}x${v.h} ${pg.file}`;
        try {
          await page.goto(srv.url + pg.file, { waitUntil: 'networkidle', timeout: 20000 });
          await page.evaluate(() => document.fonts.ready);
          await page.evaluate(async () => {
            const step = Math.max(200, window.innerHeight - 100);
            for (let y = 0; y <= document.body.scrollHeight; y += step) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)); }
            window.scrollTo(0, 0);
          });
          await page.waitForTimeout(250);
          /* A composition may carry `pages:[…]`; without it, it applies to every file in
             the contract's page[]. A landing page's fitted hero and a content page's
             flowing first section must not leak onto each other's pages. */
          const band = fold.filled && foldPages.includes(pg.file)
            ? (fold.json.compositions || []).find((c) => v.w >= (c.min_width ?? 0) && v.w <= (c.max_width ?? 1e9) && (c.pages || foldPages).includes(pg.file))
            : null;
          if (fold.filled && foldPages.includes(pg.file) && !band) {
            rep.fail(scope, `fold contract has no composition band covering ${v.w}px`);
          }
          const m = await page.evaluate(rigProbe, { selectors: sel, composition: band || null });
          rep.row(scope, verdict(m, { mobile: !!v.mobile, tolerance, trailingTolerance, navBreakpoint, lang: declaredLang }));
          if (shots && shotLabels.has(v.label)) {
            /* After the measurements, never before: settling images is a capture-time
               concern and must not be able to move a number the fold contract reads. */
            await S.settleImages(page);
            await page.screenshot({ path: path.join(out, `viewports-${engName}-${slugOf(pg.file)}-${v.w}x${v.h}.png`) });
          }
        } catch (e) {
          rep.fail(scope, `THREW: ${e.message.split('\n')[0]}`);
        }
      }
      await ctx.close();
    }
    await browser.close();
  }
  await srv.close();
  rep.finish({
    root: S.rootLabel(rootDir),
    engines: S.engines().join('+'),
    cells: cells.length,
    pages: built.length,
    ...wipMeta,
  });
})();
