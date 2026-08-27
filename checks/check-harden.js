/* Content hardening gate. Real content is longer and messier than the content a design is
   drawn with, and a grid drawn with six cards meets five and seven.

   Cases, per engine x cell x page:
     1. LONGEST-CONTENT INJECTION per declared component (contracts/harness-slots.json)
     2. GRID N+1 / N-1 per declared collection
     3. UNBREAKABLE TOKENS — a part number or an email address: no space, no soft hyphen,
        nothing a 320px column can wrap out of trouble
     4. after every mutation, the invariants content length can break are re-asserted:
        zero horizontal overflow, no text spilling its own box, no text clipped by a
        hidden-overflow box, and — where the fold contract declares a fold edge — that edge
        still holding.

   The site-specific slots ship UNFILLED on purpose. An unfilled slot FAILS LOUDLY — it does
   not degrade to a skip, because "0 hardening cases run" and "all hardening cases pass" look
   identical in a summary line, and only one of them is true.
*/
const { chromium, webkit } = require('playwright');
const path = require('path');

const S = require('./lib/site');
const { serve } = require('./lib/serve');
const { report } = require('./lib/report');

const USAGE = `usage: node checks/check-harden.js [options]

  --root <dir>          built site directory to measure (default: <repo>/dist)
  --pages a.html,b.html restrict the run to these site.json page files
  --viewports WxH,...   cells to measure. This checker defaults to the four cells the
                        hardening cases were written against — 320x568, 390x844, 1280x640,
                        1440x900 — instead of the rig's full matrix; pass the flag for any
                        other set, including the full matrix.
  --engines a,b         chromium,webkit (default: both)
  --shots 0             do not write a screenshot for failing cells
  --wip                 a declared-but-unbuilt page becomes a note instead of a FAIL, and
                        the run is stamped NOT-GREEN
  --help                print this

  site.json and contracts/ are always read from the repo root, never from --root.`;

/* Page files are nested (services/index.html), so a file name is not a safe path segment.
   Flattened for screenshot names; without this the shot write lands in a directory that
   does not exist and the cell reports THREW. */
const slugOf = (f) => f.replace(/[\\/\\\\]/g, '-').replace(/\.html$/, '');

const CHECKER_DEFAULT_CELLS = ['320x568', '390x844', '1280x640', '1440x900'];

/* The four cells above are where content length actually threatens a layout: two phone
   widths, the short laptop, and the wide laptop. --viewports overrides them, so the same
   checker can be replayed over the rig's full matrix without an edit. */
function cells() {
  const raw = String(S.flag('viewports', 'RIG_VIEWPORTS', '')).trim();
  const all = S.viewports();
  if (raw && raw !== 'true') return all;
  return all.filter((v) => CHECKER_DEFAULT_CELLS.includes(`${v.w}x${v.h}`));
}

function hardeningProbe(o) {
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
  const cs = (el) => getComputedStyle(el);
  const rendered = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const c = cs(n);
      if (c.display === 'none' || c.visibility === 'hidden') return false;
      if (n.hasAttribute('hidden') || n.getAttribute('aria-hidden') === 'true') return false;
      /* Screen-reader-only boxes (1px + clip) are designed clipping, not defects. */
      if (c.clipPath === 'inset(50%)' || (parseInt(c.width) <= 1 && parseInt(c.height) <= 1)) return false;
    }
    const b = el.getBoundingClientRect();
    return b.width > 0 && b.height > 0;
  };
  const trunc = (arr, n) => ({ items: arr.slice(0, n), more: Math.max(0, arr.length - n) });
  const vw = document.documentElement.clientWidth;
  const clippedBy = (el) => {
    for (let n = el.parentElement; n && n !== document.documentElement && n !== document.body; n = n.parentElement) {
      if (['hidden', 'auto', 'scroll', 'clip'].includes(cs(n).overflowX)) return true;
    }
    return false;
  };
  const offenders = [...document.querySelectorAll('body *')].filter((el) => {
    if (!rendered(el)) return false;
    const b = el.getBoundingClientRect();
    return b.width > 0 && (b.right > vw + 1 || b.left < -1) && !clippedBy(el);
  }).map(cssPath);

  const spill = [], clipped = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!rendered(el)) continue;
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
    if (!ownText) continue;
    const c = cs(el);
    if (el.scrollWidth > Math.ceil(el.clientWidth) + 1) {
      /* WebKit reports the unbroken width of a &shy;-hyphenated run in scrollWidth even
         when the line boxes fit (measured 2026-08-24: rects 260/36/36 <= 288, scrollWidth
         still 296). A second reading, taken from the line boxes, separates a real spill
         from that phantom measurement — two readings, as in the desktop-nav wrap check. */
      const rg = document.createRange();
      rg.selectNodeContents(el);
      const maxLine = Math.max(0, ...[...rg.getClientRects()].map((x) => x.width));
      if (maxLine > el.clientWidth + 1) {
        if (['hidden', 'clip'].includes(c.overflowX)) {
          clipped.push(`${cssPath(el)} text ${el.scrollWidth}px clipped to ${el.clientWidth}px`);
        } else {
          spill.push(`${cssPath(el)} scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`);
        }
      }
    }
    if (['hidden', 'clip'].includes(c.overflowY) && el.scrollHeight > el.clientHeight + 2) {
      clipped.push(`${cssPath(el)} text ${el.scrollHeight}px tall clipped to ${el.clientHeight}px`);
    }
  }

  const compoundSpill = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const t = (n.nodeValue || '');
    const hit = (o.compounds || []).find((w) => t.toUpperCase().includes(w.toUpperCase()));
    if (!hit) continue;
    const el = n.parentElement;
    if (!el || !rendered(el)) continue;
    const b = el.getBoundingClientRect();
    if (b.right > vw + 1 || el.scrollWidth > Math.ceil(el.clientWidth) + 1) {
      compoundSpill.push(`${hit} spills at ${cssPath(el)}`);
    }
  }

  let foldGap = null;
  if (o.lastInFold && !/TODO/.test(o.lastInFold)) {
    const el = document.querySelector(o.lastInFold);
    foldGap = el ? Math.round(el.getBoundingClientRect().bottom - window.innerHeight) : 'MISSING';
  }
  return {
    vw,
    docScrollW: document.documentElement.scrollWidth,
    offenders: trunc(offenders, 5),
    spill: trunc(spill, 5),
    clipped: trunc(clipped, 5),
    compoundSpill: trunc([...new Set(compoundSpill)], 5),
    foldGap,
  };
}

