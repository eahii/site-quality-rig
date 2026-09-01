# Judging the judge — method for the contrast meta-evaluation

> **DESIGN, NOT RESULTS — no number below is a measurement.** Every figure on this page is a
> denominator this evaluation is built to produce, a constant read out of the source, or a piece
> of arithmetic about the design. A run's numbers go somewhere else, with their own stamp, and
> this page keeps saying what was planned.
>
> Written 2026-09-01 against `checks/check-contrast.js` as it stands at `eb1d063`; every line
> number quoted below is from that working tree.
>
> **Corrected 2026-09-01, after the first browser runs.** This page said "nothing here has been
> run against a browser", and that sentence is retired rather than edited quietly: the runs exist.
> Their numbers are **not** copied up here — the design/result split is the point of the banner —
> they live in `meta-eval/runs/*.json`, each stamped with its own sha, engines and date. Two
> claims this page made were changed by what those runs showed, and both are marked *corrected
> 2026-09-01* where they sit, with the old claim left readable beside the new one.
>
> **One exception to the banner, added 2026-09-01 and marked where it sits:** the subsection
> *"What a Part B label is scoped to"* quotes measured numbers, because the rule it states was
> forced by a capture result rather than designed ahead of one. It names the record every number
> came from. It is the only place on this page where a figure is a measurement.

## The question

`npm run test:controls` proves the contrast gate can go red on command. That is a claim about the
harness. It says nothing about whether the instrument is *right* — a gate that fires when you
break the page on purpose can still be wrong about every page it grades green, and the repo has
no evidence either way.

So: **how often does `checks/check-contrast.js` agree with an answer it did not produce, and when
it disagrees, in which direction?**

Two kinds of specimen, because there are two kinds of answer available.

| | Part A | Part B |
|---|---|---|
| ground | solid colour | gradients, a radial, a translucent plate, stripe patterns |
| reference | analytic ratio from `meta-eval/lib/wcag.js` | one person's blind judgement of a screenshot |
| what disagreement means | an instrument defect | a gap between a formula and a reader |
| planned denominator | 30 cases | 24 cases, minus any marked *unsure* |

## The yardstick, and what it is not

`meta-eval/lib/wcag.js` implements relative luminance and contrast ratio a second time. It imports
nothing from `checks/`, because a shared helper would make instrument and yardstick agree by
construction and the resulting number would be the same arithmetic compared with itself.

That independence rules out a coding slip in one of the two. It does **not** rule out a shared
misreading of the specification: both implement the same WCAG 2.x formula, and if both got the
linearisation knee or the coefficients wrong in the same way, they would agree perfectly and
report nothing. The mitigation — a mitigation, not a proof — is `node meta-eval/lib/wcag.js
--self-test`, which asserts three hand-checkable anchors to 0.01: `#000000` on `#ffffff` = 21.00,
`#767676` on `#ffffff` = 4.54, `#777777` on `#ffffff` = 4.48. The grey pair is the useful one:
one step of the sRGB ramp straddles the 4.5 floor there, and an implementation using a plain 2.2
gamma instead of the piecewise curve fails it.

## Part A — solid grounds, and why 100% is the pass bar

Thirty specimens, ten per text class (16px/400, 24px/400, 19px/700 — the last two are large text
by the `>=24px or >=18.66px bold` rule at `check-contrast.js:128`). Targets sit at ±0.05, ±0.10,
±0.50 and ±1.55 around whichever floor the class gets, plus far anchors at 1.25 and 14.00. Never
at 4.50 or 3.00 exactly: a specimen sitting on the floor measures the comparison operator rather
than the instrument.

Colours are found by an exhaustive deterministic search (`gen-cases.js`), so `cases.json` is
reproducible byte for byte. The search takes the *least chromatic* colour landing within 0.002 of
the target rather than the closest one outright — ratio is a function of luminance alone, so this
costs nothing measured and keeps the specimen page from looking like a colour test.

