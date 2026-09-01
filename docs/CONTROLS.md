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

**Nothing is recorded here that was not observed.** The receipts below are pasted from one real
run on this fixture, exit codes included. What no control has fired is not left to look
covered: the last section counts the battery's failure paths with a script, says how many have
been seen to fire — about one in seven — and lists the rest by family.

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

The harness this was ported from — a private project of my own — judged a control by one number:
did the checker exit 1. That cannot distinguish four different situations, three of which are
failures of the control:

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
| **Expected substrings** | Each control carries one or two verbatim fragments of the checker's real failing row. A red for the wrong reason no longer satisfies the control. Where both fragments belong to ONE printed row — contrast and hero — they must co-occur on a single line (`sameLine: true` in the table). |
| **Guarded setup** | The fixture builder's vacuity throw is caught, reported as *failed to fail* with the guard's own message, and the run continues to the next control. One rotted injection no longer hides the other six. |
| **Crash is not a verdict** | A child that died on a signal or never started (`code === null`) is reported as `CRASHED (infrastructure)`, distinct from `did NOT fail on its negative control`. An infrastructure failure that reads as a gate verdict is how a broken harness passes for a working one. |

The expected-substring upgrade is not decoration. The builder's byte-level guard can only see
that a file changed, not that the injected *selector* still matches anything: rename
`.stat-label` tomorrow and the harden fixture would still be built, still be mutated, and still
prove nothing. The substring check is what notices.

**Where the substring check is loose, stated rather than fixed.** Five of the seven controls
carry fragments that belong to *different* rows by design — harden injects two defects on two
pages, deploy fails a header row and a body row — so those fragments are matched against the
whole output, and two unrelated red rows could in principle satisfy them jointly. Same-line
matching cannot express a two-row expectation, and the realistic path to a spurious pass is
already closed one step earlier: a checker that is red for an unrelated reason fails
baseline-green at step 2, before any fragment is looked at. What remains uncovered is a
fixture that produces two *new* unrelated reds carrying both fragments between them. No run in
this repo has produced one; that is an observation, not a proof, which is why it is written
down here instead of being called handled.

## The controls

`sha=44deb74`, node v22.22.2, playwright 1.62.1, chromium, 2026-08-29, against a clean tree.
Browser controls run a narrowed matrix — the receipt is that the assertion can fire in this repo,
not a second full matrix; the full two-engine matrix runs green separately under `npm test`
(869 of 869 cells at the same sha, 536 s, README).

**Every receipt below was captured from one run of `npm run build && npm run test:controls` at
`44deb74`**, which fired 7 of 7 controls in 102 s. Check what has changed under them rather than
believing a sentence:

```
git diff --stat 44deb74..HEAD -- checks controls contracts fixture scripts site.json package-lock.json
```

That command prints nothing as this is written: the only commit between `44deb74` and this sentence
is the one that pastes these receipts in. If it prints a file, this page is older than the code.

**These receipts replace an earlier capture at `f94132d`, and the differences are worth naming.**
Every cell count is identical across the two captures — 231/231 baseline and 175/204 mutated for
links, 36/36 and 26/36 for harden, 12/12 and 6/12 for motion, 4/4 and 1/4 for contrast and for
hero, 1/1 and 0/1 for viewports, 9/9 and 0/9 for deploy — as is every measured figure inside them:
the same `h-overflow 225px`, the same `spread 8.00px`, the same `1.11:1`, the same 54 unpainted
elements. Three things moved:

- every `sha=` stamp, from `f94132d` to `44deb74`;
- the hero heading quoted on three of the contrast rows, from "Elevators that stay in service." to
  "Lifts that stay in service.", because the fixture heading was reworded on 2026-08-29;
- two byte-length pairs in the deploy receipt — `12876/12914` became `12882/12920` and
  `6683/10483` became `6692/10492` — because the fixture pages that control mutates are a few bytes
  longer than they were. What the assertion is actually about, the drift itself, is unchanged: 38 B
  for the stripped `robots` meta and 3800 B for the removed directory, at both captures.

**Re-capturing is not the same as correcting, and the difference is the whole rule here.** A
receipt edited to fit later bytes is forbidden on this page and still is. A receipt re-taken by
running the suite again and pasting what it printed is the only thing that ever retires the risk
below, and it is what these are.

**Kept for the record: what this page said before, and why it was wrong.** Until 2026-08-29 the
paragraph here reasoned about the same fixture edits without re-running, and concluded that the
reworded heading changed nothing in the receipts because "the quoted string is the row's label, not
an input to the ratio, the floor or the cell count." That is true of the *checker* and false of the
*harness*: the string was also an input to the contrast control's `expect` list in
`controls/run-controls.js`, which requires that label on the same row as the ratio before it will
credit the control as fired. Rewording the fixture heading therefore broke the contrast control,
and the paragraph missed it by asking what the checker prints instead of what the harness requires.
Nothing caught it locally, because the control suite was not re-run after the rewording
(`docs/VERIFICATION.md`, "Green after the fixes", records that decision). The first CI run this
repo ever had caught it: run 33255193219, `6/7 controls fired — 1 control(s) failed to fail:
contrast (wrong failing line)`. It was fixed in `62d9804`. The coupling is the thing to remember:
**fixture copy quoted in an `expect` fragment is executable, and changing that copy is changing an
assertion.**

What is between the fences is that run's stdout. Two substitutions run through all of it and
are the only edits: absolute paths are shortened to `<repo>/`, and the deploy control's
ephemeral port to `PORT`. Every omission is marked with a bracketed line saying what was
dropped and how many rows it was; nothing else is left out.

---

### links — `checks/check-links.js`

**Defect.** Five, in one build: `dist/references/` removed while `site.json` still declares
`references/index.html`; and four elements appended to `index.html` — `<a href="#no-such-anchor">`,
`<a href="/no-such-page/">`, `<a href="#">`, and a second `<h1>`.

**Mechanism.** The removed directory fires two independent assertions from one deletion: page
parity (a claim about the manifest) and dead links (a claim about the markup, from every page
that links `/references/`). A checker that had only one of those would still call the site fine.

**Receipt.**

Rows are in the order the run printed them — the checker walks the manifest first, then the
pages alphabetically, so the four index-specific defects sit between the `contact` and
`maintenance-plans` blocks rather than at the top.

```
fixture links: dist -> controls/links/dist, mutated dist/index.html (markup), dist/references (removed)
baseline (pristine dist) $ node checks/check-links.js --root dist
  -> links: 231/231 cells OK — PASS  [sha=44deb74 root=dist pages=7 strict=false]  exit=0

mutated $ node checks/check-links.js --root controls/links/dist
FAIL  site.json pages[] references/index.html
        site.json declares references/index.html, which is not in the build
FAIL  404.html <a> "/references/"
        dead link -- "/references/" resolves to nothing in the build
[15 rows elided, each identical to the one above but for the page: 3 more for 404.html, then
 4 each for about/index.html, contact/index.html and index.html]
FAIL  index.html <a> "#no-such-anchor"
        dead anchor #no-such-anchor -- no element carries that id in index.html
FAIL  index.html <a> "/no-such-page/"
        dead link -- "/no-such-page/" resolves to nothing in the build
FAIL  index.html <a> "#"
        href="#" placeholder -- no real target
FAIL  index.html h1
        2 <h1> element(s) -- exactly 1 required
[8 rows elided, the same "/references/" dead-link shape: 4 for maintenance-plans/index.html
 and 4 for services/index.html]
note  contact/index.html <form> "/api/contact": declared submit endpoint -- answered by the host at deploy time, not a file in the build
note  18 root-absolute asset reference(s) -- links.root_absolute_assets="note"
note  153 root-absolute page link(s) -- this build assumes it is served at the domain root

links: 175/204 cells OK — FAIL  [sha=44deb74 root=controls/links/dist pages=6 strict=false]
exit=1
```

