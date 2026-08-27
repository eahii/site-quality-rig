/* Zero-dep static server for the checkers. Every checker serves its own root on an
   ephemeral port so a stale `python3 -m http.server` in another terminal can never be the
   thing under test (that failure mode is silent and looks like a pass). */
const http = require('http');
const fs = require('fs');
const path = require('path');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.avif': 'image/avif', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};

/* opts.headers = { name: value } merged into every response, so a checker that asserts
   on response headers can drive this server instead of a remote deployment. */
async function serve(root, opts = {}) {
  const base = path.resolve(root);
  const extraHeaders = opts.headers || {};
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { p = '/'; }
    if (p.endsWith('/')) p += 'index.html';
    let file = path.resolve(path.join(base, p));
    const rel = path.relative(base, file);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      res.writeHead(403, { ...extraHeaders });
      return res.end('403');
    }
    if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
    /* cleanUrls parity: a trailing slash and a bare directory both resolve to that
       directory's index.html, the way static hosts serve /about → about/index.html. */
    if (fs.existsSync(file) && fs.statSync(file).isDirectory() && fs.existsSync(path.join(file, 'index.html'))) {
      file = path.join(file, 'index.html');
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      /* Real static hosts answer a miss with the site's own 404 page, at status 404. Without
         this, a built 404 page is the one page in the site that no check can ever render. */
      const notFound = path.join(base, '404.html');
      if (fs.existsSync(notFound) && fs.statSync(notFound).isFile()) {
        res.writeHead(404, { 'content-type': TYPES['.html'], 'cache-control': 'no-store', ...extraHeaders });
        return fs.createReadStream(notFound).pipe(res);
      }
      res.writeHead(404, { 'content-type': 'text/plain', ...extraHeaders });
      return res.end('404 ' + p);
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
      ...extraHeaders,
    });
    fs.createReadStream(file).pipe(res);
  });
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/`,
    root: base,
    close: () => new Promise((r) => { for (const s of sockets) s.destroy(); server.close(r); }),
  };
}

module.exports = { serve };
