'use strict';
/* Static link integrity against the BUILT site: every internal href/src resolves, no dead
   anchors, no placeholder links, site.json pages[] and the build agree in both directions,
   exactly one non-empty h1 per page, and every stylesheet url() target exists.
   No browser and no server — this reads the build off disk.

   Clean URLs are assumed: a built about/index.html is served at /about, and a built
   about.html is served at /about too. Both spellings resolve, and the check follows
   whichever file actually exists.

   Usage: node checks/check-links.js [--root BUILT_SITE_DIR] [--strict]
     --root    the built site directory (default: <repo>/dist). site.json and its link
               policy are always read from the repo, never from --root, so a negative
               control can point --root at a mutated copy while the policy stays pinned.
     --strict  promote warn-tier findings -- route bookkeeping, and a policy whose value
               is "warn" -- from notes to failing rows. */

const fs = require('fs');
const path = require('path');
const T = require('./lib/static');
const { report } = require('./lib/report');

const args = T.parseArgs();
const strict = args.strict;
/* static.js defaults --root to the repo; in this battery --root is the built site itself. */
const dist = args.root === T.REPO ? path.join(T.REPO, 'dist') : args.root;
const r = report('links');
const rel = (p) => path.relative(T.REPO, p).replace(/\\/g, '/') || '.';

if (!fs.existsSync(dist)) {
  r.fail(rel(dist), 'no built site at this path -- run `node scripts/build.js` first');
  r.finish({ root: rel(dist), strict });
  return;
}

const site = T.readJson(path.join(T.REPO, 'site.json'), null);
const links = (site && site.links) || {};
/* Absent policy means strictest policy: an undeclared allowance must never be a silent one. */
const nonPages = new Set(links.non_pages || []);
const allowDead = links.allow_dead || {};
const formEndpoints = new Set(links.form_endpoints || []);
const rootAbsPolicy = links.root_absolute_assets || 'fail';

const ASSET_EXT = /\.(css|js|mjs|woff2?|ttf|otf|avif|webp|jpe?g|png|gif|svg|ico|mp4|webm|json|xml|txt|pdf)$/i;

const pages = T.htmlPages(dist).map((p) => path.relative(dist, p).replace(/\\/g, '/'));
const idsByFile = new Map();
const htmlByFile = new Map();
for (const f of pages) {
  const html = fs.readFileSync(path.join(dist, f), 'utf8');
  htmlByFile.set(f, html);
  const ids = new Set();
  T.walkHtml(html, { onOpen(n) { if (n.attrs.id) ids.add(n.attrs.id); if (n.tag === 'a' && n.attrs.name) ids.add(n.attrs.name); } });
  idsByFile.set(f, ids);
}

/* Warn tier: a failing row under --strict, a labelled note otherwise. */
function warn(probs, scope, msg) {
  if (strict) probs.push(msg);
  else r.note(`warn: ${scope}: ${msg}`);
}

function joinCapped(items, cap = 6) {
  if (items.length <= cap) return items.join(', ');
  return `${items.slice(0, cap).join(', ')} ... and ${items.length - cap} more`;
}

const resolveFile = (url, fromFile) => T.resolveToDistFile(url, fromFile, dist);

function checkAnchor(probs, url, targetFile) {
  const i = url.indexOf('#');
  if (i < 0) return;
  const hash = url.slice(i + 1);
  if (hash === '') { probs.push(`empty fragment in "${url}" -- a placeholder, not a real target`); return; }
  const ids = idsByFile.get(targetFile);
  if (!ids || !ids.has(hash)) probs.push(`dead anchor #${hash} -- no element carries that id in ${targetFile}`);
}

let rootAbsAssetCount = 0;
let rootAbsLinkCount = 0;

function rootAbsolute(probs, kind) {
  if (rootAbsPolicy === 'fail' || (rootAbsPolicy === 'warn' && strict)) {
    probs.push(`root-absolute ${kind} -- this build stops resolving if the site is served from a sub-path`);
    return;
  }
  rootAbsAssetCount++;
}

if (!site) r.fail('site.json', 'missing at the repo root -- page parity cannot be checked');
else {
  const declared = site.pages.map((p) => p.file);
  for (const p of site.pages) {
    const probs = [];
    if (!pages.includes(p.file)) probs.push(`site.json declares ${p.file}, which is not in the build`);
    else {
      /* Resolve the declared route the same way a link is resolved, rather than guessing a
         filename from the path: flat about.html and about/index.html are both valid
         clean-URL spellings, and only the resolver knows which one the build shipped. */
      const served = resolveFile(p.path, 'index.html');
      if (!served) probs.push(`route "${p.path}" serves no file in the build`);
      else if (served !== p.file) warn(probs, `site.json pages[] ${p.file}`, `route "${p.path}" serves ${served}, not the declared ${p.file}`);
    }
    r.row(`site.json pages[] ${p.file}`, probs);
  }
  for (const f of pages) {
    const probs = [];
    if (!nonPages.has(f) && !declared.includes(f)) probs.push('served by the build but absent from site.json pages[] -- unroutable or stray page');
    r.row(`build ${f}`, probs);
  }
}

