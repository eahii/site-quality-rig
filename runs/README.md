# runs/ — the committed run ledger

A record here is one battery run in machine-readable form, written by `npm test -- --record`
(or `--record-to FILE`): per-checker verdicts, denominators, exit codes and wall times, plus the
environment the run happened in — sha, tree cleanliness, node, playwright, OS, and the arguments
and scope environment that define what was measured. Two records are compared with
`node scripts/compare-runs.js <a.json> <b.json>`, which refuses (exit 2) when the two runs asked
different questions. `scripts/measure-repeatability.js` writes a `repeatability-*/` series of them.

Committing a record is a deliberate act, never automatic. The `.stdout.txt` transcript written
beside every record stays local as a rule: checkers print absolute paths of the machine they ran
on, and those stay out of this repo's tracked files — `.gitignore` enforces it, and `git add -f`
is the spelling of a deliberate exception. A committed record without its transcript still
carries every count and stamp; what it cannot show is which rows moved, and `compare-runs`
prints exactly that caveat when a transcript is absent.

The rule has one hole the records themselves can walk through: a run made with a path-carrying
argument or scope variable (`SITE_ROOT=/abs/path`, `--root /abs/path`) writes that path into the
record's own `argv`/`scopeEnv` — the fields two records are compared on, which is why they are
never rewritten. The recorder prints a warning beside such a record; read it before committing.
