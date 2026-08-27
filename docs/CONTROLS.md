# Negative controls — what each gate was proven to catch

A gate that has never gone red is decorative. Every checker in this repo therefore has a
**negative control**: a copy of the real built site with one targeted defect injected into it,
and a recorded run in which the checker caught that defect. Without such a run, "the contrast
gate passes" and "the contrast gate cannot fail" produce identical output, and only one of them
is worth anything.

Two rules govern what goes in this file.

**A control may be noisy. It may not be vacuous.** An injected defect that also trips a
neighbouring assertion is acceptable — layouts are connected, and pretending otherwise means
tuning the defect until it is unrealistically surgical. An injection that quietly stopped
matching the markup is not acceptable, because it produces a green run that reads exactly like
a healthy one.

**Nothing is recorded here that was not observed.** The receipts below are pasted from real
runs on this fixture, exit codes included. An assertion no control has fired is listed as
unarmed at the bottom rather than left to look covered.

Run them:

```
npm run build          # the controls mutate copies of dist/, so it has to exist
npm run test:controls  # all seven
node controls/run-controls.js motion contrast    # or a subset by name
```

## How a control is judged

Each control is three runs, in this order:

1. **Setup** — `controls/<name>/setup.js` copies `dist/` into `controls/<name>/dist` and
   injects one defect. The builder (`controls/fixture.js`) throws if a mutation changed zero
   bytes, or if a removal's target was not there.
2. **Baseline** — the same checker, with the *same arguments*, pointed at the pristine `dist/`.
   It must exit 0. (Deploy is the one documented exception: its baseline is a healthy origin
   rather than a different `--root`, for the reason given in its section.)
3. **Mutated** — the same checker pointed at the fixture. It must exit 1 (deploy inverts this,
   see below), and its output must contain the checker's real failing line for this defect.

Steps 2 and 3 together are what turn "the checker went red" into "the checker went red
**because of this defect**".

### Why exit codes alone were not enough

The harness this was ported from judged a control by one number: did the checker exit 1. That
cannot distinguish four different situations, three of which are failures of the control:

- the checker caught the injected defect (what the control claims);
- the checker was already red for an unrelated reason, and the injection changed nothing that
  mattered;
- the checker went red because a contract slot or a selector rotted, i.e. it failed to *run*
  rather than failing to *pass*;
- the site itself was broken before the fixture was built.

Four upgrades close that gap, and each is in `controls/run-controls.js`:

| Upgrade | What it adds |
|---|---|
| **Baseline-green** | The instrument must exit 0 on the pristine build with identical arguments before the mutated run counts. A checker that is red anyway can no longer be credited with catching anything. |
| **Expected substrings** | Each control carries one or two verbatim fragments of the checker's real failing row. A red for the wrong reason no longer satisfies the control. |
| **Guarded setup** | The fixture builder's vacuity throw is caught, reported as *failed to fail* with the guard's own message, and the run continues to the next control. One rotted injection no longer hides the other six. |
| **Crash is not a verdict** | A child that died on a signal or never started (`code === null`) is reported as `CRASHED (infrastructure)`, distinct from `did NOT fail on its negative control`. An infrastructure failure that reads as a gate verdict is how a broken harness passes for a working one. |

The expected-substring upgrade is not decoration. The builder's byte-level guard can only see
that a file changed, not that the injected *selector* still matches anything: rename
`.stat-label` tomorrow and the harden fixture would still be built, still be mutated, and still
prove nothing. The substring check is what notices.

## The controls

`sha=c4285ab`, node v22.22.2, chromium. Browser controls run a narrowed matrix — the
receipt is that the assertion can fire in this repo, not a second full matrix; the full
two-engine matrix runs green separately under `npm test`.

---

### links — `checks/check-links.js`

**Defect.** Five, in one build: `dist/references/` removed while `site.json` still declares
`references/index.html`; and four elements appended to `index.html` — `<a href="#no-such-anchor">`,
`<a href="/no-such-page/">`, `<a href="#">`, and a second `<h1>`.

