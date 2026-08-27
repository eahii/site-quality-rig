'use strict';
/* Shared, dependency-free helpers for the static checkers. Every static checker takes
   `--root <dir>` so it can be pointed at a negative-control fixture (controls/*) as well
   as at the repo — a checker that cannot be made to FAIL here has not proven anything.
   Default root = repo root. */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title']);
const NON_TEXT = new Set(['script', 'style', 'noscript', 'template', 'title']);

function parseArgs(argv = process.argv.slice(2)) {
  const out = { root: REPO, strict: false, rest: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') out.root = path.resolve(argv[++i]);
    else if (argv[i] === '--strict') out.strict = true;
    else out.rest.push(argv[i]);
  }
  return out;
}

function parseAttrs(s) {
  const a = {};
  const re = /([a-zA-Z_:@][-a-zA-Z0-9_:.]*)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;
  let m;
  while ((m = re.exec(s))) a[m[1].toLowerCase()] = m[2] ? m[2].replace(/^(["'])([\s\S]*)\1$/, '$2') : '';
  return a;
}

/* Minimal tag-stack walker. Not a spec HTML parser — enough to know, for any node, which
   elements and classes enclose it, which is what a per-region assertion needs. */
function walkHtml(html, h = {}) {
  const stack = [];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\/([a-zA-Z][^\s>]*)\s*>|<([a-zA-Z][^\s/>]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  let last = 0;
  let m;
  while ((m = re.exec(html))) {
    if (m.index > last && h.onText) h.onText(html.slice(last, m.index), stack, last);
    last = re.lastIndex;
    if (m[0].startsWith('<!')) continue;
    if (m[1]) {
      const tag = m[1].toLowerCase();
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tag) { stack.length = i; break; }
      }
      if (h.onClose) h.onClose(tag, stack);
      continue;
    }
    const tag = m[2].toLowerCase();
    const attrs = parseAttrs(m[3] || '');
    const node = { tag, attrs, classes: (attrs.class || '').split(/\s+/).filter(Boolean), index: m.index };
    if (h.onOpen) h.onOpen(node, stack);
    const selfClosing = /\/\s*$/.test(m[3] || '') || VOID.has(tag);
    if (selfClosing) continue;
    stack.push(node);
    if (RAW.has(tag)) {
      const rest = html.slice(re.lastIndex);
      const cm = rest.match(new RegExp('</' + tag + '\\s*>', 'i'));
      const end = cm ? re.lastIndex + cm.index : html.length;
      if (h.onRaw) h.onRaw(tag, html.slice(re.lastIndex, end), node, stack);
      re.lastIndex = cm ? end + cm[0].length : html.length;
      last = re.lastIndex;
      stack.pop();
    }
  }
  if (last < html.length && h.onText) h.onText(html.slice(last), stack, last);
}

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '­', ndash: '–', mdash: '—', hellip: '…', auml: 'ä', ouml: 'ö', aring: 'å', Auml: 'Ä', Ouml: 'Ö', Aring: 'Å', eacute: 'é', middot: '·', bull: '•', laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', rsquo: '’', euro: '€', copy: '©', deg: '°', times: '×' };

function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (full, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    return body in NAMED ? NAMED[body] : full;
  });
}

/* Visible text of a page, as a list of blocks with their enclosing element chain.
   keepShy: keep U+00AD so a hyphenation check can see authored break points. */
function textBlocks(html, { keepShy = false } = {}) {
  const blocks = [];
  walkHtml(html, {
    onText(raw, stack) {
      if (stack.some((n) => NON_TEXT.has(n.tag))) return;
      let t = decodeEntities(raw);
      if (!keepShy) t = t.replace(/­/g, '');
      t = t.replace(/\s+/g, ' ').trim();
      if (!t) return;
      blocks.push({
        text: t,
        tags: stack.map((n) => n.tag),
        classes: stack.flatMap((n) => n.classes),
        ids: stack.map((n) => n.attrs.id).filter(Boolean)
      });
    }
  });
  return blocks;
}

function renderedText(html) {
  return textBlocks(html).map((b) => b.text).join(' ');
}

/* String literals out of JS — the surface where script-injected copy lives, so a text
   sweep can reach strings that a static DOM read never renders. */
function jsStringLiterals(js) {
  const out = [];
  const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
  let m;
  while ((m = re.exec(js))) {
    const v = m[1] ?? m[2] ?? m[3];
    if (v && v.trim()) out.push(v.replace(/\\n/g, ' '));
  }
  return out;
}

