# site-quality-rig

Seven checkers that assert a *built* static site meets an explicit, per-project contract — link
integrity, viewport overflow and tap targets, contrast measured over actually-painted pixels,
reduced-motion and JS-off degradation, content hardening, hero geometry, and what a deployed
origin answers — across two browser engines and up to twelve viewport cells. Each checker also
ships a **negative control**: a copy of the build with one defect injected, and a recorded run in
which that checker went red because of it, because a gate that has never gone red and a gate that
*cannot* go red produce identical output.

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
cells have now come back from four full runs: two on 2026-08-27 at `60863e4` and `611824e`, whose
only difference is two files under `.github/`; one on 2026-08-29 from a reviewer with no access to
how this repo was built, on a fresh clone outside the project with a from-scratch install, 524 s;
and the one stamped above, 536 s. That reviewer's pass also found things wrong here, and both
halves of it are written down in [`docs/VERIFICATION.md`](docs/VERIFICATION.md).

Twelve source files changed between `611824e` and the run above. Five are annotation only:
`checks/check-hero.js` and `checks/lib/site.js` are comment text (historical claims relabelled as
provenance after the review); `contracts/hero-contract.json` and `contracts/harness-slots.json`
changed only in their `_`-prefixed note strings, which no checker reads (`grep -rn '_note' checks/
scripts/` prints nothing); and `controls/run-controls.js` had one `defect:` label reworded, a
string printed in a control's banner line and in no assertion. The other seven are the fixture's
own pages, edited on 2026-08-29 so that one fictional company reads as one place — the telephone
number moved into `01632 96xxxx`, the range Ofcom reserves for fiction and drama, the plan prices
to the currency that goes with it, one invented staff surname replaced, and the hero heading
changed from "Elevators that stay in service." to "Lifts that stay in service." on a site that says
*lift* everywhere else.

The argument at the time was that none of that could move a number. It was an argument, and it was
wrong once already — the hero heading was also an assertion input in `controls/run-controls.js`,
which broke the contrast control silently until CI caught it (below). So the argument has been
replaced with a measurement: the table above and the control receipts in
[`docs/CONTROLS.md`](docs/CONTROLS.md) were both re-taken at `44deb74` on a clean tree. **No cell
count moved** — 869 in the battery, and every per-control baseline and mutated count identical to
the previous capture. Three things in the control receipts did move, and all three are in the file:
every `sha=` stamp, the hero heading quoted on three of the contrast rows, and two byte-length
figures in the deploy receipt, because the fixture pages that control mutates are a few bytes
longer than they were.

```
git diff --stat 44deb74..HEAD -- checks controls contracts fixture scripts site.json package-lock.json
```

That command prints nothing as this is written: the only commit between `44deb74` and this sentence
is the one that writes these numbers down. If it prints a file, the numbers above are older than
the code they claim to describe.