**The pass bar is 100%, and the reason is mechanical.** The instrument reads the background from
a screenshot taken with every glyph made transparent, then reports the 10th-percentile pixel of
the sampled box (`check-contrast.js:151-193`). On a solid ground every sampled pixel is the same
pixel, so the percentile is a no-op and the ratio the instrument computes is the ratio the two
authored colours have. Instrument and yardstick should agree **exactly**, on every case, in every
cell. Any miss is a real defect, not noise, and gets read as one.

## Part B — no analytic truth, and the direction that matters

Twenty-four specimens over grounds where no single ratio exists: horizontal linear gradients with
the text at the light end, the dark end and the middle; a vertical gradient probed with three
different foregrounds against its mid band (the text sits in a fixed 32 px line inside a 56 px
ground, so on a `180deg` gradient `text-align` moves it across the gradient's *constant* axis —
the difficulty axis there is the foreground, not the position); a radial gradient; a translucent
white plate over a gradient at three alphas; two stripe patterns. The set spans
clearly readable, genuinely borderline and clearly unreadable by design — that intent is recorded
in the manifest to show the spread exists, is never shown to the labeller, and is never compared
against anything.

The reference is a person: `gen-labeling-sheet.js` emits a sheet showing only the screenshot and
one question, *"Could you comfortably read this text? Judge the hardest-to-read region."*, with
**acceptable / not acceptable / unsure**, in a seeded shuffle (seed `20260901`, recorded in the
manifest). No ratio, verdict, colour or design intent appears on it — **and no case id either**.
The id is a join key straight into `cases.json`, whose row for that case carries `designIntent`,
the foreground and the ground, so an id printed beside a screenshot is an analytic hint by
reference, available to this annotator in one lookup. It is carried by the export instead, which
costs traceability nothing. What remains is that the id is still *in* the page — it is the radio
group's name and the screenshot's filename, because the export has to key on something — so the
sheet is blind against being read, not against being inspected.

**Corrected 2026-09-01 — the sheet is blind and the picture is not.** The paragraph above was
written before any screenshot existed and it is wrong about where the id ends up. `gen-cases.js`
builds every specimen's string from its own id (`Specimen sample b01`, `Sample b24` —
`TEXT_CLASSES` in that file), so the id is **painted into the specimen**, and the screenshot is
the one surface the annotator is asked to look at. The sheet's own markup is clean; the evidence
on it is not. The leak has a shape worth naming rather than averaging away: it is legible exactly
when the specimen is legible, so it reaches the annotator on the easy cases and not on the hard
ones — which is the wrong half to lose, because the borderline cases are the ones a label is worth
anything on. Nothing here is a reason to change a specimen after it has been measured; it is a
reason no Part B agreement number may be quoted without it. Closing it means giving the specimens
id-free strings, regenerating the set, and re-running every baseline that quoted the old one.

**Resolved 2026-09-01, later the same day — and the paragraph above stays because the resolution
is only readable against it.** The leak is closed **at source**: `gen-cases.js` now paints one
neutral constant string per text class (`Sample specimen text` at 16px/400, `Sample text` at
24px/400 and 19px/700) and the single word `canary` in every canary strip. No case id is painted
anywhere — not into the specimen, not into the canary that is currently framed out of the picture
but might not always be. Identical strings cost the accounting nothing: the join key was never the
text, it is the unique first class in the printed path (`spec-b17`, `canary-b17`), and
`check-contrast.js:298` dedups on `path|text|docTop`, so two blocks sharing a string can no more
merge than they could before.

Three things follow, and all three are what make this a resolution rather than a claim:

- **The baselines below were re-made after the fix.** Every run record in `meta-eval/runs/` was
  regenerated against the id-free set; the pre-fix runs are not quoted anywhere and are not
  evidence for anything on this page.
- **No labels were ever collected under the leaking scheme.** There is no `labels.json`, and there
  never was one — the labelling pass had not started when the leak was found. So there is no
  contaminated observation to discount, discard or caveat, and this is the whole reason the fix
  was cheap: an hour later, with 24 labels recorded, the honest options would have been to throw
  the labels away or to publish them with a permanent asterisk.
- **The limit that remains is the one the section below states**, and it is unrelated: the
  annotator is the author, who wrote the specimen table.