function listFiles(dir, ext) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p, ext));
    else if (!ext || ext.some((x) => e.name.toLowerCase().endsWith(x))) out.push(p);
  }
  return out;
}

function htmlPages(distDir) {
  return listFiles(distDir, ['.html']).sort();
}

function readJson(p, fallback) {
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/* A contract belongs to the checker, not to the site under test: --root swaps the SITE,
   so a control fixture is exercised against the real contract instead of a copy that
   could drift. A control that needs its own contract can still carry one in contracts/
   under its root, and it wins. */
function configPath(root, name) {
  const inRoot = path.join(root, 'contracts', name);
  return fs.existsSync(inRoot) ? inRoot : path.join(REPO, 'contracts', name);
}

/* Every asset URL a page pulls: src, srcset candidates, poster, <link href>, inline style
   url(), form action. Page links (<a href>) come back tagged so the relative-asset rule
   and the dead-link rule can be told apart. */
function pageRefs(html) {
  const refs = [];
  const push = (kind, url, node, extra) => {
    if (!url) return;
    refs.push({ kind, url: url.trim(), tag: node ? node.tag : '', attrs: node ? node.attrs : {}, ...extra });
  };
  walkHtml(html, {
    onOpen(node) {
      const a = node.attrs;
      if (node.tag === 'a' && 'href' in a) push('link', a.href, node);
      if (node.tag === 'form' && a.action) push('link', a.action, node);
      if (a.src) push('asset', a.src, node);
      if (a.poster) push('asset', a.poster, node);
      if (a.srcset) for (const c of a.srcset.split(',')) push('asset', c.trim().split(/\s+/)[0], node, { srcset: true });
      if (node.tag === 'link' && a.href) {
        const rel = (a.rel || '').toLowerCase();
        push(rel === 'canonical' || rel === 'alternate' ? 'meta-url' : 'asset', a.href, node, { rel });
      }
      if (node.tag === 'meta' && a.content && /^(og:|twitter:)/i.test(a.property || a.name || '')) {
        if (/^https?:|^\//.test(a.content)) push('meta-url', a.content, node, { metaKey: (a.property || a.name).toLowerCase() });
      }
      if (a.style) for (const u of cssUrls(a.style)) push('asset', u, node, { fromCss: true });
    },
    onRaw(tag, raw, node) {
      if (tag === 'style') for (const u of cssUrls(raw)) push('asset', u, node, { fromCss: true });
    }
  });
  return refs;
}

function cssUrls(css) {
  const out = [];
  const re = /url\(\s*("([^"]*)"|'([^']*)'|([^)'"]*))\s*\)/g;
  let m;
  while ((m = re.exec(css))) {
    const u = (m[2] ?? m[3] ?? m[4] ?? '').trim();
    if (u && !u.startsWith('data:')) out.push(u);
  }
  return out;
}

function isExternal(url) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(url) || url.startsWith('//');
}

function isSpecialScheme(url) {
  return /^(mailto:|tel:|sms:|data:|javascript:|#)/i.test(url);
}

/* cleanUrls: dist/about.html is served at /about. Both spellings must resolve. */
function resolveToDistFile(url, fromFile, distDir) {
  const clean = url.split('#')[0].split('?')[0];
  if (clean === '' ) return fromFile;
  let p;
  if (clean.startsWith('/')) p = clean.slice(1);
  else p = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile.replace(/\\/g, '/')), clean));
  if (p === '' || p === '.' || p.endsWith('/')) p = path.posix.join(p, 'index.html');
  /* A candidate must be a FILE. fs.existsSync is true for a directory, so without the
     isFile() test /services "resolves" to the dist/services directory — the dead-link test
     then passes on a path no host serves, and the anchor lookup for it, keyed by file,
     misses and reports every fragment on that page as dead. */
  const candidates = [p, p + '.html', path.posix.join(p, 'index.html')];
  for (const c of candidates) {
    const abs = path.join(distDir, c);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return c;
  }
  return null;
}

module.exports = {
  REPO, parseArgs, parseAttrs, walkHtml, decodeEntities, textBlocks, renderedText,
  jsStringLiterals, listFiles, htmlPages, readJson, configPath, pageRefs, cssUrls,
  isExternal, isSpecialScheme, resolveToDistFile, VOID, NON_TEXT
};
