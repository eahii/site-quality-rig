# Independent verification — what a cold reader found, including what was wrong

This repo argues that its gates are worth believing because they have been shown to fire. That
argument is only as good as its own verification, so this file records an independent pass over
the repo: who ran it, when, by what method, what reproduced, **what did not**, what was fixed in
response, what was accepted unfixed and why, and what nobody has verified at all.

It is not a summary of good news. Of the seven acceptance criteria this repo was built to, one is
unmet and two are partial. Nine findings follow: five were fixed, four were accepted unfixed, and
each accepted one says why.

*As written on 2026-08-29. The unmet criterion — 4, CI evidence — was met later the same day; the
two corrections at the end of this file say how, and the rest of the verdicts stand. Everything
above and below them is left exactly as the review left it.*

---

## Who ran it, and how

Three independent passes on **2026-08-29**, against `fdba9e0` on `main`:

| pass | what it was given | what it did |
|---|---|---|
| **Fresh-context reviewer** | the repo and the written brief only — no access to how the repo was built, no reasoning from the sessions that wrote it | cloned to a directory outside the project, installed from scratch, ran the full battery and the full control suite, re-ran the census script, tamper-tested the control harness four ways in a second clone, and tested runtime network isolation |
| **Sanitization pass** | the repo, including its object database | scanned all 64 blobs in the object store — reachable and unreachable — plus every commit message and every path that has ever existed in history, against a pattern list for client identifiers, secrets, internal paths and non-English residue |
| **Fact resolver** | two specific claims and permission to measure | re-measured the hero contract's cell-count claim from scratch rather than reasoning about it |

A fourth pass — this one — integrated the findings and made the changes below. It is the author's
side of the exchange and is not independent; treat its judgement accordingly.

**A limit of this file, stated first.** Two of the three reports reached the integrating pass
truncated. The fresh-context reviewer's per-criterion verdicts, its blocking list and the start of
its narrative came through; the tail of its finding list did not. The sanitization pass's verdict
(pass, with warnings, nothing critical), its method and its clean categories came through; its
enumerated warnings did not, beyond two — the commit identity and a generic `vercel.json` mention
in `contracts/deploy-contract.json`, which sits in a list beside `netlify.toml`, a `Caddyfile` and
an nginx block and identifies nobody.

So this file cannot claim to have dispositioned every finding those passes made: it disposes of
every finding that reached it. Everything attributed to a pass below is either quoted from an
artifact it left on disk or restated from the part of its report that arrived intact; where its
reasoning did not arrive, this file says so instead of inventing it. That is a defect in how these
passes were run — a report that does not survive the trip is a report that did not happen — and it
is recorded here because a verification page that hid its own gaps would be the exact failure this
repo exists to argue against.

---

## Acceptance criteria: the verdicts

Seven criteria were set in the brief this repo was built to. The fresh-context reviewer graded
them; the verdicts are its, not the author's.

| # | Criterion | Verdict |
|---|---|---|
| 1 | Runs from a cold clone, offline, no API key | MET |
| 2 | A neutral fixture site ships in-repo, not a snapshot of anyone's real site | MET |
| 3 | Every negative control ports and fires, with discipline | MET — 7, where 6 were asked for |
| 4 | CI green on the default branch, a preserved red run on `demo/failing-gate`, both linked from the README | **UNMET** *(met later the same day — corrections below)* |
| 5 | README in English, in the prescribed order | **PARTIAL** |
| 6 | No emoji headers, no Features / Roadmap / Contributing sections, no dead badges | MET |
| 7 | Commit history spread across real sessions, messages state the *because*, nothing backdated | **PARTIAL** |

### Criterion 4 is unmet, and cannot be met from here

There is no remote. No workflow in `.github/workflows/` has ever been executed by GitHub or by
anything else. `demo/failing-gate` does not exist; `main` is the only branch. There is therefore no
CI run to link, green or red, and the README now says so in the Results section instead of leaving
a reader to infer from two committed workflow files that they run.