29 red rows: 1 parity + 24 dead links to `/references/` + the 4 injected into `index.html`.
23 of the 24 are elided above, in the two marked blocks.

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
fixture viewports: dist -> controls/viewports/dist, mutated dist/index.html (markup), dist/index.html (style)
baseline (pristine dist) $ node checks/measure-viewports.js --root dist --engines chromium --viewports 320x568 --pages index.html --shots 0
  -> viewports: 1/1 cells OK — PASS  [sha=44deb74 root=dist engines=chromium cells=1 pages=1]  exit=0

mutated $ node checks/measure-viewports.js --root controls/viewports/dist --engines chromium --viewports 320x568 --pages index.html --shots 0
viewports: root=<repo>/controls/viewports/dist pages declared=1 built=1 contract=<repo>/contracts/fold-contract.json status=FILLED

FAIL  chromium se1 320x568 index.html
        h-overflow 160px (documentElement.scrollWidth 480 > 320)
        h-overflow on body 160px
        overflowing (unclipped): html.js>body>div.control-overflow[0..480]
        tap targets <44px: body>header.site-head>div.head-inner>a.call-link 20x20

viewports: 0/1 cells OK — FAIL  [sha=44deb74 root=controls/viewports/dist engines=chromium cells=1 pages=1]
exit=1
```

Nothing is elided from that receipt. Note what is *not* in it: the root-masking row
(`measure-viewports.js:266`) did not print, even though the paragraph above invokes root
masking as the reason two readings are taken. Two readings is a design argument here, not a
fired assertion — the unarmed table records it.

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

**Receipt.** Ten of 36 cells red — all ten are below. The `services/index.html` baseline,
longest-content and `N-1` rows stay green, which is what makes the `N+1` red mean something.
The eight `index.html` rows share one identical `overflowing:` line; it is printed in full on
the first and marked as elided on the other seven, and that is the only thing dropped.

```
fixture harden: dist -> controls/harden/dist, mutated dist/index.html (style), dist/services/index.html (style)
baseline (pristine dist) $ node checks/check-harden.js --root dist --engines chromium --pages index.html,services/index.html,maintenance-plans/index.html --viewports 1280x640,1440x900 --shots 0
  -> harden: 36/36 cells OK — PASS  [sha=44deb74 root=dist engines=chromium cells=2 components=3 grids=2]  exit=0

mutated $ node checks/check-harden.js --root controls/harden/dist --engines chromium --pages index.html,services/index.html,maintenance-plans/index.html --viewports 1280x640,1440x900 --shots 0
harden: root=<repo>/controls/harden/dist slots=<repo>/contracts/harness-slots.json status=FILLED

FAIL  chromium laptop-720 index.html baseline
        h-overflow 225px
        overflowing: div.wrap>div.stats-slab>section.stats>div.stat div.stats-slab>section.stats>div.stat>span.stat-value div.stats-slab>section.stats>div.stat>span.stat-label div.stats-slab>section.stats>div.stat>span.stat-note
FAIL  chromium laptop-720 index.html longest-content [stat-labelx3 card-titlex3]
        h-overflow 268px
        [same overflowing: line, elided]
FAIL  chromium laptop-720 index.html grid card-grid N+1
        h-overflow 225px
        [same overflowing: line, elided]
FAIL  chromium laptop-720 index.html grid card-grid N-1
        h-overflow 225px
        [same overflowing: line, elided]
FAIL  chromium laptop-720 services/index.html grid process-steps N+1
        h-overflow 230px
        overflowing: section.slab>div.wrap>ol.process>li div.wrap>ol.process>li>h2 div.wrap>ol.process>li>p
FAIL  chromium mbp index.html baseline
        h-overflow 145px
        [same overflowing: line, elided]
FAIL  chromium mbp index.html longest-content [stat-labelx3 card-titlex3]
        h-overflow 188px
        [same overflowing: line, elided]
FAIL  chromium mbp index.html grid card-grid N+1
        h-overflow 145px
        [same overflowing: line, elided]
FAIL  chromium mbp index.html grid card-grid N-1
        h-overflow 145px
        [same overflowing: line, elided]
FAIL  chromium mbp services/index.html grid process-steps N+1
        h-overflow 150px
        overflowing: section.slab>div.wrap>ol.process>li div.wrap>ol.process>li>h2 div.wrap>ol.process>li>p

harden: 26/36 cells OK — FAIL  [sha=44deb74 root=controls/harden/dist engines=chromium cells=2 components=3 grids=2]
exit=1
```

**Noise, recorded.** The nowrapped labels make every `index.html` row of the mutated run red,
including its baseline row — the injection is page CSS, so it is present before the checker
mutates anything. That is the honest shape of a CSS regression and is not tuned away. The four
`index.html` rows at a given cell are not one number repeated: `baseline` and both `card-grid`
rows print the injection's own overflow (225px at 1280, 145px at 1440, since the card-grid
cases reload the same page and change nothing that touches the stats), while `longest-content`
prints 268px and 188px — 43px more at both cells, because the checker's own longest-content
substitution lengthens labels that can no longer wrap. The signal that is specifically about
the hardening case is on `services/index.html`, where only the `N+1` row moved.

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

**Receipt.** Six of 12 cells red — legs A and B at all three cells. Each red row lists 12
unpainted offenders and then the checker's own cap line; 10 of those 12 are elided below, and
the four rows at `iphone-pro` and `laptop-720` are elided whole, being the same two rows again.

```
fixture motion: dist -> controls/motion/dist, mutated dist/index.html (style)
baseline (pristine dist) $ node checks/check-motion.js --root dist --engines chromium --pages index.html --shots 0
  -> motion: 12/12 cells OK — PASS  [sha=44deb74 root=dist engines=chromium cells=3]  exit=0

mutated $ node checks/check-motion.js --root controls/motion/dist --engines chromium --pages index.html --shots 0
motion: root=<repo>/controls/motion/dist pages=1 reveal-pattern=/rv/i reveal-optional=[contact/index.html] contract=<repo>/contracts/fold-contract.json status=FILLED

FAIL  chromium se1 index.html reduced-motion
        running animation under reduce: #hero-title control-spin 2s
        not painted under reduce: #figures-title effective-opacity=0.00 [reveal class on section.slab>div.wrap>div.stats-slab>div.stack]
