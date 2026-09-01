# Evidence log

> Long-form receipts moved out of `README.md` on 2026-08-29 so the README stays readable in one
> sitting. Nothing here was rewritten in the move: these are the same paragraphs, and the runs and
> shas they name are unchanged. The README keeps the headline numbers and the CI table; this file
> keeps the forensics behind them.

## How the 869 was reproduced, and what changed between runs

Every checker prints its own denominator and its own `sha=` stamp; the summary table is rebuilt
from those stamps, so it structurally cannot report a number a checker did not print. The same 869
cells have now come back from six full runs; the sixth, on 2026-09-01 at `eb1d063`, is the first
whose record is committed rather than described — [`runs/20260901-0142-eb1d063-full.json`](../runs/20260901-0142-eb1d063-full.json),
869/869, 7/7 PASS, 558 s, `dirty=false`. Four of the other five were on this machine: two on 2026-08-27
at `60863e4` and `611824e`, whose only difference is two files under `.github/`; one on 2026-08-29
from a reviewer with no access to how this repo was built, on a fresh clone outside the project
with a from-scratch install, 524 s; and the one stamped in the README's results table, 536 s. That reviewer's pass also
found things wrong here, and both halves of it are written down in
[`docs/VERIFICATION.md`](VERIFICATION.md).

The fifth of those was not on this machine. On 2026-08-29 `.github/workflows/full-battery.yml` executed for
the first time and returned the same 869 — every per-checker denominator identical — on a GitHub
`ubuntu-24.04` runner under node v20.20.2, at `85aedbe`, battery step 598 s; it is the third row of the CI table in the README. One run, on one runner image, on one day, so it is not a portability claim. What
it does retire is the narrower one this section rested on until that day: that every two-engine 869
this repo has ever printed came off a single machine.

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
replaced with a measurement: the README's results table and the control receipts in
[`docs/CONTROLS.md`](CONTROLS.md) were both re-taken at `44deb74` on a clean tree. **No cell
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


## The red run in detail

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

**The third row is the only one that is not `ci.yml`.** `full-battery.yml` runs the two-engine
battery on a schedule and on demand, and had never executed on any runner until it was dispatched
by hand against `main` on 2026-08-29. Its browser cache key had never been populated either, which
is what a workflow that has never run looks like from outside. It came back with the seven
denominators the Results table decomposes — 231 / 144 / 37 / 144 / 288 / 16 / 9, and `battery: 7/7
checkers PASS` — every line stamped `sha=85aedbe`. Two wall times, and how they were derived: the
battery step ran 14:57:49Z to 15:07:47Z, so 598 s, against 536 s for the same battery on the
author's machine; the job ran 14:56:46Z to 15:07:56Z, so 670 s. Both are subtractions over the
run's own step and job timestamps, because that job prints no wall time of its own. One honest
annotation on it: GitHub warned that `actions/checkout@v4`, `actions/setup-node@v4` and
`actions/cache@v4` target the deprecated Node 20 *action* runtime and were forced onto Node 24.
That is the runtime those three actions themselves execute in; the node the battery ran under was
v20.20.2 as pinned, and the two are not the same thing.

**One more run is worth more than any row in that table, because nobody arranged it.** The very
first CI execution this project ever had,
[33255193219](https://github.com/eahii/site-quality-rig/actions/runs/33255193219)
at `f25a18e`, went red on `6/7 controls fired — 1 control(s) failed to fail: contrast (wrong
failing line)`. The contrast control asserted a hero heading the fixture had stopped carrying, so
the checker still went red on the injected defect but the harness could no longer confirm it went
red *for that defect* — the exact distinction the control layer exists to draw, and a gate that had
been unable to fire since the rewording. Reproduced locally at `f25a18e` before it was fixed, so it
was a repo defect and not a runner difference; fixed in `62d9804`; the reasoning that let it
through is corrected in [`docs/CONTROLS.md`](CONTROLS.md). **The first CI execution this
project ever had found a gate that had quietly stopped working**, which is the argument this repo
exists to make, arriving at the repo's own expense.


## Three library defects the gates caught during construction


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


## Nine defects an adversarial audit found in this harness


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


## Whether the battery says the same thing twice


Until 2026-09-01, every number in the README was a single run, and a single run cannot tell a
stable measurement from a lucky one. On that date, at `eb1d063`, on the author's machine (WSL2,
node v22.22.2, playwright 1.62.1, otherwise idle — the battery's own header warns that checkers on
a starved machine produce flaky reds, so nothing else ran during the series),
`scripts/measure-repeatability.js --runs 10 --engines chromium` ran the full build-plus-battery ten
times in sequence and compared every run to the first through `scripts/compare-runs.js`: **0 flips
across 189 checker-field comparisons** — 7 checkers x 3 compared fields (verdict, ok/total, exit
code) x 9 comparisons — with all ten runs `battery: 7/7 checkers PASS` at 555/555 cells and per-run
wall times between 276.5 and 277.1 s. The series is committed at
[`runs/repeatability-eb1d063-20260901-014245/`](../runs/repeatability-eb1d063-20260901-014245/),
one record per run.

The claim is deliberately narrower than "the runs were identical". A flip is a checker changing
verdict, denominator or exit code; a passing cell drifting inside its threshold, compensating flips
within one checker, and a note appearing or disappearing are all invisible to the counts — the
header of `scripts/measure-repeatability.js` enumerates each, with which of them a transcript diff
could still catch. The transcripts themselves stay local as a rule (checkers print machine-absolute
paths, which this repo keeps out of tracked files; [`runs/README.md`](../runs/README.md) states the
rule), so the committed series supports the count-level claim and not a byte-level one.

The comparator those 189 comparisons ran through is itself controlled.
`scripts/compare-runs.js --control` is a six-leg self-test, run by CI on every push under
`if: always()`. The legs were earned during review by a blinding pass: under the first two-leg
version, three advertised behaviours — the refusal of incomparable records, name-based checker
matching, and "stamps and durations are never counted" — could each be deleted from the code with
the control still reporting every leg green. Eleven distinct blindings of the comparator were
attempted in that review's re-verification and each was caught by a named leg — but the eleven are
itemised only in the review's own transcript, not in this repo, so treat that count as the
review's, an as-of of 2026-09-01. What a clone can re-derive is smaller and still real: the six
legs themselves, and that a blinding is caught — the 2026-09-01 fresh-context pass recorded in
[`docs/VERIFICATION.md`](VERIFICATION.md) re-blinded the verdict axis independently and the
control went red *(labelled 2026-09-01; the original
sentence here carried the eleven as if this repo could hand them over, which it cannot)*. The same
review pass found the cleanliness flag answering a question
about itself: `git status --porcelain` counts untracked files, so the recorder's own output under
`runs/` turned every record after the first `dirty: true` on an untouched source tree, until
`runs/` was excluded from the question the flag asks.