This is the largest hole in the repo's evidence. It is recorded as **unmet**, not as pending: the
publishing decision that would create the remote is the author's and has not been made, so the
criterion is not partly done, it is not done. Everything the workflows assert about runner
behaviour, Node 20 versus the local v22.22.2, and timeout headroom is untested prediction, which
`ci.yml`'s own header already says.

**— Superseded 2026-08-29, after this review: the publishing decision was made, the remote exists
and `ci.yml` has run. The criterion moves from unmet to partly met — CI runs are now linkable, but
`demo/failing-gate` still does not exist, so the intentional red run it calls for still does not.
See the correction section at the end of this file.**

**— Superseded again, later on 2026-08-29: `demo/failing-gate` now exists. It is `44deb74` plus one
commit changing one CSS declaration, its CI run 33257439952 is red on `contrast FAIL 1/19` with 54
measured rows naming that declaration, and both it and the green `main` run 33256643910 are linked
from the README's Results section. The criterion is **met**. What it asked for is done; what it was
*for* — evidence that these gates fire — now rests on three artifacts rather than one: that branch,
the seven negative controls, and the unplanned red run that found a real defect.**

### Criterion 7 is partial, for a reason that is visible in the log

All 16 commits carry dates on **2026-08-27**, between 01:26 and 14:34 — one working day, not
several sessions. That is a consequence of `7d2620b`, which restarted the history on a clean root
so no pre-public material could survive in the object database, and the sanitization pass confirmed
that restart worked: `git fsck --unreachable --dangling` is empty and the reflog holds only these
16 commits. Nothing is backdated — the dates are the real ones. But "spread across real sessions"
describes a history this repo does not have, and no amount of framing changes that.

### Criterion 5 is partial

The README's structure and language met the criterion. Its claim hygiene did not: the reviewer
found unlabelled claims the repo could not support, which for a repo whose entire thesis is
"every number carries a denominator, a method and a date" is the most serious defect class
available to it. Those are itemised below, with what was done about each.

---

## What reproduced

Every one of these was re-run, not restated.

**The battery, from a cold clone.** The reviewer cloned the repo to a directory outside the
project, installed dependencies and browsers, and ran `npm run build && npm test`. From its log:

```
links       PASS     231/231     sha=fdba9e0 root=dist pages=7 strict=false
viewports   PASS     144/144     sha=fdba9e0 root=dist engines=chromium+webkit cells=12 pages=6
contrast    PASS     37/37       sha=fdba9e0 root=dist engines=chromium+webkit cells=3 pages=6
motion      PASS     144/144     sha=fdba9e0 root=dist engines=chromium+webkit cells=3
harden      PASS     288/288     sha=fdba9e0 root=dist engines=chromium+webkit cells=4 components=3 grids=2
hero        PASS     16/16       sha=fdba9e0 root=dist contract=contracts/hero-contract.json page=index.html engines=chromium+webkit cells=2
deploy      PASS     9/9         sha=fdba9e0 origin=local-fixture root=dist pages=6 drift=0 form=3-probes strict=false

battery: 7/7 checkers PASS
WALL_SECONDS=524.37
```

869 cells, the same denominators the README's table decomposes, at a different sha on a different
clone. The README quoted 526 s for the same battery at `611824e` and `.github/workflows/ci.yml`
quoted 525 s for what is described as the same run; that one-second discrepancy was unreconciled,
and no log of that run is in this repo. It was left as it was rather than quietly harmonised.

*Resolved 2026-08-29, and worth saying how, because it is not a re-measurement.* No log of the
`611824e` run survives, so neither figure can be re-derived from this repo and neither is more
"true" than the other on the evidence here. The repo carried the run's wall time in seven places:
five said 525 s (`ci.yml`, two lines of `full-battery.yml`, and the bodies of `d5efe08` and
`c18e692`) and two said 526 s (`README.md`). The README's two were changed to 525 s so that one
run has one number; the five were not renumbered, and no commit body was touched. That makes the
artifact self-consistent and nothing more — the figure is still a single unlogged run on one
developer machine, and the next full battery re-stamps it with a figure that has a log.