const fmt = (t, sep) => t.items.join(sep) + (t.more ? `${sep}... and ${t.more} more` : '');

function check(m, tol) {
  const p = [];
  if (m.docScrollW > m.vw) p.push(`h-overflow ${m.docScrollW - m.vw}px`);
  if (m.offenders.items.length) p.push(`overflowing: ${fmt(m.offenders, ' ')}`);
  if (m.spill.items.length) p.push(`text wider than its box: ${fmt(m.spill, ' | ')}`);
  if (m.clipped.items.length) p.push(`text clipped: ${fmt(m.clipped, ' | ')}`);
  if (m.compoundSpill.items.length) p.push(`unbreakable token spill: ${fmt(m.compoundSpill, ' | ')}`);
  if (m.foldGap === 'MISSING') p.push('MISSING SELECTOR last_in_fold = FAIL');
  else if (typeof m.foldGap === 'number' && Math.abs(m.foldGap) > tol) p.push(`fold contract broken by injected content: ${m.foldGap > 0 ? '+' : ''}${m.foldGap}px`);
  return p;
}

async function inject(page, components) {
  return page.evaluate((comps) => {
    const applied = [];
    for (const c of comps) {
      const hosts = [...document.querySelectorAll(c.selector)];
      let n = 0;
      for (const host of hosts) {
        const targets = c.text_selector && c.text_selector !== c.selector
          ? [...host.querySelectorAll(c.text_selector)] : [host];
        for (const t of targets) { t.textContent = c.longest; n++; }
      }
      if (n) applied.push(`${c.name}x${n}`);
    }
    return applied;
  }, components);
}

async function gridMutate(page, grid, delta) {
  return page.evaluate(({ g, d }) => {
    const hosts = [...document.querySelectorAll(g.selector)];
    if (!hosts.length) return { ok: false, absent: true };
    let touched = 0;
    for (const host of hosts) {
      const items = [...host.querySelectorAll(g.item_selector)];
      if (items.length < 2) return { ok: false, why: `grid "${g.name}" has a host with ${items.length} item(s) — N+1/N-1 cannot be exercised there` };
      if (d > 0) host.appendChild(items[items.length - 1].cloneNode(true));
      else items[items.length - 1].remove();
      touched++;
    }
    return { ok: true, touched };
  }, { g: grid, d: delta });
}

