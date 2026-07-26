# Node.js Express API Example

This example is the runnable **Node-server evidence** for `minder-data-provider`:
it proves both the `minder()` data path and the `minder-data-provider/server`
entry point work on a real Node.js HTTP server (Express), not just in
browser/edge bundles. See
[`docs/product/SUPPORT_MATRIX.md`](../../../docs/product/SUPPORT_MATRIX.md).

## What it proves

- **`GET /api/users`** — the `minder()` JSON data path (via
  `minder-data-provider/node` + `minder-data-provider/config`), fetching from
  a configurable upstream (`API_URL` env var). In CI/`ci:smoke` it points at a
  plain-Node mock upstream (`mock-upstream.mjs`, same pattern as
  [`../../edge-worker/mock-upstream.mjs`](../../edge-worker/mock-upstream.mjs))
  that returns `[{"id":1,"name":"Ada"}]`.
- **`POST /api/webhook`** — HMAC-SHA256 webhook signature verification via
  `minder-data-provider/server`'s `createWebhookHandler` + `secret()`,
  mounted onto Express with `toNodeHandler` — the Node-specific adapter that
  bridges the library's web-standard `(Request) => Response` handler onto
  Express's `(req, res)` signature. Accepts a valid signature (200
  `{"verified":true,...}`) and rejects a tampered one (401). This is the same
  HMAC verification code path the Cloudflare Worker example exercises
  ([`../../edge-worker/src/index.ts`](../../edge-worker/src/index.ts)), proving
  it also runs correctly on plain Node (via `toNodeHandler`) — not just on
  edge runtimes.

## 🎯 What You'll Learn

- Using `minder()` in Express route handlers
- Mounting `minder-data-provider/server`'s web-standard handlers onto Express
  via `toNodeHandler`
- CRUD operations with consistent API
- Rate limiting middleware
- Error handling patterns
- Security best practices

## Requirements

- Node.js **>= 20**
- npm >= 9

## 🚀 Quick Start

```bash
# Run setup script (builds the root package, then npm installs this example
# against its file:../../../ dependency)
./setup.sh

# Or manually:
(cd ../../.. && npm run build)
npm install
cp .env.example .env

# Start development server
npm run dev
```

Server runs at: http://localhost:3001 (`PORT` in `.env`, default `3001`).

## 📁 Project Structure

```
mock-upstream.mjs        # plain-Node mock upstream for GET /api/users (ci:smoke)
ci-smoke.sh               # self-contained CI smoke test (npm run ci:smoke)
src/
├── app.ts                # Express app factory (no listener — used by tests)
├── index.ts               # boots the HTTP listener (guarded for direct-run only)
├── config/
│   └── api.ts            # Minder configuration
├── routes/
│   ├── users.ts           # User CRUD endpoints (minder() data path)
│   └── webhook.ts         # HMAC webhook verification (minder-data-provider/server)
├── middleware/
│   ├── rateLimiter.ts     # Rate limiting
│   └── errorHandler.ts    # Error handling
└── types/
    └── index.ts           # TypeScript types
```

## 🛣️ API Endpoints

### Health Check

```bash
GET /health
# Returns server status
```

### Users

```bash
GET    /api/users          # List all users (paginated)
GET    /api/users/:id      # Get single user
POST   /api/users          # Create user
PUT    /api/users/:id      # Update user
DELETE /api/users/:id      # Delete user
```

### Webhook

```bash
POST /api/webhook          # HMAC-SHA256 verified webhook receiver
```

## 💡 Key Concepts

### 1. Using minder() in Routes

```typescript
// Same API as client-side!
const { data, error, success } = await minder<User[]>(API_ENDPOINTS.USERS);

if (!success || error) {
  throw new AppError(error?.message || "Failed to fetch", 500);
}

res.json({ success: true, data });
```

**Why this approach?**

- Consistent interface (same as `useMinder()`)
- Type-safe responses
- Built-in error handling
- Easy to test

### 2. Mounting minder-data-provider/server on Express

```typescript
import { createWebhookHandler, secret, toNodeHandler } from 'minder-data-provider/server';

const webhookHandler = createWebhookHandler({
  secret: secret('NODEJS_WEBHOOK_SECRET', process.env.NODEJS_WEBHOOK_SECRET ?? 'nodejs-smoke-secret'),
  signatureHeader: 'x-minder-signature',
  algorithm: 'hmac-sha256',
  onEvent: async ({ body }) => new Response(JSON.stringify({ verified: true, body }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }),
});

router.post('/', toNodeHandler(webhookHandler));
```