**The negative controls, from the same cold clone.** `7/7 controls fired`,
`CONTROLS_WALL_SECONDS=103.01`, against the 101 s the README reports from the author's machine.

**The failure-emit census.** `node scripts/count-emit-sites.js` re-run by the integrating pass on
2026-08-29 printed `179 failure-emit sites; 143 carry a literal prefix of 8+ characters and can be
probed; 36 cannot` — the two numbers the README's coverage paragraph rests on.

**The hero centreline spread.** An ad-hoc probe over 14 viewport cells in chromium and webkit:
spread, contact gap and cross-check delta all `0.000` at all 28 engine-cell combinations. Run twice
on 2026-08-29 — once by the resolver pass, once by the integrating pass re-running that same
script, which is a repetition rather than a second independent implementation — with identical
output to three decimals. The checker itself, run over the same 14 cells, printed
`hero: 112/112 cells OK — PASS`.

**The control harness rejects tampering.** The reviewer did not take the discipline described in
`docs/CONTROLS.md` on faith. In a second clone it neutralised the hero injection, made both
expected fragments appear on unrelated rows, and pointed the control at a baseline that was already
red. The harness refused all three, by name:

```
!! hero did NOT fail on its negative control (exit 0, expected 1)
!! hero: every expected fragment appears, but no single row carries them all — this defect prints them on one row, so they were satisfied by unrelated rows
!! hero: the baseline is NOT green, so a red mutated run would prove nothing about the injected defect
```

That is the strongest single result of the pass, because it is the claim the whole repo rests on
and it was tested adversarially by someone with no stake in it.

**Sanitization.** Zero client or origin identifiers, zero secrets, zero non-English residue, zero
internal paths — in the working tree and in all 64 blobs of the object database, including
unreachable ones. The set of paths that had ever existed in this history was exactly the 47 tracked
at `fdba9e0`; the restart on a clean root left nothing behind it.

---

## What was found wrong

Each finding below is fixed, accepted, or disputed. Nothing is dropped.

### FIXED — the README called a source comment a receipt

`README.md` described `checks/measure-viewports.js:123-127` as "the in-repo receipt" for a WebKit
float32 flake that made a genuine 44px control measure 43.999755859375 and turned a row red in 6 of
12 identical runs. There is no receipt. There is a comment, describing runs made while this rig was
being extracted from a private project, which no log, artifact or commit in this repo witnesses.

This matters more than its size. The repo's own README boasts that an adversarial audit found nine
defects "every one in the annotation layer: comments and documentation asserting more than the runs
showed" — and then committed one more of exactly that kind, three screens further down. A purge
that misses an instance in the same document is not a purge.

Fixed by relabelling it in place as provenance for a design decision, stating that nothing in this
repo witnesses those runs, and pointing at what *is* checkable — the rounding rule three lines below
it in the code. The same claim appeared as "the one engine-specific flake this repo has a receipt
for" in `.github/workflows/ci.yml`; that wording is corrected too, and the engine-split decision it
supports is kept, now resting on a stated design bet rather than on a receipt that does not exist.

### FIXED — three unlabelled measurement claims in the README

- *"a third run taken after this README was written reproduced them again"* — no sha, no date, no
  denominator, no artifact. Replaced with the cold-clone reproduction above, which has all four.
- *"the measured spread is 0.000px in both engines at every cell tried"* — a real measurement with
  no date, no cell count and no method, in a paragraph justifying a 0.5px tolerance. Now carries
  its date, its 28 engine-cell denominator, and an explicit statement that the probe is ad-hoc and
  **not** a script this repo ships.
