/* check-hero — the pinned hero scene's GEOMETRY, asserted against a contract.

   Why this instrument exists: the hero this was extracted from shipped for weeks with the
   moving element sitting 3px left of the line it travels on — a leftover negative margin
   from a narrower shape. It survived two reviewers and every other gate that was green at
   the time, because nothing in the battery ever asserted WHERE the element was. Overflow,
   tap targets, fold height, contrast and painted text were all measured; the one thing the
   scene IS — an object on a line, moving between two ends — was not. A checker family can
   be complete and still be blind in the middle of the frame. That is what a geometry
   contract is for.

   Every selector, literal and tolerance lives in contracts/hero-contract.json. This file
   holds only the assertion structure, per engine x cell:

     a. FRAME 1 — the elements named in `centerline` share one vertical centre within
        `center_tolerance_px`. They may differ in width; they may never differ in centre.
     b. FRAME 1 — the `contact` edges meet within `ground_tolerance_px`, and the ground line
        agrees with its declared cross-check. Both edges are MEASURED from the DOM, never
        hardcoded: the fold and the scene's own height move with the viewport.
     c. END STATE — scrolled to the end of the pinned scrub, a distance DERIVED from the pin
        spacer's own geometry rather than copied from the site's script: the centrelines
        still agree, the reveal element is actually revealed, the readout shows the authored
        `climax`, and the scene is still in frame. An edit that quietly moves the
        destination fails here.
     d. REDUCED MOTION — the frame-1 geometry holds, the readout still holds its resting
        literal, and the moving element carries no running animation: off, not just slower.

   MISSING SELECTOR is a FAIL, never a skip: an assertion that cannot find its element has
   measured nothing, and "nothing measured" and "everything fine" look identical in a
   summary. A skip has to be declared in the contract. */
const { chromium, webkit } = require('playwright');
const path = require('path');
const S = require('./lib/site');
const { serve } = require('./lib/serve');
const { report } = require('./lib/report');

const EDGES = ['top', 'bottom', 'left', 'right'];

/* One missing element is one finding, even when three assertions in the same row trip over
   it. Exact duplicates only — nothing is summarised away. */
const uniq = (probs) => [...new Set(probs)];

function cellsFrom(dflt) {
  const raw = String(S.flag('cells', 'HERO_CELLS', dflt)).trim();
  return raw.split(',').filter(Boolean).map((s) => {
    const [w, h] = s.trim().split('x').map(Number);
    return { w, h, label: `${w}x${h}`, bad: !Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1 ? s.trim() : null };
  });
}

/* A contract that names a selector key nothing defines, or an edge that is not an edge,
   produces "undefined" in a message and measures nothing. Refuse before the browser
   starts, rather than reporting green rows built out of holes. */
function contractProblems(k) {
  const probs = [];
  const sel = k.selectors || {};
  const named = (key, where) => {
    if (!sel[key]) probs.push(`${where} names selector "${key}", which is not in selectors{}`);
  };
  if (!Object.keys(sel).length) probs.push('selectors{} is empty — nothing can be measured');
  if (!Array.isArray(k.centerline) || k.centerline.length < 2) probs.push('centerline must list at least two selector keys');
  else k.centerline.forEach((key) => named(key, 'centerline'));
  const c = k.contact;
  if (!c || !c.from || !c.to) probs.push('contact{} must declare from{edge,of} and to{edge,of}');
  else {
    named(c.from.of, 'contact.from');
    named(c.to.of, 'contact.to');
    for (const e of [c.from.edge, c.to.edge]) if (!EDGES.includes(e)) probs.push(`contact edge "${e}" is not one of ${EDGES.join('/')}`);
    if (c.cross_check && (!c.cross_check.selector || !EDGES.includes(c.cross_check.edge))) {
      probs.push('contact.cross_check must be null or {selector, edge, tolerance_px}');
    }
  }
  for (const key of ['readout', 'reveal', 'scene']) named(key, `the ${key} assertion`);
  for (const n of ['center_tolerance_px', 'ground_tolerance_px', 'end_frame_tolerance_px', 'pin_inset_px', 'pin_min_distance_px', 'reveal_min_opacity', 'rail_rest_tolerance_px']) {
    if (typeof k[n] !== 'number') probs.push(`${n} must be a number, got ${JSON.stringify(k[n])}`);
  }
  if (typeof k.climax !== 'string' || !k.climax) probs.push('climax must be the literal the readout shows at the end of the scrub');
  if (typeof k.pin_class_pattern !== 'string' || !k.pin_class_pattern) probs.push('pin_class_pattern must be a class pattern for the scene\'s pin spacer');
  return probs;
}

