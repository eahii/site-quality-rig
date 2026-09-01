# site-quality-rig

Seven checkers that assert a *built* static site meets an explicit, per-project contract — link
integrity, viewport overflow and tap targets, contrast measured over actually-painted pixels,
reduced-motion and JS-off degradation, content hardening, hero geometry, and what a deployed
origin answers — across two browser engines and up to twelve viewport cells. Each checker also
ships a **negative control**: a copy of the build with one defect injected, and a recorded run in
which that checker went red because of it, because a gate that has never gone red and a gate that
*cannot* go red produce identical output.

**Reading this.** The results table below is the whole claim. `Quickstart` reproduces it in two
commands. `What this does not catch` is where the limits are, and it is deliberately longer than
the results. Long-form receipts — run-by-run forensics, control transcripts, the independent
review — live in [`docs/`](docs/).

## Results

`npm run build && npm test`, run 2026-08-29 at `sha=44deb74` on this repo's own fixture site,
against a clean tree — node v22.22.2, playwright 1.62.1, chromium + webkit, 536 s wall.

| checker | cells OK | how that denominator is built |
|---|---|---|
| links | 231 / 231 | 6 declared-page parity rows + 7 built-file parity rows + 204 internal reference rows + 7 `h1` rows + 7 empty-heading rows. Static: no browser, no engine dimension. |
| viewports | 144 / 144 | 2 engines x 12 viewport cells (320x568 to 2560x1440) x 6 pages. |
| contrast | 37 / 37 | 2 engines x 3 cells (320x568, 390x844, 1280x640) x 6 pages = 36, plus 1 run-level register-coverage row. |
| motion | 144 / 144 | 2 engines x 3 cells x 6 pages x 4 rows (reduced-motion, reveal-coverage, scripts-removed, js-disabled). |
| harden | 288 / 288 | 2 engines x 4 cells (320x568, 390x844, 1280x640, 1440x900) x 6 pages x 6 rows (baseline, longest-content, and N+1 / N-1 for each of 2 declared grids). |
| hero | 16 / 16 | 2 engines x 2 cells (390x844, 1280x800) x 4 rows (frame-1 centreline, frame-1 ground contact, end-state, reduced-motion). |
| deploy | 9 / 9 | 6 page probes + 3 form probes against one running origin. |
| **battery** | **869 / 869** | the seven above, summed. 7 of 7 checkers PASS. |


Every checker prints its own denominator and its own `sha=` stamp; the summary table is rebuilt
from those stamps, so it structurally cannot report a number a checker did not print. The same 869
cells have come back from six full runs — five on the author's machine, one on a GitHub runner —
and one of those was an independent reviewer's fresh clone, whose pass also found things wrong
here. Both halves of that are in [`docs/VERIFICATION.md`](docs/VERIFICATION.md); the run-by-run
forensics, including what changed between runs and why it could not move a number, are in
[`docs/EVIDENCE.md`](docs/EVIDENCE.md).