- *"a several-hundred-megabyte download"* for the browser install. Re-measured: at the pinned
  playwright 1.62.1 on linux-x64, `npx playwright install chromium webkit` leaves 941 MB on disk
  (chromium 388 MB, headless shell 261 MB, webkit 292 MB, `du --apparent-size`, 2026-08-29).
  The README now gives that number, and says plainly that the *download* size and a genuinely cold
  first-run time remain unmeasured, because every machine this has run on had warm npm and browser
  caches.

### FIXED — a "nothing has changed since" claim that was about to become false

Both `README.md` and `docs/CONTROLS.md` told readers that a `git diff` command "prints nothing",
i.e. that no measured file had changed since the runs their numbers came from. That was true at
`fdba9e0` and the reviewer confirmed it. The fixes in this very pass made it false. Both files now
name the files that changed, say what class of change each is (comment text, `_`-prefixed contract
notes that no checker reads, and one banner label the control harness prints but no assertion
consults), and still tell the reader to run the diff instead of believing the sentence.

### FIXED — origin-project history stated as if it were measurement

Six places asserted history from a private project of my own as though it were
evidence produced here: `checks/check-hero.js` (three sites — the 3px offset, a velocity-sensitive
pin producing readings 160px past the end, and an unreproducible release-boundary search),
`checks/lib/site.js` (a desktop-nav wrap at 1600/1920 that justifies the 2560px matrix row), and
`contracts/hero-contract.json` (two sites — the `_why_note` story and "the origin defect was 3px").

The reviewer flagged them independently of the resolver pass, which is the whole argument for
changing them: the attribution was legible to the people who wrote it and not to a cold reader.
None was cut — each carries a real WHY that a reader deserves. Each is now labelled in place, in
the wording the repo already used elsewhere: provenance, not evidence, not reproducible from this
repo, with a pointer to the thing that *is* reproducible. One claim was additionally weakened
because it could not be defended: the stepped scroll approach in `check-hero.js` cannot be shown to
earn its keep on this fixture, whose scrub is a pure function of `pageYOffset` with no velocity
term, so it is now stated as a design bet rather than as a lesson learned.

### FIXED — vocabulary residue from another trade than the fixture's

One `defect:` label in `controls/run-controls.js` named the thing the hero's tip travels along
using a noun from the trade of a private project of my own rather than this fixture's — on a fixture whose
subject is lift maintenance and whose selector is `.guide-rail`. It identified nobody, and the
sanitization pass's identifier sweep did not catch it, because it is not an identifier. The
fresh-context reviewer caught it by reading. Reworded to the fixture's own vocabulary. The lesson
is the general one: a pattern-based sweep finds names, and a reader finds voice.

### ACCEPTED — the hero contract's "14 cells" was wrong, and the correction is in the file

The contract's `_note` said the fill was measured "at 14 viewport cells from 320x568 to 2560x1440"
without recording which 14. No 14-cell matrix exists in this repo or anywhere in its history: the
shared default matrix has 12 entries in every version of `checks/lib/site.js`, and the hero checker
never reads that matrix at all — it takes its cells from the contract's own `cells` field.

Rather than quietly changing "14" to "12", the resolver pass reconstructed a 14 that reproduces
(the 12 default viewports plus `1000x800` and `1023x800`, the two extra widths `fold-contract.json`
measures for the same reason), re-ran the checker over exactly those 14 to confirm, and wrote both
the correction and the command into the contract. **Accepted rather than "fixed" because the
original claim's provenance is genuinely unknown**: nobody can now say which 14 cells the 2026-08-27
fill actually used, and the file says so instead of implying the reconstruction is what happened.

### ACCEPTED — hero's own sub-assertions ride along untested inside fired rows

