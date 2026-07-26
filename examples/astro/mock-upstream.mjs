// Plain Node http server — no dependencies. Stands in for a real upstream API
// so the Astro SSR page's server-side minder() call has something to fetch
// from. Pattern copied from ../edge-worker/mock-upstream.mjs. Only serves
// GET /users; everything else is 404.
import http from 'node:http';

const PORT = 8788;
const HOST = '127.0.0.1';

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/users') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify([{ id: 1, name: 'Ada' }]));
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, HOST, () => {
  console.log(`mock upstream listening on http://${HOST}:${PORT}`);
});
