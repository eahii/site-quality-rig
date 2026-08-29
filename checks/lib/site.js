/* Shared plumbing: CLI/env parsing, page enumeration from site.json (never from a
   hardcoded list — the page set is the manifest's business), contract loading with a
   TODO-slot detector that fails loudly instead of quietly measuring nothing. */
const fs = require('fs');
const path = require('path');

/* checks/lib/ sits two levels below the repo root. Moving this file moves REPO, and with
   it site.json, the contracts directory and every default path derived below. */
const REPO = path.join(__dirname, '..', '..');

function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      out.flags[k] = v === undefined ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true) : v;
    } else out._.push(a);
  }
  return out;
}

const ARGS = parseArgs();
const flag = (name, envName, dflt) =>
  (ARGS.flags[name] !== undefined ? ARGS.flags[name]
    : process.env[envName] !== undefined ? process.env[envName] : dflt);

function root() {
  return path.resolve(flag('root', 'SITE_ROOT', path.join(REPO, 'dist')));
}

/* Receipt-grade label for whichever root a run measured. NOT a basename: every built site
   directory is also called "dist", so a basename cannot say WHICH dist was measured, and a
   negative control pointed at a mutated copy would stamp the same word as a main run. */
function rootLabel(p = root()) {
  const r = path.relative(REPO, p);
  return (r && !r.startsWith('..') ? r : p).replace(/\\/g, '/');
}

/* site.json is always read from the repo root, never from --root. The asymmetry is
   deliberate: the manifest and the contracts describe THIS repo's site, so a control can
   point --root at a mutated copy of the build without the manifest drifting with it. */