`docs/CONTROLS.md` already records that the hero control's `end-state climax` and `reduced-motion
frame1` rows go red on their centreline check alone, so the readout-literal, reveal-opacity,
scene-in-frame, resting-readout, running-animation and scrub-off assertions those rows also carry
are not proven live by that control. The reviewer went looking for a vacuous control and reports
finding none; this is the closest thing, and it is already counted as unarmed rather than as fired.
Accepted, because closing it needs more controls, not different words.

### ACCEPTED, UNFIXABLE HERE — criterion 4

See above. No remote, no run, nothing to link. Accepted as a stated hole rather than softened.

### ACCEPTED — measurement notes inside the contracts carry a file-level date, not their own

`contracts/hero-contract.json` states several measured figures in its note strings — a resting
opacity of 0.220, an end-state opacity of 1.000, pin distances of 2110px and 2000px, a resting
translateY of 0. Each is covered by the file-level "FILLED 2026-08-27 from the built fixture"
stamp rather than carrying its own as-of. Accepted: they describe a fixture that ships in this
repo and can be re-measured by anyone who clones it, and per-figure stamping would be churn without
adding a check anyone would run. Recorded so a reader knows it was a decision.

---

## What remains unverified by anyone

- **CI has never run, anywhere.** Nothing in `.github/workflows/` has been executed. Runner
  behaviour, the Node 20 path, the cache keys and the timeouts are all untested.
  **— No longer true as of 2026-08-29, after this review; left in place because it is what the
  review found. `ci.yml` had run five times on `ubuntu-24.04` when this line was written — four on
  `main` (33255193219 red, then 33255702213, 33256223839 and 33256643910 green) and one on
  `demo/failing-gate` (33257439952, red on purpose); pushing this commit adds another, and the run
  history is the only current answer. The Node 20 path, the cache keys,
  the timeouts and the branch condition that skips the controls on `demo/failing-gate` were all
  exercised; see the correction sections at the end of this file. `full-battery.yml` has still
  never executed on any runner.**
- **A genuinely cold install.** Every run has been on a machine with warm npm and playwright
  caches. First-run download size and wall time for a stranger are unmeasured.
- **Anything but this platform.** Linux, node v22.22.2, playwright 1.62.1, one machine.
  `package.json` declares `node >=18` and nothing has ever tested that claim.
  **— Partly answered 2026-08-29: the full battery and all seven controls ran green on
  `ubuntu-24.04` under node v20.20.2. That is a second node major, not a second OS; Windows,
  macOS and node 18 remain untested, and `>=18` is still an untested lower bound.**
- **History from a private project of my own.** The 3px hero offset, the 6-of-12 WebKit flake, the 1600/1920
  nav wrap, the velocity-sensitive pin: none can be reproduced from this repo, all are now labelled
  as such, and a reader should treat every one of them as an unverifiable story that explains a
  design rather than as evidence for it.
- **That the fixture is not a rebranded derivation** of the site this rig was extracted from. That
  site — a private project of my own — was a forbidden input to the reviewer, so this was
  assessed indirectly — different
  business domain, self-contained assets, zero identifier hits across the whole object database —
  and not confirmed against the original.
- **The adversarial audit of `f94132d` as a historical event.** Its worksheet is not in this repo,
  and the audit itself is attested only by two commit bodies. What *was* re-established is that the
  harness still rejects that class of tampering: the reviewer tamper-tested it four ways in its own
  clone and reports all four refused; three of those refusals are quoted above from its logs, and
  the fourth is attested only by its report.
- **Most of the battery's own assertions.** About one failure path in seven has been observed
  firing. `docs/CONTROLS.md` counts the gap and names the families; this file does not improve on
  that count, and nobody should read "7 of 7 controls fired" as "the checkers work".

---

## The one open decision that would have invalidated every sha — resolved 2026-08-29

*Written as an open decision by the pass above; the resolution is appended below it rather than
written over it.*

All 16 commits are authored under a personal address that has not been decided on for a public
repo. The sanitization pass flagged it, and it is tracked as an open decision rather than as a
finding, because it is the author's call and not a defect in the code. Resolving it rewrites the
history and therefore changes **every** sha, including the ones quoted throughout this file, the
README and `docs/CONTROLS.md`. That re-stamping is deliberately not done here, because doing it
before the decision would mean doing it twice.

**— Decided 2026-08-29: the history is not rewritten, and the address stays.** It is already public
in this author's other public repositories, so a rewrite buys no privacy that is not already gone,
while changing every sha this repo cites and orphaning `d5efe08`'s own claim to have corrected a
figure *beside* it rather than by rewriting the commit — a rewrite to tidy the history would
falsify the one commit whose point is that history is not tidied. The decision costs nothing that
was available and closes the largest piece of pending churn in these files.

So the shas below are permanent pointers, not debt. The inventory the pass above wrote as a
re-stamping list had already rotted by the time it was read — its line numbers were correct at
`fdba9e0` and every edit since moved them, which is what a hand-maintained line list does. It is
replaced by counts and the command that re-derives them, in the same spirit as
`scripts/count-emit-sites.js`: a census beats a list.

```
grep -rnoE '\b[0-9a-f]{7}\b' README.md docs/*.md .github/workflows/*.yml
```

| file | sha citations |
|---|---|
| `README.md` | 34 |
| `docs/CONTROLS.md` | 27 |
| `docs/VERIFICATION.md` | 42 (this file) |
| `.github/workflows/ci.yml` | 1 |
| `.github/workflows/full-battery.yml` | 1 |

105 citations of 15 distinct shas, counted on 2026-08-29 over the tree this commit records. The
command above has no false positives in this repo today, but it matches any seven-character hex
token, so it is a starting point for a reader rather than an oracle.

`contracts/hero-contract.json` deliberately carries no sha; it uses the date-and-method style of
`contracts/fold-contract.json` so this pass adds no new sha debt.

---

## Green after the fixes

Everything in the *What was found wrong* section changed comment text, contract note strings, one
printed label, one comment block in a workflow file, and three markdown files including this one.
Nothing executable changed. `npm run build && npm test -- --engines chromium` and
`npm run check:links`, re-run on 2026-08-29 with every fix in place:

```
checker     verdict  cells       stamp
links       PASS     231/231     sha=fdba9e0 root=dist pages=7 strict=false
viewports   PASS     72/72       sha=fdba9e0 root=dist engines=chromium cells=12 pages=6
contrast    PASS     19/19       sha=fdba9e0 root=dist engines=chromium cells=3 pages=6
motion      PASS     72/72       sha=fdba9e0 root=dist engines=chromium cells=3
harden      PASS     144/144     sha=fdba9e0 root=dist engines=chromium cells=4 components=3 grids=2
hero        PASS     8/8         sha=fdba9e0 root=dist contract=contracts/hero-contract.json page=index.html engines=chromium cells=2
deploy      PASS     9/9         sha=fdba9e0 origin=local-fixture root=dist pages=6 drift=0 form=3-probes strict=false

battery: 7/7 checkers PASS
BATTERY_EXIT=0 WALL_SECONDS=261

links: 231/231 cells OK — PASS  [sha=fdba9e0 root=dist pages=7 strict=false]
LINKS_EXIT=0
```

555 cells, which is the one-engine denominator the README quotes, and the same 231 from the
static checker run on its own.

Two things about that receipt, both of which are the instrument telling on itself. It stamps
`sha=fdba9e0` because the fixes were still uncommitted when it ran — the stamp records the last
commit, not the bytes measured, which is exactly the limit `checks/lib/report.js` has and a reader
should know about. And the two-engine battery and the control suite were deliberately **not**
re-run: their receipts are stamped at shas the identity decision above is about to invalidate, so
re-running them now buys a number that has to be thrown away. The last two-engine and control runs
this repo has are the cold-clone ones quoted further up, at `fdba9e0`, before these fixes.

**— Corrected 2026-08-29, and the decision above is the reason it could be.** The identity question
was settled without a rewrite (see the section below), so a re-run no longer buys a number that has
to be thrown away. Both suites have now been run, at `44deb74` on a clean tree, same machine, node
v22.22.2, playwright 1.62.1:

```
npm run build && npm test          7/7 checkers PASS, 869/869 cells, BATTERY_EXIT=0   WALL_SECONDS=536
npm run test:controls              7/7 controls fired, CONTROLS_EXIT=0                CONTROLS_WALL_SECONDS=102
```

Every per-checker denominator is the one the README's table decomposes — 231 / 144 / 37 / 144 / 288
/ 16 / 9 — and every per-control baseline and mutated count matches the previous capture exactly.
The control receipts in `docs/CONTROLS.md` were re-taken from that run rather than left as the
older ones; that file names the three things that differ from the `f94132d` capture and why. The
paragraph above is left standing because the decision it records was correct at the time and is
where the contrast-control break survived: not re-capturing a receipt is a choice, not re-running
the suite is how a broken gate stays quiet.

**Re-run once more against a clean tree**, after every fix above was committed, so that one
receipt in this repo stamps the bytes it actually measured: at `473ccd8`, `7/7 checkers PASS`,
the same 555 cells with the same per-checker denominators, `BATTERY_EXIT=0 WALL_SECONDS=261`, and
`links: 231/231 cells OK — PASS [sha=473ccd8 root=dist pages=7 strict=false]`, `LINKS_EXIT=0`.
The commit that adds this paragraph is the only thing between that sha and this sentence.

---

## Correction: the first CI runs, 2026-08-29

Added after the review above, which is left exactly as it was written. Two bullets in *What
remains unverified by anyone* and criterion 4 in *Acceptance criteria* were true when written and
are not true now; each keeps its original wording with a dated correction appended, pointing here.

The repo was pushed to `github.com/eahii/site-quality-rig` (**private**, so the run URLs below are
404 without access) and `ci.yml` executed for the first time. Environment: `ubuntu-24.04`, node
**v20.20.2** — the runner installs 20 per the workflow, against the author's v22.22.2 — playwright
1.62.1, Chrome for Testing 151.0.7922.34.

| run | commit | outcome | job | battery | controls |
|---|---|---|---|---|---|
| 33255193219 | `f25a18e` | red | 445 s | 7/7 PASS, 555 cells | **6/7**, contrast did not fire |
| 33255702213 | `62d9804` | green | 450 s | 7/7 PASS, 555 cells, 290 s | **7/7 fired**, 117 s |

**What the red run caught, and why it matters here.** The contrast control's `expect` list in
`controls/run-controls.js` required the row label `#hero-title "Elevators that stay in service."`.
The fixture heading had been reworded to *Lifts that stay in service.* on 2026-08-29, so the
control could no longer be credited as fired — the checker still went red on the injected defect,
but the harness could not confirm it went red *for that defect*, which is the whole distinction
this harness exists to draw. `docs/CONTROLS.md` had reasoned explicitly about that rewording and
concluded "nothing else in them moves", having asked what the checker prints and not what the
harness requires; the correction is written beside that paragraph.

Three things a skeptic should take from this rather than from the green run:

1. The defect was **reproduced locally at `f25a18e` before being fixed**, with byte-identical
   output. It was a repo defect that CI merely executed, not a runner difference.
2. It survived because the control suite was deliberately not re-run after the rewording — a
   decision recorded in *Green after the fixes* above. The gap between "the receipts are stamped"
   and "the suite was re-run" is exactly where it lived.
3. It was found by *running* the suite, not by reading it, and reading had three chances. The
   README and `docs/CONTROLS.md` each reasoned explicitly about the heading edit and concluded
   nothing executable moved. This page's own review went further and edited
   `controls/run-controls.js` — the very file holding the stale fragment — to reword the `hero`
   entry's `defect:` label (*vocabulary residue from another trade*, above), six lines below the
   stale `contrast` fragment, and did not notice it. That is evidence for the method and against
   the artifact, and both halves belong in the same sentence.

**What is now measured, and what still is not.** Measured: the Node 20 path, the cache keys, the
timeout headroom (450 s against a 45-minute limit), and that every cell count on a runner matches
the author's machine exactly — 231/72/19/72/144/8/9. A third run, 33256223839, was green on the
same 555 cells and 7/7 controls in 450 s (battery 288 s, controls 116 s), and was the first to hit
the browser cache: restore 5 s, install 20 s against 26 s on a miss. The cache is therefore worth
about 6 s, not 26 — `--with-deps` still does its apt work on a hit — which is recorded because a
speed-up nobody has measured is the kind of claim this repo is supposed to refuse. Still not
measured:
`full-battery.yml`, which has still never executed on any runner; and anything on Windows, macOS
or node 18. Criterion 4 is now **partly** met rather than unmet: CI has run, but
`demo/failing-gate` still does not exist, so there is no preserved intentional red run to link.
The red run above is an accident that is being kept, which is not the same artifact.

---

## Correction: the deliberate red run, and the receipts re-taken, 2026-08-29

Later the same day, and again appended rather than written over the sections it corrects.

**`demo/failing-gate` exists, and criterion 4 is met.** The branch is `44deb74` plus one commit
that changes one declaration in `fixture/css/site.css`: `.lede`'s colour taken off the measured
palette and written as a one-off grey, `oklch(0.68 0.014 252)`. Its run,
[33257439952](https://github.com/eahii/site-quality-rig/actions/runs/33257439952) at `264f7bb`,
job 329 s, went red on the battery step with `contrast FAIL 1/19` and `battery: 6/7 checkers
PASS — FAIL (contrast)`; the other six checkers passed in the same run. The first of the 54
measured rows it printed:

```
FAIL  chromium se1 index.html [132 nodes (base:115 footer-inverse:16 filled-control:1), 30 unpainted, 0 unresolvable]
        2.75:1 < 4.5 (min 2.75, 16px/400) #hero>div.hero-inner>div.hero-copy>p.lede "Planned maintenance, repair and modernis"
```

2.75:1 on the page ground, 2.54:1 on the sunk slabs, against the 4.5:1 floor. The same defect was
run locally on the branch's own tree before it was pushed and produced the same verdicts, so the
red is the fixture's and not the runner's. The workflow's `if:` condition skipped the negative
controls on that branch, which is the baseline rule holding rather than an exemption: a control
credits a red only after the same checker exits 0 on the pristine build, and no baseline on a
deliberately broken fixture can be green.

**What the branch is and is not.** It is a permanent git branch, so the defect and its commit
message stay readable; the run's screenshot artifact is not permanent (`retention-days: 7`). It is
one commit off `44deb74`, so its copy of `README.md` predates this correction — read `main` for the
current page. And it proves one thing only: that this checker, on this defect, on a runner, prints
a row a stranger can read. The seven negative controls remain the broader claim, and the coverage
count in `docs/CONTROLS.md` remains the limit on both.

**The receipts were re-taken at `44deb74`.** Figures and method are under *Green after the fixes*
above. The short version: 7/7 checkers and 869/869 cells in 536 s, 7/7 controls in 102 s, every
denominator and every per-control count identical to the previous captures, and
`scripts/count-emit-sites.js` printing byte-identical totals to its `f94132d` output. Three
strings in the control receipts changed, all named in `docs/CONTROLS.md`. **No number moved that
the previous pass had argued could not move** — but it is now a measurement rather than an
argument, which is the only reason to trust it.

*This file describes work at `fdba9e0`, the changes made on top of it on 2026-08-29, and the two
corrections above. The identity decision it was waiting on is now resolved, in the section that
records it: the history is not rewritten, so the shas quoted throughout this file stay valid.*