/* ------------------------------------------------------------- in-page probes ------- */

function heroProbe(cfg) {
  const box = (s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, w: r.width, h: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  };
  const boxes = {};
  for (const k of Object.keys(cfg.sel)) boxes[k] = box(cfg.sel[k]);
  if (cfg.crossSel) boxes.__cross = box(cfg.crossSel);

  /* Effective opacity, not the element's own: a revealed element inside a faded ancestor
     is not revealed, and getComputedStyle only ever reports the one hop. */
  const el = document.querySelector(cfg.sel.reveal);
  let reveal = null;
  if (el) {
    let o = 1, hidden = false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const c = getComputedStyle(n);
      if (c.visibility === 'hidden') hidden = true;
      o *= parseFloat(c.opacity);
    }
    reveal = { o, hidden, h: el.getBoundingClientRect().height };
  }

  const mover = cfg.animSel ? document.querySelector(cfg.animSel) : null;
  const anim = mover
    ? (() => { const c = getComputedStyle(mover); return { name: c.animationName, dur: c.animationDuration, play: c.animationPlayState }; })()
    : null;
  const readoutEl = document.querySelector(cfg.sel.readout);
  const sceneEl = document.querySelector(cfg.sel.scene);
  return {
    boxes,
    reveal,
    anim,
    moverFound: !!mover,
    readout: readoutEl ? readoutEl.textContent.trim() : null,
    sceneTop: sceneEl ? sceneEl.getBoundingClientRect().top : null,
  };
}

/* Vertical transform currently applied to the rail. Frame-1 geometry is only meaningful at
   rest — measuring mid-animation would blame the layout for a few pixels of motion. */
function railTy(selector) {
  const el = document.querySelector(selector);
  if (!el) return null;
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return 0;
  const m = t.match(/matrix\(([^)]+)\)/);
  if (!m) return 0;
  return Number(m[1].split(',')[5]);
}

/* Every probe approaches its position from BELOW in small steps and then waits for the
   scroll position to hold still across consecutive frames.

   behavior:'instant' is load-bearing, not cosmetic: this fixture's CSS sets
   html{scroll-behavior:smooth}, so a plain scrollTo ANIMATES, and a sample taken before it
   arrives reads an early frame of the scrub — measured here as the readout returning an
   early floor instead of the authored destination. The landing is asserted by the callers
   for the same reason: a scroll that silently did not arrive is an instrument measuring the
   wrong frame.

   The stepped approach is for velocity-sensitive pinning: implementations that pin early in
   proportion to scroll velocity latch their state at the velocity of the scroll that
   entered it, and an instant jump is effectively infinite velocity — in the origin project
   that produced "pinned" readings at positions the same code then landed on as 160px past
   the end, differing between two consecutive runs. Twelve-pixel steps are roughly the
   approach a thumb makes. */
function approachAndRead(arg) {
  const el = document.querySelector(arg.scene);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const go = (t) => window.scrollTo({ top: Math.max(0, t), behavior: 'instant' });
  return (async () => {
    if (!el) return null;
    go(arg.y - 72);
    await wait(90);
    for (let s = 60; s > 0; s -= 12) { go(arg.y - s); await wait(40); }
    go(arg.y);
    let last = -1, same = 0;
    for (let i = 0; i < 180 && same < 2; i++) {
      await frame();
      const now = window.pageYOffset;
      same = now === last ? same + 1 : 0;
      last = now;
    }
    await wait(120);
    return { top: el.getBoundingClientRect().top, sy: window.pageYOffset, want: arg.y, settled: same >= 2 };
  })();
}

/* Where the pinned scene ends, DERIVED from the pin spacer rather than hunted. The spacer
   is static geometry: it is padded by exactly the pin distance, so `spacerHeight -
   sceneHeight` IS the scrub distance, and a future edit to the site's scroll distance moves
   this measurement with it. Searching for the release boundary instead was not reproducible
   in the origin project — the same position read as pinned during the search and unpinned
   on the next visit. The derivation is VERIFIED by the end-state frame assertion below: if
   it were wrong, the scene would not be where it says it is. */
