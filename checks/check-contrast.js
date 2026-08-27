/* Contrast — EVERY rendered text node, against the ACTUALLY PAINTED background.
   Both engines, at 320x568 (the rig's contractual floor), 390x844 and 1280x640.

   Why a canvas plus a screenshot rather than walking computed background-color up the tree
   (the cheap way every a11y snippet does it): a designed page layers text over gradients,
   grain, photographs and translucent plates. An ancestor-walk answers "what colour is the
   nearest opaque box", which for text over a painted surface is a fabrication. Here:
     1. the foreground colour is resolved through a real 2D canvas — any colour syntax the
        engine supports (oklch, color(srgb ...), hsl) comes back as sRGB, and a colour the
        canvas refuses FAILS instead of silently measuring 1:1;
     2. the background is read from a screenshot taken with every glyph made transparent,
        so the sampled pixels are the real painted surface under the text box;
     3. the reported ratio is the 10th-percentile pixel (worst-decile), not the mean —
        a mean passes text laid over a bright patch of a dark surface.

   Thresholds: 4.5:1, or 3.0:1 for >=24px or >=18.66px bold (WCAG AA large text).

   Registers are read from the contract (contrast.registers), never held here: a register
   names a ground a reviewer can point at. The base register — every node inside no named
   register — is implicit and is never declared. A page carrying a register in its DOM but
   none of whose nodes were measured FAILS: "0 measured nodes on that ground" and "every
   node on that ground is fine" look identical in a summary, and only one of them is true.

   Known hole, deliberate: a text rect that does not fit inside the viewport box is never
   measured. The rect filter keeps only rects wholly inside the cell, so a heading taller or
   wider than the viewport is skipped rather than graded against a partial background. It is
   a coverage limit of this instrument, not a pass.
*/
const { chromium, webkit } = require('playwright');
const sharp = require('sharp');
const S = require('./lib/site');
const { serve } = require('./lib/serve');
const { report } = require('./lib/report');

const CELLS = [
  { w: 320, h: 568, label: 'se1' },
  { w: 390, h: 844, label: 'iphone-pro' },
  { w: 1280, h: 640, label: 'laptop-720' },
];
const MAX_SAMPLES = 1200;
const WORST_DECILE = 0.10;
const MAX_PROBLEMS = 40;
const BASE_REGISTER = 'base';

/* ------------------------------------------------------------- in-page collector ----- */
function collectText(regSels) {
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = 1;
  const ctx = cvs.getContext('2d', { willReadFrequently: true });
  const resolve = (str) => {
    ctx.fillStyle = '#000';
    ctx.fillStyle = str;
    const a = ctx.fillStyle;
    ctx.fillStyle = '#fff';
    ctx.fillStyle = str;
    if (ctx.fillStyle !== a) return null;           // engine rejected the syntax
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
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
  const effOpacity = (el) => {
    let o = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
      if (n.hasAttribute('hidden') || n.getAttribute('aria-hidden') === 'true') return 0;
      o *= parseFloat(cs.opacity);
    }
    return o;
  };

  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TITLE', 'TEMPLATE', 'OPTION']);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const out = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.nodeValue || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const el = n.parentElement;
    if (!el || SKIP.has(el.tagName)) continue;
    const op = effOpacity(el);
    if (op <= 0.01) { out.push({ unpainted: true, path: cssPath(el), text: text.slice(0, 40) }); continue; }
    const cs = getComputedStyle(el);
    const range = document.createRange();
    range.selectNodeContents(n);
    /* A rect covered by a fixed header or an overlay is not painted text — hit-testing keeps
       the instrument from grading the header's background as this node's. Three points, not
       one: a line scrolling half under a fixed header still hit-tests clean at its centre,
       so its top pixels were sampled as this node's background and graded 1.52:1. */
    const unoccluded = (r) => {
      const x = r.left + r.width / 2;
      for (const y of [r.top + 1, r.top + r.height / 2, r.bottom - 1]) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || !(el.contains(hit) || hit.contains(el))) return false;
      }
      return true;
    };
    const rects = [...range.getClientRects()]
      .filter((r) => r.width >= 2 && r.height >= 2 && r.top >= 0 && r.left >= 0 && r.bottom <= vh && r.right <= vw)
      .filter(unoccluded)
      .slice(0, 3)
      .map((r) => ({ x: r.left, y: r.top, w: r.width, h: r.height }));
    if (!rects.length) continue;
    const size = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight, 10) || 400;
    out.push({
      path: cssPath(el),
      text: text.slice(0, 40),
      docTop: Math.round(rects[0].y + window.scrollY),
      fg: resolve(cs.color),
      fgRaw: cs.color,
      opacity: op,
      size, weight,
      large: size >= 24 || (size >= 18.66 && weight >= 700),
      regs: regSels.filter((s) => !!el.closest(s)),
      rects,
    });
  }
  return out;
}