**Mechanism.** The removed directory fires two independent assertions from one deletion: page
parity (a claim about the manifest) and dead links (a claim about the markup, from every page
that links `/references/`). A checker that had only one of those would still call the site fine.

**Receipt.**

```
baseline (pristine dist) $ node checks/check-links.js --root dist
  -> links: 231/231 cells OK — PASS  [sha=c4285ab root=dist pages=7 strict=false]  exit=0

mutated $ node checks/check-links.js --root controls/links/dist
FAIL  site.json pages[] references/index.html
        site.json declares references/index.html, which is not in the build
FAIL  index.html <a> "#no-such-anchor"
        dead anchor #no-such-anchor -- no element carries that id in index.html
FAIL  index.html <a> "/no-such-page/"
        dead link -- "/no-such-page/" resolves to nothing in the build
FAIL  index.html <a> "#"
        href="#" placeholder -- no real target
FAIL  index.html h1
        2 <h1> element(s) -- exactly 1 required
FAIL  services/index.html <a> "/references/"
        dead link -- "/references/" resolves to nothing in the build
[23 further rows of that last shape, one per surviving link to /references/, elided here]

links: 175/204 cells OK — FAIL  [sha=c4285ab root=controls/links/dist pages=6 strict=false]
exit=1
```

---

### viewports — `checks/measure-viewports.js`

**Defect.** An in-flow `150vw` block appended to `index.html`, and `.call-link` shrunk to
20x20 with its min-width, min-height and padding zeroed.

**Mechanism.** At the 320x568 cell the block is 480px wide in a 320px viewport and no ancestor
clips it, so it fires both readings the checker takes of the same fact — the document's scroll
width, and the named offender list. Either alone can be gamed: a root-level `overflow-x:hidden`
hides the first, a clipping ancestor hides the second. `.call-link` is the element
`contracts/fold-contract.json` declares as `contact_affordance`, so the tap-target defect lands
on a contracted element rather than on decoration.

**Receipt.**

```
baseline (pristine dist) $ node checks/measure-viewports.js --root dist --engines chromium --viewports 320x568 --pages index.html --shots 0
  -> viewports: 1/1 cells OK — PASS  [sha=c4285ab root=dist engines=chromium cells=1 pages=1]  exit=0

mutated $ node checks/measure-viewports.js --root controls/viewports/dist --engines chromium --viewports 320x568 --pages index.html --shots 0
FAIL  chromium se1 320x568 index.html
        h-overflow 160px (documentElement.scrollWidth 480 > 320)
        h-overflow on body 160px
        overflowing (unclipped): html.js>body>div.control-overflow[0..480]
        tap targets <44px: body>header.site-head>div.head-inner>a.call-link 20x20

viewports: 0/1 cells OK — FAIL  [sha=c4285ab root=controls/viewports/dist engines=chromium cells=1 pages=1]
exit=1
```

---

### harden — `checks/check-harden.js`

**Defect.** Two CSS regressions, each on the page that carries the case it targets:
`white-space:nowrap` on all three `.stat-label` elements of `index.html`, and `.process` on
`services/index.html` forced to one implicit row of fixed 290px columns
(`grid-template-columns:none; grid-auto-flow:column; grid-auto-columns:290px`).

**Mechanism, measured rather than assumed.**

*The labels.* `.stats` is `repeat(3, 1fr)` with an auto minimum — deliberately not
`minmax(0, 1fr)`, so a label that no longer fits breaks the layout where it actually broke.
Measured in chromium, as `documentElement.scrollWidth` against the viewport:

| labels nowrapped | 1280x640 | 1440x900 | |
|---|---|---|---|
| 1 | 1280 (+0) | 1440 (+0) | absorbed by the siblings |
| 2 | 1365 (+85) | 1445 (+5) | fires, but grazes the threshold |
| 3 | 1505 (+225) | 1585 (+145) | fires with room to spare |

**One** nowrapped label is absorbed: its column grows, the other two give the width back, and
the document does not move at all — box-level overflow only, invisible to a document-level
assertion. Three leave nothing to absorb it. Two would technically fire at both cells, but
+5px at 1440 sits close enough to the noise floor that a font substitution could erase it, and
a control that only fires on one machine is not a control. At 320 and 390 the grid is still a
single column and the same injection moves the document +13px and 0px, which is the other
reason this control runs the wide cells.

