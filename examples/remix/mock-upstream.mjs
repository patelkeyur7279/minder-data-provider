// Plain Node http server — no dependencies. Stands in for a real upstream API
// so both the loader's minder() call and the /api/users resource route have
// something to fetch from. Only serves GET /users; everything else is 404.
// Pattern copied from ../edge-worker/mock-upstream.mjs.
import http from 'node:http';

const PORT = 8788;
const HOST = '127.0.0.1';

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/users') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify([{ id: 1, name: 'Ada', email: 'ada@example.com' }]));
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, HOST, () => {
  console.log(`mock upstream listening on http://${HOST}:${PORT}`);
});