/* Register presence per page: does the DOM carry visible-geometry text under each register
   selector at all? An off-canvas element parked above the document origin (a skip link) is
   not "present", because no scroll band can ever measure it. */
function registerPresence(regSels) {
  const out = {};
  for (const sel of regSels) {
    out[sel] = [...document.querySelectorAll(sel)].some((el) => {
      if (!(el.textContent || '').trim()) return false;
      const r = el.getBoundingClientRect();
      return r.width >= 2 && r.height >= 2 && r.top + window.scrollY >= 0;
    });
  }
  return out;
}

const TRANSPARENT_TEXT = `
*,*::before,*::after{color:transparent!important;-webkit-text-fill-color:transparent!important;
 text-shadow:none!important;text-decoration-color:transparent!important;caret-color:transparent!important}
*::placeholder{color:transparent!important}
svg text,svg tspan{fill:transparent!important}`;

/* ------------------------------------------------------------- maths ----------------- */
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => {
  const l1 = lum(a[0], a[1], a[2]), l2 = lum(b[0], b[1], b[2]);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

function measureNode(node, plate) {
  const { data, width, height, channels } = plate;
  const samples = [];
  for (const r of node.rects) {
    const x0 = Math.max(0, Math.ceil(r.x) + 1), x1 = Math.min(width - 1, Math.floor(r.x + r.w) - 1);
    const y0 = Math.max(0, Math.ceil(r.y) + 1), y1 = Math.min(height - 1, Math.floor(r.y + r.h) - 1);
    if (x1 <= x0 || y1 <= y0) continue;
    const area = (x1 - x0) * (y1 - y0);
    const stride = Math.max(1, Math.round(Math.sqrt(area / (MAX_SAMPLES / node.rects.length))));
    for (let y = y0; y <= y1; y += stride) {
      for (let x = x0; x <= x1; x += stride) {
        const i = (y * width + x) * channels;
        samples.push([data[i], data[i + 1], data[i + 2]]);
      }
    }
  }
  if (!samples.length) return null;
  const alpha = node.fg[3] * node.opacity;
  const ratios = samples.map((bg) => {
    const fg = alpha >= 0.999 ? node.fg
      : [0, 1, 2].map((k) => alpha * node.fg[k] + (1 - alpha) * bg[k]);
    return ratio(fg, bg);
  }).sort((a, b) => a - b);
  return {
    p10: ratios[Math.floor(ratios.length * WORST_DECILE)],
    min: ratios[0],
    median: ratios[Math.floor(ratios.length / 2)],
    n: ratios.length,
  };
}

/* Names and selectors must both be unique: the per-cell counters are keyed by selector, so a
   duplicate would silently merge two grounds and let either stand in as evidence for the other. */
function readRegisters() {
  let c;
  try { c = S.loadContract('fold-contract.json', 'FOLD_CONTRACT'); }
  catch (e) { return { error: e.message }; }
  if (c.todos.length) return { error: `${c.path} still holds TODO slots: ${c.todos.join('; ')}` };
  if (!c.filled) return { error: `${c.path} is not status FILLED — refusing to grade against a draft contract` };
  const decl = c.json.contrast && c.json.contrast.registers;
  if (!Array.isArray(decl)) return { error: `${c.path} declares no contrast.registers — registers are declared, never invented` };
  const names = new Set(), sels = new Set();
  for (const r of decl) {
    if (!r || typeof r.name !== 'string' || typeof r.selector !== 'string' || !r.name || !r.selector) {
      return { error: `contrast.registers entry is not {name, selector}: ${JSON.stringify(r)}` };
    }
    if (names.has(r.name)) return { error: `contrast.registers declares the name "${r.name}" twice` };
    if (sels.has(r.selector)) return { error: `contrast.registers declares the selector "${r.selector}" twice` };
    if (r.name === BASE_REGISTER) return { error: `contrast.registers may not declare "${BASE_REGISTER}" — the base register is implicit` };
    names.add(r.name); sels.add(r.selector);
  }
  return { registers: decl.map((r) => ({ name: r.name, selector: r.selector })) };
}

/* ------------------------------------------------------------- driver ---------------- */
(async () => {
  const rep = report('contrast');
  const rootDir = S.root();
  const { site, declared, built, missing, wip } = S.pages(rootDir);
  /* "This register selector is dead" is a claim about the whole declared site. A --pages
     subset or an unbuilt page makes it unfounded — a register can legitimately live on one
     page only — so the guard is evaluated only over the full set, and says so when it is not. */
  const wholeSite = declared.length === site.pages.length && missing.length === 0;
  const meta = () => ({
    root: S.rootLabel(rootDir),
    engines: S.engines().join('+'),
    cells: CELLS.length,
    pages: built.length,
    ...(wip ? { wip: 'NOT-GREEN' } : {}),
  });

  const loaded = readRegisters();
  if (loaded.error) { rep.fail('contract', loaded.error); return rep.finish(meta()); }
  const registers = loaded.registers;
  const regSels = registers.map((r) => r.selector);
  const nameOf = Object.fromEntries(registers.map((r) => [r.selector, r.name]));

  console.log(`contrast: root=${rootDir} pages=${built.length} registers=${registers.map((r) => `${r.name}(${r.selector})`).join(', ') || '(base only)'}`);
  for (const p of missing) {
    if (wip) rep.note(`PENDING page ${p.file} not built — --wip run, NOT a green run`);
    else rep.fail(`page-missing ${p.file}`, `declared in site.json but absent from ${rootDir}`);
  }
  if (!built.length) { rep.fail('pages', 'nothing to measure'); return rep.finish(meta()); }

  const measuredAnywhere = Object.fromEntries(regSels.map((s) => [s, 0]));
  const srv = await serve(rootDir);
  for (const engName of S.engines()) {
    const type = { chromium, webkit }[engName];
    if (!type) { rep.fail(`engine ${engName}`, 'unknown engine'); continue; }
    let browser;
    try { browser = await type.launch(); }
    catch (e) { rep.fail(`engine ${engName}`, `launch failed: ${e.message.split('\n')[0]}`); continue; }

    for (const v of CELLS) {
      /* reducedMotion: 'reduce' is a correctness fix, not a convenience: without it a node
         can be sampled mid-fade and graded against a partly-transparent version of itself,
         and that was the sole source of flake in this instrument. The end state measured is
         byte-identical to the revealed one; what disappears is the timing. */
      const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      for (const pg of built) {
        const scope = `${engName} ${v.label} ${pg.file}`;
        try {
          await page.goto(srv.url + pg.file, { waitUntil: 'networkidle', timeout: 20000 });
          await page.evaluate(() => document.fonts.ready);
          await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
          const docH = await page.evaluate(async () => {
            const step = Math.max(200, window.innerHeight - 100);
            for (let y = 0; y <= document.body.scrollHeight; y += step) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)); }
            window.scrollTo(0, 0);
            return document.body.scrollHeight;
          });
          await page.waitForTimeout(300);
          const present = await page.evaluate(registerPresence, regSels);

          const seen = new Set(), seenUnpainted = new Set();
          const probs = [];
          const regCounts = Object.fromEntries(regSels.map((s) => [s, 0]));
          let baseCount = 0;
          let checked = 0, unpainted = 0, unresolvable = 0;
          for (let y = 0; y < Math.max(docH, v.h); y += Math.max(200, v.h - 140)) {
            await page.evaluate((yy) => window.scrollTo(0, yy), y);
            await page.waitForTimeout(160);
            const nodes = await page.evaluate(collectText, regSels);
            const wanted = nodes.filter((n) => {
              /* Both counters in the row stamp must mean "distinct nodes". An unpainted node is
                 re-seen in every scroll band, so counting it per band put a number ~4x the
                 measured count beside it in the same bracket, which reads as a coverage hole. */
              if (n.unpainted) {
                const key = `${n.path}|${n.text}`;
                if (!seenUnpainted.has(key)) { seenUnpainted.add(key); unpainted++; }
                return false;
              }
              const key = `${n.path}|${n.text}|${n.docTop}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            if (!wanted.length) continue;
            const tag = await page.addStyleTag({ content: TRANSPARENT_TEXT });
            await page.waitForTimeout(60);
            const buf = await page.screenshot({ caret: 'hide' });
            await tag.evaluate((el) => el.remove());
            const plate = await sharp(buf).raw().toBuffer({ resolveWithObject: true })
              .then(({ data, info }) => ({ data, width: info.width, height: info.height, channels: info.channels }));

            for (const n of wanted) {
              if (!n.fg) {
                unresolvable++;
                probs.push(`UNRESOLVABLE COLOUR ${n.fgRaw} on ${n.path} "${n.text}" — instrument cannot certify this node`);
                continue;
              }
              const m = measureNode(n, plate);
              if (!m) continue;
              checked++;
              for (const s of n.regs) { regCounts[s]++; measuredAnywhere[s]++; }
              if (!n.regs.length) baseCount++;
              const floor = n.large ? 3.0 : 4.5;
              if (m.p10 < floor) {
                probs.push(`${m.p10.toFixed(2)}:1 < ${floor.toFixed(1)} (min ${m.min.toFixed(2)}, ${Math.round(n.size)}px/${n.weight}) ${n.path} "${n.text}"`);
              }
            }
          }
          if (!checked && !probs.length) probs.push('NO TEXT NODES MEASURED — instrument measured nothing, which is not a pass');
          for (const r of registers) {
            if (present[r.selector] && checked && !regCounts[r.selector]) {
              probs.push(`REGISTER ${r.name} (${r.selector}) present in DOM but 0 nodes measured — a coverage hole is not a pass`);
            }
          }
          if (checked && !baseCount) probs.push(`REGISTER ${BASE_REGISTER} (outside every named register) 0 nodes measured — a coverage hole is not a pass`);
          const capped = probs.slice(0, MAX_PROBLEMS);
          if (probs.length > MAX_PROBLEMS) capped.push(`... and ${probs.length - MAX_PROBLEMS} more failing nodes`);
          const regStamp = regSels.map((s) => `${nameOf[s]}:${regCounts[s]}`).join(' ');
          rep.row(`${scope} [${checked} nodes (${BASE_REGISTER}:${baseCount}${regStamp ? ' ' + regStamp : ''}), ${unpainted} unpainted, ${unresolvable} unresolvable]`, capped);
        } catch (e) {
          rep.fail(scope, `THREW: ${e.message.split('\n')[0]}`);
        }
      }
      await ctx.close();
    }
    await browser.close();
  }
  await srv.close();

  const counts = registers.map((r) => `${r.name}:${measuredAnywhere[r.selector]}`).join(' ') || 'none declared';
  if (wholeSite) {
    rep.row(
      `contract registers [${counts}]`,
      registers.filter((r) => !measuredAnywhere[r.selector])
        .map((r) => `MISSING SELECTOR ${r.selector} (register ${r.name}) — declared in the contract, matched no measured text node on any page`),
    );
  } else {
    rep.row(`contract registers [${counts}, dead-selector guard NOT EVALUATED]`, []);
    rep.note(`warn: dead-selector guard not evaluated — measured ${built.length} of ${site.pages.length} declared pages, and a register may legitimately live on a page this run skipped`);
  }

  rep.finish(meta());
})();
