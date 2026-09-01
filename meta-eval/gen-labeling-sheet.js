'use strict';
/* Builds the blind labelling sheet for Part B — the specimens over gradients, plates and stripe
   patterns, where no formula says what the answer is and the only available reference is a
   person looking at the pixels.

   Blind means three specific things, each of which is a way this sheet could have been rigged:

     no verdicts        nothing check-contrast.js printed appears here, in any form.
     no analytic hints  no ratios, no colours, no `designIntent` from the manifest, no grouping
                        by expected difficulty. The sheet emits the screenshot and nothing else.
     no case id on screen
                        the sheet shows a position in the sequence, never `bNN`. The id is a
                        direct join key into cases.json, whose rows carry `designIntent`, `fg`
                        and the ground — so an id beside a screenshot is an analytic hint by
                        reference, and one the author-annotator can follow in one lookup. It was
                        displayed here for traceability; the export carries it instead, which
                        costs traceability nothing.
     shuffled order     Part B is permuted by a seeded PRNG, seed recorded in the manifest, so
                        the sequence is reproducible without being the authoring order (in which
                        intent was assigned).

   What blindness does NOT reach, and METHOD.md says so as a limit rather than burying it: the
   annotator is the author, who wrote the specimen table. A reader who recognises a specimen is
   not blind to it. The id also survives in the markup — it is the radio group's name and the
   screenshot's filename, because the export has to key on something — so this sheet is blind
   against being read, not against being inspected. One annotator is likewise no measure of
   inter-rater agreement: this sheet produces one person's judgement, and the meta-evaluation
   reports it as one person's judgement.

   Screenshots come from the browser phase and are expected at <shots>/<id>.png. A case with no
   screenshot yet renders as a marked placeholder, never as a broken image: a labeller who cannot
   tell "not captured" from "captured and blank" would produce labels for nothing.

   Usage: node meta-eval/gen-labeling-sheet.js [--shots DIR] [--out FILE] */

const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const REPO = path.join(HERE, '..');
const CASES = path.join(HERE, 'cases', 'cases.json');

function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : dflt;
}