**Why `toNodeHandler`?**

`createWebhookHandler` returns a web-standard `(Request) => Promise<Response>`
handler (edge-safe: WebCrypto only, no Node APIs). `toNodeHandler` adapts it to
Express's `(req, res)` signature. This route is mounted **before**
`express.json()` in `src/app.ts` — the handler needs the raw request body to
verify the HMAC signature, and `express.json()` would drain the body stream
first.

### 3. Rate Limiting

```typescript
app.use(
  rateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100, // 100 requests max
  })
);
```

### 4. Error Handling

```typescript
// Centralized error handler
app.use(errorHandler);

// Custom errors with status codes
throw new AppError("User not found", 404, "USER_NOT_FOUND");
```

### 5. Async Error Handling

```typescript
router.get('/', asyncHandler(async (req, res) => {
  // Any error here automatically caught
  const { data } = await minder(...);
  res.json(data);
}));
```

## 🧪 Testing

### Unit tests (Jest + supertest)

```bash
npm test
# or watch mode
npm run test:watch
```

Covers `GET /health` and `POST /api/webhook` (valid signature, tampered
signature, missing signature header) against the app in-process — no network,
no listening port.

### ci:smoke (uniform CI contract)

```bash
npm run build     # tsc -> dist/
npm run ci:smoke  # starts mock upstream (:4401) + server (:4402), curl-verifies, tears down
```

`ci-smoke.sh` is self-contained:

- Starts `mock-upstream.mjs` on fixed port **4401**.
- Starts `dist/index.js` on fixed port **4402** (`PORT=4402`,
  `API_URL=http://127.0.0.1:4401`, `NODEJS_WEBHOOK_SECRET=nodejs-smoke-secret`)
  — distinct from the dev default (3001) so it never collides with `npm run dev`.
- Waits (bounded, 30s max) for both to become ready via `curl --max-time`
  polling — never an unbounded hang.
- Verifies `GET /api/users` response body contains `"Ada"`.
- Verifies `POST /api/webhook` with a valid HMAC-SHA256 signature returns
  `{"verified":true,...}` (200), and with a tampered signature returns 401.
- Kills both background processes on exit (success or failure) via a `trap`.

## Local proof against the packed tarball

By default this example depends on `minder-data-provider` via
`"file:../../../"` (a directory link — see `package.json`). To prove it also
works when installed exactly like a real npm consumer (as CI's
`edge-worker-example` job does for the edge-worker example), override with the
packed tarball:

```bash
# From the repo root:
npm run build
npm pack

# From this directory:
npm install
npm install ../../../minder-data-provider-*.tgz

npm run build
npm run ci:smoke
```

## 🔒 Security Features

- **Helmet**: Security HTTP headers
- **CORS**: Cross-origin resource sharing
- **Rate Limiting**: Prevent abuse
- **HMAC webhook verification**: constant-time signature check via WebCrypto
  (`minder-data-provider/server`)
- **Input Validation**: Validate all inputs
- **Error Sanitization**: Don't leak internal errors

## 📊 Example Requests

### Create User

```bash
curl -X POST http://localhost:3001/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "username": "johndoe",
    "email": "john@example.com"
  }'
```

### Get Users with Pagination

```bash
curl http://localhost:3001/api/users?page=1&limit=5
```

### Webhook (valid signature)

```bash
BODY='{"event":"ping"}'
SIG=$(node -e "const c=require('crypto');process.stdout.write(c.createHmac('sha256','nodejs-smoke-secret').update(process.argv[1]).digest('hex'))" "$BODY")
curl -X POST http://localhost:3001/api/webhook \
  -H "Content-Type: application/json" \
  -H "x-minder-signature: $SIG" \
  -d "$BODY"
```

## 🎓 Learning Resources

- [Express.js Documentation](https://expressjs.com/)
- [TypeScript with Express](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-1.html)
- [API Security Best Practices](https://owasp.org/www-project-api-security/)

## 🚀 Production Deployment

1. Set environment variables
2. Build the project: `npm run build`
3. Start production server: `npm start`

For production, consider:

- Use Redis for rate limiting
- Implement proper logging (Winston, Pino)
- Add authentication (JWT, OAuth)
- Use process manager (PM2, Docker)
- Enable HTTPS
- Add monitoring (New Relic, DataDog)

## 🤝 Contributing

Found an issue or have a suggestion? Please file an issue!