for (const file of pages) {
  const html = htmlByFile.get(file);

  for (const ref of T.pageRefs(html)) {
    const url = ref.url;
    const where = `${file} <${ref.tag}> "${url}"`;

    if (!url) { r.fail(where, `empty ${ref.kind} reference -- a target attribute with nothing in it`); continue; }
    if (/^(mailto:|tel:|sms:)/i.test(url)) continue;        // contact schemes, not document references
    if (/^javascript:/i.test(url)) { r.fail(where, 'javascript: URL'); continue; }
    if (/^data:/i.test(url)) continue;
    if (ref.kind === 'meta-url') continue;                  // canonical and social URLs are absolute by design
    if (T.isExternal(url)) { r.note(`${where}: external URL -- not resolved, this check does not use the network`); continue; }
    if (url === '#') { r.fail(where, 'href="#" placeholder -- no real target'); continue; }

    const probs = [];
    const looksAsset = ref.kind === 'asset' || ASSET_EXT.test(url.split('?')[0].split('#')[0]);
    if (url.startsWith('/') && looksAsset) rootAbsolute(probs, 'asset path');
    else if (url.startsWith('/') && ref.kind === 'link') rootAbsLinkCount++;

    if (url.startsWith('#')) { checkAnchor(probs, url, file); r.row(where, probs); continue; }

    const target = resolveFile(url, file);

    if (url in allowDead) {
      /* Self-expiring allowance: one whose target now exists is a stale ruling, and stale
         allowances are how a link gate quietly stops gating. */
      if (target) probs.push(`allowed dead ("${allowDead[url]}") but "${url}" now resolves to ${target} -- remove the links.allow_dead entry`);
      else r.note(`${where}: dead link ALLOWED -- ${allowDead[url]}`);
      r.row(where, probs);
      continue;
    }

    if (ref.tag === 'form' && formEndpoints.has(url)) {
      r.note(`${where}: declared submit endpoint -- answered by the host at deploy time, not a file in the build`);
      r.row(where, probs);
      continue;
    }

    if (!target) probs.push(`dead ${ref.kind} -- "${url}" resolves to nothing in the build`);
    else checkAnchor(probs, url, target);
    r.row(where, probs);
  }

  let h1 = 0;
  const empties = [];
  let current = null;
  let buf = '';
  T.walkHtml(html, {
    onOpen(n) { if (/^h[1-6]$/.test(n.tag)) { current = n.tag; buf = ''; if (n.tag === 'h1') h1++; } },
    onText(t, stack) { if (current && stack.some((n) => n.tag === current)) buf += T.decodeEntities(t); },
    onClose(tag) { if (tag === current) { if (!buf.replace(/[\s\u00ad]/g, '')) empties.push(tag); current = null; } }
  });
  r.row(`${file} h1`, h1 === 1 ? [] : [`${h1} <h1> element(s) -- exactly 1 required`]);
  r.row(`${file} headings`, empties.length ? [`empty heading(s): ${joinCapped(empties)}`] : []);
}

for (const css of T.listFiles(dist, ['.css'])) {
  const cssRel = path.relative(dist, css).replace(/\\/g, '/');
  for (const u of T.cssUrls(fs.readFileSync(css, 'utf8'))) {
    if (T.isExternal(u)) { r.note(`${cssRel}: external url(${u}) -- not resolved`); continue; }
    const probs = [];
    if (u.startsWith('/')) rootAbsolute(probs, 'url()');
    if (!resolveFile(u, cssRel)) probs.push(`dead url("${u}") -- resolves to nothing in the build`);
    r.row(`${cssRel} url(${u})`, probs);
  }
}

if (rootAbsAssetCount) r.note(`${rootAbsPolicy === 'warn' ? 'warn: ' : ''}${rootAbsAssetCount} root-absolute asset reference(s) -- links.root_absolute_assets="${rootAbsPolicy}"`);
if (rootAbsLinkCount) r.note(`${rootAbsLinkCount} root-absolute page link(s) -- this build assumes it is served at the domain root`);

r.finish({ root: rel(dist), pages: pages.length, strict });