*The grid.* The 290px is derived from this fixture. `.process` measures a 1168px content box at
both 1280x640 and 1440x900 — `.wrap` is capped at 78rem and gutter-padded, so it is the same
width at both — and the grid gap is 1px. Four tracks: `4x290 + 3 = 1163px`, fits. Five tracks:
`5x290 + 4 = 1454px`, which puts the last item 230px past the right edge at 1280 and 150px past
it at 1440 — the two numbers the run below prints. Three tracks: 872px, comfortably inside.

**So the discriminating cells are 1280x640 and 1440x900**: `grid process-steps N+1` is RED and
`grid process-steps N-1` is GREEN at both, which is exactly the assertion — a grid drawn for
four meets five. The narrow cells cannot discriminate at all (a 290px fixed track overflows a
320px viewport at any item count), which is why they are not in this control's matrix. A fixed
track was chosen over a percentage one for the same reason: percentage tracks at 320px squeeze
the item text until it spills its own box, and the spill row would then be red at every item
count — noise that would drown the signal.

**Receipt.** Ten of 36 cells red. The `services/index.html` baseline, longest-content and
`N-1` rows stay green, which is what makes the `N+1` red mean something.

```
baseline (pristine dist) $ node checks/check-harden.js --root dist --engines chromium --pages index.html,services/index.html,maintenance-plans/index.html --viewports 1280x640,1440x900 --shots 0
  -> harden: 36/36 cells OK — PASS  [sha=c4285ab root=dist engines=chromium cells=2 components=3 grids=2]  exit=0

mutated $ node checks/check-harden.js --root controls/harden/dist --engines chromium --pages index.html,services/index.html,maintenance-plans/index.html --viewports 1280x640,1440x900 --shots 0
FAIL  chromium laptop-720 index.html baseline
        h-overflow 225px
        overflowing: div.wrap>div.stats-slab>section.stats>div.stat div.stats-slab>section.stats>div.stat>span.stat-value div.stats-slab>section.stats>div.stat>span.stat-label div.stats-slab>section.stats>div.stat>span.stat-note
FAIL  chromium laptop-720 index.html longest-content [stat-labelx3 card-titlex3]
        h-overflow 268px
        overflowing: [the same four offenders as the row above]
FAIL  chromium laptop-720 services/index.html grid process-steps N+1
        h-overflow 230px
        overflowing: section.slab>div.wrap>ol.process>li div.wrap>ol.process>li>h2 div.wrap>ol.process>li>p
FAIL  chromium mbp index.html baseline
        h-overflow 145px
        overflowing: [the same four offenders]
FAIL  chromium mbp services/index.html grid process-steps N+1
        h-overflow 150px
        overflowing: section.slab>div.wrap>ol.process>li div.wrap>ol.process>li>h2 div.wrap>ol.process>li>p
[5 further index.html rows elided: the same +225 / +145 document overflow measured again in the
 longest-content and card-grid N+1 / N-1 rows, which reload the same nowrapped page]

harden: 26/36 cells OK — FAIL  [sha=c4285ab root=controls/harden/dist engines=chromium cells=2 components=3 grids=2]
exit=1
```

**Noise, recorded.** The nowrapped labels make every `index.html` row of the mutated run red,
including its baseline row — the injection is page CSS, so it is present before the checker
mutates anything. That is the honest shape of a CSS regression and is not tuned away. The
signal that is specifically about the hardening case is on `services/index.html`, where only
the `N+1` row moved.

---

### motion — `checks/check-motion.js`

**Defect.** An infinite 2s keyframe animation on `#hero h1`, and `.rv` forced to `opacity:0`
in base CSS.

**Mechanism.** The fixture carries the standard reduce guard,
`@media (prefers-reduced-motion: reduce) { *,*::before,*::after { animation-duration:0s
!important } }`. The injected rule is also `!important`, and `#hero h1` (one id, one type)
outranks `*` (zero specificity), so the duration survives the guard and the animation keeps
running under reduce. That is the real-world shape of this bug: nobody writes an animation that
ignores the guard on purpose — they write a more specific selector and never notice it outranks
the blanket rule.