async function findPinEnd(page, cfg) {
  await page.evaluate(approachAndRead, { y: 0, scene: cfg.sel.scene });
  const geo = await page.evaluate((c) => {
    const scene = document.querySelector(c.sel.scene);
    if (!scene) return null;
    const spacer = scene.parentElement;
    const cls = spacer ? String(spacer.className || '') : '(the scene has no parent element)';
    if (!new RegExp(c.pinPattern).test(cls)) return { noSpacer: cls };
    const h = scene.getBoundingClientRect(), s = spacer.getBoundingClientRect();
    return { spacerDocTop: s.top + window.pageYOffset, sceneH: h.height, spacerH: s.height };
  }, cfg);
  if (!geo) return null;
  if (geo.noSpacer) return { noSpacer: geo.noSpacer };

  const distance = geo.spacerH - geo.sceneH;
  if (distance < cfg.pinMinDistance) return { badDistance: distance };

  const mid = await page.evaluate(approachAndRead, { y: Math.round(distance / 2), scene: cfg.sel.scene });
  if (!mid || Math.abs(mid.sy - mid.want) > 2) return { scrollBroken: mid || { want: Math.round(distance / 2), sy: null } };
  const base = mid.top;
  const end = Math.max(0, Math.round(geo.spacerDocTop - base + distance) - cfg.pinInset);
  const landed = await page.evaluate(approachAndRead, { y: end, scene: cfg.sel.scene });
  if (!landed || Math.abs(landed.sy - end) > 2) return { scrollBroken: landed || { want: end, sy: null } };
  return { end, base, distance };
}

/* ------------------------------------------------------------- assertions ----------- */

function centerlineProblems(boxes, phase, cfg) {
  const keys = cfg.centerline;
  const missing = keys.filter((k) => !boxes[k]).map((k) => `MISSING SELECTOR ${k} (${cfg.sel[k]}) — nothing measured`);
  if (missing.length) return missing;
  const xs = keys.map((k) => boxes[k].x);
  const spread = Math.max(...xs) - Math.min(...xs);
  if (spread <= cfg.centerTol) return [];
  const where = keys.map((k) => `${k} ${boxes[k].x.toFixed(2)}`).join(', ');
  return [
    `${phase}: ${keys.join(' / ')} are not on one centerline — spread ${spread.toFixed(2)}px > ${cfg.centerTol}px ` +
    `(${where}; ${keys[keys.length - 1]} ${boxes[keys[keys.length - 1]].w}x${boxes[keys[keys.length - 1]].h}px)`,
  ];
}

/* The contact gap is the one geometry that does not depend on where the page has scrolled
   to, which is what makes it the honest way to ask "has the moving element travelled?" */
function contactGap(boxes, cfg) {
  const c = cfg.contact;
  if (!boxes[c.from.of] || !boxes[c.to.of]) return null;
  return boxes[c.from.of][c.from.edge] - boxes[c.to.of][c.to.edge];
}

function contactProblems(boxes, cfg) {
  const c = cfg.contact;
  if (!boxes[c.from.of]) return [`MISSING SELECTOR ${c.from.of} (${cfg.sel[c.from.of]}) — nothing measured`];
  if (!boxes[c.to.of]) return [`MISSING SELECTOR ${c.to.of} (${cfg.sel[c.to.of]}) — it is what contact is measured against`];
  const probs = [];
  const cross = c.cross_check;
  const target = boxes[c.to.of][c.to.edge];
  if (cross) {
    if (!boxes.__cross) probs.push(`MISSING SELECTOR ${cross.selector} — the ground cross-check is unavailable, so nothing confirms where the ground line is`);
    else {
      const d = boxes.__cross[cross.edge] - target;
      if (Math.abs(d) > cross.tolerance_px) {
        probs.push(`ground cross-check disagrees: ${cfg.sel[c.to.of]} ${c.to.edge} ${target.toFixed(2)} vs ${cross.selector} ${cross.edge} ${boxes.__cross[cross.edge].toFixed(2)} (${d.toFixed(2)}px apart, tolerance ±${cross.tolerance_px}px)`);
      }
    }
  }
  const gap = boxes[c.from.of][c.from.edge] - target;
  if (Math.abs(gap) > cfg.groundTol) {
    probs.push(
      `frame 1: ${c.from.of} does not meet ${c.to.of} — ${c.from.of} ${c.from.edge} ${boxes[c.from.of][c.from.edge].toFixed(2)} ` +
      `vs ${c.to.of} ${c.to.edge} ${target.toFixed(2)} (gap ${gap.toFixed(2)}px, tolerance ±${cfg.groundTol}px)`,
    );
  }
  return probs;
}

