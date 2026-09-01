# Failure taxonomy — every defect this project has recorded finding in itself

This repo argues that a gate is only worth believing once it has been shown to fire. The same
standard applies to the project that built the gates: a claim about how carefully something was
made is worth nothing without a count of what the care actually caught. This file is that count —
class by frequency by severity by the layer that caught it — so that an argument about what to fix
next, or where to spend review effort, comes from the ledger rather than from anybody's sense of it.

It is not a good-news page. It records the annotation defects and the disarmed controls in the same
table as the library bugs, because the distribution is the finding.

**Compiled 2026-09-01, at `cd5818c`.** Forty-four events. Every one of them was already written down
somewhere in this repo before this page existed; nothing here is new information, and that is the
point — the material was in forty-odd commit bodies and four documents, where no one could count it.

## The population rule, stated before the numbers

**Every failure event with a receipt reachable from this repo, and nothing else.** A receipt is one
of three things: a commit body in this history, a passage in a tracked document, or a CI run this
repo links. Nothing enters this ledger from memory, from a session log, from an untracked file, or
from anyone's recollection of what happened — including the compiler's. The rule is deliberately
narrower than the truth: things went wrong here that nobody wrote down, and they are absent from
every count below.

A **failure event** is one distinct defect or finding that a receipt records as having been *found
and dispositioned* — fixed, accepted with a reason, or retired. Three consequences of that
definition, each of which changes the counts:

- **A batch counts as one row when its members are not individually receipted.** The 2026-08-27
  adversarial audit found nine defects; the two 2026-09-01 pre-commit review passes found
  twenty-two. Neither worksheet is in this repo, and `docs/EVIDENCE.md` says in as many words that
  the audit's nine cannot be mapped onto anything countable here. So each batch is one row carrying
  its stated size, and the class counts below therefore **understate** every class a batch belongs
  to. Where a batch member *is* separately receipted — `docs/EVIDENCE.md` names two of the
  twenty-two — it gets its own row and the batch row carries the remainder.
- **A claim that was true when written and made false by later work is not a failure event.** The
  README once said "no CI run has ever executed, anywhere"; pushing the repo falsified it, and
  `ec52a69` retired it. That is the maintenance loop working, not a defect. The same rule excludes
  `164f155` (the two-engine battery had never run on a runner, and then it did) and two of
  `meta-eval/METHOD.md`'s dated corrections. What *does* count is a claim that outran its evidence
  **at the moment it was published** — an unmeasured figure used as a reason, a receipt that was
  never a receipt, a ledger of changed files that was already false when it was committed.
- **The commit that fixes a defect is not a second event.** `85aedbe` replaced a standing argument
  ("none of those edits could move a number") with a measurement. It found nothing new; it closed
  something already recorded here as F23, and it is not a row.

**Severities in this ledger are assigned by the compiler, not sourced.** The repo has no severity
vocabulary: `CRITICAL`, `HIGH`, `MEDIUM` and `LOW` appear nowhere in `README.md`, `docs/` or
`meta-eval/METHOD.md`. The single exception is `eb1d063`'s body, which says "22 findings, 5 HIGH"
without mapping the five onto anything. Every severity below is therefore marked *(a)* for assigned,
and the two `CRITICAL`s are the compiler's judgement about consequence, not a grade anyone else
gave. Treat the severity column as the weakest column on the page.

**Receipts are cited as a sha, or as a file plus the exact heading of the section that carries the
finding.** Every sha in the table was checked with `git cat-file -t` and resolves to a commit in
this history; every quoted heading was checked with `grep -n '^#'` against the file it names.
Section headings are quoted rather than turned into `#anchor` fragments because the headings here
carry em dashes and quotation marks, and a hand-computed slug is a receipt that rots without
telling anyone — which is itself F20 in the table below.

## The ledger

`covers` in a description means the row stands for more than one defect. Dates are the receipt's
date, not the date the defect was introduced.

