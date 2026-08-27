'use strict';
/* Negative control for checks/check-deploy.js — self-contained, because a deploy gate needs
   an ORIGIN and not a directory.

   It builds a mutated copy of the real build, serves it on an ephemeral local port with
   checks/lib/serve.js in its PLAIN form — no headers option, no form mock, none of the
   scripts/serve-fixture.js scaffolding a healthy origin gets — and asserts that check-deploy
   fails against it. No third-party host is ever probed: a control that reaches out to
   somebody else's server is both impolite and weaker, because it can only fire the
   assertions that host happens to break.

   Injected defects:
     1. dist/about/ removed                  -> a page site.json declares answers 404
     2. <meta name="robots"> stripped from services/index.html
                                             -> the build's own noindex mechanism is gone,
                                                and the page's bytes no longer match the build
     3. plain serve, no response headers      -> every header the deploy contract declares is
                                                absent, on every page
     4. no /api/contact behind the port       -> all three form probes fail

   Byte drift is compared against the repo's pristine dist/ (check-deploy reads --root, which
   defaults there, while --url points at the mutated copy), and --require-current escalates
   drift from a note to a failing row.

   --negative INVERTS check-deploy's exit code: 0 only when the run found failures, 1 loudly
   when the control passed — a control that passes has proven the assertions are vacuous.
   So the judgement here is: child exit 0 AND the "negative control fired" line on stdout.

   CRITICAL — the child is spawned ASYNCHRONOUSLY, and that is not a style preference. This
   process HOSTS the origin the child probes. execFileSync blocks the event loop that the
   http server is listening on, so every request from the child would sit unanswered until the
   child timed out: a 120-second deadlock of the control against itself, with no error message
   that points at the cause. Any future control that serves something and then probes it
   inherits this trap. */

const { execFile } = require('child_process');
const path = require('path');
const F = require('../fixture');
const { serve } = require('../../checks/lib/serve');

const run = (file, args) => new Promise((resolve) => {
  execFile(file, args, { encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024 },
    (err, stdout, stderr) => resolve({
      out: (stdout || '') + (stderr || ''),
      code: err ? (typeof err.code === 'number' ? err.code : 1) : 0,
    }));
});

(async () => {
  F.build(__dirname, {
    remove: ['dist/about'],
    html: {
      /* Hand-rolled changed-bytes guard: this mutation is a regex strip rather than an
         injection, so it is exactly the kind that can silently stop matching. The builder's
         own guard would catch a no-op too; this one names WHAT stopped matching. */
      'dist/services/index.html': (s) => {
        const out = s.replace(/<meta name="robots"[^>]*>/i, '');
        if (out === s) {
          throw new Error('no <meta name="robots"> in services/index.html — the strip matched nothing, so the robots-meta assertion would have nothing to catch');
        }
        return out;
      },
    },
  });

  const srv = await serve(path.join(__dirname, 'dist'));
  const url = srv.url.replace(/\/$/, '');
  const checker = path.join(F.REPO, 'checks', 'check-deploy.js');
  const { out, code } = await run(process.execPath, [checker, '--url', url, '--negative', '--require-current']);
  await srv.close();

  console.log(`$ node checks/check-deploy.js --url ${url} --negative --require-current`);
  console.log(out.trim());
  console.log(`check-deploy exit=${code}`);

  if (code !== 0 || !/negative control fired/.test(out)) {
    console.log('!! the deploy control did NOT fire — check-deploy.js assertions are suspect');
    process.exitCode = 1;
  }
})().catch((e) => { console.error(e.message || e); process.exitCode = 1; });