What the comparison then means has to be stated carefully, because it is easy to overclaim:
**agreement here is agreement with one reader's perception, which is not what WCAG defines.** A
disagreement is not automatically an instrument defect. What the evaluation reports is therefore
the *direction*, split and never summed:

- **checker PASS, reader strained** — the dangerous direction. This is the case that ships: the
  gate said fine, a person could not read it.
- **checker FAIL, reader fine** — a false alarm. Costly in trust, not in accessibility.

**Limits, stated up front rather than in a footnote.** One annotator, and that annotator is the
author, who wrote the specimen table — a reader who recognises a specimen is not blind to it. One
annotator also yields no inter-rater agreement, so there is no way to tell a perception from a
habit. Both belong in any sentence quoting the Part B number.

## The block contract, and the canary that makes it readable

Every specimen is one fixed-size block: a 272×56 px ground carrying the specimen line, and under
it a 272×28 px strip carrying a canary. Five clauses, each answering something the instrument
does:

1. **Fixed pixel size, wholly inside 320×568.** `check-contrast.js:113` keeps only text rects
   that fit entirely inside the viewport cell. An oversized specimen is skipped, and a skip is
   invisible in the output — it reads exactly like a pass.
2. **Self-contained styling.** Every declaration is `!important` over an `all: initial` reset, so
   no carrier stylesheet can move a box, a background or a font metric. With one exception, and
   it is the most load-bearing line in the generator:
3. **Colour is deliberately *not* `!important`.** The instrument blanks the glyphs by injecting
   `*,*::before,*::after{color:transparent!important; …}` (`check-contrast.js:151-155`), a
   selector with specificity (0,0,0). Between two `!important` declarations the cascade is
   settled by specificity, not source order, so *any* author `!important` colour above `*` would
   outrank it and leave the glyphs painted in the plate the instrument then samples as
   background. The specimens therefore declare colour at normal weight. **This is also a real
   limit of the instrument** — a site whose CSS forces text colour with `!important` is a site
   `check-contrast.js` measures wrongly rather than refuses to measure. Reasoned from the source
   and the cascade; not yet observed in a run, and worth confirming in the browser phase.
4. **A unique first class per text node** (`spec-a01`, `canary-a01`, …). The instrument's printed
   path is built from the **first** class of each element (`:62-73`) and the quoted text is
   truncated at 40 characters (`:96`, `:122`). The class is the only reliable join key between a
   printed row and a case; the text is not. Uniqueness is asserted against the carrier pages' own
   markup as well as within the generated set: the namespace is shared with whatever the site
   already ships, and the fixture already carries `spec-list`, which misses the join pattern only
   because `lis` is not a letter followed by two digits. `gen-cases.js` reads each carrier page
   (from `dist/`, else `fixture/`) and throws on any class that would match; when neither tree is
   present it says so in the manifest rather than reporting a scan it did not do.
5. **A canary in every block**, `#fafafa` on `#ffffff` = 1.04:1, far under every floor.

Clause 5 is the one that makes the whole accounting possible. **The checker prints failing rows
only.** A specimen absent from the output either passed or was never measured, and those two
produce byte-identical output. The canary must fail, so its row is positive evidence that the
block was reached, measured and reported. Only against that evidence does a specimen's absence
mean PASS. A block whose canary did not print is **unusable** — reported as its own number, never
folded into either column, and with no exception for the block that printed a specimen row
anyway. That combination is louder, not quieter: a canary is 1.04:1 and cannot pass, so a block
that produced one row and not the other was reached in half its geometry, and the ratio in the
surviving row is a measurement of an unknown box. It refuses, and the cell books the case as
unusable — one observation, not a `fail` and a `null` for the same cell.

## The capture viewport for Part B — declared, and why it needs declaring

Part B's reference is a person looking at a picture, so the picture has a provenance and it is
stated here rather than left in a script: **`meta-eval/capture-shots.js` photographs each specimen
at 1280×640, the checker's own `laptop-720` cell**, one element screenshot of `.mev-ground-<id>`
per case. The viewport is one of `check-contrast.js`'s three (`:35-39`) and not a fourth invented
for photography, because a label should attach to a picture of something the instrument actually
graded.