/* ------------------------------------------------------------- run ------------------ */

(async () => {
  const rep = report('hero');
  const contract = S.loadContract('hero-contract.json', 'HERO_CONTRACT');
  const k = contract.json;
  const rel = (p) => path.relative(S.REPO, p) || path.basename(p);
  const strictFlag = S.flag('strict', 'STRICT', false);
  const STRICT = strictFlag === true || (typeof strictFlag === 'string' && !['', '0', 'false'].includes(strictFlag));
  const warn = (msg, probs) => { if (STRICT) probs.push(msg); else rep.note(`warn: ${msg}`); };

  const shape = [
    ...(contract.filled ? [] : [`status is ${JSON.stringify(k.status)}, not "FILLED" — an unfilled contract asserts nothing`]),
    ...contract.todos.map((t) => `unfilled slot ${t}`),
    ...contractProblems(k),
  ];
  if (shape.length) {
    rep.row(`contract ${rel(contract.path)}`, shape);
    return rep.finish({ contract: rel(contract.path) });
  }

  const cfg = {
    sel: k.selectors,
    crossSel: k.contact.cross_check ? k.contact.cross_check.selector : null,
    animSel: k.reduced_motion && k.reduced_motion.no_running_animation_on ? k.reduced_motion.no_running_animation_on : null,
    centerline: k.centerline,
    contact: k.contact,
    centerTol: k.center_tolerance_px,
    groundTol: k.ground_tolerance_px,
    pinPattern: k.pin_class_pattern,
    pinInset: k.pin_inset_px,
    pinMinDistance: k.pin_min_distance_px,
  };

  const rootDir = S.root();
  const { declared, built, wip } = S.pages(rootDir);
  const page1 = k.page;
  const meta = { root: rel(rootDir), contract: rel(contract.path), page: page1 };

  if (!declared.some((p) => p.file === page1)) {
    rep.fail(`page ${page1}`, `not declared in site.json (or excluded by --pages) — the hero page must be in the manifest to be measured`);
    return rep.finish(meta);
  }
  if (!built.some((p) => p.file === page1)) {
    /* --wip is the only way a missing page is not red, and it stamps the whole run so a
       receipt can never be mistaken for a green one. */
    if (wip) rep.note(`page-missing ${page1} — not built under ${rootDir} (--wip)`);
    else rep.fail(`page-missing ${page1}`, `not built under ${rootDir} — the hero cannot be measured`);
    return rep.finish(wip ? { ...meta, wip: 'NOT-GREEN' } : meta);
  }

  const CELLS = cellsFrom(k.cells);
  const badCells = CELLS.filter((c) => c.bad);
  for (const c of badCells) rep.fail(`cell ${c.bad}`, 'unreadable --cells entry, expected WIDTHxHEIGHT');
  const cells = CELLS.filter((c) => !c.bad);
  if (!cells.length) return rep.finish(meta);

  console.log(`hero: root=${rootDir} page=${page1} contract=${rel(contract.path)} cells=${cells.map((c) => c.label).join(',')}`);

  const srv = await serve(rootDir);
  const out = S.shots() ? S.outDir() : null;

  for (const engName of S.engines()) {
    const type = { chromium, webkit }[engName];
    if (!type) { rep.fail(`engine ${engName}`, 'unknown engine'); continue; }
    let browser;
    try { browser = await type.launch(); }
    catch (e) { rep.fail(`engine ${engName}`, `launch failed: ${e.message.split('\n')[0]}`); continue; }

    for (const v of cells) {
      const tag = `${engName} ${v.label}`;

      /* --- live page: frame 1 + end state ------------------------------------------ */
      const ctx = await browser.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      try {
        await page.goto(srv.url + page1, { waitUntil: 'networkidle', timeout: 20000 });
        await page.evaluate(() => document.fonts.ready);

        let rest = null, stable = 0;
        for (let i = 0; i < 50 && stable < 2; i++) {
          const ty = await page.evaluate(railTy, cfg.sel.rail);
          if (ty === null) break;
          stable = Math.abs(ty) < k.rail_rest_tolerance_px ? stable + 1 : 0;
          rest = ty;
          if (stable < 2) await page.waitForTimeout(80);
        }
        const restProb = rest === null
          ? [`MISSING SELECTOR rail (${cfg.sel.rail}) — cannot tell whether frame 1 is at rest`]
          : stable < 2
            ? [`${cfg.sel.rail} never came to rest (last translateY ${rest.toFixed(2)}px) — frame-1 geometry unmeasurable`]
            : [];

        const m1 = await page.evaluate(heroProbe, cfg);
        if (out) await page.screenshot({ path: path.join(out, `hero-frame1-${engName}-${v.label}.png`), caret: 'hide' });

        rep.row(`${tag} frame1 centerline`, uniq([...restProb, ...centerlineProblems(m1.boxes, 'frame 1', cfg)]));
        rep.row(`${tag} frame1 ground-contact`, uniq([...restProb, ...contactProblems(m1.boxes, cfg)]));

        const pin = await findPinEnd(page, cfg);
        const endProbs = [];
        if (!pin) endProbs.push(`MISSING SELECTOR scene (${cfg.sel.scene}) — cannot locate the pinned scene`);
        else if (pin.noSpacer) endProbs.push(`no pin spacer matching /${cfg.pinPattern}/ around ${cfg.sel.scene} (parent class "${pin.noSpacer}") — the scrub distance cannot be measured, so the end state is unverifiable`);
        else if (pin.badDistance !== undefined) endProbs.push(`pin distance measures ${pin.badDistance}px, below the declared minimum ${cfg.pinMinDistance}px — the scene is not pinned over a scrub at all`);
        else if (pin.scrollBroken) endProbs.push(`scroll did not land: asked for ${pin.scrollBroken.want}, arrived at ${pin.scrollBroken.sy} — every end-state measurement below would be the wrong frame`);
        else {
          if (out) {
            /* halfway through the scrub, not just short of the end: a "during" shot taken
               at 93% is the end frame again, and two identical screenshots are not evidence */
            await page.evaluate(approachAndRead, { y: pin.end - Math.round(pin.distance / 2), scene: cfg.sel.scene });
            await page.screenshot({ path: path.join(out, `hero-mid-${engName}-${v.label}.png`), caret: 'hide' });
            /* re-approach the end the same slow way: a jump back would enter the pin at a
               different velocity, and the measurement below would be taken in a frame
               nobody scrolled to */
            await page.evaluate(approachAndRead, { y: pin.end, scene: cfg.sel.scene });
          }
          let m2 = null;
          for (let i = 0; i < 40; i++) {
            m2 = await page.evaluate(heroProbe, cfg);
            if (m2.readout === k.climax) break;
            await page.waitForTimeout(100);
          }
          if (out) await page.screenshot({ path: path.join(out, `hero-end-${engName}-${v.label}.png`), caret: 'hide' });

          /* the end state must be ON SCREEN in the frame actually measured, not merely
             computed: opacity and textContent pass happily above the viewport */
          if (m2.sceneTop === null) endProbs.push(`MISSING SELECTOR scene (${cfg.sel.scene}) — cannot tell whether the scene is in frame`);
          else if (pin.base - m2.sceneTop > k.end_frame_tolerance_px) {
            endProbs.push(`end state: the scene has left the frame — ${cfg.sel.scene} top ${m2.sceneTop.toFixed(1)} vs pinned offset ${pin.base.toFixed(1)} at scrollY ${pin.end} (tolerance ${k.end_frame_tolerance_px}px)`);
          }
          endProbs.push(...centerlineProblems(m2.boxes, `end state (scrollY ${pin.end})`, cfg));
          if (!m2.reveal) endProbs.push(`MISSING SELECTOR reveal (${cfg.sel.reveal}) — the end state cannot be verified`);
          else if (m2.reveal.hidden || m2.reveal.o < k.reveal_min_opacity || m2.reveal.h < 1) {
            endProbs.push(`end state: ${cfg.sel.reveal} is not revealed (effective opacity ${m2.reveal.o.toFixed(2)} < ${k.reveal_min_opacity}${m2.reveal.hidden ? ', visibility:hidden' : ''}, painted height ${m2.reveal.h.toFixed(1)}px) at scrollY ${pin.end}`);
          }
          if (m2.readout === null) endProbs.push(`MISSING SELECTOR readout (${cfg.sel.readout}) — the readout is the end state's caption`);
          else if (m2.readout !== k.climax) endProbs.push(`end state: readout is "${m2.readout}", authored destination is "${k.climax}" — the scene no longer lands where it was written to land`);
        }
        rep.row(`${tag} end-state climax`, uniq(endProbs));
      } catch (e) {
        rep.fail(`${tag} live`, `THREW: ${e.message.split('\n')[0]}`);
      }
      await ctx.close();

      /* --- reduced motion: same geometry, no scrub --------------------------------- */
      const rmCtx = await browser.newContext({ viewport: { width: v.w, height: v.h }, reducedMotion: 'reduce', deviceScaleFactor: 1 });
      const rmPage = await rmCtx.newPage();
      try {
        await rmPage.goto(srv.url + page1, { waitUntil: 'networkidle', timeout: 20000 });
        await rmPage.evaluate(() => document.fonts.ready);
        await rmPage.waitForTimeout(300);
        const m = await rmPage.evaluate(heroProbe, cfg);
        const probs = [...centerlineProblems(m.boxes, 'frame 1 (reduce)', cfg), ...contactProblems(m.boxes, cfg)];
        const rm = k.reduced_motion || {};
        if (rm.readout_reads !== undefined) {
          if (m.readout === null) probs.push(`MISSING SELECTOR readout (${cfg.sel.readout}) — cannot check the resting readout under reduce`);
          else if (m.readout !== rm.readout_reads) probs.push(`readout reads "${m.readout}" under reduce, resting literal is "${rm.readout_reads}"`);
        }
        if (cfg.animSel) {
          if (!m.moverFound) probs.push(`MISSING SELECTOR ${cfg.animSel} — cannot check for a running animation under reduce`);
          else if (m.anim.name !== 'none' && !/^0s(,\s*0s)*$/.test(m.anim.dur) && m.anim.play !== 'paused') {
            probs.push(`running animation on ${cfg.animSel} under reduce: ${m.anim.name} ${m.anim.dur}`);
          }
        }
        /* Sampled at scroll 0, the row above cannot tell a honoured reduce query from an
           ignored one: a live scrub paints exactly the resting frame at progress 0. A
           negative control proved it — a build that ignored the query entirely passed. So
           scroll into the scrub range and require that nothing moved. */
        if (rm.scrub_must_be_off) {
          const span = await rmPage.evaluate((c) => {
            const scene = document.querySelector(c.sel.scene);
            const spacer = scene ? scene.parentElement : null;
            const cls = spacer ? String(spacer.className || '') : '';
            const ok = scene && spacer && new RegExp(c.pinPattern).test(cls);
            const s = ok ? spacer.getBoundingClientRect() : null;
            return {
              dist: ok ? s.height - scene.getBoundingClientRect().height : 0,
              top: ok ? s.top + window.pageYOffset : 0,
              maxScroll: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
            };
          }, cfg);
          /* Midpoint of the scrub in DOCUMENT coordinates: progress is measured from where
             the spacer starts, so half the distance is still progress 0 on a page whose
             spacer does not begin at the top. */
          const target = Math.min(span.dist > 1 ? span.top + Math.round(span.dist / 2) : 300, span.maxScroll);
          if (target < 1) {
            warn(`${tag} reduced-motion: the page does not scroll under reduce (max scroll ${span.maxScroll}px) — scrub_must_be_off was not exercised`, probs);
          } else {
            await rmPage.evaluate(approachAndRead, { y: target, scene: cfg.sel.scene });
            const m3 = await rmPage.evaluate(heroProbe, cfg);
            const g0 = contactGap(m.boxes, cfg), g1 = contactGap(m3.boxes, cfg);
            if (g0 !== null && g1 !== null && Math.abs(g1 - g0) > cfg.groundTol) {
              probs.push(`reduce: the scene is still scroll-linked — ${cfg.contact.from.of} travelled ${(g0 - g1).toFixed(2)}px by scrollY ${target} (tolerance ±${cfg.groundTol}px)`);
            }
            if (m3.readout !== null && m3.readout !== m.readout) {
              probs.push(`reduce: the readout changed from "${m.readout}" to "${m3.readout}" by scrollY ${target} — the scrub is still running`);
            }
          }
        }
        rep.row(`${tag} reduced-motion frame1`, uniq(probs));
      } catch (e) {
        rep.fail(`${tag} reduced-motion`, `THREW: ${e.message.split('\n')[0]}`);
      }
      await rmCtx.close();
    }
    await browser.close();
  }
  await srv.close();
  /* full relative path, not basename: every built root also ends in "dist", and a control
     receipt that cannot say WHICH dist it measured is not a receipt */
  rep.finish({ ...meta, engines: S.engines().join('+'), cells: cells.length });
})();