**CI runs, and both outcomes are linkable.** Both workflows in `.github/workflows/` executed for
the first time on 2026-08-29 — `ci.yml` on pushes, `full-battery.yml` by manual dispatch; until
that date this section said no workflow here had ever run anywhere, which was true and was the
largest single hole in this repo's evidence. Every run below is on a GitHub `ubuntu-24.04` runner
under node v20.20.2 — not the author's v22.22.2, which is the point of pinning 20 in the workflows.
For runs after this commit, read the
[run history](https://github.com/eahii/site-quality-rig/actions) rather than this paragraph.

| run | branch | commit | outcome | job | what it proves |
|---|---|---|---|---|---|
| [33256643910](https://github.com/eahii/site-quality-rig/actions/runs/33256643910) | `main` | `44deb74` | **green** | 449 s | battery 7/7 PASS, 555 cells; controls **7/7 fired** — the same tree the receipts above are stamped at |
| [33257439952](https://github.com/eahii/site-quality-rig/actions/runs/33257439952) | `demo/failing-gate` | `264f7bb` | **red** | 329 s | battery **6/7** — `contrast FAIL 1/19`, 54 rows, on a defect committed on purpose |
| [33258911560](https://github.com/eahii/site-quality-rig/actions/runs/33258911560) | `main` | `85aedbe` | **green** | 670 s | `full-battery.yml`'s first execution ever — battery 7/7 PASS, **869 cells across both engines** in 598 s: the two-engine denominator reproduced off the author's machine |



**One run is one sample, and whether the battery repeats itself is its own measurement.** Made
2026-09-01 at `sha=eb1d063` on the author's machine, otherwise idle: ten consecutive
build-plus-battery runs, chromium, every run compared to the first — **0 flips across 189
checker-field comparisons** (7 checkers x 3 fields x 9 comparisons), all ten runs 7/7 PASS at
555/555 cells, 276–277 s each. A flip is a checker changing its verdict, its ok/total or its exit
code over the same source; a passing cell drifting inside its threshold is invisible to this
measurement, and the header of `scripts/measure-repeatability.js` enumerates what else it cannot
see. The series' records are committed under [`runs/`](runs/), beside a recorded two-engine run of
the same tree (869/869, 558 s). Any run leaves such a record with `npm test -- --record`;
`node scripts/compare-runs.js <a.json> <b.json>` diffs two records — or refuses when they measured
different things — and its own six-leg self-test runs in CI on every push.

**Negative controls: 7 of 7 fired**, re-run 2026-08-29 at `sha=44deb74` on a clean tree, chromium,
102 s. The receipts are pasted verbatim, exit codes included, into
[`docs/CONTROLS.md`](docs/CONTROLS.md): per control the defect, the mechanism it was derived from,
the baseline exit code and the mutated exit code. Command: `npm run build && npm run test:controls`.
Earlier captures of the same suite: 7 of 7 at `f94132d` and again at `611824e` in 101 s on this
machine, and 7 of 7 in 103 s on the independent reviewer's own clone and install on 2026-08-29.

## Quickstart

```
npm install && npx playwright install chromium webkit
npm run build && npm test            # the battery, both engines — 869 cells, 536 s above
npm run test:controls                # the seven injected defects, chromium — 102 s, same machine
```

No API key. No network at runtime: the fixture is served from an ephemeral local port, and
external URLs are noted rather than fetched. Every argument is forwarded to every checker, so
`npm test -- --engines chromium` narrows the whole battery to one engine — 555 cells, and 7 of 7
PASS every time it has been run: 260 s at `611824e` and 261 s at `66b480d` on this machine, 289 s
on the CI runner at `44deb74`. That one-engine run is what `.github/workflows/ci.yml` executes on
every push to `main` and to `demo/failing-gate`, followed by the control suite on `main` only; the
green and red runs it has produced are linked above.

## The checks

Every site-specific selector, tolerance and literal lives in `contracts/`, never inside a checker
— an instrument carrying one site's idea of what a hero is stops being identity-neutral. A check
that cannot find its element **fails** with `MISSING SELECTOR` rather than skipping, because
"nothing measured" and "everything fine" look identical in a summary line and only one of them is
true. A skip exists only where a contract declares one.

- **links** (`checks/check-links.js`) — every internal `href`/`src` resolves to a real *file* in
  the build, every `#fragment` to a real `id`, `site.json` and the build agree in both directions,
  exactly one non-empty `h1` per page. The threshold is zero, because a dead internal reference is
  not a judgement call: the build is the entire population, and the file is either in it or it is
  not.
- **viewports** (`checks/measure-viewports.js`) — zero horizontal overflow
  (`documentElement.scrollWidth` must not exceed the viewport, and the unclipped offenders are
  named rather than counted), interactive targets at least 44x44 CSS px on the five mobile cells,
  heading outline, accessible names, and the first view composed exactly as
  `contracts/fold-contract.json` declares. 44px is WCAG 2.5.5's target-size figure, compared in
  *whole* CSS pixels because WebKit holds layout rects as float32 and a genuine 44px control far
  down the document measures 43.999755859375. The matrix runs to 2560px wide because a matrix that
  stops at 1920 structurally cannot see a defect whose own threshold is 1920.
- **contrast** (`checks/check-contrast.js`) — every rendered text node, graded against the
  background *actually painted under it*: the page is screenshotted with every glyph made
  transparent, and the reported ratio is the 10th-percentile pixel inside the text's own rect.
  Floors are 4.5:1, or 3.0:1 at >=24px or >=18.66px bold, which are WCAG AA's normal and
  large-text minimums. The worst decile rather than the mean, because a mean passes text laid over
  a bright patch of a dark surface.
- **motion** (`checks/check-motion.js`) — three degradation paths. Under
  `prefers-reduced-motion: reduce`: every rendered interactive element's `transitionDuration` is
  `0s`, no keyframe animation is running, `scroll-behavior:smooth` is off, and nothing sits at
  effective opacity 0. With the site's scripts stripped: nothing is left unpainted. With JS
  genuinely disabled: the first view's greyscale standard deviation must exceed 3. `0s` rather
  than "shorter", because `reduce` is a request to stop, not to hurry; a pixel threshold in the
  JS-off leg because no assertion can run inside that page, so a screenshot that is not a flat
  plate is the only evidence available.
- **harden** (`checks/check-harden.js`) — the longest string the fixture's own copy already puts
  in each declared slot is injected into *every* instance of that slot, and each declared grid is
  re-run at N+1 and N-1 items; after every mutation the invariants content length can break are
  re-asserted — zero overflow, no text spilling its box, no text clipped by a hidden-overflow box,
  and the declared fold edge still holding. Longest-*real* rather than lorem, because a design
  drawn with the shortest label never meets the longest one, and a synthetic worst case fails for
  reasons no content will ever produce.
- **hero** (`checks/check-hero.js`) — the pinned scene as geometry, against
  `contracts/hero-contract.json`: the rail, the moving frame and its tip share one vertical centre
  within 0.5px; the tip's bottom edge meets the ground's top edge within 2px and agrees with an
  independent second expression of the same ground line; at the end of a scrub distance *derived
  from the pin spacer's own geometry* rather than copied from the site's script, the readout reads
  the authored literal, the reveal element is at opacity >= 0.9, and the scene is still in frame;
  under `reduce` the scrub is off rather than slower, probed by scrolling into the scrub range and
  requiring that nothing moved. 0.5px because the spread measured 0.000px at all 28 engine-cell
  combinations of a 14-cell probe on 2026-08-29 in chromium and webkit, so the tolerance is
  subpixel-only and a real regression clears it by an order of magnitude. That probe is an ad-hoc
  script, *not* one this repo ships — `contracts/hero-contract.json`'s `_cells_note` states its
  method and the command that re-runs the checker itself over the same 14 cells.
- **deploy** (`checks/check-deploy.js`) — against a *running origin*, per declared page: HTTP 200,
  every response header `contracts/deploy-contract.json` declares at its declared value, the
  in-body `<meta name="robots">` the contract declares, and served bytes equal to the local built
  file. Then three POSTs at the declared endpoint: a valid one accepted, one missing a required
  field rejected 400 *server-side*, one with the honeypot filled accepted silently. Byte drift is
  a loud note by default and a failing row only under `--require-current`, because a deployed
  origin is routinely older than the local build while work is in flight, and an instrument that
  fails on honest drift teaches people to stop running it.

## What it has actually caught

Three kinds of evidence, in descending order of how much they prove:

1. **Seven injected defects, each proven to fire** — the negative controls, below.
2. **Three library defects the gates caught during construction** — real bugs in this harness,
   found by running it. Detail in [`docs/EVIDENCE.md`](docs/EVIDENCE.md).
3. **Nine defects an adversarial audit found in the claims** — every one in the annotation layer,
   not the code. That count cannot be re-derived from this repo, and the reasons are written down
   in [`docs/EVIDENCE.md`](docs/EVIDENCE.md).

### Seven injected defects, each proven to fire

Each control copies the build, injects one targeted defect, and requires the matching checker to
report it. Reproduce all seven with `npm run build && npm run test:controls`; the verbatim output
of the run that caught each is in [`docs/CONTROLS.md`](docs/CONTROLS.md).

| control | defect injected | what went red |
|---|---|---|
| links | a declared directory removed; four bad elements appended to one page | 29 rows: 1 page-parity + 25 dead links + 1 dead anchor + 1 `href="#"` + 1 second `h1` |
| viewports | a `150vw` in-flow block; the contact affordance shrunk to 20x20 | document scroll width, the named unclipped offender, the tap-target row |
| harden | `nowrap` on three stat labels; a grid forced to fixed 290px columns | 10 of 36 cells, including `grid process-steps N+1` while `N-1` stayed green |
| motion | a 2s `!important` animation on the hero heading; the reveal class forced to `opacity:0` | 6 of 12 cells: the animation still running under `reduce`, and 54 unpainted elements |
| contrast | the hero heading recoloured to near-white over a near-white ground | 3 of 4 cells, at 1.11:1 against the 3.0 floor |
| hero | `.car-tip{margin-left:-8px}` | 3 of 4 rows: centreline spread 8.00px against a 0.5px tolerance |
| deploy | a page removed, a `robots` meta stripped, headers dropped, the endpoint dead | 9 of 9 cells, with byte drift on the two mutated pages |

What makes those reds mean anything is the discipline around them. Before every mutated run the
**same checker runs with identical arguments against the pristine build and must exit 0**, so a
checker that was red anyway cannot be credited with catching something. Each control also carries
verbatim fragments of the checker's real failing row, so a red *for the wrong reason* counts as a
failed control. The fixture builder throws when a mutation changes zero bytes or a removal finds
nothing; a child that dies on a signal is reported as `CRASHED (infrastructure)`, never as a
verdict about the gate.


## What this does not catch

**The contracts were measured from the fixture this repo ships.**
`contracts/fold-contract.json` says so in its own header: *"Every number below was measured on the
built fixture."* The same author wrote the site and derived the contract from it, so `869 / 869` is
in significant part self-fulfilling — it says the fixture still matches the shape it had when the
numbers were taken, not that the shape was independently right. Two things partly offset it and
neither closes it. The negative controls inject defects the contract did not anticipate, and a
checker still has to turn red on them, which is not something a fixture can satisfy by
construction. And on 2026-08-29 an outside reviewer, working from a clone with no access to how
this was built, injected two defects this repo had never seen — a dead link plus a second `<h1>`,
and a lede colour taken off the measured palette — and both were caught with the right rows named.
Pointed at a site whose contract was written *before* the build, this battery would be answering a
harder question than the one it answers here.

**Most of this battery's own assertions have never been observed firing.** Seven controls fire
seven checkers, which is a much smaller claim than "the checkers work", and
[`docs/CONTROLS.md`](docs/CONTROLS.md) counts the gap rather than gesturing at it. Re-run at
`44deb74` on 2026-08-29 against the control log described there — and printing the same three
numbers it printed at `f94132d` — `scripts/count-emit-sites.js` counts **179 failure-emit sites**
in `checks/` — the places that can put a line inside a failing row — of which 143 carry a probeable
literal prefix. Hand-checking the
script's matches against the run log, and adding the printed messages the script structurally
cannot see, gives **25 source locations observed authoring a printed failure line, against a
population of at least 182: about one in seven**. Both halves of that ratio are approximate, and
that file states in which direction each errs. The at-least-157 never observed firing are grouped
there into 17 named families with line numbers — the whole nav-toggle family, hero pin discovery,
most of hero's end-state sub-assertions, contrast register coverage, and 14 branches that guard a
malformed *contract* rather than a broken site and would need a broken-contract fixture this repo
does not have. That table is by family and is not the site-by-site list; the site-by-site list is
what `count-emit-sites.js` prints under *not printed by that run* when it is handed a control log.
Running the battery *walks* far more code than 25 sites; walking an assertion is not firing it.

Beyond that coverage count, these are holes in the instruments themselves:

- **Contrast skips text that does not fit the viewport.** The rect filter keeps only text rects
  wholly inside the cell, so a heading taller or wider than the viewport is never graded — a
  coverage limit, not a pass. The checker's own header says so.
- **In `--local` mode the deploy checker's byte-identity assertion is near-vacuous**: the server is
  serving the very directory the bytes are compared against, so it can only fail if the response is
  corrupted in flight. The checker prints that caveat on every `--local` run. Its only real
  evidence is the negative control, which serves a *mutated* copy on an ephemeral port.
- **The deploy checker does not follow redirects** (`redirect: 'manual'`), so a host that 301s a
  clean URL to its canonical form fails the 200 assertion. That is deliberate — following a
  redirect lets an origin answer for a URL other than the one declared — but it means a
  legitimately redirecting origin has to be probed at its final host.
- **The `sha=` in every stamp is `git rev-parse HEAD` and nothing else** (`checks/lib/report.js:6-9`).
  It degrades to `no-git` in a tarball checkout with no `.git` directory unless `GIT_SHA` is set,
  and a receipt whose as-of reads `no-git` cannot be re-checked later. It also says nothing about
  whether the working tree was clean: a run over uncommitted edits stamps the last commit, so a
  stamp identifies the commit a run was *near*, not the bytes it measured. The receipt in
  [`docs/VERIFICATION.md`](docs/VERIFICATION.md) is a worked example — it stamps a sha that is not
  the tree it measured, and says so.
- **This measures a built directory belonging to this repo.** `site.json` and `contracts/` are
  always read from the repo root by design, which is what lets `--root` point at a mutated copy
  while the policy stays pinned. Pointing the rig at an unrelated external site is out of scope:
  that site needs its own manifest and its own contracts, which is a port, not a flag.
- **Width-sensitive assertions are engine-sensitive, and nothing here normalises that.** On this
  fixture's system sans stack at 1280x800, the same strings measure 15.9%-17.4% narrower in WebKit
  than in Chromium (`.stat-label` 280.84 -> 234.84px, the hero `h1` 965.02 -> 797.31px), while the
  monospace elements agree to within 0.01% — measured 2026-08-27 with an ad-hoc Range-rect probe
  over both engines, *not* a script in this repo, and on a build whose hero heading has been
  reworded since, so the `h1` pair is an as-of for `611824e` rather than a figure a clone
  re-derives. The same class of problem is *recorded* at
  `checks/measure-viewports.js:123-127`: before tap targets were compared in whole CSS pixels,
  WebKit's float32 layout rects made a genuine 44px control measure 43.999755859375, and the row
  went red in 6 of 12 identical runs. That is a comment, not a receipt. The runs it describes were
  made while this rig was being extracted and **no log, artifact or commit in this repo witnesses
  them**; what is checkable here is the rounding it justifies, which is three lines below it in the
  code. Treat the 6-of-12 as provenance for a design decision, not as a measurement this repo can
  hand you.
- **Whole families of quality are simply out of scope**: performance and Core Web Vitals, SEO past
  a `robots` mechanism, ARIA correctness, form-label association, landmark semantics, keyboard-trap
  detection, colour-vision simulation, and anything that requires a real user.

**Setup cost, honestly.** No API key and no network at runtime, but getting there needs `npm
install` plus `npx playwright install`, and `sharp` is a native dependency that resolves a prebuilt
binary per platform. The engines are the bulk of it: at the pinned playwright 1.62.1 on linux-x64,
`npx playwright install chromium webkit` leaves **941 MB on disk** — chromium 388 MB, its headless
shell 261 MB, webkit 292 MB, measured with `du --apparent-size` on 2026-08-29; chromium alone is
649 MB of that. The *download* is compressed and is not that number, and I have not measured it.
Every developer machine this has run on had warm npm and browser caches. The one cold two-engine
install with a figure attached is a runner's: in run 33258911560 the cache key had never been
populated and `npx playwright install --with-deps chromium webkit` took 52 s end to end, apt work
included — GitHub's network and GitHub's mirrors, which bounds nothing for a clone at home. So
first-run wall time for a stranger is still unmeasured here. "Clone and run" is a download first.

**What an outsider found wrong.** The section you have just read is the author's own account of the
limits, which is the least trustworthy kind. [`docs/VERIFICATION.md`](docs/VERIFICATION.md) is the
other kind: a reviewer who saw only the brief and the repo graded it against its acceptance
criteria, marked one of the seven unmet and two partial, and found unlabelled claims on this page —
including one of the exact defect class this repo boasts about having purged. That file lists every
finding, which ones were fixed, which were accepted unfixed and why, and what nobody has checked at
all.

## Why not Lighthouse, axe or pa11y alone

Those tools test a page against a *general* standard. This tests a build against *this project's
written-down contract*: where the hero's moving element sits relative to the line it travels on,
what the first view is composed of in each breakpoint band, which response headers the deployed
origin owes, and what happens when the longest string the site's own copy contains lands in the
shortest slot the design was drawn with. No general tool knows any of that, because none of it is a
general fact — it lives in `contracts/`, and pointing the rig at a different site means replacing
those files rather than editing a checker.

Two of the differences are mechanical rather than philosophical. axe and pa11y compute contrast by
walking up the tree to the nearest opaque `background-color`; over a gradient, a photograph or a
translucent plate, that answer is a fabrication, and here the background is read from a screenshot
of the page with every glyph made transparent and graded at the 10th-percentile pixel. And a
Lighthouse run scores one URL, once, in one engine, at one viewport, where this walks six pages
across twelve viewport cells in two engines.

**Where those tools do fit, and this does not replace them.** axe and pa11y implement whole rule
families this repo does not implement at all — ARIA misuse, form-label association, landmark and
heading semantics past the `h1` count, name/role/value. Lighthouse gives performance, Core Web
Vitals and a best-practices sweep, none of which anything here measures. Run them. Run this as
well. They answer *"does this page violate a known rule"*. This answers *"is this build the thing
we specified"*, and those are different questions with different failure modes.

## How this was built

Most of the code here was generated by a language model, working to a specification I wrote and
under constraints I set: every checker reads its selectors, tolerances and literals from a contract
file rather than holding them; a check that cannot find its element fails rather than skips; every
verdict carries an as-of stamp.

The verification is the part worth judging, because model-generated code that runs is not the same
as model-generated code that is right. The battery only proves it executes. What makes it evidence
is the control layer: baseline-green on the pristine build with identical arguments before any red
is credited, per-control expected substrings so a red for the wrong reason fails the control, a
fixture builder that throws on a zero-byte mutation, and infrastructure crashes reported as crashes
rather than as verdicts.

An independent adversarial pass with no access to the build reasoning then tamper-tested that
layer — neutralised injections, an already-red baseline, a falsified substring — and the harness
rejected all three. The same pass reported nine defects, every one in the annotation layer rather
than the mechanics: comments and docs claiming more than the runs showed. They were fixed across
`f94132d` and `60863e4`, whose twelve bullets do not map one-to-one onto that nine — the section
above says why, and why the count is the audit's rather than this repo's.

## License

MIT — see [`LICENSE`](LICENSE).