**CI runs, and both outcomes are linkable.** `ci.yml` executed for the first time on 2026-08-29;
until that date this section said no workflow here had ever run anywhere, which was true and was
the largest single hole in this repo's evidence. Every run below is on a GitHub `ubuntu-24.04`
runner under node v20.20.2 — not the author's v22.22.2, which is the point of pinning 20 in the
workflow. For runs after this commit, read the
[run history](https://github.com/eahii/site-quality-rig/actions) rather than this paragraph.

| run | branch | commit | outcome | job | what it proves |
|---|---|---|---|---|---|
| [33256643910](https://github.com/eahii/site-quality-rig/actions/runs/33256643910) | `main` | `44deb74` | **green** | 449 s | battery 7/7 PASS, 555 cells; controls **7/7 fired** — the same tree the receipts above are stamped at |
| [33257439952](https://github.com/eahii/site-quality-rig/actions/runs/33257439952) | `demo/failing-gate` | `264f7bb` | **red** | 329 s | battery **6/7** — `contrast FAIL 1/19`, 54 rows, on a defect committed on purpose |

**The red run is the point of the second row, and it is a branch rather than an accident.**
`demo/failing-gate` is `44deb74` plus one commit changing one declaration in `fixture/css/site.css`
— the lede's colour taken off the measured palette and written as a one-off grey, the shape a
"soften the intro paragraph" tweak really has. It renders as an unremarkable light grey; nothing
about the page looks wrong. `checks/check-contrast.js` never reads the declaration: it screenshots
the page with every glyph made transparent, reads the background actually painted under each text
rect, and grades the worst decile of those pixels. The run prints 54 such rows, across six pages
and three viewport cells:

```
FAIL  chromium se1 index.html [132 nodes (base:115 footer-inverse:16 filled-control:1), 30 unpainted, 0 unresolvable]
        2.75:1 < 4.5 (min 2.75, 16px/400) #hero>div.hero-inner>div.hero-copy>p.lede "Planned maintenance, repair and modernis"
[17 more red cells carrying 53 more rows of the same shape, and the other six checkers' output]
battery: 6/7 checkers PASS — FAIL (contrast)
```

2.75:1 on the page ground and 2.54:1 on the sunk slabs, against the 4.5:1 floor WCAG AA sets for
text at this size and weight. One cause, one red checker: the other six passed in the same run, so
the log names the gate that caught it instead of going red everywhere at once. The commit message
on that branch and a comment beside the declaration both say it is deliberate, what the defect is,
and which gate catches it.

The negative-control step is skipped on that branch by `ci.yml`, and that is the baseline rule
working rather than an exemption — a control credits a checker's red on a mutated copy only after
the same checker exits 0 on the pristine build, and on a deliberately broken fixture no baseline
can be green. The branch is a permanent artifact; the run's screenshot bundle is not,
`retention-days: 7` in the workflow.

**A third run is worth more than either, because nobody arranged it.** The very first CI execution
this project ever had, [33255193219](https://github.com/eahii/site-quality-rig/actions/runs/33255193219)
at `f25a18e`, went red on `6/7 controls fired — 1 control(s) failed to fail: contrast (wrong
failing line)`. The contrast control asserted a hero heading the fixture had stopped carrying, so
the checker still went red on the injected defect but the harness could no longer confirm it went
red *for that defect* — the exact distinction the control layer exists to draw, and a gate that had
been unable to fire since the rewording. Reproduced locally at `f25a18e` before it was fixed, so it
was a repo defect and not a runner difference; fixed in `62d9804`; the reasoning that let it
through is corrected in [`docs/CONTROLS.md`](docs/CONTROLS.md). **The first CI execution this
project ever had found a gate that had quietly stopped working**, which is the argument this repo
exists to make, arriving at the repo's own expense.

**One limit on all three links.** The repository is **private** as this is written, so the URLs are
404 to anyone without access; they become checkable when it is made public.

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

### Three library defects the gates caught during construction

All three surfaced while wiring the checkers to the fixture, and all three are recorded in the
commit that fixed them: `git show 9971ea8`.

- **`checks/lib/static.js` resolved a link to a directory.** `resolveToDistFile()` accepted a bare
  directory as a resolution hit, because `fs.existsSync()` is true for one. `/services` therefore
  "resolved" to the `dist/services` directory: a link written without a trailing slash passed the
  dead-link test against a path no static host serves, and the anchor lookup — keyed by file —
  then missed and would have reported every fragment on that page as dead. It was found because
  the links gate went red on the real fixture. Fixed by requiring `fs.statSync(abs).isFile()`; the
  guard and its reason are at `checks/lib/static.js:213-220`.
- **`checks/lib/site.js` stamped an unusable `root=`.** Four checkers derived that stamp from the
  directory's basename, and every built site directory is called `dist` — so a negative control
  pointed at a mutated copy stamped the same word as a main run, leaving the receipt unable to say
  which build it measured. Fixed with `rootLabel()`.
- **`checks/lib/serve.js` could not render the 404 page.** A miss answered with a bare status
  rather than the site's own `404.html` made the built 404 the one page in the site no check could
  ever see. Fixed by serving it at status 404.

A fourth, found later: `--wip` had shipped with three different stamping behaviours across five
checkers (`git show 55f43ae`). Three stamped `wip=NOT-GREEN` whenever the flag was passed, one
only if a page was actually downgraded, one only on an early return — so a permissive run was
indistinguishable from a strict one on the days nothing happened to be missing, which is the exact
question that stamp is read to answer.

### Nine defects an adversarial audit found in this harness

A pass with no access to the build reasoning tamper-tested the control layer — it neutralised the
injections, pointed a control at an already-red baseline, and falsified an expected substring, and
the harness rejected all three — and then went after the *claims*. It found nine defects, every one
in the annotation layer: comments and documentation asserting more than the runs showed. Among
them: a receipt stamped with a sha it had not been run at; a control comment claiming the
unresolvable-colour branch was demonstrated, when every cell reports `0 unresolvable` and that
branch never executes; a checker citing "a negative control proved it" for a control this repo does
not contain; and an "assertions not armed" table that read as exhaustive while covering a small
fraction of the never-fired assertions. All nine were fixed in `f94132d` and `60863e4` — read both
commit bodies with `git show f94132d 60863e4`.

**Nine is the audit's own count, and it cannot be re-derived from this repo.** The audit's
worksheet is not here; those two commits are, and what a reader can actually count in them is
twelve bullets — five in `f94132d`, seven in `60863e4`. Twelve is not nine renumbered. Four of
`60863e4`'s bullets are consequences of one decision, re-capturing every receipt verbatim, and two
of `f94132d`'s are hardening the findings prompted rather than findings themselves:
`scripts/count-emit-sites.js`, which turned a reading into a re-runnable census, and the rule that
a control's expected fragments must co-occur on one printed line. Which bullet closes which
finding is not recoverable here, so count the bullets and judge those rather than the headline.

*Provenance, not evidence:* the hero geometry contract exists because a hero in a private project
of my own shipped with its moving element a few pixels off the line it travels on, while every
other gate stayed green — a defect that carries no denominator here and **cannot be reproduced from
this repo**. What can be reproduced is the control above, which injects that defect class into this
fixture and catches it.

## What this does not catch

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
649 MB of that. The *download* is compressed and is not that number, and I have not measured it:
both the npm and the browser caches were already warm on every machine this has run on, so
first-run wall time for a stranger is unmeasured here. "Clone and run" is a download first.

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