(async () => {
  if (S.flag('help', 'HELP', false) !== false) { console.log(USAGE); return; }

  const rep = report('harden');
  const rootDir = S.root();
  const { built, missing, wip } = S.pages(rootDir);
  const slots = S.loadContract('harness-slots.json', 'HARNESS_SLOTS');
  const fold = S.loadContract('fold-contract.json', 'FOLD_CONTRACT');
  const H = slots.json;
  const tol = fold.json.tolerance_px ?? 2;
  const stamp = {};

  console.log(`harden: root=${rootDir} slots=${slots.path} status=${H.status}`);
  for (const p of missing) {
    if (wip) { stamp.wip = 'NOT-GREEN'; rep.note(`PENDING page ${p.file} not built — --wip run, NOT-GREEN`); }
    else rep.fail(`page-missing ${p.file}`, `declared in site.json but absent from ${rootDir}`);
  }

  const components = (H.components || []).filter((c) => !/TODO/.test(JSON.stringify(c)));
  const grids = (H.grids || []).filter((g) => !/TODO/.test(JSON.stringify(g)));
  for (const c of H.components || []) if (/TODO/.test(JSON.stringify(c))) rep.fail('harness-slots components', `UNFILLED slot ${JSON.stringify(c)} — longest-content injection did NOT run for this component`);
  for (const g of H.grids || []) if (/TODO/.test(JSON.stringify(g))) rep.fail('harness-slots grids', `UNFILLED slot ${JSON.stringify(g)} — N+1/N-1 did NOT run for this grid`);
  if (!components.length) rep.fail('harden coverage', 'zero components carry a longest-content case — the hardening gate has no evidence');
  if (!grids.length) rep.fail('harden coverage', 'zero grids carry an N+1/N-1 case — the hardening gate has no evidence');

  if (!built.length) { rep.fail('pages', 'nothing to measure'); return rep.finish({ root: S.rootLabel(rootDir), ...stamp }); }

  const srv = await serve(rootDir);
  const shots = S.shots();
  const viewports = cells();
  const seenComponents = new Set(), seenGrids = new Set();
  const foldPages = fold.filled ? [].concat(fold.json.page || []) : [];

  const shoot = async (page, name) => {
    if (!shots) return;
    await S.settleImages(page);
    await page.screenshot({ path: path.join(S.outDir(), name), fullPage: true });
  };

  for (const engName of S.engines()) {
    const type = { chromium, webkit }[engName];
    if (!type) { rep.fail(`engine ${engName}`, 'unknown engine'); continue; }
    let browser;
    try { browser = await type.launch(); }
    catch (e) { rep.fail(`engine ${engName}`, `launch failed: ${e.message.split('\n')[0]}`); continue; }

    for (const v of viewports) {
      const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      for (const pg of built) {
        /* Per-page composition scoping — the same rule the viewports checker uses: a page
           the fold contract does not name carries no fold edge, so its fold check is a
           declared no-op here rather than a MISSING SELECTOR. */
        const band = foldPages.includes(pg.file)
          ? (fold.json.compositions || []).find((c) => v.w >= (c.min_width ?? 0) && v.w <= (c.max_width ?? 1e9) && (c.pages || foldPages).includes(pg.file))
          : null;
        const probeOpts = { compounds: H.compounds || [], lastInFold: (band && band.last_in_fold) || null };
        const load = async () => {
          await page.goto(`${srv.url}${pg.file}`, { waitUntil: 'networkidle', timeout: 20000 });
          await page.evaluate(() => document.fonts.ready.then(() => true));
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.waitForTimeout(200);
        };
        try {
          /* 0 — baseline before any mutation, so an injection failure is distinguishable
             from a pre-existing break (a control that cannot separate those is not an
             instrument) */
          await load();
          rep.row(`${engName} ${v.label} ${pg.file} baseline`, check(await page.evaluate(hardeningProbe, probeOpts), tol));

          // 1 — longest content
          if (components.length) {
            const applied = await inject(page, components);
            for (const n of applied) seenComponents.add(n.split('x')[0]);
            await page.waitForTimeout(200);
            const probs = check(await page.evaluate(hardeningProbe, probeOpts), tol);
            rep.row(`${engName} ${v.label} ${pg.file} longest-content [${applied.join(' ') || 'none on this page'}]`, probs);
            if (probs.length) await shoot(page, `harden-long-${engName}-${slugOf(pg.file)}-${v.w}x${v.h}.png`);
          }

          // 2 — grids at N+1 and N-1
          for (const g of grids) {
            for (const d of [+1, -1]) {
              const scope = `${engName} ${v.label} ${pg.file} grid ${g.name} N${d > 0 ? '+' : '-'}1`;
              await load();
              const r = await gridMutate(page, g, d);
              /* A grid absent from this page is not a finding — the contract declares one
                 grid across the pages that have it, and the coverage assertion after the
                 run is what proves each declared grid was mutated somewhere. A grid whose
                 host holds fewer than two items IS a finding: the case cannot run, and a
                 case that cannot run reads exactly like a case that passed. */
              if (r.absent) { rep.ok(`${scope} [grid not on this page]`); continue; }
              if (!r.ok) { rep.fail(scope, r.why); continue; }
              seenGrids.add(g.name);
              await page.waitForTimeout(200);
              const probs = check(await page.evaluate(hardeningProbe, probeOpts), tol);
              rep.row(scope, probs);
              if (probs.length) await shoot(page, `harden-grid-${g.name}-${d > 0 ? 'plus' : 'minus'}-${engName}-${slugOf(pg.file)}-${v.w}x${v.h}.png`);
            }
          }
        } catch (e) {
          rep.fail(`${engName} ${v.label} ${pg.file}`, `THREW: ${e.message.split('\n')[0]}`);
        }
      }
      await ctx.close();
    }
    await browser.close();
  }
  await srv.close();

  for (const c of components) if (!seenComponents.has(c.name)) rep.fail('harden coverage', `component "${c.name}" (${c.selector}) was never found on any page — the declared case never ran`);
  for (const g of grids) if (!seenGrids.has(g.name)) rep.fail('harden coverage', `grid "${g.name}" (${g.selector}) was never mutated on any page — the declared case never ran`);

  rep.finish({
    root: S.rootLabel(rootDir),
    engines: S.engines().join('+'),
    cells: viewports.length,
    components: components.length,
    grids: grids.length,
    ...stamp,
  });
})();
