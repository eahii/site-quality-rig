'use strict';
/* The whole battery, in one command: build, then every checker in turn, then one table.

   Sequential on purpose. The checkers each launch browsers and each serve their own root on
   an ephemeral port; run in parallel they contend for CPU, and a tap-target or fold
   measurement taken on a starved machine is a flaky red that teaches people to re-run until
   green. A slow honest gate beats a fast unreliable one.

   Output is streamed, not captured-then-printed: a battery that goes quiet for ten minutes
   is a battery nobody waits for. The summary is rebuilt from each checker's own finish()
   stamp, so the table can never claim a denominator the checker did not print.

   Every argument is forwarded to every checker, so `npm test -- --engines chromium
   --shots 0` narrows the whole battery at once.

   Usage: node scripts/run-checks.js [checker args...] */

const { spawn } = require('child_process');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const PASSTHROUGH = process.argv.slice(2);

const CHECKS = [
  ['links', 'checks/check-links.js', []],
  ['viewports', 'checks/measure-viewports.js', []],
  ['contrast', 'checks/check-contrast.js', []],
  ['motion', 'checks/check-motion.js', []],
  ['harden', 'checks/check-harden.js', []],
  ['hero', 'checks/check-hero.js', []],
  /* --local spawns the fixture origin from scripts/serve-fixture.js. The gate has no
     default URL by design, so the battery must name one or the checker prints usage. */
  ['deploy', 'checks/check-deploy.js', ['--local']],
];

/* The one line every checker ends on: "name: N/M cells OK — PASS|FAIL [stamp]". */
const FINISH = /^(\S+): (\d+)\/(\d+) cells OK\s+[-—]+\s+(PASS|FAIL)\s+\[(.*)\]\s*$/;

function run(script, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(REPO, script), ...args, ...PASSTHROUGH], {
      cwd: REPO,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let pending = '';
    let finish = null;
    /* Buffered by line, not by chunk: a finish stamp that straddles two reads would be
       invisible to a per-chunk match, and the table would report UNSTAMPED for a checker
       that printed its stamp perfectly well. */
    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const line of lines) {
        const m = line.match(FINISH);
        if (m) finish = { ok: m[2], total: m[3], verdict: m[4], stamp: m[5] };
      }
    });
    child.on('close', (code) => {
      const m = pending.match(FINISH);
      if (m) finish = { ok: m[2], total: m[3], verdict: m[4], stamp: m[5] };
      resolve({ code: code === null ? 1 : code, finish });
    });
  });
}

(async () => {
  const build = await run('scripts/build.js', []);
  if (build.code !== 0) {
    console.error('\nbuild failed — the battery measures the BUILT site, so there is nothing to check.');
    process.exit(build.code);
  }

  const results = [];
  for (const [name, script, args] of CHECKS) {
    console.log(`\n${'='.repeat(78)}\n== ${name}  (node ${script}${[...args, ...PASSTHROUGH].map((a) => ' ' + a).join('')})\n${'='.repeat(78)}`);
    const { code, finish } = await run(script, args);
    results.push({ name, code, finish });
  }

  const w = (s, n) => String(s).padEnd(n);
  console.log(`\n${'='.repeat(78)}\n== battery summary\n${'='.repeat(78)}`);
  console.log(`${w('checker', 12)}${w('verdict', 9)}${w('cells', 12)}stamp`);
  for (const { name, code, finish } of results) {
    /* A checker that exited without printing a finish stamp is reported as UNSTAMPED, never
       folded into PASS: the table's whole job is to refuse to speak for a checker that did
       not report its own denominator. */
    if (!finish) console.log(`${w(name, 12)}${w(code === 0 ? 'UNSTAMPED' : 'ERROR', 9)}${w('-', 12)}exit ${code}, printed no finish line`);
    else console.log(`${w(name, 12)}${w(finish.verdict, 9)}${w(`${finish.ok}/${finish.total}`, 12)}${finish.stamp}`);
  }

  const red = results.filter((r) => r.code !== 0 || !r.finish || r.finish.verdict !== 'PASS');
  console.log(red.length
    ? `\nbattery: ${results.length - red.length}/${results.length} checkers PASS — FAIL (${red.map((r) => r.name).join(', ')})`
    : `\nbattery: ${results.length}/${results.length} checkers PASS`);
  process.exit(red.length ? 1 : 0);
})();
