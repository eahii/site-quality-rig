'use strict';
/* The local stand-in for a deployed origin: the built site served with the response headers
   the deploy contract declares, plus a mock of the submit endpoint the contract describes.
   `check-deploy.js --local` drives this, so the deploy gate — and its negative control — can
   be exercised with no third-party host involved and no network access.

   lib/serve.js has no request hook, so the endpoint lives in a small front server that answers
   the contract's POST path itself and forwards every other request to it byte for byte.

   Usage: node scripts/serve-fixture.js [--root BUILT_SITE_DIR]
     --root  the built site directory to serve (default: <repo>/dist)
   The contract is always read from <repo>/contracts/deploy-contract.json. */

const http = require('http');
const path = require('path');
const { serve } = require('../checks/lib/serve');
const T = require('../checks/lib/static');

const CONTRACT = path.join(T.REPO, 'contracts', 'deploy-contract.json');

function readBody(req, cap = 65536) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > cap) { req.destroy(); reject(new Error('request body over cap')); }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function handleForm(req, res, form, headers) {
  const send = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
    res.end(JSON.stringify(body));
  };
  let data;
  try { data = JSON.parse((await readBody(req)) || '{}'); }
  catch { return send(400, { ok: false, error: 'body is not JSON' }); }
  const filled = (k) => typeof data[k] === 'string' && data[k].trim() !== '';
  /* Honeypot first, and answered exactly like a success: a caught bot that learns it was
     caught comes back with the field left empty. */
  if (form.honeypot && filled(form.honeypot)) return send(200, { ok: true });
  const missing = (form.required || []).filter((k) => !filled(k));
  if (missing.length) return send(400, { ok: false, error: `missing required field(s): ${missing.join(', ')}` });
  /* demo:true is the promise that nothing reached a human — the flag a probe asserts before
     it is willing to POST to an origin at all. */
  return send(200, { ok: true, demo: true });
}

async function startFixtureServer(opts = {}) {
  const contract = T.readJson(CONTRACT, null);
  if (!contract) throw new Error(`no deploy contract at ${CONTRACT}`);
  const root = opts.root ? path.resolve(opts.root) : path.join(T.REPO, 'dist');
  const headers = contract.required_headers || {};
  const form = contract.form || null;

  const inner = await serve(root, { headers });
  const innerPort = new URL(inner.url).port;
  const sockets = new Set();

  const front = http.createServer((req, res) => {
    let pathname = '/';
    try { pathname = new URL(req.url, 'http://x').pathname; } catch { /* keep '/' — forwarded as-is below */ }
    if (form && req.method === 'POST' && pathname === form.path) {
      handleForm(req, res, form, headers).catch(() => {
        res.writeHead(400, { 'content-type': 'application/json', ...headers });
        res.end(JSON.stringify({ ok: false, error: 'bad request' }));
      });
      return;
    }
    const up = http.request(
      { host: '127.0.0.1', port: innerPort, path: req.url, method: req.method, headers: req.headers },
      (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); }
    );
    up.on('error', (e) => {
      res.writeHead(502, { 'content-type': 'text/plain', ...headers });
      res.end(`502 ${e.message}`);
    });
    req.pipe(up);
  });
  front.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  await new Promise((r) => front.listen(0, '127.0.0.1', r));

  const { port } = front.address();
  return {
    url: `http://127.0.0.1:${port}/`,
    root,
    form,
    headers,
    close: async () => {
      for (const s of sockets) s.destroy();
      await new Promise((r) => front.close(r));
      await inner.close();
    },
  };
}

module.exports = { startFixtureServer };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const rootArg = argv.includes('--root') ? argv[argv.indexOf('--root') + 1] : null;
  startFixtureServer({ root: rootArg }).then((s) => {
    console.log(`serving ${path.relative(T.REPO, s.root) || '.'} at ${s.url}`);
    console.log(`headers: ${Object.entries(s.headers).map(([k, v]) => `${k}: ${v}`).join(' | ') || '(none declared)'}`);
    console.log(s.form ? `form endpoint: POST ${s.form.path} required=[${(s.form.required || []).join(', ')}] honeypot=${s.form.honeypot || '(none)'}` : 'form endpoint: none declared');
    console.log('Ctrl-C to stop.');
  }).catch((e) => { console.error(e.message); process.exitCode = 1; });
}