function siteManifest() {
  const p = path.join(REPO, 'site.json');
  if (!fs.existsSync(p)) throw new Error(`site.json missing at ${p} — cannot enumerate pages`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/* Declared pages come from site.json. A declared page with no file in the root is a FAIL
   row named `page-missing`, never a skip — unless --wip is passed, which downgrades it to
   PENDING and stamps the whole run NOT-GREEN. */
function pages(rootDir = root()) {
  const site = siteManifest();
  const filter = String(flag('pages', 'PAGES', '')).trim();
  const only = filter && filter !== 'true' ? new Set(filter.split(',').map((s) => s.trim())) : null;
  const declared = site.pages.filter((p) => !only || only.has(p.file));
  const built = [], missing = [];
  for (const p of declared) {
    (fs.existsSync(path.join(rootDir, p.file)) ? built : missing).push(p);
  }
  return { site, declared, built, missing, wip: !!flag('wip', 'WIP', false) };
}

const DEFAULT_VIEWPORTS = [
  { w: 320, h: 568, label: 'se1', mobile: true },
  { w: 360, h: 800, label: 'android', mobile: true },
  { w: 390, h: 844, label: 'iphone-pro', mobile: true },
  { w: 414, h: 896, label: 'iphone-plus', mobile: true },
  { w: 768, h: 1024, label: 'ipad-portrait', mobile: true },
  { w: 1024, h: 768, label: 'ipad-landscape' },
  { w: 1280, h: 640, label: 'laptop-720' },
  { w: 1280, h: 800, label: 'laptop' },
  { w: 1440, h: 900, label: 'mbp' },
  { w: 1512, h: 860, label: 'mbp14' },
  { w: 1920, h: 1080, label: 'fhd' },
  /* The matrix used to stop at 1920, which is exactly why a desktop-nav wrap that starts
     at 1600 (webkit) / 1920 (chromium) shipped: no checker ever looked at a viewport wider
     than the bug's own threshold. That wrap was in a private project of my own —
     provenance for the extra row, not evidence, and not reproducible from this repo. What is reproducible is that the row exists and runs. Real readers sit in
     front of ultrawide monitors; the rig now does too. */
  { w: 2560, h: 1440, label: 'ultrawide' },
];

function viewports() {
  const raw = String(flag('viewports', 'RIG_VIEWPORTS', '')).trim();
  if (!raw || raw === 'true') return DEFAULT_VIEWPORTS;
  return raw.split(',').map((s) => {
    const [w, h] = s.trim().split('x').map(Number);
    const known = DEFAULT_VIEWPORTS.find((v) => v.w === w && v.h === h);
    return known || { w, h, label: `${w}x${h}`, mobile: w < 1024 };
  });
}

function engines() {
  return String(flag('engines', 'ENGINES', 'chromium,webkit')).split(',').map((s) => s.trim()).filter(Boolean);
}

function shots() {
  return String(flag('shots', 'SHOTS', '1')) !== '0';
}

/* Which viewport labels get a screenshot. Capturing all 12 costs more than it proves, so
   the default is one desktop and one phone; the labels must exist in DEFAULT_VIEWPORTS. */
function shotLabels() {
  const raw = String(flag('shot-labels', 'SHOT_LABELS', '')).trim();
  const list = !raw || raw === 'true' ? 'laptop-720,iphone-pro' : raw;
  return list.split(',').map((s) => s.trim()).filter(Boolean);
}

function outDir() {
  const d = path.resolve(flag('out', 'OUT_DIR', path.join(REPO, 'shots')));
  fs.mkdirSync(d, { recursive: true });
  return d;
}

/* A contract slot still holding a TODO_ token is an unfilled checker, which is worse
   than a missing one: it looks like coverage. Detector returns the offending paths. */
function todoSlots(obj, prefix = '') {
  const bad = [];
  const walk = (v, p) => {
    if (typeof v === 'string') { if (/TODO/.test(v)) bad.push(`${p} = ${v}`); return; }
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${p}[${i}]`));
    if (v && typeof v === 'object') return Object.entries(v).forEach(([k, x]) => { if (!k.startsWith('_')) walk(x, p ? `${p}.${k}` : k); });
  };
  walk(obj, prefix);
  return bad;
}

function loadContract(name, envName) {
  const p = path.resolve(flag(name.replace(/\.json$/, ''), envName, path.join(REPO, 'contracts', name)));
  if (!fs.existsSync(p)) throw new Error(`contract ${p} missing — checker refuses to run blind`);
  const json = JSON.parse(fs.readFileSync(p, 'utf8'));
  return { path: p, json, todos: todoSlots(json), filled: json.status === 'FILLED' };
}

/* Rig-only: make every image not just LOADED but DECODED before a capture. The
   measurement corrected the obvious guess: a full-width image band came out blank in every
   fullPage capture even though its <img> reported complete=true and naturalWidth=1440.
   Loading was never the problem — `decoding="async"` is. Chromium's fullPage capture
   paints from the existing raster, and an off-screen image that has downloaded but never
   been decoded has no raster to paint. Forcing loading="eager" alone changed NOTHING
   (pixel stddev 43.0 both with and without it); `img.decode()` alone fixed it (stddev
   54.7, band visible). Both steps are kept: the eager flip is what makes decode()
   reachable on a taller page where the band never downloads at all. The shipped markup is
   untouched — this runs in the checker's page, never in dist. */
async function settleImages(page, timeoutMs = 6000) {
  await page.evaluate(async (t) => {
    const deadline = (p) => Promise.race([p, new Promise((r) => setTimeout(r, t))]);
    const imgs = Array.from(document.images);
    for (const img of imgs) if (img.loading === 'lazy') img.loading = 'eager';
    await Promise.all(imgs.map((img) => img.complete ? null : deadline(new Promise((done) => {
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    }))));
    await Promise.all(imgs.map((img) => deadline(img.decode().catch(() => {}))));
  }, timeoutMs);
}

module.exports = {
  REPO, ARGS, flag, root, rootLabel, siteManifest, pages, viewports, engines, shots,
  shotLabels, outDir, loadContract, todoSlots, settleImages,
};
