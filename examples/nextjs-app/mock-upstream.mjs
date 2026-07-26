// Plain Node http server — no dependencies. Stands in for a real upstream API
// so pages/ssr-users.tsx's getServerSideProps -> minder() call (server-side,
// during SSR) has something real to fetch from. Only serves GET /users;
// everything else is 404. Mirrors examples/edge-worker/mock-upstream.mjs,
// just on a different port so both examples can run standalone without a
// port clash.
import http from 'node:http';

const PORT = process.env.MOCK_UPSTREAM_PORT ? Number(process.env.MOCK_UPSTREAM_PORT) : 8790;
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
