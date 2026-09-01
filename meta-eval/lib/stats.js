'use strict';
/* The two numbers a meta-evaluation is allowed to print: an interval around an agreement rate,
   and a confusion count that says which way the disagreements went.

   Why an interval at all. This repo's rule is that every number carries a denominator, and a
   denominator of thirty is small enough that the point estimate is the least interesting part of
   it: 30/30 agreement and 300/300 agreement print the same "100%" and are not the same evidence.
   The Wilson score interval is used rather than the textbook normal (Wald) interval because Wald
   is degenerate exactly where this instrument is expected to live — at p = 1 it reports the
   interval [1, 1], i.e. certainty from thirty observations — while Wilson keeps a real lower
   bound there.

   Form, from Wilson (1927), in the spelling reproduced in Brown, Cai & DasGupta (2001) §2:

     centre = (p + z^2/2n) / (1 + z^2/n)
     half   = z * sqrt( p(1-p)/n + z^2/4n^2 ) / (1 + z^2/n)

   with p the observed proportion and z the standard normal 97.5th percentile, 1.959964.

   Hand derivation of the first self-test anchor, so the assertion is checkable without running
   anything: n = 10, x = 10, p = 1, z^2 = 3.841459. Denominator 1 + 0.3841459 = 1.3841459.
   Centre (1 + 0.1920729) / 1.3841459 = 0.8612336. Half = 1.959964 * sqrt(0 + 3.841459/400) /
   1.3841459 = 1.959964 * 0.0979982 / 1.3841459 = 0.1387664. Lower 0.7224672, upper clamped at
   1. The 0.7225 lower bound for 10 of 10 is the standard worked example of the interval, and
   0/10 -> [0, 0.2775] is its mirror.

   Usage: node meta-eval/lib/stats.js --self-test */

const Z95 = 1.959964;

/* n = 0 returns null rather than an interval. There is no 95% interval for no observations, and
   a [0, 1] placeholder would print as a measurement of something. */
function wilson(successes, n, z = Z95) {
  if (!Number.isInteger(successes) || !Number.isInteger(n) || n < 0 || successes < 0 || successes > n) {
    throw new Error(`wilson(${successes}, ${n}): needs integers with 0 <= successes <= n`);
  }
  if (n === 0) return null;
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return {
    successes, n, p,
    lo: Math.max(0, centre - half),
    hi: Math.min(1, centre + half),
  };
}

const fmtInterval = (w, digits = 4) => (w === null ? 'no interval (n=0)'
  : `${(w.p * 100).toFixed(1)}% [${w.lo.toFixed(digits)}, ${w.hi.toFixed(digits)}]`);

/* Direction is the whole point of this helper, so the four cells are named for what they mean
   about the instrument rather than for the usual positive/negative convention, which needs a
   reader to remember which verdict was arbitrarily called positive:

     falsePass  the instrument said PASS where the truth is FAIL — a defect shipped past the gate
     falseFail  the instrument said FAIL where the truth is PASS — a false alarm

   The two are not symmetric in cost and must never be summed into one "error rate". */
function confusion(pairs) {
  const c = { n: 0, truePass: 0, trueFail: 0, falsePass: 0, falseFail: 0 };
  for (const { truth, verdict } of pairs) {
    if (truth !== 'pass' && truth !== 'fail') throw new Error(`confusion: truth must be 'pass' or 'fail', got ${JSON.stringify(truth)}`);
    if (verdict !== 'pass' && verdict !== 'fail') throw new Error(`confusion: verdict must be 'pass' or 'fail', got ${JSON.stringify(verdict)}`);
    c.n++;
    if (truth === 'pass') c[verdict === 'pass' ? 'truePass' : 'falseFail']++;
    else c[verdict === 'fail' ? 'trueFail' : 'falsePass']++;
  }
  c.agree = c.truePass + c.trueFail;
  c.disagree = c.falsePass + c.falseFail;
  return c;
}

module.exports = { Z95, wilson, fmtInterval, confusion };

if (require.main === module && process.argv.includes('--self-test')) {
  const bad = [];
  let asserted = 0;
  const near = (got, want, tol, what) => {
    asserted++;
    console.log(`${what}: ${got.toFixed(4)}  want ${want.toFixed(4)}`);
    if (Math.abs(got - want) > tol) bad.push(`${what}: ${got.toFixed(6)} is not within ${tol} of ${want.toFixed(4)}`);
  };

  const all = wilson(10, 10);
  near(all.lo, 0.7225, 0.00005, 'wilson(10,10).lo');
  near(all.hi, 1.0000, 0.00005, 'wilson(10,10).hi');
  const none = wilson(0, 10);
  near(none.lo, 0.0000, 0.00005, 'wilson(0,10).lo');
  near(none.hi, 0.2775, 0.00005, 'wilson(0,10).hi');
  const half = wilson(50, 100);
  near(half.lo, 0.4038, 0.00005, 'wilson(50,100).lo');
  near(half.hi, 0.5962, 0.00005, 'wilson(50,100).hi');

  asserted++;
  if (wilson(0, 0) !== null) bad.push('wilson(0, 0) must be null, not an interval');
  console.log('wilson(0,0): null');

  /* Six pairs, counted by hand: truth pass/verdict pass twice, truth fail/verdict fail once,
     one false pass, two false fails. */
  const c = confusion([
    { truth: 'pass', verdict: 'pass' },
    { truth: 'pass', verdict: 'pass' },
    { truth: 'fail', verdict: 'fail' },
    { truth: 'fail', verdict: 'pass' },
    { truth: 'pass', verdict: 'fail' },
    { truth: 'pass', verdict: 'fail' },
  ]);
  const want = { n: 6, truePass: 2, trueFail: 1, falsePass: 1, falseFail: 2, agree: 3, disagree: 3 };
  console.log(`confusion: ${JSON.stringify(c)}`);
  for (const k of Object.keys(want)) {
    asserted++;
    if (c[k] !== want[k]) bad.push(`confusion.${k} = ${c[k]}, want ${want[k]}`);
  }

  if (bad.length) {
    console.log(`\nstats self-test: ${bad.length} of ${asserted} assertions FAILED\n  ${bad.join('\n  ')}`);
    process.exitCode = 1;
  } else {
    console.log(`\nstats self-test: ${asserted}/${asserted} assertions OK — PASS`);
  }
}
