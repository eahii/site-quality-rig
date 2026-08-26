/* One reporting shape for every checker, so a control run can grep a FAIL line and so
   no checker can end with a bare "OK". Every finish() prints the as-of stamp (root,
   engines, cell count) — a verdict without its as-of cannot be re-checked later. */
const { execSync } = require('child_process');

function gitSha() {
  try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return process.env.GIT_SHA || 'no-git'; }
}

function report(name) {
  const rows = [];
  const notes = [];
  const api = {
    /* probs = array of strings; empty array = this cell passed */
    row(scope, probs) { rows.push({ scope, probs: (probs || []).filter(Boolean) }); return api; },
    fail(scope, msg) { rows.push({ scope, probs: [msg] }); return api; },
    ok(scope) { rows.push({ scope, probs: [] }); return api; },
    note(msg) { notes.push(msg); return api; },
    get failCount() { return rows.filter((r) => r.probs.length).length; },
    finish(meta = {}) {
      console.log('');
      for (const r of rows) {
        if (r.probs.length) console.log(`FAIL  ${r.scope}\n        ${r.probs.join('\n        ')}`);
      }
      const bad = rows.filter((r) => r.probs.length).length;
      for (const n of notes) console.log(`note  ${n}`);
      const stamp = Object.entries({ sha: gitSha(), ...meta }).map(([k, v]) => `${k}=${v}`).join(' ');
      console.log(`\n${name}: ${rows.length - bad}/${rows.length} cells OK — ${bad ? 'FAIL' : 'PASS'}  [${stamp}]`);
      if (bad) process.exitCode = 1;
      return bad;
    },
  };
  return api;
}

module.exports = { report, gitSha };
