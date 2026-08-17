// Plain Node http server — no dependencies. Stands in for a real upstream API
// so the Express server's GET /api/users route (via minder()) has something to
// fetch from. Mirrors ../edge-worker/mock-upstream.mjs; runs on a different
// fixed port (4401) so both examples' ci:smoke/CI jobs can run concurrently
// without a port clash. Only serves GET /users; everything else is 404.
import http from 'node:http';

const PORT = 4401;
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