**What is in the frame is `.mev-ground`, not the whole `.mev-block`.** The block's second half is
the canary, and the canary's text is the string `canary b17` — the case id, at 1.04:1. Invisible to
an eye and trivially recoverable by anyone who raises the contrast of a PNG, so framing it in would
put the join key into the evidence. It is also unreadable *by design*, and a deliberately illegible
second line answers "could you comfortably read this text?" about the wrong text. The instrument
still measures the canary; it is simply not photographed.

*Corrected 2026-09-01:* the canary's text is now the word `canary`, with no id in it — see the
resolution two sections up. The first reason is therefore retired and the second one carries the
frame on its own, which it always could. The frame did not change: a specimen's own ground is the
only thing on the page that was designed to be looked at.

**One viewport is only enough if the block renders the same at all three, and that is a claim, not
a given.** Every block is fixed-pixel over an `all: initial` reset, so the *layout* should not move
— but a layout box that does not move can still land on a different device-pixel grid, and a
screenshot is a raster. So `capture-shots.js` captures the whole set a second time at 320×568
(`se1`, the narrowest cell and the rig's contractual floor) and compares the two pixel by pixel,
with a same-viewport third pass as the control that says whether a difference belongs to the
viewport or to the camera. The comparison's *result* is a measurement and is not written on this
page; it is in `meta-eval/runs/shot-capture.json`, per case, beside each box's sub-pixel offset.

*Corrected 2026-09-01:* an earlier reading of the block contract treated "fixed pixel size" as
implying a viewport-independent raster. It does not, and the check above exists because it does
not.

*Corrected 2026-09-01, beside the sentence above:* "the result is not written on this page" no
longer holds, and pretending otherwise would hide the reason it stopped holding. The result
turned out to **change a rule about how labels may be read**, and a rule whose justification lives
only in a JSON file is a rule nobody will find. The next section therefore quotes measured
numbers — the one deliberate exception to this page's design/results banner, marked as one where
it sits, sourced to a named record rather than to this page's authority.

### What a Part B label is scoped to — added 2026-09-01, after the first capture run

> **This section carries measurements, which the banner at the top of this page otherwise
> forbids.** It is here because the rule below is *forced by* a result rather than designed ahead
> of one, and it cannot be stated without the result that forces it. Every number in it is read
> out of `meta-eval/runs/shot-capture.json` (24 Part B specimens, chromium, capture 1280×640 vs
> verify 320×568, 2026-09-01, post-fix set) and out of the `partB.inconsistent` field of
> `meta-eval/runs/baseline-chromium.json` and `baseline-two-engine.json` from the same day. If a
> re-run disagrees, that record is right and this prose is stale.

The check above came back with an answer that forces a rule, so the rule is written here rather
than left implicit in a script: **the rasters are not viewport-independent, and on some grounds
they differ materially.** The layout box is identical in both cells (272×56, every case), the
camera is repeatable (two captures at the same viewport are pixel-identical on every case), and
*still* no case rasterises identically at 1280×640 and 320×568 — because a fixed-size box on a
fractional-y device-pixel phase antialiases onto a different grid. How much that costs is not
uniform: of the 24 cases, 12 differ by a worst channel delta of **1**, three by **8**, and nine by
**212 to 244** out of 255. The per-case profile is in `meta-eval/runs/shot-capture.json` and is a
recorded observation, not a gate: `capture-shots.js`'s exit code gates the layout box and the
same-viewport repeatability control, nothing else.

**The split is not by ground kind, which is worth writing down because it was the obvious guess
and the data refuses it.** `b14` and `b16` sit on the same translucent plate at α 0.35 and differ
by 1 and 238 respectively; the linear gradient under `b21` (244) is the same declaration as the one
under `b01` (1). What the split *does* follow exactly is the carrier page, and with it the box's
sub-pixel y phase: all fifteen cases on `about/index.html` carry phase 0.46875 at the capture
viewport against 0.015625 at the verify viewport and differ by ≤8; all nine on `contact/index.html`
carry 0.546875 against 0.390625 and differ by ≥212. That correlation is 24 out of 24 and it is
reported as a correlation — a plausible mechanism is that on one page the glyph rows realign across
the two viewports and on the other they land a device row apart, which would put the delta at the
foreground/background difference rather than at an antialiasing residue, but nothing here measured
that and it is not claimed. The scoping rule below does not depend on which mechanism it is.

So a Part B label cannot silently mean "this specimen, in every cell". It means exactly this:

- **A label is scoped to the capture viewport.** It is one person's judgement of the 1280×640
  (`laptop-720`) picture, and that is the only cell whose pixels the annotator saw. Any sentence
  quoting the Part B number carries that scope, next to the two limits already stated above (one
  annotator; that annotator is the author).
- **The comparison is still well-defined across the checker's three cells, and the thing that
  makes it well-defined is the *checker's* consistency, not the raster's.** A Part B case collapses
  to one verdict only when the instrument returned the same verdict in every cell it was measured
  in. That consensus is what the label is compared against — so the label needs to stand for one
  picture, while the verdict already stands for all three.
- **A case that ever goes cell-inconsistent is excluded from the agreement tally and named.** This
  is not a new rule; it is the accounting `run-meta-eval.js` already performs (`summarise`, the
  `bInconsistent` bucket), which prints such cases by id in the Part B block and blocks the clean
  stamp. What is new is the reason it matters here: an inconsistent case is precisely the case
  where "the label's picture" and "the instrument's verdict" could not be about the same thing.
- **On the current baseline the question is empty.** Every Part B case was cell-consistent —
  `inconsistent 0` in both the chromium and the two-engine records — so the exclusion rule has
  removed nothing from any denominator, and the Part B denominator is the full measured set.

## The 40-row cap, and why 15 blocks per page

`check-contrast.js:42` caps a cell at 40 printed rows and appends `... and N more failing nodes`
(`:335-336`). Every canary fails by design, so the cap is a real constraint on how many blocks a
page may carry:

```
worst case per page-cell = 15 canaries + 15 specimens (if every one failed)
                         +  2 named-register coverage rows + 1 base-register row
                         +  0 carrier rows, while the carrier page is green
                         = 33 rows, against a cap of 40
```

Hence **at most 15 blocks per page** — 15 + 15 + 15 + 9 across the four carriers, which is where
the 54 cases go. (Four *full* pages would be 60 slots; only 54 are used.)

**The carrier term is not always zero, and the sabotage is where it isn't.** While the contrast
gate is green on the pristine build — which the repo's receipts record at `44deb74`
(`docs/CONTROLS.md`), and which this page has not re-run — the carrier pages contribute nothing.
The `floor` control raises both floors on the whole instrument, not on the blocks, so the
carriers' own text is graded against 5.5/4.0 too. Reading the fixture's tokens (`fixture/css/site.css`)
through `meta-eval/lib/wcag.js`, two of them land under a 5.5 floor: `--ink-faint` on the light
grounds (≈5.07, ≈5.30, ≈4.64) and `--paper` on the filled `.btn` accent ground (≈4.88 — the
"lowest ratio in the system is 4.89:1" that stylesheet's own header names). Grepping the built
pages for the elements that carry them gives the sabotaged sum:

```
worst sabotaged page-cell = 15 canaries + 15 specimens + 3 register rows
                          +  2 carrier rows (the filled .btn pair on services / maintenance-plans)
                          = 35 rows, against a cap of 40
contact/index.html        =  9 + 9 + 3 + 9 (5 .small, 2 .field-hint, 2 .btn) = 30
```

Arithmetic over the stylesheet and a grep, not a browser measurement: the engine does its own
oklch conversion and the browser phase is what settles it. Which is the point of the next rule —
the sum is a design check, and the guard is what makes it non-load-bearing.

**A cell whose output carries the elision line is refused, not read.** `run-meta-eval.js` treats
it as unusable for canary accounting and says so loudly, because the rows it needs may be the
ones that were dropped. It refuses on three more things, for the same reason: a **carrier cell
that printed no failing row at all**, a failing row it cannot classify, and a `FAIL` row that is
not a page cell.

That first one is checked per scope, not off the finish tally, and the tally itself is checked
against a number that is **not zero**. `check-contrast.js:356-359` always appends one *passing*
row — the `contract registers [..., dead-selector guard NOT EVALUATED]` summary — whenever the run
measured fewer than all declared pages, which this one always does (four carriers of `site.json`'s
six), and `report.js:29` counts every row into `N/M cells OK`. So the producible finish line here
is `1/M cells OK`; a rule demanding `0/M` would refuse every correct run, the baseline included,
and with it every sabotage the baseline gates. What proves the cells were measured is instead that
**every engine × viewport × carrier appears as a `FAIL` cell** — silence for one of them is the
refusal, because silence is exactly what a passing page looks like.

**A failing row on a node that is no specimen and no canary is counted, named and printed** as an
*off-specimen row*. On a baseline run there should be none and one blocks the clean stamp; under a
declared floor remap they are expected and do not. Either way they are visible, because a carrier
going red silently is how the sum above gets overrun without anyone noticing.

## How the specimens get measured — the mechanism, and why this one

**Decision: inject into copies of the built pages, through `controls/fixture.js`.**

`checks/lib/site.js` was read first, and it settles the question. Pages are enumerated from
`site.json`, which is always read from the repo root and never from `--root` (`site.js:40-47`) —
the asymmetry is deliberate there, so a control can point `--root` at a mutated build without the
manifest drifting. The `--pages` flag *narrows* that declared set; nothing in `site.js` can *add*
a page. A site.json-level mechanism would therefore mean editing the repo's own manifest, which
would put specimen pages into every `npm test` run of the real battery. That is not a trade worth
making for a measurement harness.

What `site.js` *does* support is exactly what is needed: `--root` points the checker at any
directory, and `--pages` narrows the page set. So the meta-evaluation follows the negative
controls' precedent — `controls/fixture.js`, the copy-and-mutate builder — and:

- copies `dist/` to `meta-eval/dist/` (already covered by the `dist/` line in `.gitignore`);
- injects one markup fragment before `</body>` of each of four carrier pages, and one `<style>`
  before `</head>`;
- inherits that builder's vacuity guard: a mutation that changes zero bytes **throws**, so an
  injection whose pattern rotted cannot produce a case site with no cases in it;
- runs the checker with `--root meta-eval/dist --pages <the four carriers>`.

Three consequences worth writing down rather than discovering later:

**Register coverage is preserved.** The injected container is a plain flow child of `<body>`,
after the footer. It matches neither declared register (`.site-foot`, `.btn:not(.btn-hero)
:not(.btn-ghost)`), it overlays nothing, and it displaces nothing, so the register-coverage rows
at `check-contrast.js:329-334` still have their measured nodes. Because only four of six declared
pages are measured, the dead-selector guard prints its "NOT EVALUATED" warning — the same
warning the contrast negative control produces, for the same reason.

**`index.html` is not a carrier.** It layers a sticky hero over a 250svh pin spacer; the five
content pages are plain flow, and four of them hold the 54 blocks, filled to at most 15 a page.

**One site-specific line, and it lives in the manifest as data:** `.site-head { position: static
!important; }`. The fixture's header is `position: sticky; top: 0`, so it covers the top band of
the viewport at every scroll position, and `check-contrast.js:104-111` rejects a text rect whose
hit-test points land on something else. A block is fully inside the viewport in essentially one
scroll band, and if that band puts it under the header it is occluded in *every* band the checker
visits, so it is never measured. The canary would report that honestly, but the case would be
spent. A static header on the copies costs nothing measured — the header's own text is still
collected in the first band. The rejected alternative was lifting the specimen container above
the header with a `z-index`, which trades the specimen's occlusion for the header's and puts the
instrument's own coverage rows at risk to buy nothing.

**Why 84 px blocks are always visible somewhere.** The checker walks the page in steps of
`max(200, cellHeight - 140)` and only measures rects wholly inside the cell. A block is fully
visible when the band top falls in an interval of length `cellHeight - 84`; a band lands in that
interval whenever the interval is at least as long as the step:

| cell | step | window (`h − 84`) | covered |
|---|---|---|---|
| 320×568 (`se1`) | 428 | 484 | yes |
| 390×844 (`iphone-pro`) | 704 | 760 | yes |
| 1280×640 (`laptop-720`) | 500 | 556 | yes |

Design arithmetic, not a measurement: sub-pixel rounding and the clamped final band are what the
browser phase confirms. The canary is what would report it if this were wrong.

## Planned denominators

Every one of these is a design figure. None has been produced by a run.

| number | planned value | what it will mean |
|---|---|---|
| Part A cases | 30 | ten per text class, solid grounds, analytic truth |
| Part A cells per case | 3 per engine | `se1`, `iphone-pro`, `laptop-720` — the checker's fixed matrix |
| Part A agreement | *n* / usable, with a Wilson 95% interval | pass bar is 100%; anything less is an instrument defect |
| Part A confusion | false-pass, false-fail, never summed | direction is the finding, not the rate |
| Part A ratio delta | over failing cases only | only failing rows print a number; a passing case prints none |
| Part B cases | 24 | gradients, radial, plate, stripes |
| Part B agreement | *n* / decided, `unsure` excluded and counted | agreement with one reader, not with WCAG |
| unusable | reported separately, never folded in | canary missing, cell elided, or colour unresolvable |
| off-specimen rows | 0 on a baseline run | carrier text failing; expected only under a declared floor remap |

A case measured in several cells collapses to one verdict. If the cells disagree, that case counts
as a **disagreement** and is named: the truth does not depend on the viewport, so a case that came
out PASS in one cell and FAIL in another is wrong in at least one of them. Part B has no truth to
disagree with, so an inconsistent Part B case cannot join the agreement tally — but it is printed
by id in the Part B block rather than silently vanishing from between `measured N/24` and 24, and
it blocks the clean stamp exactly as its Part A counterpart does.

## The control — proving the agreement meter can move

`meta-eval/control-sabotage.js` damages the instrument in exactly one constant, requires the
unsabotaged baseline to be **clean** before anything is credited, and requires the meter to move
by a **predicted** amount. It follows `controls/fixture.js`'s rule at the level of source: if the
find-string does not occur exactly once, it throws rather than damaging nothing or damaging more
than it names. The copy lives at `checks/.check-contrast.sabotaged.js` — it must sit in `checks/`
because `checks/lib/site.js` derives the repo root from its own directory — and is removed in a
`finally`.

**`floor` (the default).** `const floor = n.large ? 3.0 : 4.5;` becomes `4.0 : 5.5`. Every Part A
specimen whose analytic ratio lies between its real floor and the raised one must flip PASS →
FAIL. The predicted set is computed from `cases.json` **before the run** — nine cases, all in the
false-fail direction — and the control requires the observed disagreement set to *equal* it. A
drop of about the right size is not evidence; a drop naming the right nine cases is.

This sabotage is at war with one of `run-meta-eval.js`'s own integrity checks unless the war is
declared, and declaring it is the design. The runner cross-checks the floor printed in **every**
specimen row against the manifest — a specimen graded against a floor nobody authored is a
specimen the run cannot read — and a raised-floor instrument fails that check on every row it
prints. So the control passes the sabotaged child `--sabotage-floors 3=4,4.5=5.5`: the exact
remap it performed, on the command line, recorded in the JSON, derived from the same object the
prediction is derived from so the two cannot drift. Under that declaration the check expects the
raised floor and **stays armed against every floor the declaration does not name**. The baseline
child is given no declaration at all, so its check is the unmodified one — which is what makes
the baseline's cleanliness worth anything.

The same raise makes the carriers' own faint text fail (the sum two sections up). Those arrive as
off-specimen rows: counted and printed, not refused, and not folded into any tally. On the
baseline a single one of them fails the clean gate.

**`worst-decile`.** `WORST_DECILE` 0.10 → 0.90. This was the sabotage the meta-evaluation was
first specified with, and on Part A it provably cannot do anything: a solid ground makes every
background sample the same pixel, so p10 and p90 are the same number. That is the same argument
that makes 100% the Part A pass bar, which turns this variant into a pre-registered test of the
argument itself:

- Part A verdicts must be **identical** to the baseline. If they move, the solid-ground claim on
  this page is wrong, and the control has found a defect in the *evaluation*, not the instrument.
- At least one Part B verdict must move, since a gradient is where a decile means anything.

Both are kept. The first is what arms the Part A meter; the second is what keeps this page
honest about its own reasoning.

## What this cannot see

- **A shared misreading of WCAG.** Both implementations follow the same specification (above).
- **Anything about the other six checkers.** This evaluates one instrument's colour verdicts.
- **Passing cases in numbers.** The instrument prints failing rows only, so for a passing
  specimen the evaluation learns "at or above the floor" and no ratio. Part A agreement is
  therefore a *verdict*-agreement rate, and the ratio delta covers the failing half only.
- **The printed ratio is rounded to two decimals; the decision is not.** `check-contrast.js:323`
  compares the raw float and `:324` prints `toFixed(2)`, so a node at 4.4996 prints `4.50:1 <
  4.5` and is correctly failed. The parser therefore reads verdicts from the *presence* of a row,
  never by re-deriving them from the printed number.
- **Screenshot round-trip fidelity.** Part A assumes a `#767676` ground reads back as
  (118,118,118) in the raw pixels `sharp` hands the checker. If colour management shifts it, Part
  A agreement will fall — and that fall would be a finding about the instrument's pixel path, not
  noise to be tuned away.
- **Font substitution.** The specimens use a system stack. Generation asserts each string fits
  its ground under a deliberately generous 0.62em average advance, but the browser phase is what
  confirms every block renders on one line in both engines.
- **Correlated observations.** Three cells and two engines per case are not independent samples of
  a case; they are the same specimen measured repeatedly. The Wilson interval is computed over
  cases, not over cell-observations, so the denominator cannot be inflated by the matrix.

## Running it

Browserless, and true today:

```
node meta-eval/lib/wcag.js --self-test          # three hand-checkable anchors, the large-text rule
node meta-eval/lib/stats.js --self-test         # Wilson anchors with their derivation, confusion counts
node meta-eval/gen-cases.js                     # cases.json + specimens.css + one fragment per carrier
node meta-eval/gen-labeling-sheet.js            # labeling/sheet.html; placeholders until screenshots exist
node meta-eval/run-meta-eval.js --self-test     # the parser and the accounting rule, on hand-written rows
node meta-eval/control-sabotage.js --dry-run    # the one-replacement guard, no browser
```

Needs a browser (*corrected 2026-09-01: this block used to say "and has never been run"*):

```
npm run build
node meta-eval/run-meta-eval.js --engines chromium --json meta-eval/runs/baseline-chromium.json
node meta-eval/capture-shots.js                 # Part B shots + the viewport-independence check
node meta-eval/gen-labeling-sheet.js            # re-run once the shots exist, to replace placeholders
node meta-eval/control-sabotage.js --engines chromium
```

`--engines` is forwarded to both nested runs by the control; without it they take
`run-meta-eval.js`'s own default, which is both engines. `--sabotage-floors` is set by the control
for its sabotaged child and is not a flag to pass by hand — a run that declares a remap the
instrument did not perform disarms a check for nothing.

Before the first browser run, three things were owed to the repo: a `.gitignore` line for
`checks/.check-contrast.sabotaged.js` (the sabotage copy is removed in a `finally`, but a crash
between write and unlink should not be able to stage a damaged instrument); the screenshot step
that fills `meta-eval/labeling/shots/<id>.png` for Part B; and a decision about where `--json`
records live — like a battery record, committing one is a human decision and nothing here commits
anything.

*As of 2026-09-01* the first two exist — the ignore line, and `meta-eval/capture-shots.js`. The
third is still open, and what a browser run added to it is a **collision nobody chose**: the
existing `dist/` rule already covers `meta-eval/dist/`, which is right, and the existing `shots/`
rule already covers `meta-eval/labeling/shots/` — which is an accident. `sheet.html` is not
ignored and the 24 PNGs it `<img>`s are, so committing the tree as it stands publishes a labelling
sheet with twenty-four broken images: worse than committing both, and worse than committing
neither. Whoever settles where records live settles this with it. `meta-eval/runs/*.json` is not
ignored by anything; note that the repo's `runs/**/*.stdout.txt` transcript rule is anchored at
the root and does **not** reach `meta-eval/runs/`, so a transcript saved there would commit.