The reveal defect is the other classic. The fixture gates its hidden state on the scripted
branch (`.js .rv { opacity: 0 }`) so that a scriptless render paints in full; dropping the `.js`
gate ships the hidden state unconditionally. It is `!important`, so `.js .rv-in{opacity:1}`
cannot restore it either. Legs A and B both fire, and the offender is reported with the
*accumulated ancestor* opacity — the reveal class sits on a wrapper, and reading the leaf's own
opacity (which is 1) is exactly how this assertion would end up measuring nothing.

**Receipt.** Six of 12 cells red — legs A and B at all three cells.

```
baseline (pristine dist) $ node checks/check-motion.js --root dist --engines chromium --pages index.html --shots 0
  -> motion: 12/12 cells OK — PASS  [sha=c4285ab root=dist engines=chromium cells=3]  exit=0

mutated $ node checks/check-motion.js --root controls/motion/dist --engines chromium --pages index.html --shots 0
FAIL  chromium se1 index.html reduced-motion
        running animation under reduce: #hero-title control-spin 2s
        not painted under reduce: #figures-title effective-opacity=0.00 [reveal class on section.slab>div.wrap>div.stats-slab>div.stack]
        not painted under reduce: div.wrap>div.stats-slab>div.stack>p.lede effective-opacity=0.00 [reveal class on section.slab>div.wrap>div.stats-slab>div.stack]
        ... and 42 more
FAIL  chromium se1 index.html scripts-removed
        not painted with scripts removed: #figures-title effective-opacity=0.00 [reveal class on section.slab>div.wrap>div.stats-slab>div.stack]
        ... and 42 more
[the same two rows again at iphone-pro and laptop-720, elided]

motion: 6/12 cells OK — FAIL  [sha=c4285ab root=controls/motion/dist engines=chromium cells=3]
exit=1
```

---

### contrast — `checks/check-contrast.js`

**Defect.** `#hero h1{color:oklch(0.95 0.01 106)}` — the hero heading recoloured to a
near-white over the hero's own light ground, `--paper: oklch(0.985 0.004 106)`.

**Mechanism.** 0.035 of lightness between text and surface lands the pair at 1.11:1, against
the 3.0:1 floor the heading gets for being large text. Near-white-on-white is also the most
common real instance of this defect: a token swapped for its inverse-surface twin. The value is
written in `oklch` on purpose — the checker resolves every foreground colour through a real 2D
canvas rather than parsing the string, so this injection exercises that path end to end, and
the run reports `0 unresolvable`, which is the other thing it demonstrates.

**Receipt.** Three of four cells red, and nothing else on the page moved.

```
baseline (pristine dist) $ node checks/check-contrast.js --root dist --engines chromium --pages index.html
  -> contrast: 4/4 cells OK — PASS  [sha=c4285ab root=dist engines=chromium cells=3 pages=1]  exit=0

mutated $ node checks/check-contrast.js --root controls/contrast/dist --engines chromium --pages index.html
FAIL  chromium se1 index.html [132 nodes (base:115 footer-inverse:16 filled-control:1), 30 unpainted, 0 unresolvable]
        1.11:1 < 3.0 (min 1.11, 29px/650) #hero-title "Elevators that stay in service."
FAIL  chromium iphone-pro index.html [105 nodes (base:88 footer-inverse:16 filled-control:1), 30 unpainted, 0 unresolvable]
        1.11:1 < 3.0 (min 1.11, 30px/650) #hero-title "Elevators that stay in service."
FAIL  chromium laptop-720 index.html [148 nodes (base:131 footer-inverse:16 filled-control:1), 25 unpainted, 0 unresolvable]
        1.11:1 < 3.0 (min 1.11, 62px/650) #hero-title "Elevators that stay in service."

contrast: 1/4 cells OK — FAIL  [sha=c4285ab root=controls/contrast/dist engines=chromium cells=3 pages=1]
exit=1
```

---

### hero — `checks/check-hero.js`