[10 "not painted under reduce" lines elided, same shape, different offender]
        not painted under reduce: section.slab>div.wrap>div.slab-head>p.eyebrow effective-opacity=0.00 [reveal class on #main>section.slab>div.wrap>div.slab-head]
        ... and 42 more
FAIL  chromium se1 index.html scripts-removed
        not painted with scripts removed: #figures-title effective-opacity=0.00 [reveal class on section.slab>div.wrap>div.stats-slab>div.stack]
[10 "not painted with scripts removed" lines elided, same shape, different offender]
        not painted with scripts removed: section.slab>div.wrap>div.slab-head>p.eyebrow effective-opacity=0.00 [reveal class on #main>section.slab>div.wrap>div.slab-head]
        ... and 42 more
[4 rows elided: the same two rows again at iphone-pro and at laptop-720]

motion: 6/12 cells OK — FAIL  [sha=44deb74 root=controls/motion/dist engines=chromium cells=3]
exit=1
```

`... and 42 more` is the checker's cap, not an elision of this document: 54 elements fail the
paint assertion on this page and the row prints the first 12.

---

### contrast — `checks/check-contrast.js`

**Defect.** `#hero h1{color:oklch(0.95 0.01 106)}` — the hero heading recoloured to a
near-white over the hero's own light ground, `--paper: oklch(0.985 0.004 106)`.

**Mechanism.** 0.035 of lightness between text and surface lands the pair at 1.11:1, against
the 3.0:1 floor the heading gets for being large text. Near-white-on-white is also the most
common real instance of this defect: a token swapped for its inverse-surface twin. The value is
written in `oklch` on purpose — the checker resolves every foreground colour through a real 2D
canvas rather than parsing the string, so this injection exercises that path end to end and
lands on 1.11:1, the ratio the authored pair actually has rather than the 1:1 an unparsed
string would collapse to.

**What this control does not touch.** Every cell reports `0 unresolvable`, so the failure
branch of that same path — `check-contrast.js:314`, the row for a colour the engine refuses —
never executes here. Exercising a resolution path correctly is not the same as exercising its
failure branch, and the difference is recorded in the unarmed table rather than blurred.

**Receipt.** Three of four cells red, and nothing else on the page moved. Nothing is elided —
including the warning line, which is exactly the caveat a sceptic should want: this control
measures one of the six declared pages, so the checker refuses to run its dead-selector guard
and says so.

```
fixture contrast: dist -> controls/contrast/dist, mutated dist/index.html (style)
baseline (pristine dist) $ node checks/check-contrast.js --root dist --engines chromium --pages index.html
  -> contrast: 4/4 cells OK — PASS  [sha=44deb74 root=dist engines=chromium cells=3 pages=1]  exit=0

mutated $ node checks/check-contrast.js --root controls/contrast/dist --engines chromium --pages index.html
contrast: root=<repo>/controls/contrast/dist pages=1 registers=footer-inverse(.site-foot), filled-control(.btn:not(.btn-hero):not(.btn-ghost))

FAIL  chromium se1 index.html [132 nodes (base:115 footer-inverse:16 filled-control:1), 30 unpainted, 0 unresolvable]
        1.11:1 < 3.0 (min 1.11, 29px/650) #hero-title "Lifts that stay in service."
FAIL  chromium iphone-pro index.html [105 nodes (base:88 footer-inverse:16 filled-control:1), 30 unpainted, 0 unresolvable]
        1.11:1 < 3.0 (min 1.11, 30px/650) #hero-title "Lifts that stay in service."
FAIL  chromium laptop-720 index.html [148 nodes (base:131 footer-inverse:16 filled-control:1), 25 unpainted, 0 unresolvable]
        1.11:1 < 3.0 (min 1.11, 62px/650) #hero-title "Lifts that stay in service."
note  warn: dead-selector guard not evaluated — measured 1 of 6 declared pages, and a register may legitimately live on a page this run skipped

contrast: 1/4 cells OK — FAIL  [sha=44deb74 root=controls/contrast/dist engines=chromium cells=3 pages=1]
exit=1
```

---

### hero — `checks/check-hero.js`

**Defect.** `.car-tip{margin-left:-8px}`.

**Mechanism.** This is a replay of the defect class the instrument exists for: a hero whose
moving element sat a few px off the line it travels on, while a battery measuring overflow,
contrast, tap targets and fold height stayed green — because none of those assert *where* the
tip is. The one thing the scene is, an object on a line, was the one thing nothing measured.
That is the engineering reason a geometry contract exists. (The defect was found in a private
project of my own; that history is provenance, not evidence — it carries no denominator and
cannot be reproduced from this repo. Everything below can be.)

`.car-tip` here is centred by `left:50%; transform:translateX(-50%)` and carries no margin, so
the injected -8px is the entire offset. The defect is horizontal only, deliberately: it must
move the centreline assertion without disturbing anything else.

**Receipt.** Three of four rows red; `frame1 ground-contact` stays green, because the tip's
bottom edge still meets the ground.

```
fixture hero: dist -> controls/hero/dist, mutated dist/index.html (style)
baseline (pristine dist) $ node checks/check-hero.js --root dist --cells 390x844 --shots 0 --engines chromium
  -> hero: 4/4 cells OK — PASS  [sha=44deb74 root=dist contract=contracts/hero-contract.json page=index.html engines=chromium cells=1]  exit=0

mutated $ node checks/check-hero.js --root controls/hero/dist --cells 390x844 --shots 0 --engines chromium
hero: root=<repo>/controls/hero/dist page=index.html contract=contracts/hero-contract.json cells=390x844

FAIL  chromium 390x844 frame1 centerline
        frame 1: rail / frame / tip are not on one centerline — spread 8.00px > 0.5px (rail 195.00, frame 195.00, tip 187.00; tip 10x6px)
FAIL  chromium 390x844 end-state climax
        end state (scrollY 2107): rail / frame / tip are not on one centerline — spread 8.00px > 0.5px (rail 195.00, frame 195.00, tip 187.00; tip 10x6px)
FAIL  chromium 390x844 reduced-motion frame1
        frame 1 (reduce): rail / frame / tip are not on one centerline — spread 8.00px > 0.5px (rail 195.00, frame 195.00, tip 187.00; tip 10x6px)

hero: 1/4 cells OK — FAIL  [sha=44deb74 root=controls/hero/dist contract=contracts/hero-contract.json page=index.html engines=chromium cells=1]
exit=1
```

Read what those three rows do and do not prove. Each is a *row* verdict, and each went red on
its centreline check alone: the `end-state climax` row also carries a readout-literal, a
reveal-opacity and a scene-in-frame assertion, and the `reduced-motion frame1` row also carries
a resting-readout, a running-animation and a scrub-off assertion. None of those printed, so
none of them is proven live by this control. Both rows are recorded in the unarmed table for
that reason.

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

The four response-header lines are identical on all six page rows; they are printed in full on
the first and marked as elided on the other five. That is the only thing dropped.

```
baseline (pristine dist) $ node checks/check-deploy.js --local --require-current
  -> deploy: 9/9 cells OK — PASS  [sha=44deb74 origin=local-fixture root=dist pages=6 drift=0 form=3-probes strict=false]  exit=0

mutated $ node controls/deploy/run.js
fixture deploy: dist -> controls/deploy/dist, mutated dist/services/index.html (markup), dist/about (removed)
$ node checks/check-deploy.js --url http://127.0.0.1:PORT --negative --require-current
FAIL  index.html (http://127.0.0.1:PORT/)
        response header X-Robots-Tag absent — the contract declares "noindex"
        response header X-Content-Type-Options absent — the contract declares "nosniff"
        response header Referrer-Policy absent — the contract declares "strict-origin-when-cross-origin"
        response header X-Frame-Options absent — the contract declares "DENY"
FAIL  services/index.html (http://127.0.0.1:PORT/services)
        [same four response-header lines, elided]
        served body carries no <meta name="robots" ... noindex> — the build's own noindex mechanism did not survive the deploy
        served bytes != dist/services/index.html (12882 B served vs 12920 B local) — the origin is not this build
FAIL  maintenance-plans/index.html (http://127.0.0.1:PORT/maintenance-plans)
        [same four response-header lines, elided]
FAIL  about/index.html (http://127.0.0.1:PORT/about)
        HTTP 404, expected 200
        [same four response-header lines, elided]
        served bytes != dist/about/index.html (6692 B served vs 10492 B local) — the origin is not this build
FAIL  contact/index.html (http://127.0.0.1:PORT/contact)
        [same four response-header lines, elided]
FAIL  references/index.html (http://127.0.0.1:PORT/references)
        [same four response-header lines, elided]
FAIL  form valid POST (http://127.0.0.1:PORT/api/contact)
        HTTP 404, expected 200
        body null — expected {ok:true, ...}
FAIL  form missing-required POST (http://127.0.0.1:PORT/api/contact)
        HTTP 404, expected 400 — server-side validation of [name, phone] is the contract; client-side validation is not
FAIL  form honeypot POST (http://127.0.0.1:PORT/api/contact)
        HTTP 404, expected a silent 200
        body null — a filled honeypot must answer a silent {ok:true}, so a bot never learns it was caught
note  origin=http://127.0.0.1:PORT build=dist pages=6 form-probes=3 drift=2 MODE=require-current MODE=negative-control

deploy: 0/9 cells OK — FAIL  [sha=44deb74 origin=http://127.0.0.1:PORT root=dist pages=6 drift=2 form=3-probes strict=false]

negative control fired: 9 cell(s) failed against an origin known to be broken — the assertions are live. exit 0.
check-deploy exit=0
exit=0
```

**One trap, written into the file's header so the next person does not pay for it again.** The
checker is spawned asynchronously, and that is not a style preference: this process *hosts* the
origin the child probes. `execFileSync` blocks the event loop the http server listens on, so
every request from the child sits unanswered until it times out — a two-minute deadlock of the
control against itself, with no error message that points at the cause. Any future control that
serves something and then probes it inherits the trap.

## How much of the battery is armed — counted, not asserted

Seven controls fire seven checkers. That is a much smaller claim than "the checkers work", and
the honest way to say how much smaller is to count the assertions rather than to list a
tasteful few. This section is that count, its method, and what it cannot see.

**Method, re-runnable from a clean checkout:**

```
npm run build && npm run test:controls > /tmp/controls.txt 2>&1
grep -E '^(FAIL |        )' /tmp/controls.txt > /tmp/rows.txt    # failure rows only, no notes
node scripts/count-emit-sites.js /tmp/rows.txt
```

`scripts/count-emit-sites.js` counts **failure-emit sites** — the places in `checks/` that can
put a line inside a failing row (`p.push`, `probs.push`, `endProbs.push`, `<report>.fail`) —
and reports how many of them printed. Its output at `44deb74`, against the receipts above — byte-identical to what it printed at `f94132d`:

```
file                        sites  probeable  printed
check-contrast.js             11          8        0
check-deploy.js               22         15        3
check-harden.js               19         16        2
check-hero.js                 37         31        1
check-links.js                15         11        3
check-motion.js               18         12        0
measure-viewports.js          57         50        4

179 failure-emit sites; 143 carry a literal prefix of 8+ characters and can be probed; 36 cannot.
13 probeable site(s) appear in /tmp/rows.txt; 130 do not.
```

**Those numbers are wrong in both directions, and here is each direction.**

*Too high.* Sites that share a probe are credited together. Hand-checking the 13 matches
against the run kills two of them: `check-deploy.js:145` (the *wrong header value* row) shares
the probe `response header ` with `:144` (the *absent header* row), and only `:144` printed;
`check-hero.js:261` (ground contact) has the head `frame 1: `, which was matched by the
centreline message `frame 1: rail / frame / tip …` from a different site. **11 probeable sites
are confirmed printed.**

*Too low, twice over.* First: 36 counted sites cannot be probed at all — the message starts
with an interpolation, or is assembled inside a `.map`, or its literal head is under 8
characters — and several of them are exactly the rows these controls exist to fire. Reading the
same log by hand finds 11 of them printed: `check-links.js:152` (`dead link …`),
`check-contrast.js:324` (the ratio row), `check-motion.js:216` and `:218`, and
`check-deploy.js:139`, `:163`, `:194`, `:195`, `:204`, `:216`, `:217`.

Second: the census itself is a floor. A message returned as an array literal from a helper and
handed straight to `rep.row()` is not a `.push` and is not counted at all — and three such
sites printed: `check-hero.js:230` (the centreline row, in all three of its phases),
`check-links.js:166` (the `<h1>` count) and `check-motion.js:248` (the scripts-removed row). So
the population is **at least 182**, not 179, and the hand count adds **14** printed messages
the script cannot credit.

**Best reading: 25 source locations were observed authoring a printed failure line — the 11 the
script credits, plus the 14 it cannot see. Against a population of at least 182, that leaves at
least 157 assertions never observed firing.** About one in seven is armed. Both halves of that
ratio are approximate for the reasons just given; the direction is not. (A few counted sites
are *routers* rather than authors — `endProbs.push(...centerlineProblems(…))` at
`check-hero.js:404` prints a message written at `:230` — and are credited to the author, not
counted twice.) A run of `npm test` *walks* far more of this code than 25 sites; walking an
assertion is not firing it, and only firing separates a live gate from a decorative one.

**One class deserves separating.** Of the 179, 14 guard a malformed *contract* rather than a
broken site: `check-deploy.js:104-108` (5) and `check-hero.js:63-83` (9) refuse to measure when
a contract is empty, unfilled, or names a selector nothing defines. Firing those needs a broken
contract fixture, not a broken page — a different kind of control, and one this repo does not
have. They are counted as unarmed above, which is honest but reads harsher than it is.

### What is NOT armed, by family

Every family below is unarmed: no control in this repo has been observed printing it. Line
numbers are at `44deb74`; the full site-by-site list is what `count-emit-sites.js` prints under
*not printed by that run*. Only `check-hero.js` moved between `f94132d` and `44deb74` — comment
text, +5 lines before its line 146 and +10 after its line 186 — so its numbers here are the ones
that were re-derived, and every other file's are unchanged.

| Family | Sites | Why nothing fired it |
|---|---|---|
| viewports: root-overflow masking (`measure-viewports.js:266`) | 1 | Notable, because the viewports section above invokes root masking as the *reason* two readings are taken. The 150vw block is unmasked, so the two readings agree and the masking row never prints. A fixture would add `overflow-x:hidden` at the root. |
| viewports: nav-toggle and desktop-nav (`298-328`, plus the missing-toggle row at `261`) | 15 | The largest unarmed family in the repo: breakpoint flip, 44px size, accessible name, trailing-edge anchoring, `aria-expanded` / `aria-controls`, element type, desktop nav wrapping and unequal item heights. One defect fires one of them; nothing here injects any. |
| viewports: heading outline (`268-274`) and CTA / interactive-name family (`280-291`) | 12 | The links control fires *its own* h1 assertion (`check-links.js:166`), not this one — different checker, different row. The CTA rows need a CTA that is not a real `a[href]`/`button`, disabled, unreachable, or nameless. |
| viewports: fold-contract composition (`335-360`), `lang` (`277`), dead fragments (`278`) | 13 | A defect that moves the fold edge past its tolerance, bleeds a `never_in_fold` element into view, or breaks the declared `lang` — without breaking anything else. |
| viewports: `contact_affordance` **rendered** leg (`331-333`) | 1 | The tap-target law is what catches the shrunk affordance; the rendered leg needs a `display:none` fixture, which would then be invisible to the tap-target law. One defect, one row. |
| hero: pin discovery (`375-378`) | 4 | Missing scene, no pin spacer, too short a scrub, a scroll that did not land. All four are "the end state cannot be measured" — they need a broken pin, and the injected margin leaves the pin intact. |
| hero: `frame1 ground-contact` (`246-261`) | 3 + 1 | The injected offset is horizontal, so the tip still meets the ground. A vertical-offset fixture would fire it. (Three counted sites; the missing-selector message at `:245` is an array literal the census does not count.) |
| hero: end-state sub-assertions (`398-411`) | 6 of 7 | The `end-state climax` ROW is red, but on its centreline check — scene-in-frame, reveal opacity and the readout literal rode along untested. The seventh site is the router that printed the centreline message. Needs a fixture that moves the destination without touching the centreline. |
| hero: reduced-motion sub-assertions (`429-435`) | 4 | The same shape as the row above, recorded for the same reason: `reduced-motion frame1` is red on its centreline check, while the resting-readout and running-animation legs never printed. |
| hero: scrub-off under reduce (`468`, `471`) | 2 | The two rows that would catch a build ignoring `prefers-reduced-motion` entirely. The argument for them in the source is a sampling argument — at scroll 0 an ignored query looks identical to an honoured one — not a receipt. No fixture here disables the query check. |
| motion: leg C (real JS-off, flat-plate pixel evidence) | 1 | The hero carries no reveal class, so the first view still paints and the greyscale stdev stays well above the flat-plate threshold. (An array literal handed to `rep.row`, so the census does not count it either.) |
| motion: `NO-ELEMENTS-MEASURED`, smooth-scroll under reduce, empty-text rows (`214`, `217`, `219`, `249`) | 4 | Vacuity and belt-and-braces rows. The fixture keeps its interactive elements, keeps its text, and declares no `scroll-behavior:smooth`. |
| contrast: unresolvable colour (`314`) | 1 | The oklch injection *resolves* — every cell reports `0 unresolvable`. Firing this needs a colour the engine refuses, which is a different injection from the one this control makes. |
| contrast: register coverage (`328`, `331`, `334`) | 3 | A fixture whose text on a named register is systematically occluded or emptied, and one whose page measures no text at all. |
| harden: token spill, text-clipped, fold-gap rows (`160-164`) | 5 | The two injected regressions produce document-level overflow, not token spill, clipping, or a broken `last_in_fold` gap. |
| links: empty fragment (`74`), stray page (`108`), stale allowance (`140`) | 3 | The removed directory and the four injected elements do not produce an empty `#`, an undeclared built page, or a `links.allow_dead` entry whose target came back. |
| contract-validation branches (`check-deploy.js:104-108`, `check-hero.js:63-83`) | 14 | See the paragraph above: these guard the contract, not the site. A control for them would inject a malformed contract. |

**One assertion is armed only compoundly, which is not the same as armed.** The deploy drift row
(`check-deploy.js:163`) did print — twice — but only on pages that were failing other rows at
the same time. What no control here shows is drift *in isolation*: an origin that answers 200
with every contracted header and still serves bytes that are not this build. That is the case
the row exists for, and it needs a healthy-in-every-other-respect origin to produce.

## Provenance

The harness pattern — fixture builder with vacuity guards, table-driven runner, one defect per
named assertion — is ported from a private project of my own. The four upgrades in the
table above, the derivations, every defect and every receipt on this page are this repo's.

## The mirror image: documented misses, demonstrated

Everything above proves a gate can go red. This section is the other half: **three cases where a
real defect is injected and the checker stays green on purpose**, because the defect sits outside
what the instrument looks at. `npm run test:known-miss`, runner at
`controls/known-miss/run-known-miss.js`, cases under `controls/known-miss/<case>/setup.js`.

The reason to build it: a limits section is the part of a document nobody can check. It is also the
part most worth checking, because a limit that has quietly stopped being true is a checker that got
better and a document that got dishonest, and a limit that was never true is worse. Prose cannot
tell those apart. A run can.

### Why a miss needs three legs

**A green run is the weakest evidence there is.** An injection whose selector rotted, a fixture
that was never mutated, a page that failed to load — every one of them produces exactly the green
this suite is looking for. So a miss is never credited alone. Each case is pinned between two runs
that cannot both be satisfied by an accident:

| leg | what runs | required |
|---|---|---|
| **(a) baseline** | the checker on the pristine `dist/`, identical argv | exit 0 — without it, a green mutated run says nothing, because the site could be green for its own reasons |
| **(b) miss** | the checker on the mutated copy, the **same** argv | exit 0 |
| **(c0) proof-scope baseline** | the pristine build under leg (c)'s scope, *only when (c) changes the scope* | exit 0 — otherwise a red at a cell the build was never healthy at would be the cell's fault, not the defect's |
| **(c) proof** | the same instrument where it *can* see the defect | exit 1, **and** the row this defect produces matched by verbatim substring |

One `args(root)` builder is written per case and every leg of that case is handed the same one, so
legs (a) and (b) cannot drift apart by an edit to one of them: they differ in the root they measure
and in nothing else, and the proof leg reuses that builder too.
Leg (c) is what stops the suite being a machine for manufacturing green.
Two of its three cases prove the defect on a **twin** fixture — same colours, one geometric
declaration changed — because `check-contrast.js`'s three cells are a module constant with no knob
to widen (`check-contrast.js:35-39`). The third does the stronger thing: the same bytes, the same
argv, one environment variable, and the checker goes red. A red for the wrong reason fails the leg,
the same rule the controls above are judged by.

**What a red leg (b) would mean.** If the checker catches one of these defects, the fixture is not
what is broken: a sentence in `README.md` or on this page is false, and the documentation is what
has to change. The runner says so in its failure text, because the reflex on a red is to fix the
test.

Vacuity is guarded as it is above — fixtures are built from the real `dist/` by
`controls/fixture.js`, which throws when a mutation changes zero bytes — plus three checks this
suite needs and the controls above do not, because here *green is the expected outcome*:

- **The scope witness.** Each case compares its baseline's and its miss's finish-line stamps with
  the `root=` removed, so a miss that silently measured fewer cells than its baseline is not
  credited as a miss. Leg (a) must additionally carry the scope the case declares
  (`engines=chromium cells=12 pages=1` for `between-cells`, `cells=3` for the two contrast cases),
  so editing the default matrix cannot turn a case into a different case that still passes.
- **The coupling witness**, for the two twin cases. Before any browser starts, the miss page and
  the proof page are read back off disk and the miss's declared token is substituted for the
  proof's; the result must equal the proof page byte for byte. This is the runtime form of the
  sentence *"geometry is the only thing that changed"*, and it exists because that sentence was
  otherwise enforced by nothing but the setup script's good intentions: a miss fixture whose defect
  was neutralised — a legible colour, an injection that landed nowhere — is green for a reason that
  has nothing to do with the limit, while its untouched twin still goes red, and the case would
  have been credited. **Measured both ways** on 2026-09-01, by changing the miss fixture's
  declaration to `white-space:nowrap;color:#333333` — a legible dark-on-white ticker, no defect
  left — and touching nothing else: with the coupling witness removed the suite printed
  `1/1 documented misses demonstrated ... legs=3/3` and exited **0**; with it in place the same
  tamper prints *"substituting … does NOT reproduce the proof page"*, credits no legs, and exits
  **1**.
- **The environment scrub.** Every knob these two checkers read — `SITE_ROOT`, `PAGES`, `WIP`,
  `ENGINES`, `RIG_VIEWPORTS`, `SHOTS`, `SHOT_LABELS`, `OUT_DIR`, `FOLD_CONTRACT`, all resolved at
  `checks/lib/site.js:24-26` — is deleted from every child's environment, and only what a leg sets
  itself is put back. The receipt's first line says so and counts how many were set in the calling
  shell. Without it, an ambient `RIG_VIEWPORTS` narrows `between-cells`' baseline *and* its miss by
  the same amount: the scope witness sees two matching lines, and the twelve-cell walk-past the
  case is named after never runs. **Measured both ways** on 2026-09-01 with
  `RIG_VIEWPORTS=320x568 node controls/known-miss/run-known-miss.js between-cells`: with the old
  `{...process.env}` pass-through restored, leg (a) reported
  `viewports: 1/1 cells OK — PASS [... cells=1 pages=1]`; with the scrub, the same command reports
  `12/12 ... cells=12 pages=1` and the run's first line reads `1 of 9 were set in this shell:
  RIG_VIEWPORTS`. The two guards are independent: even with the pass-through restored, the scope
  assertion caught the narrowed baseline and failed the case rather than crediting it.

**These are the makeable limits, not all of them.** *"Whole families of quality are out of scope"*
cannot be demonstrated by a fixture, and nothing here pretends otherwise. **What is executable, split
honestly:** `viewport-clip` executes one bullet of README's *"What this does not catch"* — the rect
filter — and that bullet carries a pointer back to it. The other two do **not** execute README
limits, because the README does not state them: it presents the matrix's reach and the worst-decile
grade as strengths, which they are, and says nothing about the cost each one carries. `between-cells`
and `sub-decile` execute those costs, stated as limits here and in the case headers and nowhere
else in this repo. One README bullet, then, plus two limits this section is the first place to
admit to — not three README bullets.

### The three cases

**`viewport-clip` — contrast skips text that does not fit the viewport.** The limit is the rect
filter at `check-contrast.js:113` and the skip at `:117`: a rect not wholly inside the cell is
dropped, and a node whose every rect was dropped is `continue`d — not counted as measured, not
counted as unpainted, not counted. *Defect:* a marquee ticker line, `#f2f2f2` on `#ffffff` at
20px/400, which is **1.12:1 against a 4.5:1 floor** — the same defect class the contrast control
above injects into the hero, where the checker catches it every time. Its text rect measures
**1683.97px wide**, so `r.right <= vw` is false at all three cells (320, 390, 1280) and **0 of 1
rects survive the filter in every one**. *Proof:* the twin, differing in exactly one declaration —
`white-space:normal` instead of `nowrap` — wraps to the wrapper's width, keeps 3 of 6 rects at
320x568, and is graded 1.12:1 and red. Colour identical, geometry different, verdict different.
The 1683.97px and the rect counts come from the same throwaway probe named under `sub-decile`
below and are why the fixture is shaped this way; what the suite reproduces is the verdict pair.

**`between-cells` — the viewport matrix is a list, not a range.** `checks/lib/site.js:64-82` holds
twelve cells; everything between two adjacent widths is unmeasured. README argues the same
mechanism in the other direction — *"a matrix that stops at 1920 structurally cannot see a defect
whose own threshold is 1920"* — and read backwards that sentence is this case. *Defect:* an in-flow
150vw block, the same shape the viewports control injects at 320x568, gated by media query to
480–700px, a band inside the 414 → 768 gap. Outside the band it is `display:none`, which
`measure-viewports.js:53-61` rejects before the offender list is built, so all twelve cells see a
healthy page. The band has 66px of clearance below and 68px above, because `vw` units and a media
query resolve against slightly different widths when a classic scrollbar is present. *Proof:* the
same fixture, the same argv, `RIG_VIEWPORTS=600x800` (`checks/lib/site.js:85`) — **300px of
horizontal overflow and the offender named**. 414 → 768 is not the widest gap in the list (1920 →
2560 is 640px); it was picked because a split-view width is where a real layout most often has an
untested breakpoint, and because the pristine build is green at 600x800, which leg (c0) checks
rather than assumes.

**`sub-decile` — the grade is the 10th-percentile pixel, and every percentile is a blind spot below
itself.** `WORST_DECILE = 0.10` at `check-contrast.js:41`, read at `:189`, compared at `:323`.
README states the design as a strength, and it is one — *"the worst decile rather than the mean,
because a mean passes text laid over a bright patch of a dark surface"* — but the other half of it
is nowhere in that document: a region of unreadable text smaller than a tenth of the sampled pixels
cannot move `ratios[floor(0.10 * n)]`. *Defect:* a 13px `#333333` caption with a `#0b0b0b` stripe
under **4% of its box = 104 of 2743 sampled pixels (3.79%)**. Over the stripe the pair measures
**1.56:1**; over the rest, 12.63:1; the grade returns 12.63:1 and the cell is green. *Proof:* the
same colours with the stripe at **60% = 1651 of 2743 samples (60.19%)**, which is above the decile
the grade reads — **1.56:1, red, row named**.

*The boundary, because a case built on a threshold owes the threshold.* A sweep of 2/4/6/8/10/12/
15/20/60% stripes over this caption gave patch shares of 1.90 / 3.79 / 5.69 / 8.06 / 9.95 / 11.85 /
14.69 / 19.91 / 60.19 percent of sampled pixels, and the verdict flipped between the 10% stripe
(9.95% of samples, still graded 12.63:1) and the 12% stripe (11.85%, graded 1.56:1). The flip is at
the constant, not near it. **Provenance, stated rather than implied: that sweep was measured with a
throwaway probe replicating `check-contrast.js:165-193`, not with a script in this repo, and no
artifact here witnesses it.** What this repo reproduces on demand is the pair — 4% green, 60% red,
both through the real instrument. Treat the boundary as the reason those two fractions were chosen,
not as a receipt this page hands you. Shares rather than counts throughout, because the sample
count is not stable: the stride is derived from the rect's area (`check-contrast.js:173`) and a
sub-pixel difference in the rect's top samples 13 rows instead of 12, flipping the stride from 1 to
2 (2743 samples vs 742, seen at 1280x640) while the patch *share* moved 0.03 percentage points.

*Honest about size:* 4% of that caption is about 8.5 CSS px, roughly one character on the dark
stripe. That is a small defect and calling it a scandal would be dishonest. The claim is the
threshold, not the severity — below a tenth of the rect this instrument cannot see a region at
**any** contrast, 1.56:1 included.

### The receipt

`sha=2ab542b`, node v22.22.2, playwright 1.62.1, chromium, 2026-09-01, 102 s, **3 of 3
demonstrated, 10 of 10 legs**. Command: `npm run test:known-miss`, over a `dist/` freshly built by
`npm run build` in the same shell; the 109 lines below are that command's stdout and nothing else.

Two caveats about this stamp, both of which the README's own limits section predicts. The tree was
**not clean** when this ran, so `2ab542b` names the commit this run was *near*, not the bytes it
measured. The uncommitted set was: `controls/known-miss/` (untracked — the runner and the three
`setup.js` files), plus modifications to `README.md`, `docs/CONTROLS.md` (this page),
`package.json` (which defines the very script the command above runs) and
`.github/workflows/ci.yml`. What is load-bearing is that **every checker is unmodified at that
commit** — `git status --porcelain checks/ contracts/ fixture/ scripts/ site.json` was empty, so
the instruments doing the measuring are exactly `2ab542b`'s. And the suite was run six times around
this capture: all six stdouts were **byte-identical, 0 differing lines of 113 captured** (the 109
pasted below plus npm's four-line preamble), at 101.6, 101.7, 101.5, 102.1, 101.8 and 101.5 s wall
clock. Six runs on one machine in one session is not a distribution;
`scripts/measure-repeatability.js` is what this repo uses when the question is actually
repeatability, and it has never been pointed at this suite.

Below is the second run's stdout. One substitution runs through it, the same one used above:
absolute paths are shortened to `<repo>/`. Nothing else is edited and nothing is omitted.

```
environment: 9 checker knobs dropped from every child (0 of 9 were set in this shell); each leg pins its own scope in argv

==============================================================================
== viewport-clip  (checks/check-contrast.js)
== limit:  README "What this does not catch": contrast skips text that does not fit the viewport — the rect filter at check-contrast.js:113, the skip at :117, the three cells at :35-39
== defect: a marquee ticker line, #f2f2f2 on #ffffff at 20px/400 = 1.12:1 against a 4.5:1 floor, on a text rect 1683.97px wide — wider than all three cells (320, 390, 1280)
==============================================================================
fixture miss: dist -> controls/known-miss/viewport-clip/miss/dist, mutated dist/index.html (markup), dist/index.html (style)
fixture proof: dist -> controls/known-miss/viewport-clip/proof/dist, mutated dist/index.html (markup), dist/index.html (style)
coupling: the proof page IS the miss page with "white-space:nowrap" -> "white-space:normal", 16153 -> 16153 bytes, nothing else differs

(a) BASELINE  the pristine build, must be GREEN
    $ node checks/check-contrast.js --root dist --engines chromium --pages index.html
    -> contrast: 4/4 cells OK — PASS  [sha=2ab542b root=dist engines=chromium cells=3 pages=1]  exit=0

(b) MISS      the same argv against the mutated copy, must ALSO be GREEN
    $ node checks/check-contrast.js --root controls/known-miss/viewport-clip/miss/dist --engines chromium --pages index.html
    -> contrast: 4/4 cells OK — PASS  [sha=2ab542b root=controls/known-miss/viewport-clip/miss/dist engines=chromium cells=3 pages=1]  exit=0
    witness: baseline and miss measured the same scope — yes  contrast: 4/4 cells OK — PASS  [sha=2ab542b engines=chromium cells=3 pages=1]

(c) PROOF     the injected defect is real: the same colours on a wrapped twin — one declaration different, white-space:normal, so every rect fits a cell and the node is graded
    $ node checks/check-contrast.js --root controls/known-miss/viewport-clip/proof/dist --engines chromium --pages index.html
contrast: root=<repo>/controls/known-miss/viewport-clip/proof/dist pages=1 registers=footer-inverse(.site-foot), filled-control(.btn:not(.btn-hero):not(.btn-ghost))

FAIL  chromium se1 index.html [133 nodes (base:116 footer-inverse:16 filled-control:1), 30 unpainted, 0 unresolvable]
        1.12:1 < 4.5 (min 1.12, 20px/400) html.js>body>section.km-ticker>p.km-ticker-line "Serviced today, running tomorrow. Lift m"
FAIL  chromium iphone-pro index.html [109 nodes (base:92 footer-inverse:16 filled-control:1), 30 unpainted, 0 unresolvable]
        1.12:1 < 4.5 (min 1.12, 20px/400) html.js>body>section.km-ticker>p.km-ticker-line "Serviced today, running tomorrow. Lift m"
FAIL  chromium laptop-720 index.html [149 nodes (base:132 footer-inverse:16 filled-control:1), 25 unpainted, 0 unresolvable]
        1.12:1 < 4.5 (min 1.12, 20px/400) html.js>body>section.km-ticker>p.km-ticker-line "Serviced today, running tomorrow. Lift m"
note  warn: dead-selector guard not evaluated — measured 1 of 6 declared pages, and a register may legitimately live on a page this run skipped

contrast: 1/4 cells OK — FAIL  [sha=2ab542b root=controls/known-miss/viewport-clip/proof/dist engines=chromium cells=3 pages=1]
    exit=1

DEMONSTRATED  viewport-clip: baseline exit 0 on dist, miss exit 0 on controls/known-miss/viewport-clip/miss/dist (the documented limit holds), proof exit 1 matching "1.12:1 < 4.5 (min 1.12, 20px/400)" + "html.js>body>section.km-ticker>p.km-ticker-line" on one row

==============================================================================
== between-cells  (checks/measure-viewports.js)
== limit:  the viewport matrix is a list of twelve cells, not a range — checks/lib/site.js:64-82, resolved at :84-92; everything between two adjacent widths is unmeasured
== defect: an in-flow 150vw block gated to 480-700px, a band inside the 414 -> 768 gap; display:none outside it, so `rendered` (measure-viewports.js:53-61) rejects it at every cell
==============================================================================
fixture miss: dist -> controls/known-miss/between-cells/miss/dist, mutated dist/index.html (markup), dist/index.html (style)
coupling: the proof leg re-runs the miss fixture itself — one page, nothing to couple

(a) BASELINE  the pristine build, must be GREEN
    $ node checks/measure-viewports.js --root dist --engines chromium --pages index.html --shots 0
    -> viewports: 12/12 cells OK — PASS  [sha=2ab542b root=dist engines=chromium cells=12 pages=1]  exit=0

(b) MISS      the same argv against the mutated copy, must ALSO be GREEN
    $ node checks/measure-viewports.js --root controls/known-miss/between-cells/miss/dist --engines chromium --pages index.html --shots 0
    -> viewports: 12/12 cells OK — PASS  [sha=2ab542b root=controls/known-miss/between-cells/miss/dist engines=chromium cells=12 pages=1]  exit=0
    witness: baseline and miss measured the same scope — yes  viewports: 12/12 cells OK — PASS  [sha=2ab542b engines=chromium cells=12 pages=1]

(c0) PROOF-SCOPE BASELINE  the pristine build under the proof leg's scope, must be GREEN
    $ RIG_VIEWPORTS=600x800 node checks/measure-viewports.js --root dist --engines chromium --pages index.html --shots 0
    -> viewports: 1/1 cells OK — PASS  [sha=2ab542b root=dist engines=chromium cells=1 pages=1]  exit=0

(c) PROOF     the injected defect is real: the SAME fixture and the SAME argv, one in-gap cell added through the checker's own env knob (checks/lib/site.js:85) — nothing about the build changed
    $ RIG_VIEWPORTS=600x800 node checks/measure-viewports.js --root controls/known-miss/between-cells/miss/dist --engines chromium --pages index.html --shots 0
viewports: root=<repo>/controls/known-miss/between-cells/miss/dist pages declared=1 built=1 contract=<repo>/contracts/fold-contract.json status=FILLED

FAIL  chromium 600x800 600x800 index.html
        h-overflow 300px (documentElement.scrollWidth 900 > 600)
        h-overflow on body 300px
        overflowing (unclipped): html.js>body>div.km-gap-band[0..900]

viewports: 0/1 cells OK — FAIL  [sha=2ab542b root=controls/known-miss/between-cells/miss/dist engines=chromium cells=1 pages=1]
    exit=1

DEMONSTRATED  between-cells: baseline exit 0 on dist, miss exit 0 on controls/known-miss/between-cells/miss/dist (the documented limit holds), proof exit 1 matching "h-overflow 300px (documentElement.scrollWidth 900 > 600)" + "overflowing (unclipped): html.js>body>div.km-gap-band[0..900]"

==============================================================================
== sub-decile  (checks/check-contrast.js)
== limit:  the grade is the 10th-percentile pixel — WORST_DECILE at check-contrast.js:41, read at :189, compared at :323; a region under a tenth of the sampled pixels cannot move it
== defect: #333333 caption with a #0b0b0b stripe under 4% of its box = 3.79% of sampled pixels; 1.56:1 over the stripe, 12.63:1 over the rest, graded 12.63:1
==============================================================================
fixture miss: dist -> controls/known-miss/sub-decile/miss/dist, mutated dist/index.html (markup), dist/index.html (style)
fixture proof: dist -> controls/known-miss/sub-decile/proof/dist, mutated dist/index.html (markup), dist/index.html (style)
coupling: the proof page IS the miss page with "#0b0b0b 0 4%,rgba(0,0,0,0) 4%" -> "#0b0b0b 0 60%,rgba(0,0,0,0) 60%", 16063 -> 16065 bytes, nothing else differs

(a) BASELINE  the pristine build, must be GREEN
    $ node checks/check-contrast.js --root dist --engines chromium --pages index.html
    -> contrast: 4/4 cells OK — PASS  [sha=2ab542b root=dist engines=chromium cells=3 pages=1]  exit=0

(b) MISS      the same argv against the mutated copy, must ALSO be GREEN
    $ node checks/check-contrast.js --root controls/known-miss/sub-decile/miss/dist --engines chromium --pages index.html
    -> contrast: 4/4 cells OK — PASS  [sha=2ab542b root=controls/known-miss/sub-decile/miss/dist engines=chromium cells=3 pages=1]  exit=0
    witness: baseline and miss measured the same scope — yes  contrast: 4/4 cells OK — PASS  [sha=2ab542b engines=chromium cells=3 pages=1]

(c) PROOF     the injected defect is real: the same colours with the stripe widened to 60% of the box = 60.19% of sampled pixels, which is above the decile the grade reads
    $ node checks/check-contrast.js --root controls/known-miss/sub-decile/proof/dist --engines chromium --pages index.html
contrast: root=<repo>/controls/known-miss/sub-decile/proof/dist pages=1 registers=footer-inverse(.site-foot), filled-control(.btn:not(.btn-hero):not(.btn-ghost))

FAIL  chromium se1 index.html [133 nodes (base:116 footer-inverse:16 filled-control:1), 30 unpainted, 0 unresolvable]
        1.56:1 < 4.5 (min 1.56, 13px/400) html.js>body>section.km-band>p.km-caption "Certificates issued the same day."
FAIL  chromium iphone-pro index.html [109 nodes (base:92 footer-inverse:16 filled-control:1), 30 unpainted, 0 unresolvable]
        1.56:1 < 4.5 (min 1.56, 13px/400) html.js>body>section.km-band>p.km-caption "Certificates issued the same day."
FAIL  chromium laptop-720 index.html [149 nodes (base:132 footer-inverse:16 filled-control:1), 25 unpainted, 0 unresolvable]
        1.56:1 < 4.5 (min 1.56, 13px/400) html.js>body>section.km-band>p.km-caption "Certificates issued the same day."
note  warn: dead-selector guard not evaluated — measured 1 of 6 declared pages, and a register may legitimately live on a page this run skipped

contrast: 1/4 cells OK — FAIL  [sha=2ab542b root=controls/known-miss/sub-decile/proof/dist engines=chromium cells=3 pages=1]
    exit=1

DEMONSTRATED  sub-decile: baseline exit 0 on dist, miss exit 0 on controls/known-miss/sub-decile/miss/dist (the documented limit holds), proof exit 1 matching "1.56:1 < 4.5 (min 1.56, 13px/400)" + "html.js>body>section.km-band>p.km-caption" on one row

==============================================================================
3/3 documented misses demonstrated (each: baseline green, miss green, defect proven red)  [sha=2ab542b engines=chromium legs=10/10]
```

### What this suite still does not do

- **It is chromium-only**, like the controls above. The two contrast cases are pure geometry and
  the arithmetic is engine-independent, but WebKit measures this fixture's strings 15.9–17.4%
  narrower (README) — a rect width is exactly the kind of number that moves, and nothing here has
  been run in WebKit.
- **It executes one bullet of the README's limits section, not three.** That section lists seven
  holes in the instruments; `viewport-clip` demonstrates the first one. `between-cells` and
  `sub-decile` demonstrate the costs of two choices the README states only as strengths, which is
  useful and is also a smaller claim. Nothing counts what fraction of anything that is, and no such
  fraction is claimed. Whether those two costs should become README bullets is an open question this
  suite raises rather than settles.
- **The two contrast cases prove their defect on a twin, not on the same bytes.** What is
  established is that the colours are a failure this instrument prints and that geometry is the
  only thing that changed — the coupling witness now enforces that second half at runtime rather
  than asserting it — but not that the clipped rect itself would fail if the filter let it through.
  Only `between-cells` does the same-bytes version, and only because `measure-viewports.js` has a
  cell knob.
- **A green here is a claim about this fixture, not about every site.** `sub-decile` shows that a
  region under a tenth of a rect cannot move the grade *for this caption at this size*; the
  threshold is structural but the fractions were measured on one element.