/* mulberry32: a 32-bit PRNG small enough to read in one sitting, which matters more here than
   statistical quality — the shuffle has to be reproducible from the seed in the manifest by
   anyone who wants to check that the order was not chosen to flatter a result. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(list, seed) {
  const rnd = mulberry32(seed);
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const QUESTION = 'Could you comfortably read this text? Judge the hardest-to-read region.';
const CHOICES = ['acceptable', 'not acceptable', 'unsure'];

function sheetHtml(manifest, order, shotsRel, present) {
  const items = order.map((c, i) => {
    const src = `${shotsRel}/${c.id}.png`;
    /* Neither the alt text nor the placeholder names the case: both are on-screen surfaces. The
       missing ids go to stdout instead, where the person capturing screenshots needs them and the
       person labelling never looks. */
    const shot = present.has(c.id)
      ? `<img class="shot" src="${esc(src)}" alt="specimen ${i + 1}" width="272">`
      : '<p class="shot missing">screenshot not captured yet — nothing to judge here</p>';
    const options = CHOICES.map((v) => `
          <label class="choice"><input type="radio" name="${esc(c.id)}" value="${esc(v)}"> ${esc(v)}</label>`).join('');
    return `
    <li class="case" data-case="${esc(c.id)}">
      <p class="seq">${i + 1} of ${order.length}</p>
      ${shot}
      <p class="q">${esc(QUESTION)}</p>
      <div class="choices">${options}
      </div>
    </li>`;
  }).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Part B labelling sheet — ${order.length} specimens</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; padding: 24px; background: #ffffff; color: #14171a;
         font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
  main { max-width: 44rem; margin: 0 auto; }
  h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
  .lede { margin: 0 0 1.5rem; color: #45505a; }
  .lede b { color: #14171a; }
  ol { list-style: none; margin: 0; padding: 0; }
  .case { border-top: 1px solid #d8dee3; padding: 20px 0; }
  .seq { margin: 0 0 10px; font-size: 0.8125rem; color: #66727c; letter-spacing: 0.02em; }
  .shot { display: block; border: 1px solid #d8dee3; }
  .shot.missing { margin: 0; padding: 14px; border-style: dashed; color: #7a4a00; background: #fff8ea; font-size: 0.875rem; }
  .q { margin: 12px 0 8px; }
  .choices { display: flex; flex-wrap: wrap; gap: 8px 20px; }
  .choice { display: inline-flex; align-items: center; gap: 6px; padding: 4px 0; cursor: pointer; }
  footer { position: sticky; bottom: 0; margin-top: 24px; padding: 14px 0;
           border-top: 1px solid #d8dee3; background: #ffffff; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  input[type=text] { font: inherit; padding: 6px 8px; border: 1px solid #b9c2c9; }
  button { font: inherit; padding: 7px 14px; border: 1px solid #14171a; background: #14171a; color: #ffffff; cursor: pointer; }
  button:disabled { border-color: #b9c2c9; background: #e7ebee; color: #7d878f; cursor: default; }
  #count { color: #45505a; }
</style>
</head>
<body>
<main>
  <h1>Part B labelling sheet</h1>
  <p class="lede">
    ${order.length} specimens, shown in a seeded shuffle (seed <b>${manifest.labelingSeed}</b>).
    <b>${present.size} of ${order.length}</b> screenshots present.
    Answer from the picture alone: no ratio, verdict, case id or expected answer is shown on
    screen or painted in any image. (Case ids do exist in this page's markup — they key the
    export — so this sheet is blind against being read, not against being inspected.)
    Answers live in this page only until you export them.
  </p>
  <ol>${items}
  </ol>
  <footer>
    <label>annotator <input type="text" id="who" placeholder="name or initials" size="14"></label>
    <span id="count">0 of ${order.length} answered</span>
    <button id="export" disabled>Export labels.json</button>
  </footer>
</main>
<script>
  var SEED = ${manifest.labelingSeed};
  var IDS = ${JSON.stringify(order.map((c) => c.id))};
  var count = document.getElementById('count');
  var btn = document.getElementById('export');

  function collect() {
    var labels = {};
    IDS.forEach(function (id) {
      var hit = document.querySelector('input[name="' + id + '"]:checked');
      if (hit) labels[id] = hit.value;
    });
    return labels;
  }

  function refresh() {
    var n = Object.keys(collect()).length;
    count.textContent = n + ' of ' + IDS.length + ' answered';
    btn.disabled = n === 0;
  }

  document.addEventListener('change', refresh);
  refresh();

  btn.addEventListener('click', function () {
    var payload = {
      schemaVersion: 1,
      labelingSeed: SEED,
      annotator: document.getElementById('who').value.trim(),
      labeledAt: new Date().toISOString(),
      labels: collect()
    };
    var blob = new Blob([JSON.stringify(payload, null, 2) + '\\n'], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'labels.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
</script>
</body>
</html>
`;
}

function main() {
  if (!fs.existsSync(CASES)) {
    console.log(`no manifest at ${path.relative(REPO, CASES)} — run node meta-eval/gen-cases.js first`);
    process.exit(2);
  }
  const manifest = JSON.parse(fs.readFileSync(CASES, 'utf8'));
  const out = path.resolve(REPO, arg('out', path.join(HERE, 'labeling', 'sheet.html')));
  const shots = path.resolve(REPO, arg('shots', path.join(HERE, 'labeling', 'shots')));

  const partB = manifest.cases.filter((c) => c.part === 'B');
  if (!partB.length) {
    console.log('the manifest holds no Part B cases — nothing to label');
    process.exit(2);
  }
  const order = shuffled(partB, manifest.labelingSeed);

  /* An absent screenshots directory is the normal state before the browser phase, not an error:
     the sheet is generated, every case is marked not-captured, and the same command regenerates
     it once the pictures exist. */
  const present = new Set(partB.filter((c) => fs.existsSync(path.join(shots, `${c.id}.png`))).map((c) => c.id));

  fs.mkdirSync(path.dirname(out), { recursive: true });
  const shotsRel = path.relative(path.dirname(out), shots).replace(/\\/g, '/') || '.';
  fs.writeFileSync(out, sheetHtml(manifest, order, shotsRel, present));

  const rel = (p) => path.relative(REPO, p).replace(/\\/g, '/');
  const missing = partB.filter((c) => !present.has(c.id)).map((c) => c.id);
  console.log(`labelling sheet: ${partB.length} Part B specimens, shuffled with seed ${manifest.labelingSeed}`);
  console.log(`screenshots: ${present.size}/${partB.length} present in ${rel(shots)}${present.size ? '' : ' — every case rendered as a marked placeholder'}`);
  if (missing.length) console.log(`  still to capture as ${rel(shots)}/<id>.png: ${missing.join(' ')}`);
  /* The sequence, printed here and not on the sheet: it is the sheet's own join key back to the
     manifest, and the point of leaving it off the page is that the annotator does not see it. */
  console.log(`order: ${order.map((c) => c.id).join(' ')}`);
  console.log(`wrote ${rel(out)}`);
}

if (require.main === module) main();

module.exports = { mulberry32, shuffled, QUESTION, CHOICES };