**Defect.** `.car-tip{margin-left:-8px}`.

**Mechanism.** This is a replay of the defect the instrument exists for. The origin project's
hero shipped for weeks with the moving element's tip sitting 3px left of the line it travels
on — a leftover negative margin from a narrower shape — and it passed two reviewers and every
gate that was green at the time, because nothing in the battery ever asserted *where* the tip
was. Overflow, contrast, tap targets and fold height were all measured; the one thing the scene
is, an object on a line, was not.

`.car-tip` here is centred by `left:50%; transform:translateX(-50%)` and carries no margin, so
the injected -8px is the entire offset. The defect is horizontal only, deliberately: it must
move the centreline assertion without disturbing anything else.

**Receipt.** Three of four rows red; `frame1 ground-contact` stays green, because the tip's
bottom edge still meets the ground.

```
baseline (pristine dist) $ node checks/check-hero.js --root dist --cells 390x844 --shots 0 --engines chromium
  -> hero: 4/4 cells OK — PASS  [sha=c4285ab root=dist contract=contracts/hero-contract.json page=index.html engines=chromium cells=1]  exit=0

mutated $ node checks/check-hero.js --root controls/hero/dist --cells 390x844 --shots 0 --engines chromium
FAIL  chromium 390x844 frame1 centerline
        frame 1: rail / frame / tip are not on one centerline — spread 8.00px > 0.5px (rail 195.00, frame 195.00, tip 187.00; tip 10x6px)
FAIL  chromium 390x844 end-state climax
        end state (scrollY 2107): rail / frame / tip are not on one centerline — spread 8.00px > 0.5px (rail 195.00, frame 195.00, tip 187.00; tip 10x6px)
FAIL  chromium 390x844 reduced-motion frame1
        frame 1 (reduce): rail / frame / tip are not on one centerline — spread 8.00px > 0.5px (rail 195.00, frame 195.00, tip 187.00; tip 10x6px)

hero: 1/4 cells OK — FAIL  [sha=c4285ab root=controls/hero/dist contract=contracts/hero-contract.json page=index.html engines=chromium cells=1]
exit=1
```

---

### deploy — `checks/check-deploy.js`

**Defect.** Four, because a deploy gate needs an origin rather than a directory:
`dist/about/` removed; `<meta name="robots">` stripped from `services/index.html`; the copy
served by `checks/lib/serve.js` in its plain form, with no response headers; and nothing behind
`/api/contact`.

**Mechanism.** `controls/deploy/run.js` builds the mutated copy, serves it on an ephemeral
local port, and probes it. No third-party host is ever contacted: a control that reaches out to
somebody else's server is both impolite and weaker, because it can only fire the assertions
that host happens to break. Byte drift is measured against the repo's pristine `dist/` —
`check-deploy --root` defaults there while `--url` points at the mutated copy — and
`--require-current` escalates drift from a note to a failing row.

`--negative` inverts the checker's exit code: 0 only when the run found failures, 1 loudly when
the control passed, because a control that passes has proven the assertions are vacuous. So the
judgement is exit 0 **and** the "negative control fired" line.

**Stated deviation.** This is the one control whose baseline is not the same command with a
different `--root`. Its baseline is `check-deploy --local --require-current`, which spawns the
healthy fixture origin (`scripts/serve-fixture.js`: contract headers, mocked submit endpoint)
over the pristine build. For a deploy gate the ORIGIN is the thing under test, so the honest
baseline/mutated pair is two origins, not two directories.

**Receipt.** All nine cells red — six pages and three form probes — with drift on the two
mutated pages.