| id | date | what was found | class | caught by | sev | receipt |
|---|---|---|---|---|---|---|
| F01 | 2026-08-27 | `resolveToDistFile()` accepted a bare directory as a link resolution, so a link without a trailing slash passed the dead-link test against a path no static host serves — and the file-keyed anchor lookup would then have reported every fragment on that page dead | instrument-defect | checker gate | HIGH (a) | `9971ea8`; `docs/EVIDENCE.md` "Three library defects the gates caught during construction" |
| F02 | 2026-08-27 | Four checkers stamped `root=` from the directory basename, and every built site directory is called `dist`, so a control's receipt could not say which build it measured | receipt-integrity | self-noticed | MEDIUM (a) | `9971ea8` |
| F03 | 2026-08-27 | `serve.js` answered a miss with a bare status, making the built `404.html` the one page in the site no checker could ever render | instrument-defect | self-noticed | MEDIUM (a) | `9971ea8` |
| F04 | 2026-08-27 | `--wip` had shipped with three different stamping behaviours across five checkers, so a permissive run was indistinguishable from a strict one on the days nothing was missing — the exact question that stamp is read to answer | receipt-integrity | self-noticed | MEDIUM (a) | `55f43ae` |
| F05 | 2026-08-27 | An adversarial audit of the control layer found nine defects, every one in the annotation layer: a receipt stamped with a sha it had not run at, a comment claiming a branch was demonstrated that never executes, a checker citing a control this repo does not contain, an "assertions not armed" table reading as exhaustive while covering a fraction *(covers 9 as the audit counted them; 12 bullets are countable in the two fixing commits and the mapping is not recoverable here)* | annotation-overclaim | independent review | HIGH (a) | `f94132d`, `60863e4`; `docs/EVIDENCE.md` "Nine defects an adversarial audit found in this harness" |
| F06 | 2026-08-27 | The engine-policy figures were wrong by a factor of about two and about four — the two-engine battery quoted at ~20 min against a measured 525 s, the controls at ~7 min against 101 s — and the decision to keep webkit out of the required gate was resting on the first of them | annotation-overclaim | self-noticed | HIGH (a) | `d5efe08`; the wrong figure is repeated in `611824e`'s own body and corrected beside it |
| F07 | 2026-08-27 | "Every commit after `f94132d` touches documentation only" stopped being true the moment `.github/` arrived, and a provenance claim that is only nearly true is the class this repo exists to catch | annotation-overclaim | self-noticed | LOW (a) | `588b270` |
| F08 | 2026-08-29 | `README.md` and `ci.yml` called a source comment "the in-repo receipt" for a WebKit float32 flake that no run, artifact or commit in this repo witnesses — an annotation overclaim three screens below the paragraph boasting that such overclaims had been purged | annotation-overclaim | independent review | HIGH (a) | `docs/VERIFICATION.md` "FIXED — the README called a source comment a receipt"; `ff614c5`, `473ccd8` |
| F09 | 2026-08-29 | Three README measurement claims with no denominator, date, method or artifact between them: a "third run" nothing recorded, a 0.000px spread with no cell count, and "a several-hundred-megabyte download" *(covers 3)* | annotation-overclaim | independent review | MEDIUM (a) | `docs/VERIFICATION.md` "FIXED — three unlabelled measurement claims in the README"; `473ccd8` |
| F10 | 2026-08-29 | Both `README.md` and `docs/CONTROLS.md` told readers a `git diff` "prints nothing" — true when the reviewer confirmed it, and falsified by the fixes made in the same pass | annotation-overclaim | self-noticed | MEDIUM (a) | `docs/VERIFICATION.md` "FIXED — a \"nothing has changed since\" claim that was about to become false"; `ff614c5` |
| F11 | 2026-08-29 | Six places asserted history from a private origin project in the same voice as the measurements around them — three comments in `check-hero.js`, one in `lib/site.js`, two contract notes — legible as provenance to whoever wrote them and as evidence to a cold reader *(covers 6)* | annotation-overclaim | independent review | MEDIUM (a) | `docs/VERIFICATION.md` "FIXED — origin-project history stated as if it were measurement"; `c8f01e1`, `a55e4fa` |
| F12 | 2026-08-29 | A control's printed `defect:` label used the vocabulary of the origin project's trade on a fixture about lift maintenance; the sanitization pass's identifier sweep could not see it, because it is not an identifier — a reader found it | process/hygiene | independent review | LOW (a) | `docs/VERIFICATION.md` "FIXED — vocabulary residue from another trade than the fixture's"; `2328753` |
| F13 | 2026-08-29 | `hero-contract.json` claimed a fill measured "at 14 viewport cells" without recording which 14, and no 14-cell matrix exists anywhere in this repo's history — accepted rather than fixed, because the original provenance is genuinely unknown | annotation-overclaim | independent review | MEDIUM (a) | `docs/VERIFICATION.md` "ACCEPTED — the hero contract's \"14 cells\" was wrong, and the correction is in the file"; `a55e4fa` |
| F14 | 2026-08-29 | Six of the hero control's seven end-state sub-assertions ride along inside a row that goes red on its centreline check alone, so they are counted as fired and have never been proven live — accepted unfixed, because closing it needs more controls, not different words | control-disarmed | independent review | MEDIUM (a) | `docs/VERIFICATION.md` "ACCEPTED — hero's own sub-assertions ride along untested inside fired rows"; `docs/CONTROLS.md` "What is NOT armed, by family" |
| F15 | 2026-08-29 | Acceptance criterion 4 graded UNMET: no remote, no workflow had ever executed, no `demo/failing-gate`, and therefore no CI run to link — recorded as the largest hole in the repo's evidence rather than as pending | evidence-gap | independent review | HIGH (a) | `docs/VERIFICATION.md` "Criterion 4 is unmet, and cannot be met from here" |
| F16 | 2026-08-29 | Measured figures inside `hero-contract.json`'s note strings carry the file's date rather than their own as-of — accepted, and recorded so a reader knows it was a decision | receipt-integrity | independent review | LOW (a) | `docs/VERIFICATION.md` "ACCEPTED — measurement notes inside the contracts carry a file-level date, not their own" |
| F17 | 2026-08-29 | Acceptance criterion 7 graded PARTIAL: all commits fall inside one working day, which "spread across real sessions" does not describe, and no framing changes that | process/hygiene | independent review | LOW (a) | `docs/VERIFICATION.md` "Criterion 7 is partial, for a reason that is visible in the log" |
| F18 | 2026-08-29 | Two of the three independent reports reached the integrating pass truncated, so `docs/VERIFICATION.md` can only claim to have dispositioned every finding *that reached it* — a report that does not survive the trip is a report that did not happen | process/hygiene | self-noticed | HIGH (a) | `docs/VERIFICATION.md` "Who ran it, and how" |
| F19 | 2026-08-29 | One battery run carried two wall times across the artifact — 526 s in two README lines against 525 s in five other places — with no surviving log to adjudicate, so the resolution is a consistency choice and not a measurement | receipt-integrity | independent review | MEDIUM (a) | `docs/VERIFICATION.md` "What reproduced"; `b494c66` |
| F20 | 2026-08-29 | The hand-maintained sha inventory was wrong twice: it omitted the shas the commit that wrote it added to itself, and its line numbers had rotted before anyone read them *(covers 2)* | receipt-integrity | self-noticed | LOW (a) | `64dba2d`; `docs/VERIFICATION.md` "The one open decision that would have invalidated every sha — resolved 2026-08-29" |
| F21 | 2026-08-29 | A green-run receipt stamped `sha=fdba9e0` while the fixes it was measuring were still uncommitted — accurate about `report.js`'s limits and useless as an as-of for the code that shipped | receipt-integrity | self-noticed | MEDIUM (a) | `f8bc725`; `docs/VERIFICATION.md` "Green after the fixes" |
| F22 | 2026-08-29 | The fixture was one fictional company written as two places: a North American telephone number and dollar prices on a British lift firm, and an `h1` saying "Elevators" on a site that says *lift* ninety-odd times elsewhere | fixture-defect | self-noticed | MEDIUM (a) | `6d16edd` |
| F23 | 2026-08-29 | Both change-ledgers still said the files changed since the last run were annotation only and so could not move a cell count, after seven fixture pages — real page bytes — had been edited | annotation-overclaim | self-noticed | MEDIUM (a) | `f25a18e` |
| F24 | 2026-08-29 | The contrast control's `expect` list required a hero heading the fixture had stopped carrying, so the checker still went red on the injected defect but the harness could no longer confirm it went red *for that defect* — a gate that had been unable to fire since the rewording | control-disarmed | CI, on the control harness | HIGH (a) | run [33255193219](https://github.com/eahii/site-quality-rig/actions/runs/33255193219) at `f25a18e`; `62d9804`; `docs/EVIDENCE.md` "The red run in detail"; `docs/CONTROLS.md` "The controls" |
| F25 | 2026-08-29 | The README asserted "nine defects" and sent the reader to two commit bodies carrying twelve bullets, on the one page whose whole argument is that its numbers survive checking | annotation-overclaim | self-noticed | MEDIUM (a) | `66b480d` |
| F26 | 2026-08-29 | The extraction source was named five different ways across the documents and three ways across code comments, so a reader meeting them had to work out whether they were three projects *(covers 2)* | process/hygiene | self-noticed | LOW (a) | `4a3b3c7`, `8cfcc32` |
| F27 | 2026-08-29 | A contract note claimed the origin defect "passed two reviewers" — a claim about other people's judgement, which is the one kind no label can rescue and no reader can check | annotation-overclaim | self-noticed | MEDIUM (a) | `4c868ee` |
| F28 | 2026-08-29 | `LICENSE` named the account handle rather than a person, and `package.json` carried neither description nor repository | process/hygiene | self-noticed | LOW (a) | `f2b7f77` |
| F29 | 2026-08-29 | Two overclaims of the author's own inside a correction section: an unsourced "the second time a gate was found decorative", and credit given to three documents for reasoning that one of them had never done *(covers 2)* | annotation-overclaim | self-noticed | MEDIUM (a) | `44deb74` |
| F30 | 2026-08-29 | The browser-cache comment quoted only the 26 s miss, which a reader could reasonably read as the saving; the measured saving is about 6 s, because `--with-deps` still does its apt work on a hit | annotation-overclaim | self-noticed, on CI data | LOW (a) | `44deb74`; run 33256223839 |
| F31 | 2026-08-29 | The README had reached 441 lines; the outside reviewer who had just reproduced 869/869 cell by cell estimated that a busy reader gets through about 15% of it | process/hygiene | independent review | MEDIUM (a) | `6fce2a5` |
| F32 | 2026-08-29 | The contracts were measured from the fixture this repo ships, which makes 869/869 in significant part self-fulfilling — a limit that had been named nowhere, in a document that names every other limit exhaustively | annotation-overclaim | self-noticed | HIGH (a) | `6fce2a5`; `README.md` "What this does not catch" |
| F33 | 2026-09-01 | Two adversarial review passes over the record, compare and repeatability scripts returned 22 findings, 5 of them HIGH, all fixed in the same diff rather than after it *(covers the 19 not individually receipted; F34–F36 are the itemised remainder)* | batch, unclassified | adversarial review, pre-commit | HIGH (5 of 22, per the receipt) | `eb1d063` |
| F34 | 2026-09-01 | The cleanliness flag answered a question about itself: `git status --porcelain` counts untracked files, so the recorder's own output under `runs/` turned every record after the first `dirty: true` on an untouched source tree | self-contaminating measurement | adversarial review, pre-commit | HIGH (a) | `eb1d063`; `docs/EVIDENCE.md` "Whether the battery says the same thing twice" |
| F35 | 2026-09-01 | The repeatability measure could return `PASS` over a run that was repeatably red; it now prints `REPEATABLY-RED` and never `PASS` *(attribution inferred: the receipt states the fix and attributes the diff's fixes to the two passes, without naming this one)* | instrument-defect | adversarial review, pre-commit | HIGH (a) | `eb1d063` |
| F36 | 2026-09-01 | The comparator's own self-test was blind: under the first two-leg version, three advertised behaviours — refusal of incomparable records, name-based checker matching, and never counting stamps or durations — could each be deleted from the code with every leg still reporting green | control-disarmed | adversarial review, pre-commit (blinding pass) | HIGH (a) | `eb1d063`; `docs/EVIDENCE.md` "Whether the battery says the same thing twice" |
| F37 | 2026-09-01 | The transcripts' stay-local rule had no mechanism behind it: one `git add runs/` would have swept eleven files carrying machine-absolute paths into a public commit | process/hygiene | sanitizer pass | HIGH (a) | `83704ec` |
| F38 | 2026-09-01 | A record made under a path-carrying flag writes that path into its own comparability keys, which are never rewritten precisely because rewriting them would falsify what was measured | process/hygiene | sanitizer pass | MEDIUM (a) | `83704ec` |
| F39 | 2026-09-01 | The meta-evaluation's accounting gate would have refused every correct run: it demanded a `0/M` finish line where the producible one is `1/M`, so the baseline — and with it every sabotage the baseline gates — could never have been credited | instrument-defect | adversarial review, pre-commit (browserless emulation) | CRITICAL (a) | `78a6c92`; `meta-eval/METHOD.md` "The 40-row cap, and why 15 blocks per page" |
| F40 | 2026-09-01 | The meta-evaluation's own negative control could not fire: the sabotaged instrument failed the runner's floor cross-check on every row it printed, before the agreement meter had any chance to move | control-disarmed | adversarial review, pre-commit (browserless emulation) | CRITICAL (a) | `78a6c92`; `meta-eval/METHOD.md` "The control — proving the agreement meter can move" |
| F41 | 2026-09-01 | Every specimen's text was built from its own case id, painting the join key into the images a blind labelling pass would be shown — and legible exactly when the specimen is legible, so it would have leaked on the easy cases and not on the borderline ones a label is worth anything on *(the receipt says only "found by review" and does not name the pass)* | self-contaminating measurement | adversarial review, pre-commit | HIGH (a) | `78a6c92`; `meta-eval/METHOD.md` "Part B — no analytic truth, and the direction that matters" |
| F42 | 2026-09-01 | An unanchored `shots/` ignore pattern silently swallowed `meta-eval/labeling/shots/`, and the previous commit shipped the labelling sheet without the imagery it is made from | process/hygiene | self-noticed | MEDIUM (a) | `cd5818c` |
| F43 | 2026-09-01 | An earlier reading of the block contract treated "fixed pixel size" as implying a viewport-independent raster; it does not, and the cross-viewport capture check exists because it does not | annotation-overclaim | self-noticed | MEDIUM (a) | `78a6c92`; `meta-eval/METHOD.md` "The capture viewport for Part B — declared, and why it needs declaring" |
| F44 | 2026-09-01 | The battery's determinism had been a belief supported by anecdote — the same 869 cells from five full runs, none of them recorded — and a single run cannot tell a stable measurement from a lucky one | evidence-gap | self-noticed | MEDIUM (a) | `ff3cc78`; `docs/EVIDENCE.md` "Whether the battery says the same thing twice" |

## Class by count

Nine classes, none of them imposed: each was named from the events that landed in it, and a class
exists here only because at least two events needed it — with the single exception of
fixture-defect, which is kept separate because folding one fixture bug into instrument-defect would
hide the causal chain in F22 → F24.

| class | what it means | count | share of 44 |
|---|---|---|---|
| annotation-overclaim | prose, a comment or a contract note asserting more than the runs showed: a receipt that was never a receipt, a figure with no denominator, a count that cannot be re-derived, a limit left unstated | 15 | 34% |
| process/hygiene | a leak vector, a report that did not arrive, an ignore rule that swallowed evidence, inconsistent naming, unreadable length, identity metadata | 9 | 20% |
| receipt-integrity | the machinery that makes a claim checkable is itself wrong: a stamp that cannot name its subject, one run carrying two numbers, an inventory that rotted | 6 | 14% |
| instrument-defect | the checker or harness computes the wrong thing, cannot see what it claims to measure, or would refuse every correct run | 4 | 9% |
| control-disarmed | a control or gate that existed, was believed live, and could not have fired | 4 | 9% |
| self-contaminating measurement | the instrument's own output is an input to its answer | 2 | 5% |
| evidence-gap | the project's own standard is not met by the evidence available, and the shortfall is recorded as a shortfall | 2 | 5% |
| fixture-defect | the thing being measured is internally wrong | 1 | 2% |
| batch, unclassified | a receipted batch whose members are not individually receipted, so no class can be assigned without inventing one | 1 (19 findings) | 2% |

**Those percentages have a denominator problem the table cannot fix.** Three rows stand for more
than one defect: F05 covers nine, F33 covers nineteen, and F09, F11, F20, F26 and F29 cover two to
six each. Counted as *defects* rather than as *events*, the population is at least 80, and the two
batches alone account for 26 of the 36 extra — so every share above is an event share, not a defect
share, and the two classes the batches would join (annotation-overclaim for F05, unknown for F33)
are the two most understated.

## Severity by count, and the warning that goes with it

Every one of these is assigned by the compiler. The repo grades nothing, so this table measures a
judgement about consequence rather than a recorded verdict, and it is the first table on the page a
reader should disagree with.

| severity | count of 44 | what put an event here |
|---|---|---|
| CRITICAL (a) | 2 | the meta-evaluation could not have produced a meaningful result at all — a gate that refuses every correct run, and a control that cannot fire |
| HIGH (a) | 14 | a gate that could not fire, a published claim with no evidence behind it, a leak one command away, a decision resting on a figure wrong by 2x |
| MEDIUM (a) | 20 | a receipt that cannot identify what it measured, a claim that outran its evidence in a smaller place, a fixture inconsistency |
| LOW (a) | 8 | naming, metadata, an accepted limitation recorded so a reader knows it was a decision |

**Every one of the seven pre-commit adversarial catches is HIGH or above** — both CRITICALs and
five HIGHs, no MEDIUM, no LOW. No other layer has that profile: the self-noticed layer's 21 events
run 3 HIGH, 13 MEDIUM and 5 LOW. The obvious reading is that a hostile pass over a diff finds the
things a careful author cannot see rather than the things he merely has not got to yet; the less
comfortable reading is that severity here was assigned by someone who already knew which layer
found what.

## Layer by count

The layer is the one that actually produced the finding, not the one that could have.

| layer | count of 44 | share |
|---|---|---|
| self-noticed — the author reading his own artifact, usually while writing the next paragraph | 21 | 48% |
| independent review — a pass with no access to how the repo was built, after the work was committed | 12 | 27% |
| adversarial review, pre-commit — a hostile pass over a diff before it landed | 7 | 16% |
| sanitizer pass | 2 | 5% |
| CI, on the control harness | 1 | 2% |
| checker gate — the battery going red on its own repo | 1 | 2% |
| control harness alone, with no CI or review occasioning the run | 0 | 0% |

## Class by layer, where it is illuminating

Two crosses carry the whole argument of this page.

**Every annotation-overclaim was caught by reading; none was caught by running.**

| annotation-overclaim, by layer | count of 15 |
|---|---|
| self-noticed | 10 |
| independent review | 5 |
| everything that executes anything — checker gate, control harness, CI, sanitizer, pre-commit review | 0 |

**Every mechanics defect — the ten events in instrument-defect, control-disarmed and
self-contaminating measurement — was caught somewhere other than by reading prose.**

| mechanics defect, by layer | count of 10 |
|---|---|
| adversarial review, pre-commit | 6 |
| self-noticed | 1 |
| independent review | 1 |
| CI, on the control harness | 1 |
| checker gate | 1 |

And the two layers that both look like "review" do not overlap at all: the pre-commit adversarial
layer caught 6 mechanics defects and 0 annotation defects; the post-commit independent layer's 12
events are 5 annotation defects, 3 process/hygiene, 2 receipt-integrity, 1 evidence-gap and 1
mechanics defect. Whatever they are, they are not the same instrument pointed at different weeks.

## What the distribution argues

**The claims layer is where this project breaks, by a wide margin.** Annotation-overclaim plus
receipt-integrity is 21 of 44 events, 48%, and that is before the nine-defect audit inside F05 is
unpacked. The mechanics — checkers, controls, the meta-evaluation — account for 10. The pattern held
across three separate outside passes, none of which was looking for the same thing: the 2026-08-27
control-layer audit reported that all nine of its findings were in the annotation layer, and the
2026-08-29 verification found that criterion 5 failed on claim hygiene while the code reproduced
cell for cell. On an artifact whose entire thesis is that claims must carry denominators, the
claims are the defect surface — which is either the most damning reading of this ledger or the most
reassuring one, depending on whether a reader thinks the code or the prose is the product.

**Reading and running find disjoint sets, so a project that does only one of them is blind by
construction.** No amount of running caught an annotation overclaim; no amount of reading caught a
disarmed control. F24 is the sharpest instance in the ledger: `README.md` and `docs/CONTROLS.md`
each reasoned explicitly about the fixture heading edit and each concluded nothing executable had
moved, and the independent review pass edited the very file holding the stale fragment — reaching
line 106 to reword a label six lines below the stale fragment at line 100 — without noticing it. It
took executing the suite. *(That sentence is deliberately narrower than the one `44deb74` retired:
an earlier version of this claim credited three documents with reasoning past the edit, and
`docs/VERIFICATION.md` had not reasoned about it at all.)* The converse holds too — the battery has run green over an unstated
circularity (F32) and over a receipt that was never a receipt (F08) hundreds of times.

**The pre-commit adversarial layer is the cheapest place these defects have ever been caught, and
it is one day old.** It appears in this ledger only from 2026-09-01, and in the two commits it has
run on it caught 7 events including both `CRITICAL`s and the two self-contaminating measurements —
the meta-evaluation's accounting gate that would have refused every real run, and its control that
could not have fired. All of that was found before a browser ran, by emulating runs through this
repo's own `report.js`. Every one of those would otherwise have shipped, and F39 and F40 would have
shipped as a *published meta-evaluation whose results meant nothing*. Compare F24, the same class of
defect caught after publication by CI, at the cost of a red first run and a correction in three
files.

**The strongest fix-order argument the data supports** is therefore not "write better prose". It is:
every claim gets a receipt before it is committed (which the repo already practises and which
produced 21 of the self-noticed catches), and every *instrument* gets an adversarial pass before its
first run, not after its first result. The second half is the one this project learned last.

**The single most consequential event on the page cost almost nothing to find.** F24 was found by
the first CI execution this project ever had, on a suite that would have printed the same three
lines on any machine — it was reproduced locally at `f25a18e` before it was fixed, so it was a repo
defect that CI merely executed. Nothing local caught it because the control suite was deliberately
not re-run after the edit that broke it: the gap between "the receipts are stamped" and "the suite
was run again" is exactly where it lived.

### The caveat this whole page is capped by

**This is a population of found failures, censored by where the project looked.** Every count above
is a count of catches, and a catch requires a looker. The date distribution says this outright: 7
events on 2026-08-27, 25 on 2026-08-29, 12 on 2026-09-01. The 2026-08-29 spike is not a bad day for
the code — it is the day three independent passes ran. Nothing about the underlying defect rate can
be read off these numbers.

**A layer with zero catches may be blind, or may be unneeded, and this ledger cannot tell which.**
The control harness has never independently surfaced a defect; the checker gate has done it once.
Two readings fit equally: that the checkers are sound and there was nothing for them to find, or
that nothing in this repo is set up to notice a checker going quietly wrong except a control suite
that only runs when somebody runs it. Nothing here distinguishes them, and no count on this page
should be quoted as if it did.

**Two documented misses make the point concretely.** The sanitization pass's identifier sweep did
not catch F12, because a word from the wrong trade is not an identifier — a reader found it. And
F18: two of the three independent reports arrived truncated, so the 2026-08-29 findings in this
ledger are the ones that survived the trip, not the ones that were made. The population is
demonstrably smaller than the truth in at least one known direction.

**Finally, the compiler of this page is the author of most of the defects in it.** Twenty-one of the
44 events are self-noticed, which is exactly the condition under which a ledger flatters itself.
Every row cites a receipt written before this page existed, so a reader can check the disposition
without trusting the classification — the classes, the severities and the layer attributions are
this page's, and they are the parts to argue with.

## Maintenance

**New events are appended with their receipt, never inserted or renumbered.** Ids are permanent:
`F45` is the next one whatever date it carries. A row is edited only to add a disposition or a later
receipt, and a correction goes *beside* the row's original wording, in the same style as
`docs/VERIFICATION.md` — because a ledger rewritten to be right is a ledger that cannot show what it
used to think.

**A class is added only when an event does not fit an existing one, and the addition says which
event forced it.** Nine classes for 44 events is already close to the point where the taxonomy stops
compressing anything; a tenth needs to earn its place against the alternative of widening a
definition.

**The counts above are as-of the compile date and go stale on the next appended row.** They are
re-derivable by counting the table, which is the only reason they are quoted at all.