```
baseline (pristine dist, healthy origin) $ node checks/check-deploy.js --local --require-current
  -> deploy: 9/9 cells OK — PASS  [sha=c4285ab origin=local-fixture root=dist pages=6 drift=0 form=3-probes strict=false]  exit=0

mutated $ node controls/deploy/run.js
$ node checks/check-deploy.js --url http://127.0.0.1:PORT --negative --require-current
FAIL  index.html (http://127.0.0.1:PORT/)
        response header X-Robots-Tag absent — the contract declares "noindex"
        response header X-Content-Type-Options absent — the contract declares "nosniff"
        response header Referrer-Policy absent — the contract declares "strict-origin-when-cross-origin"
        response header X-Frame-Options absent — the contract declares "DENY"
FAIL  services/index.html (http://127.0.0.1:PORT/services)
        [the same four header rows]
        served body carries no <meta name="robots" ... noindex> — the build's own noindex mechanism did not survive the deploy
        served bytes != dist/services/index.html (12876 B served vs 12914 B local) — the origin is not this build
FAIL  about/index.html (http://127.0.0.1:PORT/about)
        HTTP 404, expected 200
        [the same four header rows]
        served bytes != dist/about/index.html (6683 B served vs 10483 B local) — the origin is not this build
FAIL  form valid POST (http://127.0.0.1:PORT/api/contact)
        HTTP 404, expected 200
        body null — expected {ok:true, ...}
FAIL  form missing-required POST (http://127.0.0.1:PORT/api/contact)
        HTTP 404, expected 400 — server-side validation of [name, phone] is the contract; client-side validation is not
FAIL  form honeypot POST (http://127.0.0.1:PORT/api/contact)
        HTTP 404, expected a silent 200
        body null — a filled honeypot must answer a silent {ok:true}, so a bot never learns it was caught
[the three unmutated page rows elided: same four header failures each]
note  origin=http://127.0.0.1:PORT build=dist pages=6 form-probes=3 drift=2 MODE=require-current MODE=negative-control

deploy: 0/9 cells OK — FAIL  [sha=c4285ab origin=http://127.0.0.1:PORT root=dist pages=6 drift=2 form=3-probes strict=false]

negative control fired: 9 cell(s) failed against an origin known to be broken — the assertions are live. exit 0.
check-deploy exit=0
```

**One trap, written into the file's header so the next person does not pay for it again.** The
checker is spawned asynchronously, and that is not a style preference: this process *hosts* the
origin the child probes. `execFileSync` blocks the event loop the http server listens on, so
every request from the child sits unanswered until it times out — a two-minute deadlock of the
control against itself, with no error message that points at the cause. Any future control that
serves something and then probes it inherits the trap.

## What is NOT armed

Listed because an assertion with no control is suspect, whatever its source says, and hiding
that is the exact failure this file exists to prevent.

| Assertion | Status | What firing it would need |
|---|---|---|
| viewports: `contact_affordance` **rendered** leg | unarmed | The tap-target law is what catches the shrunk affordance; the rendered leg needs a `display:none` fixture, which would then be invisible to the tap-target law. One defect, one row. |
| viewports: fold-contract composition rows (`last_in_fold` tolerance, `never_in_fold` bleed, first-view elements) | unarmed | A defect that moves the fold edge past its tolerance without breaking anything else. |
| hero: `frame1 ground-contact` | unarmed | The injected offset is horizontal, so the tip still meets the ground. A vertical-offset fixture would fire it. |
| hero: end-state sub-assertions (reveal opacity, readout literal, scene in frame) | unarmed | The `end-state climax` ROW fires, but via its centreline check — the other three rode along untested. Needs a fixture that moves the destination without touching the centreline. |
| motion: leg C (real JS-off, flat-plate pixel evidence) | unarmed | The hero carries no reveal class, so the first view still paints and the greyscale stdev stays well above the flat-plate threshold. |
| contrast: register-coverage rows (`REGISTER … present in DOM but 0 nodes measured`, `NO TEXT NODES MEASURED`) | unarmed | A fixture whose text on a named register is systematically occluded or emptied. |
| harden: unbreakable-token (`compounds`) spill, text-clipped rows | unarmed | The two injected regressions produce document-level overflow, not token spill or clipping. |
| deploy: an origin serving 200s with correct headers but wrong bytes | unarmed | The drift leg fired here via `--require-current` on mutated pages that also failed other rows. Isolating drift needs an origin that is healthy in every other respect. |

## Provenance

The harness pattern — fixture builder with vacuity guards, table-driven runner, one defect per
named assertion — is ported from the author's own earlier tooling. The four upgrades in the
table above, the derivations, every defect and every receipt on this page are this repo's.
