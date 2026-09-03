# Migration Guide

> **Where the "v3.0" changes actually live (updated 2026-08-16):** the v3.0 train
> (Redux removal, `as const` enums, `sideEffects: false`, detectMethod re-contract,
> idempotent-only retries) shipped into the **2.2.0-beta line** (beta.0 carried the
> Redux removal; beta.2 carries the rest, plus additional breaking changes made
> during beta — the `useAuth`/`useAuthToken` split and `XSSSanitizer`'s fail-closed
> behavior) by owner decision. **Settled: the stable cut is 2.2.0, not 3.0.0.** The
> section headings below keep the "v2.x → v3.0" names because that is the semantic
> migration you are performing, even though the version number landing it is 2.2.0.
> If your app depends on `^2.1.4`, this is a breaking upgrade delivered as a minor
> version bump — **start with the checklist immediately below.**

If you're upgrading a real app pinned to `^2.1.4`, read **"Upgrading from 2.1.4 to
2.2.0"** right below — one checklist covering every breaking and default-changing
item in this release, each linked to its full write-up. The detail sections after
it (**2.2.0-beta.2 → 2.2.0**, **v2.x → v3.0**, **2.2.0-beta.0 → 2.2.0-beta.1**, and
the older **v1.x → v2.0** guide further down) are the reference material the
checklist links into — you don't need to read them front-to-back.

## Upgrading from 2.1.4 to 2.2.0

Everything below lands on `^2.1.4` consumers as part of a routine `npm update` —
none of it is gated behind a major version bump. Work down the table; "Action
needed" tells you whether your code has to change.

| # | Change | Action needed | Details |
|---|---|---|---|
| 1 | Redux integration removed (`useStore`, `useReduxSlice`, `ReduxConfig`, the Redux `<Provider>` wrapper) | Only if you used the Redux hooks/config — try `npx minder codemod redux-removal --dry-run` | [Redux removed](#v2x--v30--redux-integration-removed-breaking) |
| 2 | Exported "enums" (`HttpMethod`, `QueryStatus`, …) are now `as const` objects, not TS `enum`s | Only for enum-member-as-type usage or `enum` declaration merging | [Enums as const](#v2x--v30--enums-are-now-as-const-objects-breaking-for-enum-only-ts-ops) |
| 3 | `"sideEffects": false` restored in `package.json` | None — informational; this is what makes tree-shaking honest again | [Enums as const](#v2x--v30--enums-are-now-as-const-objects-breaking-for-enum-only-ts-ops) |
| 4 | `detectMethod`: only ID-shaped final route segments (numeric/UUID/24-hex) auto-detect `PUT`; slug/word segments now default to `POST` | Only if a slug route relied on auto-`PUT` — pass `options.method` or an `id`/`_id` field | [detectMethod re-contract](#v2x--v30--detectmethod-only-auto-detects-put-on-id-shaped-segments-breaking) |
| 5 | `detectMethod` no longer infers `DELETE` from a `delete` key in the payload | Only if you relied on `{ delete: true }` issuing `DELETE` — pass `{ method: 'DELETE' }` explicitly | [delete-key inference removed](#detectmethod-no-longer-turns-a-delete-key-into-an-http-delete) |
| 6 | `minder()` retries are idempotent-only by default (GET/HEAD/OPTIONS/PUT/DELETE); POST/PATCH no longer auto-retry | Pass `retryNonIdempotent: true` if you relied on POST/PATCH retrying | [Idempotent-only retries](#v2x--v30--minder-retries-are-idempotent-only-by-default-breaking) |
| 7 | `useAuth()` is now the capability-contract hook on **every** import path (root, `/web`, `/nextjs`, `/electron`, `/auth`, `/native`, `/expo`) — on 2.1.4 it was the token-storage hook on all of them, with no split. The old token-storage shape is preserved and renamed `useAuthToken()`, also exported from every import path | **This affects root/`/web`/`/nextjs`/`/electron` imports too, not only `/auth`/`/native`/`/expo`.** If any call site does `setToken`/`getToken`/`clearAuth`/`isLoggedIn`/`isAuthenticated`/`setRefreshToken`/`getRefreshToken` on the result of `useAuth()`, switch that call to `useAuthToken()` — same shape, same import path. Root importers: this does **not** fail to compile or fail at import time; it throws only when a legacy accessor is actually called, so `tsc`/import checks won't catch it | [useAuth / useAuthToken split](#useauth-is-one-hook-everywhere-the-token-store-is-now-useauthtoken) |
| 8 | `security.sanitization` sanitizes nothing by default now (opt-in per field via `fields`); `sanitize()` throws `SANITIZER_UNAVAILABLE` instead of silently degrading, on every non-browser runtime too | If you relied on the old blanket recursive sanitization of every request-body string — add an explicit `fields` allowlist | [XSSSanitizer fails closed / opt-in fields](#xsssanitizersanitize-now-fails-closed-everywhere-and-sanitization-is-opt-in-per-field) |
| 9 | `isAuthenticated()` fails closed on a corrupt/expired JWT-shaped token (was previously treated as valid) | Only if you intentionally stored JWT-shaped-but-invalid strings — use `getToken() !== null` instead | [Fail-closed isAuthenticated](#1-fail-closed-isauthenticated) |
| 10 | CORS defaults no longer combine a wildcard origin with credentials (`credentials: false` by default) | Only if you relied on credentialed wildcard CORS — set an explicit origin allowlist | [CORS defaults](#2-cors-defaults) |
| 11 | No forced CORS preflight: default request headers are just `Content-Type`/`Accept`; `withCredentials` defaults to `false` | Only if you relied on cookies being sent by default, or on security-response headers being attached to requests | [No forced CORS preflight](#3-no-forced-cors-preflight) |
| 12 | Default query retry is 1, not 3; explicit `retries: 0` / `retryDelay: 0` now actually disable retries | Set `performance.retries: 3` to restore the old default | [Default retry changed](#4-default-retry-changed) |
| 13 | `@tanstack/react-query`, `@tanstack/query-core`, and the optional Redux/devtools packages moved from `dependencies` to `peerDependencies` | Make sure `@tanstack/react-query` is in your own `package.json` (you almost certainly already have it) | [peerDependencies move](#5-peerdependencies-move) |
| 14 | `@tanstack/react-query-devtools` is never auto-imported by any main entry; mounting it is now an explicit opt-in via `minder-data-provider/devtools-rq` | Only if you relied on devtools auto-mounting — import `ReactQueryDevtools` from the new entry and mount it yourself | [DevTools moved to an opt-in entry](#5b-devtools-moved-to-an-opt-in-entry) |
| 15 | Standalone `minder()`'s per-call `baseURL` is now refused (resolves `{ success: false, error: { code: 'UNSAFE_REQUEST_OPTION_OVERRIDE' } }` — it does **not** throw by default) when combined with a registered route's own declared headers or an ambient bearer token | Only if you passed a per-call `baseURL` alongside a registered route/token that carries a credential — reconfigure the destination via `configureMinder()` instead, or supply your own `options.token`/`options.headers` explicitly. Check `result.success`/`result.error.code`, not a `try/catch`, unless you also pass `options.throwOnError: true` | [minder()'s per-call baseURL now refuses to redirect credentials](#minders-per-call-baseurl-now-refuses-to-redirect-credentials) |
| 16 | Standalone `minder()`'s `options.params` values substituted into a registered route's `:param` URL segment are now validated (resolves `{ success: false, error: { code: 'UNSAFE_ROUTE_PARAM_VALUE' } }` — it does **not** throw by default) — `null`/`undefined`, non-string/number/bigint values, non-finite numbers, an empty/whitespace-only string, or a value containing `..`, `/`, `\`, `?`, `#`, or a control character (raw or percent-encoded) is refused before dispatch instead of being spliced into the URL unencoded | Only if you passed an unvalidated, externally-sourced value (e.g. straight from a URL/query string) as a route param without checking it first — validate/whitelist the value yourself before calling `minder()`, or catch `result.error.code === 'UNSAFE_ROUTE_PARAM_VALUE'`. Legitimate ids (numbers, leading-zero strings, UUIDs, nested-route ids) are unaffected | [minder()'s route params are now validated before URL substitution](#minders-route-params-are-now-validated-before-url-substitution) |
| 17 | `configureMinder` imported from `/web`, `/native`, `/node`, or `/electron` now resolves to the real, routes-aware, `apiUrl`-based implementation, not the `@deprecated` `{ baseURL }`-only function it silently fell back to before | Only if you relied on the old function's specific behavior (no routes registered) — your routes are now actually registered. If you called `configureMinder({ baseURL })`, it keeps working unchanged: `baseURL` is accepted as a deprecated, one-time-warned alias for `apiUrl` — but migrate to `apiUrl` since `baseURL` is removed in v3.0 | [configureMinder on /web, /native, /node, /electron now resolves to the real implementation](#configureminder-on-web-native-node-electron-now-resolves-to-the-real-implementation) |

None of this requires a code change if you weren't using the specific behavior
listed — but items 4–8 are silent-until-runtime (no type error, no test failure
unless you have coverage for the exact case), so a quick search for `useAuth`
imports from `/auth`/`/native`/`/expo` and for `{ delete: ... }` payloads is worth
doing even after `tsc`/tests pass clean. The sections below give the full
"what changed / why / how to migrate" for every row.

## 2.2.0-beta.2 → 2.2.0 (BREAKING)

### `detectMethod` no longer turns a `delete` key into an HTTP DELETE

**What changed.** A payload containing a `delete` property used to be sent as
`DELETE`. Any ordinary object that happens to carry a `delete` field — permissions,
capability flags, feature toggles — was therefore issued as a destructive request.
That inference is gone.

| Before | After |
|---|---|
| `minder('permissions', { delete: true })` → `DELETE /permissions` | → `POST /permissions` |
| `minder('users/1', { delete: true })` → `DELETE /users/1` | → `PUT /users/1` |
| `minder('users/1', null, { method: 'DELETE' })` → `DELETE /users/1` | unchanged |

**Migration.** Search your codebase for object literals passed to `minder()` /
`useMinder()` that contain a `delete` key. If the intent was a delete, pass it
explicitly — `minder('users/1', null, { method: 'DELETE' })`, or register the route
with `method: 'DELETE'`. If the `delete` key was ordinary data, you were sending
the wrong verb and the new behavior is the fix.

### `useAuth` is one hook everywhere; the token store is now `useAuthToken`

**What changed, verified against the published 2.1.4 package (not assumed).**
We installed `minder-data-provider@2.1.4` from the npm registry into a scratch
directory and inspected the built `dist/index.js`, `dist/platforms/{web,nextjs,
electron,native,expo}.js`, and `dist/auth/index.js` directly. On 2.1.4,
**every one of these seven import paths exported the exact same function** for
`useAuth` — the token-storage hook (`{ isLoggedIn, setToken, getToken,
clearAuth, isAuthenticated, setRefreshToken, getRefreshToken }`, backed by
`AuthManager`). There was no split and no "contract hook" concept at all in
2.1.4 — it was introduced during the 2.2.0 beta line. An earlier draft of this
guide incorrectly stated that root/`/web`/`/nextjs`/`/electron` already had the
contract hook and were "unchanged" from 2.1.4 — that was false and dangerous:
those are exactly the import paths the README's Quick Start tells new users to
use, so this is the highest-traffic path through this breaking change, not a
niche one.

As of 2.2.0, `useAuth` is always the capability-contract hook, **on every one
of the seven import paths** — root, `/web`, `/nextjs`, `/electron`, `/auth`,
`/native`, `/expo`. The old token-storage shape didn't go away: it's preserved
verbatim and renamed `useAuthToken`, and — unlike in some interim beta
snapshots — `useAuthToken` is exported from **all seven** of those same import
paths, not only `/auth`/`/native`/`/expo`.

| Import (any of the seven paths above) | 2.1.4 `useAuth()` | 2.2.0 `useAuth()` | 2.2.0 `useAuthToken()` |
|---|---|---|---|
| root `minder-data-provider` / `/web` / `/nextjs` / `/electron` | token store | **capability-contract hook (BREAKING)** | token store — same shape as 2.1.4's `useAuth`; newly available here |
| `/auth` / `/native` / `/expo` | token store (identical function to the row above) | **capability-contract hook (BREAKING)** | token store — same shape |

| Old (`useAuth`, any 2.1.4 import path) | New |
|---|---|
| `const { isLoggedIn, setToken, getToken, clearAuth } = useAuth()` | `const { isLoggedIn, setToken, getToken, clearAuth } = useAuthToken()` |
| `isAuthenticated()` | `useAuthToken().isAuthenticated()` |
| session-based checks | `const { ready, session, signOut } = useAuth()` — requires a registered capability provider |

**Migration.** In every file calling `useAuth()` and then reading
`setToken`/`getToken`/`clearAuth`/`isLoggedIn`/`isAuthenticated`/
`setRefreshToken`/`getRefreshToken` off the result — **regardless of which of
the seven paths it's imported from, including plain `import { useAuth } from
"minder-data-provider"`** — switch that call to `useAuthToken()` instead; the
shape is unchanged, only the name changes. If you want session state from a
certified provider (Clerk, Supabase, Auth0, Cognito, Auth.js), keep `useAuth`
and register the provider; it now returns `{ ready, error, session, signOut,
getProviderClient }`. There is no deprecated alias: the two shapes share no
properties, so a compatible alias was not possible. Because this compiles and
imports cleanly either way, `tsc` and a passing test suite will not catch a
missed call site — grep your codebase for `useAuth()` and check what it's
destructured into.

**Note.** Earlier docs showed `const { login, logout, isAuthenticated } = useAuth()`
from `/auth`. No shipped `useAuth` ever returned that shape and those examples threw
at runtime. `docs/USAGE_GUIDE.md` is corrected in this release.

### `XSSSanitizer.sanitize()` now fails closed everywhere, and sanitization is opt-in per field

**What changed — fail-closed.** DOMPurify is lazy-loaded (a dynamic
`import('dompurify')`) so it no longer sits in the static import graph of
minimal entries like `core`/`hook`. Previously, if that dynamic import hadn't
resolved yet, had failed, or the code was running outside a browser at all, a
`sanitize()` call silently fell back to a weaker regex-based sanitizer
(`basicSanitize()`), passing data through without a real DOMPurify pass and
without any error. **`basicSanitize()` has been deleted entirely.**
`sanitize()` now **throws** a `MinderError` with code `SANITIZER_UNAVAILABLE`
(500) on every runtime without a usable DOMPurify instance — a browser where
the dynamic import hasn't resolved yet or failed, **and every non-browser
runtime** (`/node`, `/server`, Next.js SSR — DOMPurify needs a DOM this
library does not fake, so construction never even attempts the import there).
A security control that silently degrades is strictly worse than one that's
visibly absent.

**What changed — opt-in per field.** Sanitizing an object (a request body) is
no longer a blanket recursive walk of every string field. `security.sanitization:
true` (or an object with no `fields`) constructs a working sanitizer but
applies it to **nothing** automatically — the body passes through unchanged.
Only fields named in an explicit `fields` allowlist get sanitized; everything
else is untouched, so ordinary strings like `"Tom & Jerry <3"` are never
HTML-entity-mangled. **Sanitizing request bodies was never a real XSS
control** — DOMPurify operates on data going *out* to your API, not on data
your UI renders — and it stays that way; XSS defence belongs at the point you
render untrusted data (see docs/EXAMPLES.md "XSS Protection" for the
render-time pattern with `dangerouslySetInnerHTML`).

**This can trigger** the fail-closed throw when the dynamic `import()` for
`dompurify` is blocked in a browser — a strict CSP without `script-src`
coverage for the chunk, an offline/flaky-network window, a bundler that fails
to code-split the chunk correctly, or `sanitize()` called before the
sanitizer's `ready()` promise has settled — or unconditionally on any
non-browser runtime.

**Migration.** `XSSSanitizer` is not part of the public API — there is no
`minder-data-provider/utils/security` subpath (that import path never
resolved; `ApiClient`'s and `minder()`'s own internal sanitization paths
already `await ready()` before calling it, so most consumers see none of
this directly). What IS public is the `security.sanitization` config:

```typescript
// Before (pre-2.2.0): every string in the body was recursively sanitized —
// this could silently corrupt ordinary fields ("Tom & Jerry <3" → mangled):
configureMinder({
  apiUrl: "https://api.example.com",
  routes: { comments: "/comments" },
  security: { sanitization: true },
});

// After: `security.sanitization: true` alone is now a no-op pass-through —
// opt in per field. `fields` isn't yet in the published `SecurityConfig`
// TypeScript type, so declare the config as its own variable (structural
// assignment allows the extra property; an inline object literal does not)
// and pass a hand-built `MinderConfig` straight to `<MinderDataProvider>`
// instead of through `configureMinder()`, which only types `sanitization`
// as a boolean:
import type { MinderConfig } from "minder-data-provider";

const sanitization = { enabled: true, fields: ["bio", "comment"] };

const config: MinderConfig = {
  apiBaseUrl: "https://api.example.com",
  routes: { comments: { url: "/comments", method: "GET" } },
  security: { sanitization },
};
// <MinderDataProvider config={config}>...</MinderDataProvider>
```

If you only need the on/off toggle (no field list), `configureMinder({
security: { sanitization: true } })` keeps working — just remember it now
sanitizes nothing without a `fields` allowlist supplied the way shown above.

### Per-call axios options are now an allowlist

**What changed.** `apiClient.request(route, data, params, options)` — and every
path that funnels a per-call `options`/`axiosConfig` bag into it (`useMinder()`'s
`mutate(data, { axiosConfig })`, its own query-time `axiosConfig`, and the
`operations.*` helpers) — used to forward the caller's per-call options
**verbatim** into the outgoing axios request config. Adversarial testing found
that this let a per-call option override **where the request goes or how it is
physically transported** (`url`, `baseURL`, `proxy`, `adapter`,
`transformRequest`/`transformResponse`, `httpAgent`/`httpsAgent`, `socketPath`) —
carrying a route's own declared secret header, or the caller's bearer token, to
whatever host/transport the option supplied. This is now a `MinderSecurityError`
(`code: 'UNSAFE_REQUEST_OPTION_OVERRIDE'`), thrown before any part of the
outgoing request is assembled.

Only the following per-call keys still reach the outgoing request — everything
else is silently ignored, not merely undocumented:

| Forwarded (safe — never changes destination/transport) | Refused (throws `UNSAFE_REQUEST_OPTION_OVERRIDE`) |
|---|---|
| `timeout`, `signal`, `responseType`, `onUploadProgress`, `onDownloadProgress` | `url`, `baseURL`, `proxy`, `adapter` |
| `withCredentials`, `validateStatus`, `paramsSerializer`, `decompress` | `transformRequest`, `transformResponse`, `httpAgent`, `httpsAgent`, `socketPath`, `beforeRedirect` |

```typescript
// Before: a per-call axiosConfig could (accidentally or via untrusted input)
// redirect a registered route's request entirely — the route's own headers
// (e.g. a static X-Api-Key) went wherever `baseURL` pointed, with no throw:
await context.apiClient.request("thing", undefined, { id: "1" }, {
  axiosConfig: { baseURL: "https://not-your-api.example" },
});

// After: the same call throws MinderSecurityError before dispatch. To point a
// registered route at a different, same-origin PATH, use the route registry
// (or the internal urlOverride escape hatch) — never a per-call option:
await context.apiClient.request("thing", undefined, { id: "1" }, {
  axiosConfig: { timeout: 5000 }, // fine — timeout is allowlisted
});
```

**Migration.** Search your codebase for `axiosConfig`/per-call `options` values
containing any of `url`, `baseURL`, `proxy`, `adapter`, `transformRequest`,
`transformResponse`, `httpAgent`, `httpsAgent`, `socketPath`, or `beforeRedirect`
passed to `useMinder()`/`apiClient.request()`/`operations.*`. None of these were
ever meant to be caller-influenced per-request; use `configureMinder()`'s route
registry (`apiUrl`, `routes.<name>.url`) to control where a request goes. If you
were relying on some OTHER axios option not in the forwarded list above (it was
never documented as forwarded, but may have worked by accident via the old raw
spread), it is now silently dropped — open an issue if you have a legitimate
need for a specific option and it will be evaluated for the allowlist.

### `minder()`'s per-call `baseURL` now refuses to redirect credentials

**What changed.** The `ApiClient`/`useMinder()` allowlist fix above (per-call
axios options) only ever covered calls dispatched through a `<MinderDataProvider>`.
The standalone `minder(route, data, options)` function builds its outgoing
request differently — by hand-picking named fields off `options`, not spreading
an axios-config bag — and adversarial testing found the SAME class of defect in
that different shape: `options.baseURL` was honored unconditionally, so

```typescript
// Before: silently leaked BOTH the registered route's own declared header
// AND the ambient bearer token to the caller-supplied host, no throw:
configureMinder({ apiUrl: "https://api.example.com", routes: {
  thing: { method: "GET", url: "/things/:id", headers: { "X-Api-Key": "SECRET" } },
}});
minder.config({ token: "AMBIENT-TOKEN" });
await minder("thing", undefined, { baseURL: "https://not-your-api.example" });
// -> GET https://not-your-api.example/things/1
//    Authorization: Bearer AMBIENT-TOKEN
//    X-Api-Key: SECRET
```

is now refused, before any part of the request is assembled, whenever the
redirected call would carry either (a) a registered route's own declared
`headers`, or (b) an ambient bearer token set via `configureMinder()`/
`minder.config()` — the credential is attached by the library, not that call,
and must not silently follow a caller-chosen destination.

**How the refusal surfaces — this does NOT throw by default.** `minder()` has
always documented a "never throws by default" contract, and this guard does
not change that. Internally the guard raises a `MinderSecurityError` (`code:
'UNSAFE_REQUEST_OPTION_OVERRIDE'`), but `minder()`'s existing top-level error
handling catches it like any other failure and resolves normally:

```typescript
const result = await minder("thing", undefined, { baseURL: "https://not-your-api.example" });
// result.success === false
// result.error.code === 'UNSAFE_REQUEST_OPTION_OVERRIDE'
// No request reached either host — but this LINE does not throw, so a
// try/catch around it will never fire. Check result.success / result.error.

// Only if you opt in does it become a real throw, same as any other minder() error:
await minder("thing", undefined, {
  baseURL: "https://not-your-api.example",
  throwOnError: true, // now the call throws instead of resolving
});
```

**What still works, unchanged.** A per-call `baseURL` override on a route/call
that carries **no** such ambient credential (e.g. an unregistered path, no
token configured) still dispatches exactly as before — this was already
covered by existing passing tests and remains supported. If you need your own
credential to travel to a different host, pass it explicitly for that one
call (`options.token` / `options.headers`) rather than relying on the ambient
one.

**Not covered by this guard, deliberately (a pre-existing, documented escape
hatch, unchanged by this fix):** passing an ABSOLUTE URL as the `route`
argument itself (e.g. `minder("https://other-api.example.com/x", ...)`) always
bypasses `baseURL` — and, like before, still attaches the ambient bearer
token/headers to whatever host you name there. Use it only for destinations
you trust with that credential; it is not a "safe" alternative to the
`baseURL` case above.

**Migration.** Search for standalone `minder(...)` calls that pass a per-call
`baseURL` alongside either a registered route name or a configured
`token`/`minder.config({ token })`. If the intent was genuinely "run this
exact route against a different host with its credentials," reconfigure that
destination as the route's own `apiUrl`/`baseURL` via `configureMinder()`
instead of overriding it per call. If the intent was "hit an unrelated
third-party endpoint," pass your own credentials explicitly via
`options.token`/`options.headers` (or omit them if none are needed) instead of
relying on the ambient ones.

### `minder()`'s route params are now validated before URL substitution

**What changed.** Standalone `minder(route, data, options)` resolves a
registered route's `:param` placeholders from `options.params` — but the
value substituted into the URL was never checked for anything that could
escape the URL PATH SEGMENT the placeholder was meant to fill:

```typescript
// Before: '..' walks the path past the route root, no throw, no refusal:
configureMinder({ apiUrl, routes: { updateUser: { url: "/users/:id", method: "PUT" } } });
await minder("updateUser", { name: "attacker-controlled body" }, { params: { id: ".." } });
// -> PUT / (the SITE ROOT), carrying the full body, result.success === true.
```

Also live-wire-verified against a real `node:http` server: `{ id: "5#" }`
truncated the path at the raw fragment delimiter and additionally leaked the
value back as a redundant `?id=...` query param (a **different** resource
than intended); `{ id: "5?a=1" }` injected `a=1` as a **live,
attacker-controlled query param** on the real request; `{ id: "" }` hit the
**collection** (`/users/`) instead of a single resource. None of these threw
or were refused — a real API with anything mounted at `/`, or any resource
at the truncated/collection path, would execute the write.

This is now refused, before any part of the URL is assembled, whenever a
route-param value could escape its URL segment.

**How the refusal surfaces — this does NOT throw by default,** the same
"never throws" contract as every other `minder()` guard:

```typescript
const result = await minder("updateUser", body, { params: { id: ".." } });
// result.success === false
// result.error.code === 'UNSAFE_ROUTE_PARAM_VALUE'
// Zero requests reached the server — but this LINE does not throw. Check
// result.success / result.error, or pass options.throwOnError: true.
```

**What's refused:** `null`/`undefined`, any value that isn't a
string/number/bigint, a non-finite number (`NaN`/`Infinity`/`-Infinity`), an
empty or whitespace-only string, a value whose percent-escapes can't be
decoded, and any value containing `..`, a `/` or `\`, a `?` or `#`, or a raw
control character — checked both raw and percent-decoded (single- or
double-encoded), so `%2e%2e%2f` is refused exactly like a literal `../`.

**What still works, unchanged:** legitimate params — `{ id: 0 }`, a
leading-zero string like `{ id: "007" }`, a UUID, a 24-hex ObjectId, and
nested routes such as `/t/:id/comments` — dispatch exactly as before, with no
extra `?id=...` appended alongside the path substitution.

**Also fixed in the same change:** a route param used to fill `:id` in the
URL PATH was previously *also* forwarded as a redundant query-string value
(`options.params` was attached to the outgoing request verbatim). Any key
actually substituted into the path is now excluded from the query string,
matching how `<MinderDataProvider>`/`ApiClient` already behaved.

**This is a regression against 2.1.4, not new-in-2.2.0 behavior.** On
published 2.1.4, the identical call produced a literal, inert, broken
`/updateUser?id=..` request that never escaped `/updateUser` — 2.2.0's
route-template resolution fix (naive string substitution, with no encoding
or validation) is what unlocked the escape. If you upgraded straight from
2.1.4, this is a brand-new attack surface you were never exposed to before,
not a tightening of an existing check.

**Migration.** This only affects you if a route param value can come from
outside your own code (user input, an untrusted upstream response, etc.)
without your own validation in front of it. Search for `minder(...)` calls
whose `options.params` values are not already validated/whitelisted, and
either validate them yourself before the call or handle
`result.error.code === 'UNSAFE_ROUTE_PARAM_VALUE'` the same way you'd handle
any other refused request. `operations.update`/`operations.delete` (the
`useMinder()` CRUD helpers) already validated their `id` argument this way
before this release — this brings the standalone `minder()` path to parity,
it does not introduce a NEW restriction beyond what CRUD operations already
enforced.

### `configureMinder` on `/web`, `/native`, `/node`, `/electron` now resolves to the real implementation

**What changed.** `configureMinder` imported from the `minder-data-provider/web`,
`/native`, `/node`, or `/electron` subpaths used to silently resolve to the
`@deprecated` implementation in `src/core/minder.ts` — a minimal `{ baseURL,
headers }` bag that registered no routes at all (its own deprecation warning
told you to import the very thing you already imported). These subpaths now
export the real, unified implementation — the same one `minder-data-provider`
(root) and `minder-data-provider/config` already exported — which is
routes-aware and requires `apiUrl` instead of `baseURL`.

```typescript
// Before (2.1.4, any of /web /native /node /electron): registered NO routes.
import { configureMinder } from "minder-data-provider/node";
configureMinder({ baseURL: "https://api.example.com" }); // routes silently ignored

// Now: the real implementation — routes actually register, apiUrl required.
import { configureMinder } from "minder-data-provider/node";
configureMinder({
  apiUrl: "https://api.example.com",
  routes: { users: "/users" }, // now actually registered
});
```

**Migration.** If you never declared `routes` and only used `baseURL`, no
behavior change beyond what's below — your calls keep working. If you *did*
declare `routes` on one of these subpaths expecting them to be ignored (the
old behavior), they are now live; check `src/core/types.ts`'s `ApiRoute`
shape if any route definition needs adjusting.

**The `baseURL` key itself is not a hard break.** The real implementation
still requires an effective `apiUrl`, but as of this release it also accepts
`baseURL` as a deprecated, one-time-warned alias — `configureMinder({
baseURL: "..." })` keeps working exactly as before, with a single console
warning per process pointing you at `apiUrl`. `apiUrl` always wins when both
are given. This alias exists because CI caught our own
`examples/electron/desktop-app` still calling `configureMinder({ baseURL })`
against the repointed `/electron`/`/node` entries — real consumers upgrading
from 2.1.4 are exactly as likely to still be on that shape, and a config that
silently produced a broken client would have been strictly worse than either
a loud throw or a working alias. `baseURL` is removed entirely in v3.0 —
migrate to `apiUrl` now rather than later.

## v2.x → v3.0 — Redux integration removed (BREAKING)

**What changed:** MDP no longer ships any Redux integration. Redux was an optional peer used only
for auto-generated per-route slices that nothing on the core data path read. It has been removed
entirely — smaller bundle, one clear state model (TanStack Query for server state).

**Removed public API:**

| Removed | Replace with |
|---|---|
| `useStore()` hook | Use your app's own Redux store (`react-redux`'s `useStore`) if you still need Redux — MDP no longer provides one. |
| `useReduxSlice(route)` hook | Use `useMinder(route)` for data (it already exposes `data`/`loading`/`error`/`mutate`); manage any extra UI state in your own store. |
| `ReduxConfig` type + `configureMinder({ redux })` config field | Remove the `redux` field from your config — it is no longer read. |
| `MinderDataProvider`'s Redux `<Provider>` wrapper + `useMinderContext().store` | `MinderDataProvider` renders the `QueryClientProvider` tree directly; `ctx.store` is gone. If you need a Redux `<Provider>`, add your own around `MinderDataProvider`. |
| `DynamicLoader` redux members (`loadRedux`, `getStore`, `isReduxLoaded`, `addReducer`, the `'redux'` preload option, and the `redux` field in `getLoadingStatus()`/`getBundleSavings()`) | None — these lazy-loaded a store MDP no longer manages. |
| `@reduxjs/toolkit` / `react-redux` optional peer dependencies | No longer declared. If your app uses Redux independently, keep them as your own direct dependencies. |

**Migration steps:**
1. Remove any `redux` field from your `configureMinder(...)` / `MinderDataProvider` config.
2. Replace `useStore()` / `useReduxSlice()` calls — use `useMinder()` for data; use your own store for UI state.
3. If you relied on MDP creating a Redux store, wrap your app in your own `<Provider>` from `react-redux`.
4. No dependency changes are required unless you were relying on MDP to pull in Redux transitively (it never did — they were optional peers).

If you were **not** using the Redux hooks/config (the common case — they were read by nothing on the
main path), **no code changes are needed.**

### Automated migration

`npx minder codemod redux-removal [--dry-run] [--dir <path>]` handles most of the mechanical part
of the four migration steps above for you:

```bash
# Preview every change as a diff, without writing anything:
npx minder codemod redux-removal --dry-run

# Apply the changes:
npx minder codemod redux-removal

# Scope the scan to a subdirectory (default: cwd). node_modules/dist/build
# output are always skipped either way.
npx minder codemod redux-removal --dir src
```

**What it fixes automatically:**

- Renames `useReduxSlice(route)` calls (and their import) to `useMinder(route)` — step 2. It also
  inserts a `// TODO(minder-codemod): ...` comment above every renamed call, because
  `useReduxSlice` returned `{ state, actions, selectors, dispatch }` while `useMinder` returns
  `{ data, loading, error, mutate }` — the call is renamed correctly, but you still need to update
  whatever you destructured from it.
- Removes the `redux` field from `configureMinder({ ... })` calls and from object literals typed as
  `MinderConfig` — step 1.

**What it can only flag (adds a `// TODO(minder-codemod): ...` comment, does not rewrite):**

- `useStore()` calls and its import — there's no automatic replacement (step 2's "use your own
  react-redux store" is an app-specific decision).
- `ReduxConfig` type usage — step 1's field removal doesn't imply the type import can always be
  deleted blindly (it might still be referenced elsewhere).
- `MinderDataProvider`'s Redux `<Provider>` wrapper and `useMinderContext().store` reads — step 3,
  a JSX/structural change too risky to rewrite automatically.
- `DynamicLoader`'s redux members (`loadRedux`/`getStore`/`isReduxLoaded`/`addReducer`, the
  `'redux'` preload option, the `redux` field on `getLoadingStatus()`/`getBundleSavings()`).

Every file it touches is re-runnable: running it again over already-migrated code makes no further
changes. It only edits files it's confident about via text-anchored transforms (not the TypeScript
compiler API — see `scripts/lib/codemod-redux-removal.js`'s header for why, and its exact
scope/limitations). Always review a `--dry-run` first; unusual formatting (namespace imports,
computed keys, `require()`-style imports) can fall outside what it safely rewrites, in which case
it leaves that spot untouched rather than guessing.

## v2.x → v3.0 — Enums are now `as const` objects (BREAKING for enum-only TS ops)

**What changed:** the exported "enums" (`HttpMethod`, `QueryStatus`, `LogLevel`, `StorageType`,
`CacheType`, `SecurityLevel`, `Platform`, `DataSize`, `ConfigPreset`, `WebSocketState`, `AuthState`,
`ErrorCode`, and the rest — 24 in all) are no longer TypeScript `enum`s. Each is now an `as const`
object plus a same-named union type:

```ts
// before (v2.x)                    // after (v3.0)
export enum HttpMethod {            export const HttpMethod = {
  GET = 'GET',                        GET: 'GET',
  // …                                // …
}                                    } as const;
                                     export type HttpMethod =
                                       (typeof HttpMethod)[keyof typeof HttpMethod];
```

**Why:** a non-const `enum` compiles to a runtime IIFE that mutates an object at import time — a
module side effect that a consumer bundler treating the package as side-effect-free would drop from
a shared chunk, leaving `HttpMethod` undefined in production (the dabd92d / MDPD-17 crash class). An
`as const` object has no import-time mutation, which is what lets this release ship
`"sideEffects": false` honestly and reclaim tree-shaking — no consumer action
needed; see CHANGELOG.md's "`sideEffects: false` reclaimed" entry for the measured
before/after bundle numbers.

**What still works unchanged — the common case needs NO code changes:**

- **Value access** — `HttpMethod.GET`, `HttpMethod.POST`, etc. — identical.
- **Runtime values** — the strings are byte-identical, so `x === HttpMethod.GET`, `switch`,
  serialization, and `Object.values(HttpMethod)` all behave exactly as before.
- **Type annotations** — `function f(m: HttpMethod)` still compiles; the union type is if anything
  *more* permissive (a bare `'GET'` is now assignable where the nominal `enum` previously required
  `HttpMethod.GET`).
- **The packaged `.d.ts` type surface is identical** — the API-snapshot gate shows zero change, so
  most type-only consumers observe nothing.

**What breaks (narrow — only true `enum`-only operations):**

- Using an enum **member as a type**: `let m: HttpMethod.GET` → use the value-derived type
  `typeof HttpMethod.GET` (or the literal `'GET'`).
- **Declaration-merging** a `namespace`/`enum` onto one of these names — no longer possible; wrap or
  extend the object instead.
- Relying on **nominal `enum` identity** (e.g. code that deliberately rejected a plain string where
  a nominal `enum` was required) — the union accepts the matching string literal now.

There is no codemod for this change — the fixes are localized type edits flagged by `tsc`.

## v2.x → v3.0 — `detectMethod` only auto-detects PUT on ID-shaped segments (BREAKING)

**What changed.** `detectMethod` picks an HTTP verb from the shape of the final
route segment when you don't pass `options.method` explicitly. Previously *any*
non-empty final segment was treated as an id, so `minder('users/1', data)` and
`minder('orders', data)` both auto-detected `PUT`. Now only a segment that is
genuinely ID-shaped — numeric, a UUID, or a 24-hex Mongo ObjectId — triggers
`PUT`; a word/slug segment is read as a collection name, so it now sends `POST`.

| Call | Before | After |
|---|---|---|
| `minder('users/1', data)` | `PUT` | `PUT` (unchanged — `1` is ID-shaped) |
| `minder('users/a1b2c3d4-...-uuid', data)` | `PUT` | `PUT` (unchanged — UUID-shaped) |
| `minder('orders', data)` | `PUT` | `POST` (`orders` is a collection name, not an id) |
| `minder('api/orders', data)` | `PUT` | `POST` |

**Why.** A create call against a plain collection route (`/api/orders`,
`/api/users`) was silently sent as `PUT` instead of `POST` — the old heuristic
couldn't distinguish "the last path segment is a word" from "the last path
segment is an id." Most REST backends reject or misinterpret a `PUT` to a
collection endpoint.

**Migration.** If you have a slug/word-terminated route that genuinely needs
`PUT` (an update-by-slug endpoint, for example), pass the method explicitly, or
supply an `id`/`_id` field in the request body so the id-shaped-segment/body
check still resolves to `PUT`:

```typescript
// Explicit method (works regardless of route shape):
minder('articles/my-slug', data, { method: 'PUT' });

// Or register the route with method: 'PUT' in your routes config.
```

If you were relying on the old behavior for a *create* against a slug-shaped
collection route, no action is needed — it now correctly sends `POST`, which is
almost always what you wanted.

## v2.x → v3.0 — `minder()` retries are idempotent-only by default (BREAKING)

**What changed.** `minder()`'s built-in retry logic previously applied to every
HTTP method. It now only retries idempotent methods by default —
`GET`/`HEAD`/`OPTIONS`/`PUT`/`DELETE`. `POST`/`PATCH` requests no longer
auto-retry unless you opt in.

**Why.** Retrying a `POST`/`PATCH` after a network blip or timeout can silently
duplicate a write — the request may have actually succeeded server-side before
the "failure" (e.g. the response was lost, not the request). Idempotent methods
are safe to retry by definition; non-idempotent ones are not, unless your backend
itself is safe against duplicate delivery.

**Migration.** If your backend is idempotency-safe for POST/PATCH (e.g. it
accepts and de-dupes an `Idempotency-Key` header, or the operation is naturally
idempotent), opt back in per call:

```typescript
minder('orders', data, { method: 'POST', retryNonIdempotent: true });
```

No action is needed if you don't rely on POST/PATCH retrying — GET/PUT/DELETE
retry behavior (and the retry count/backoff itself) is unchanged.

## 2.2.0-beta.0 → 2.2.0-beta.1

Every default-changing or breaking behavior change in the 2.2.0-beta.1 release — see
[CHANGELOG.md](../CHANGELOG.md) for the complete, unabridged list. These are logged
there as behavior changes, not API removals: your code will very likely keep compiling
and running unmodified, but several **defaults** changed, so read this even if nothing
breaks at build time.

**In this section:**

- [1. Fail-closed `isAuthenticated()`](#1-fail-closed-isauthenticated)
- [2. CORS defaults](#2-cors-defaults)
- [3. No forced CORS preflight](#3-no-forced-cors-preflight)
- [4. Default retry changed](#4-default-retry-changed)
- [5. peerDependencies move](#5-peerdependencies-move)
- [6. `useAuth` root-entry shadowing](#6-useauth-root-entry-shadowing)
- [7. `rawUrl` and config unification](#7-rawurl-and-config-unification)
- [8. Offline conflict resolution](#8-offline-conflict-resolution)

### 1. Fail-closed `isAuthenticated()`

**Old behavior:** a JWT-shaped token (three dot-separated segments) whose payload
couldn't be decoded, or whose `exp` claim was non-numeric, was treated as
**authenticated** (`isAuthenticated()` returned `true`). The no-provider fallback used
by standalone `useMinder()` (`GlobalAuthManager`) was even looser: it only checked
token *presence* — an **expired** JWT still counted as authenticated.

**New behavior:** both `AuthManager.isAuthenticated()` (provider mode) and
`GlobalAuthManager.isAuthenticated()` (standalone/no-provider mode) now fail closed —
a JWT-shaped token that can't be decoded, or whose `exp` has passed, returns `false`.
The two are now parity-tested against each other. Opaque (non-JWT) bearer tokens are
unchanged — still presence-based, since there's nothing to decode. Signature
verification was never performed client-side and still isn't; this only affects the
shape/expiry check.

**Why:** silently treating a corrupt or expired token as valid is a fail-open
authorization bug — it let invalid sessions look "logged in" to client-side route
guards.

**Migration:**

```typescript
// Before — a corrupt or expired JWT-shaped token still passed this check
if (auth.isAuthenticated()) {
  /* ... */
}

// After — if you intentionally store JWT-shaped-but-not-actually-JWT strings
// (three dot-separated segments that aren't valid JWTs) and want the old
// presence-only semantics, check for a token instead:
if (auth.getToken() !== null) {
  /* ... */
}
```

No action needed if your tokens are real JWTs or genuinely opaque strings — this is a
pure bug fix for the corrupt/expired case.

### 2. CORS defaults

**Old behavior:** the library's own CORS-emitting code — the default `corsMiddleware`
export and `ProxyManager.generateNextJSProxy()` (the Next.js proxy-route generator) —
defaulted to `origin: '*', credentials: true`. That combination is invalid per the CORS
spec (browsers reject it) and was already flagged by the library's own
`CorsManager.validateConfig()`.

**New behavior:** the default is now `origin: '*', credentials: false`.
`generateNextJSProxy()` emits `Access-Control-Allow-Credentials: false` unless
`cors.credentials` is explicitly `true` in the `ProxyConfig` you pass it — and now
**throws** rather than generate a proxy combining `credentials: true` with a wildcard
origin.

**Why:** `Access-Control-Allow-Credentials: true` next to a wildcard origin tells
browsers "any origin may send this browser's cookies here" — a real vulnerability if a
server ever ships that pairing.

**Migration:**

```typescript
import { ProxyManager } from "minder-data-provider";

// Before (implicit): credentials always on, wildcard origin
const proxy = new ProxyManager({ enabled: true, baseUrl: "https://api.example.com" });

// After: an explicit allowlist is required to keep credentials on
const proxy = new ProxyManager({
  enabled: true,
  baseUrl: "https://api.example.com",
  cors: { origin: ["https://app.example.com"], credentials: true },
});
proxy.generateNextJSProxy(); // throws if origin is '*' and credentials is true
```

> **`createCorsMiddleware`:** a dependency-free, safe-by-default CORS middleware
> factory, exported from **`minder-data-provider/server`** (server-only — the root
> entry deliberately does not re-export it):
> ```typescript
> import { createCorsMiddleware } from "minder-data-provider/server";
>
> const cors = createCorsMiddleware({
>   origin: ["https://app.example.com"],
>   credentials: true,
> }); // throws if `origin` is '*' (or a wildcard-equivalent array/RegExp) with credentials: true
>
> // Express/Connect-style: (req, res, next) => { await cors(req, res); next(); }
> ```
> `import { createCorsMiddleware } from "minder-data-provider"` (the root entry)
> still fails — use the `/server` subpath. The `ProxyManager` snippet above remains
> the reachable equivalent for Next.js proxy-route generation specifically.

> **`configureMinder()` history note:** earlier 2.2.0-beta.1 development builds had a
> preset bug that undermined this change for `configureMinder()` users — the
> web-platform preset forced `credentials: true` onto any config that didn't set it, and
> the `corsHelper: true` boolean shorthand also defaulted credentials on. Both are fixed
> in the current build: `configureMinder()` now defaults credentials **off on every
> platform**, and only an explicit `corsHelper: { credentials: true }` from you turns
> them on (explicit user values always win over presets). Note that the `cors` config
> key is deprecated in favor of `corsHelper` — it logs a runtime deprecation warning and
> is slated for removal in v3.0, and its `configureMinder()` type only accepts
> `enabled`/`proxy` (no `credentials` field).

> **CORS is disabled by default everywhere (B4, fix-2.2.0-blockers).**
> `configureMinder()`'s presets now set `cors.enabled: false` / `corsHelper.enabled:
> false` on every platform. If you explicitly set `enabled: true` without also setting
> `proxy`, `configureMinder()` **throws a `MinderConfigError`** (code
> `CONFIG_CORS_PROXY_MISSING`) at call time instead of silently rewriting every
> request to `/api/minder-proxy/*` — there is no longer a production-silent
> auto-enable path.
>
> ```typescript
> import { configureMinder } from "minder-data-provider";
>
> // Before (pre-fix): web silently defaulted cors.enabled to true with no proxy —
> // every request got rewritten to /api/minder-proxy/*, 404ing in production with
> // no warning outside NODE_ENV === 'development'.
>
> // After — enabling the helper without a proxy throws immediately at configure-time:
> configureMinder({
>   apiUrl: "https://api.example.com",
>   routes: { users: "/users" },
>   corsHelper: { enabled: true }, // throws CONFIG_CORS_PROXY_MISSING — no `proxy` set
> });
>
> // Fix: supply the proxy route (and create that API route handler), or omit
> // corsHelper/cors entirely if you don't need the Next.js proxy:
> configureMinder({
>   apiUrl: "https://api.example.com",
>   routes: { users: "/users" },
>   corsHelper: { enabled: true, proxy: "/api/minder-proxy" },
> });
> ```

### 3. No forced CORS preflight

**Old behavior:** the default axios instance attached 7 response-type security headers
(CSP, X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security,
X-XSS-Protection, Referrer-Policy, Permissions-Policy) to every outgoing *request*, and
set `withCredentials: true` by default. Non-safelisted request headers plus credentialed
mode force the browser to run a CORS preflight `OPTIONS` round-trip before every
cross-origin call — roughly doubling latency.

**New behavior:** default request headers are exactly `Content-Type: application/json`
and `Accept: application/json` — nothing else. `withCredentials` defaults to `false`;
the client reads the resolved config's `cors.credentials === true` to enable it — via
`configureMinder()`, set `corsHelper: { credentials: true }` (this also now governs the
token-refresh call, which previously hardcoded credentials).

**Why:** this was a performance bug, not a security feature — the security-response
headers never belonged on a *request*, and most apps don't need cookies sent
cross-origin. The internal helper that builds those response headers
(`getSecurityHeaders()` in `src/utils/security.ts`) is unaffected — it's just no
longer applied to outgoing requests. Note it is an internal helper today, not exported
from any public entry point; set your own server response headers if you need them.

**Migration:**

```typescript
// If your API relies on cookies for auth, opt back in explicitly (pair with an
// explicit origin allowlist server-side — see item 2). Use `corsHelper`, not the
// deprecated `cors` key (see the note in item 2):
configureMinder({
  apiUrl: "https://api.example.com",
  routes: { /* ... */ },
  corsHelper: { credentials: true },
});

// If you were relying on the old default request headers, use route- or call-level
// headers instead — they were never meant to be silent global defaults:
useMinder("users", { headers: { "X-Custom-Header": "value" } });
```

> Earlier 2.2.0-beta.1 development builds had a `configureMinder()` preset bug that
> re-enabled `credentials: true` on web by default, undoing this change; it is fixed in
> the current build — see the history note in item 2.

### 4. Default retry changed

**Old behavior:** failed queries retried 3 times by default
(`performance.retries: 3`). Explicitly passing `performance.retries: 0` or
`retryDelay: 0` to disable retries silently didn't work — the code used `||`-style
fallbacks (`retries || <default>`), and `||` treats `0` as falsy, reverting to the
default anyway.

**New behavior:** the default query retry is now 1
(`config.performance?.retries ?? 1` — `??`, not `||`). An explicit `0` is now honored
and genuinely disables retries.

**Why:** 3 retries meant a truly-down backend took ~3x longer to surface an error to the
user; 1 retry balances resilience against transient blips with a faster failure signal.
The `||` → `??` change is a correctness fix — `0` is a legitimate value that was being
silently discarded.

**Migration:**

```typescript
// Restore the old 3-retry behavior explicitly:
configureMinder({
  apiUrl: "https://api.example.com",
  routes: { /* ... */ },
  performance: { retries: 3 },
});

// Explicit zero now works (previously silently reverted to the default):
configureMinder({
  apiUrl: "https://api.example.com",
  routes: { /* ... */ },
  performance: { retries: 0 },
});
```

> `retryDelay` is not a `configureMinder()` option (its `performance` block accepts
> `deduplication`/`retries`/`timeout`/`compression`). The `retryDelay: 0` fix applies
> when you construct a `MinderConfig` for `<MinderDataProvider>` directly, where
> `performance.retryDelay` exists.

> **`configureMinder()` history note:** earlier 2.2.0-beta.1 development builds had a
> preset bug here too — every platform preset hardcoded `performance.retries: 3`, which
> pre-empted the new default for anyone configuring through `configureMinder()`. Fixed
> in the current build: `configureMinder()` presets now emit `retries: 1` on every
> platform, and an explicit user value (including `retries: 0`) still wins. Precision
> note on where the `?? 1` fallback lives: it is `MinderDataProvider`'s **query-layer**
> retry default (what TanStack Query uses when `performance.retries` is completely
> unset). `ApiClient`'s own interceptor-level exponential-backoff retry treats unset
> `performance.retries` as `0` — it adds no HTTP-layer retries unless you configure
> some.

### 5. peerDependencies move

**Old behavior:** `@tanstack/react-query`, `@tanstack/query-core`,
`@reduxjs/toolkit`, `react-redux`, and `@tanstack/react-query-devtools` were regular
`dependencies` — your package manager installed the library's own copies alongside
whatever version (if any) your app already had.

**New behavior:** all five moved to `peerDependencies` with caret ranges.
`@tanstack/react-query` and `@tanstack/query-core` are **required** peers;
`@reduxjs/toolkit`, `react-redux`, and `@tanstack/react-query-devtools` are **optional**
peers.

**Why:** a hard dependency on `@tanstack/react-query` could install a second copy
alongside your app's own, silently breaking `QueryClientProvider` context — React
context identity is per-module-instance, so two copies of react-query means two
incompatible `QueryClient` implementations sharing one tree. This also shrank the
packed install by roughly 73% (928kB → 252kB).

**Migration:**

```bash
# Required — you almost certainly already have this if you use React Query elsewhere:
npm install @tanstack/react-query

# Only if you use the Redux-backed hooks:
npm install @reduxjs/toolkit react-redux
```

No code changes — this is purely an installation-time change. A peer-dependency warning
after upgrading is telling you exactly this.

> **`@tanstack/react-query-devtools` is no longer imported by any main entry (B5,
> fix-2.2.0-blockers).** The root, `/hook`, `/core`, `/web`, `/nextjs`, `/native`,
> `/expo`, and `/electron` entries no longer reach an `import("@tanstack/react-query-devtools")`
> at all — that auto-wiring was removed. Mounting the devtools is now an explicit,
> separate opt-in: import from the dedicated `minder-data-provider/devtools-rq` entry,
> which is the only place in the package that references the peer. See "DevTools moved
> to an opt-in entry" below for the migration.

### 5b. DevTools moved to an opt-in entry

**Old behavior:** `<MinderDataProvider>` could reach a static
`import("@tanstack/react-query-devtools")` from inside its own shared chunk —
reachable from the root, `/hook`, `/core`, `/web`, `/nextjs`, `/native`,
`/expo`, and `/electron` entries — even though the package was only an
**optional** peer. A real install that correctly omitted
`@tanstack/react-query-devtools` failed module resolution under Metro and
esbuild on every one of those entries, whether or not the app ever rendered
devtools.

**New behavior:** no main entry references `@tanstack/react-query-devtools`
at all. A dedicated **`minder-data-provider/devtools-rq`** subpath is the only
place in the package that imports it — mounting devtools is now an explicit
opt-in, and a consumer who never imports this subpath never needs the peer
installed.

**Why:** an *optional* peer that's still statically reachable from every main
entry isn't actually optional — it breaks any consumer's build the moment
they correctly follow `package.json` and skip installing it.

**Migration:**

```tsx
// Before (pre-2.2.0) — devtools mounted themselves; you never imported them:
import { MinderDataProvider } from "minder-data-provider";

function App() {
  return (
    <MinderDataProvider config={config}>
      <YourApp />
    </MinderDataProvider>
  );
}

// After — install the peer, then opt in explicitly from the new entry:
// npm install -D @tanstack/react-query-devtools
import { MinderDataProvider } from "minder-data-provider";
import { ReactQueryDevtools } from "minder-data-provider/devtools-rq";

function App() {
  return (
    <MinderDataProvider config={config}>
      <YourApp />
      {process.env.NODE_ENV !== "production" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </MinderDataProvider>
  );
}
```

The entry also exports `ReactQueryDevtoolsPanel` and an async
`loadReactQueryDevtools()` (resolves the `ReactQueryDevtools` component via a
dynamic `import()`, for code that wants to defer the load itself rather than
relying on your bundler's own code-splitting of the static import above).

### 6. `useAuth` root-entry shadowing

**Old behavior:** `import { useAuth } from "minder-data-provider"` resolved to the
legacy `AuthManager`-based hook — token get/set, `isAuthenticated()`, and the rest of
the request-layer auth API described in the README's Security Model.

**New behavior:** the root entry's `useAuth` is now the **capability-contract** hook —
the same shape backing provider integrations (Supabase/Clerk/Firebase's
`useAuth()`: `{ ready, session, error, signOut, getProviderClient }`). It's a different
contract for a different job: a swappable auth *provider* interface, not the
request-layer token manager. The legacy hook didn't go away — it's reachable through
`useMinder().auth`.

**Why:** the provider-platform capability contracts (`useAuth`, `useCheckout`,
`useStorage`, `useLive`) needed the name every provider's own docs already use for it.
Explicit named exports at the root entry intentionally shadow the star-exported legacy
`useAuth` (ES module semantics: local exports win over `export *`).

**Migration:**

```typescript
// Before (2.2.0-beta.0 and earlier) — root import was the token/session manager
import { useAuth } from "minder-data-provider";
const { isAuthenticated, getToken, setToken } = useAuth();

// After — same legacy hook, reached through useMinder()
import { useMinder } from "minder-data-provider";
const { auth } = useMinder("anyRouteName");
const isLoggedIn = auth.isAuthenticated();

// After — root `useAuth` is now the capability-contract hook (requires a
// registered auth provider — see the README's Level 2)
import { useAuth } from "minder-data-provider";
const { session, ready, signOut } = useAuth();
```

**H5 (fix-2.2.0-blockers):** untouched pre-2.2.0 code that still destructures
`{ setToken, getToken, clearAuth, isLoggedIn }` from the root `useAuth()` no
longer silently gets `undefined` for all four (which used to fail with a
generic `TypeError` only at the first real call). Those four keys now throw a
directed `MinderError` (code `USE_AUTH_LEGACY_ACCESSOR_REMOVED`) naming
`useAuthToken()`, at the exact access site:

```typescript
import { useAuth } from "minder-data-provider";

const { setToken } = useAuth(); // does not throw here — the shim is a getter
setToken("some-token");          // throws USE_AUTH_LEGACY_ACCESSOR_REMOVED here

// Fix: use useAuthToken() for the four legacy accessors instead
import { useAuthToken } from "minder-data-provider";
const { setToken } = useAuthToken();
setToken("some-token"); // works
```

The four shimmed keys are non-enumerable, so `{ ...useAuth() }`,
`JSON.stringify(useAuth())`, and `Object.keys(useAuth())` are unaffected —
only an explicit `.setToken` / `.getToken` / `.clearAuth` / `.isLoggedIn`
property access triggers the throw.

### 7. `rawUrl` and config unification

**Old behavior:** `useMinder("https://api.example.com/users")` or
`useMinder("/some/path", { rawUrl: true })` threw `"Route not found"` whenever a
`MinderDataProvider` was mounted — the escape hatch only worked in standalone
(no-provider) mode. Separately, `configureMinder()`'s routes registry and the
standalone `minder()` function's URL resolver were two independent stores: calling
standalone `useMinder("routeName")` after `configureMinder()` treated the route name as
a literal path instead of resolving it from your registry.

**New behavior:** `ApiClient.request` now dispatches ad-hoc URLs (absolute
`http(s)://`, `rawUrl: true`, or an unregistered leading-slash path) through the same
client instance in provider mode too — auth, interceptors, and plugins still run.
Unknown *bare* route names (no scheme, no leading slash) still throw, so typos are
still caught. `configureMinder()` now feeds both stores, so standalone
`useMinder("routeName")` correctly resolves url/method/headers/timeout from your
registry. `minder.config()` still works but logs a deprecation warning.

**Why:** this was both a capability gap (the escape hatch existed in only one of the
two usage modes) and a bug (two configs meant to be one source of truth silently
weren't).

**Migration:**

```tsx
// Now works identically whether or not <MinderDataProvider> is mounted:
const { data: status } = useMinder("https://third-party.example.com/status");
const { data: raw } = useMinder("/unregistered/path", { rawUrl: true });

// Standalone useMinder("routeName") now honors configureMinder()'s registry:
configureMinder({ apiUrl: "https://api.example.com", routes: { users: "/users" } });
const { data: users } = useMinder("users"); // resolves via the registry, no provider needed
```

No action needed unless you were working around the old `"Route not found"` behavior
(e.g. avoiding `rawUrl` in provider mode) — that workaround is no longer necessary.

### 8. Offline conflict resolution

**Additive — no action required.** `OfflineConfig.conflictResolution`/`onConflict` were declared
but never read; a queued mutation whose replay came back with a 409/412 simply retried up to
`maxRetries` and was then silently dropped — neither "server wins" nor "client wins," just
blind-retry-then-drop. That config is now wired into the replay pipeline (Spec 5.1): new optional
`conflictStatuses`, `resolveConflict`, `conflictResolveTimeoutMs`, `strictOrder`, `onDeadLetter`,
and `deadLetterKey` fields on `OfflineConfig`, all opt-in.

**The only observable default-path change:** with zero conflict config set, a 409/412 replay now
resolves via the documented default (`conflictResolution: 'server-wins'`) immediately, instead of
retrying 3 times and then dropping. The end state is identical either way (the queued mutation is
gone) — this is a bugfix (fewer wasted retries, deterministic instead of accidental), not a
behavior you were relying on. See [FEATURES.md § Conflict resolution](FEATURES.md#conflict-resolution-spec-51)
for the full API.

### 9. Managed SSE transport (Spec 5.2)

**Additive — no action required.** `MinderConfig.realtime` is widened from `boolean` to
`boolean | RealtimeConfig`; the boolean form (`realtime: true`) is preserved verbatim and keeps
meaning exactly what it did before (enable realtime via WebSocket). WebSocket stays the default
transport for every existing app.

Opt into the new managed, auto-reconnecting SSE transport by passing an object instead:

```ts
// Before (WebSocket, unchanged):
configureMinder({ /* ... */, realtime: true, websocket: { url } });

// New, opt-in (SSE):
configureMinder({ /* ... */, realtime: { transport: 'sse', url } });
```

New additive exports: `RealtimeConfig`, `RealtimeTransport`, and `SseTransport` (via the new
`minder-data-provider/realtime` subpath). No existing export was removed or changed. See
[FEATURES.md § Managed SSE transport](FEATURES.md#managed-sse-transport-spec-52) for the full API.

---

## v1.x → v2.0

Guide for migrating from Minder Data Provider v1.x to v2.0.

## Table of Contents

- [Overview](#overview)
- [Breaking Changes](#breaking-changes)
- [New Features](#new-features)
- [Step-by-Step Migration](#step-by-step-migration)
- [Configuration Changes](#configuration-changes)
- [Import Changes](#import-changes)
- [API Changes](#api-changes)
- [Performance Improvements](#performance-improvements)
- [Troubleshooting](#troubleshooting)

---

## Overview

Minder Data Provider v2.0 introduces significant improvements while maintaining backward compatibility where possible. This guide will help you migrate your existing application smoothly.

### What's New in v2.0

✅ **87% smaller bundle sizes** with modular imports  
✅ **Simplified configuration** with intelligent defaults  
✅ **Advanced debugging tools** for better DX  
✅ **Flexible SSR/CSR** rendering strategies  
✅ **Enhanced security** features built-in  
✅ **Performance optimizations** (batching, deduplication, monitoring)

### Migration Timeline

- **Simple projects**: 30-60 minutes
- **Medium projects**: 2-4 hours
- **Large projects**: 4-8 hours

---

## Breaking Changes

### 1. Configuration Structure

**v1.x:**

```typescript
const config = {
  apiBaseUrl: "https://api.example.com",
  routes: {
    users: { method: "GET", url: "/users" },
    createUser: { method: "POST", url: "/users" },
    updateUser: { method: "PUT", url: "/users/:id" },
    deleteUser: { method: "DELETE", url: "/users/:id" },
  },
};
```

**v2.0:**

```typescript
import { configureMinder } from "minder-data-provider/config";

const config = configureMinder({
  apiUrl: "https://api.example.com", // Changed from apiBaseUrl
  routes: {
    users: "/users", // Auto-generates full CRUD
  },
});
```

### 2. Import Paths

**v1.x:**

```typescript
import { useOneTouchCrud, useAuth, useCache } from "minder-data-provider";
```

**v2.0 (Recommended for smaller bundles):**

```typescript
import { useOneTouchCrud } from "minder-data-provider/crud";
import { useAuth } from "minder-data-provider/auth";
import { useCache } from "minder-data-provider/cache";
```

**v2.0 (Still supported for backward compatibility):**

```typescript
import { useOneTouchCrud, useAuth, useCache } from "minder-data-provider";
```

### 3. Debug API

**v1.x:**

```typescript
// No built-in debug tools
console.log("Debug info");
```

**v2.0:**

```typescript
import { useDebug } from "minder-data-provider/debug";

const debug = useDebug();
debug.log("api", "Debug info", { data: "value" });
```

---

## New Features

### 1. Auto-Generated CRUD Routes

**v1.x** required explicit route definitions:

```typescript
routes: {
  getUsers: { method: 'GET', url: '/users' },
  createUser: { method: 'POST', url: '/users' },
  updateUser: { method: 'PUT', url: '/users/:id' },
  deleteUser: { method: 'DELETE', url: '/users/:id' }
}
```

**v2.0** auto-generates all CRUD operations:

```typescript
routes: {
  users: "/users"; // Generates: GET, POST, PUT, DELETE automatically
}
```

### 2. Simplified Authentication

**v1.x:**

```typescript
auth: {
  loginRoute: 'login',
  logoutRoute: 'logout',
  tokenKey: 'token',
  storage: 'cookie', // ✅ More secure (or 'sessionStorage', 'memory')
  autoRefresh: true,
  refreshRoute: 'refresh'
}
```

**v2.0:**

```typescript
auth: true  // Auto-configures with intelligent defaults

// Or customize:
auth: {
  tokenKey: 'access_token',
  storage: 'cookie', // ✅ Secure storage (or 'sessionStorage', 'memory')
  autoRefresh: true
}
```

### 3. Performance Monitoring

New in v2.0:

```typescript
import { usePerformanceMonitor } from "minder-data-provider";

function Component() {
  const monitor = usePerformanceMonitor();

  useEffect(() => {
    const metrics = monitor.getMetrics();
    console.log("Performance:", metrics);
  }, []);
}
```

### 4. Advanced Security

New in v2.0:

```typescript
security: {
  sanitization: true,        // XSS protection
  csrfProtection: true,      // CSRF tokens
  rateLimiting: {            // Rate limiting
    requests: 100,
    window: 60000
  }
}
```

---

## Step-by-Step Migration

### Step 1: Update Dependencies

```bash
# Uninstall v1.x
npm uninstall minder-data-provider

# Install v2.0
npm install minder-data-provider@latest
```

### Step 2: Update Configuration

Create a new configuration file using the simplified API:

```typescript
// config/minder.config.ts (v2.0)
import { configureMinder } from "minder-data-provider/config";

export const config = configureMinder({
  // Change apiBaseUrl → apiUrl
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "https://api.example.com",

  // Simplify routes (auto-generates CRUD)
  routes: {
    users: "/users",
    posts: "/posts",
    comments: "/comments",
  },

  // Simplify feature configuration
  auth: true,
  cache: true,
  cors: true,

  // Add new features
  security: {
    sanitization: true,
    csrfProtection: true,
  },

  performance: {
    deduplication: true,
    monitoring: true,
  },

  debug: process.env.NODE_ENV === "development",
});
```

### Step 3: Update Imports

**Option A: Modular Imports (Recommended)**

```typescript
// Before (v1.x)
import { useOneTouchCrud, useAuth } from "minder-data-provider";

// After (v2.0)
import { useOneTouchCrud } from "minder-data-provider/crud";
import { useAuth } from "minder-data-provider/auth";
```

**Option B: Unified Import (Backward Compatible)**

```typescript
// Still works in v2.0
import { useOneTouchCrud, useAuth } from "minder-data-provider";
```

### Step 4: Update Provider Setup

```typescript
// pages/_app.tsx
import { MinderDataProvider } from "minder-data-provider";
import { config } from "../config/minder.config";

export default function App({ Component, pageProps }) {
  return (
    <MinderDataProvider config={config}>
      <Component {...pageProps} />
    </MinderDataProvider>
  );
}
```

### Step 5: Update Component Usage

Most components will work without changes, but you can leverage new features:

```typescript
// Before (v1.x)
function UsersList() {
  const { data, loading, operations } = useOneTouchCrud("users");

  if (loading.fetch) return <div>Loading...</div>;

  return (
    <div>
      {data.map((user) => (
        <div key={user.id}>{user.name}</div>
      ))}
    </div>
  );
}

// After (v2.0) - Add debug tools
import { useDebug } from "minder-data-provider/debug";

function UsersList() {
  const { data, loading, operations } = useOneTouchCrud("users");
  const debug = useDebug();

  useEffect(() => {
    if (data) {
      debug.log("data", "Users loaded", { count: data.length });
    }
  }, [data]);

  if (loading.fetch) return <div>Loading...</div>;

  return (
    <div>
      {data.map((user) => (
        <div key={user.id}>{user.name}</div>
      ))}
    </div>
  );
}
```

### Step 6: Test Your Application

```bash
# Run tests
npm test

# Start dev server
npm run dev

# Build for production
npm run build
```

---

## Configuration Changes

### API URL

```typescript
// v1.x
apiBaseUrl: "https://api.example.com";

// v2.0
apiUrl: "https://api.example.com";
```

### Routes

```typescript
// v1.x - Explicit routes
routes: {
  getUsers: { method: 'GET', url: '/users' },
  createUser: { method: 'POST', url: '/users' },
  updateUser: { method: 'PUT', url: '/users/:id' },
  deleteUser: { method: 'DELETE', url: '/users/:id' }
}

// v2.0 - Auto-generated CRUD
routes: {
  users: '/users'  // Auto-generates all CRUD operations
}

// v2.0 - Custom routes (when needed)
routes: {
  users: {
    method: 'GET',
    url: '/users',
    cache: true,
    optimistic: true
  }
}
```

### Authentication

```typescript
// v1.x
auth: {
  loginRoute: 'login',
  logoutRoute: 'logout',
  tokenKey: 'token',
  storage: 'cookie' // ✅ Secure storage
}

// v2.0 - Simple
auth: true

// v2.0 - Custom
auth: {
  tokenKey: 'access_token',
  storage: 'cookie', // ✅ Recommended for production
  autoRefresh: true
}
```

### Cache

```typescript
// v1.x
cache: {
  enabled: true,
  ttl: 300000,
  storage: 'memory'
}

// v2.0 - Simple
cache: true

// v2.0 - Custom
cache: {
  ttl: 300000,
  storage: 'memory',
  invalidationPatterns: [/^users/, /^posts/]
}
```

---

## Import Changes

### Module Reorganization

| Feature   | v1.x                   | v2.0 (Modular)                   | v2.0 (Unified)         |
| --------- | ---------------------- | -------------------------------- | ---------------------- |
| CRUD      | `minder-data-provider` | `minder-data-provider/crud`      | `minder-data-provider` |
| Auth      | `minder-data-provider` | `minder-data-provider/auth`      | `minder-data-provider` |
| Cache     | `minder-data-provider` | `minder-data-provider/cache`     | `minder-data-provider` |
| WebSocket | `minder-data-provider` | `minder-data-provider/websocket` | `minder-data-provider` |
| Upload    | `minder-data-provider` | `minder-data-provider/upload`    | `minder-data-provider` |
| Debug     | N/A                    | `minder-data-provider/debug`     | `minder-data-provider` |
| Config    | N/A                    | `minder-data-provider/config`    | `minder-data-provider` |
| SSR       | N/A                    | `minder-data-provider/ssr`       | `minder-data-provider` |

### Bundle Size Comparison

```typescript
// v1.x - Full import (~150KB)
import { useOneTouchCrud, useAuth, useCache } from "minder-data-provider";

// v2.0 - Modular imports (45KB + 25KB + 20KB = 90KB)
import { useOneTouchCrud } from "minder-data-provider/crud";
import { useAuth } from "minder-data-provider/auth";
import { useCache } from "minder-data-provider/cache";

// Savings: 60KB (40% reduction)
```

---

## API Changes

### Hook Return Values

Most hooks remain compatible, with added features:

```typescript
// v1.x
const { data, loading, error, operations } = useOneTouchCrud("users");

// v2.0 - Same API, enhanced with better TypeScript support
const { data, loading, error, operations } = useOneTouchCrud<User>("users");
```

### New Options

```typescript
// v2.0 adds new options
const { data, operations } = useOneTouchCrud("users", {
  optimistic: true, // New: Optimistic updates
  onSuccess: (data) => {}, // New: Success callback
  onError: (error) => {}, // New: Error callback
});
```

---

## Performance Improvements

### Automatic Optimizations in v2.0

1. **Request Deduplication**: Prevents duplicate API calls automatically
2. **Request Batching**: Batches multiple requests when possible
3. **Smart Caching**: Improved cache invalidation strategies
4. **Tree Shaking**: Only include code you use

### Migration to Performance Features

```typescript
// v1.x - Manual optimization
const [loading, setLoading] = useState(false);
const [users, setUsers] = useState([]);

useEffect(() => {
  let isCanceled = false;

  setLoading(true);
  fetch("/api/users")
    .then((res) => res.json())
    .then((data) => {
      if (!isCanceled) setUsers(data);
    })
    .finally(() => {
      if (!isCanceled) setLoading(false);
    });

  return () => {
    isCanceled = true;
  };
}, []);

// v2.0 - Automatic optimization
const { data: users, loading } = useOneTouchCrud("users");
// Deduplication, caching, and cleanup handled automatically
```

---

## Troubleshooting

### Common Migration Issues

#### Issue 1: Configuration Not Found

**Error:**

```
Error: MinderConfig not found
```

**Solution:**

```typescript
// Make sure to use configureMinder
import { configureMinder } from "minder-data-provider/config";

const config = configureMinder({
  /* ... */
});
```

#### Issue 2: Import Errors

**Error:**

```
Module not found: Can't resolve 'minder-data-provider/crud'
```

**Solution:**

```bash
# Make sure you're on v2.0
npm install minder-data-provider@latest

# Clear cache
rm -rf node_modules .next
npm install
```

#### Issue 3: TypeScript Errors

**Error:**

```
Type 'User[]' is not assignable to type 'never[]'
```

**Solution:**

```typescript
// Add generic type
const { data } = useOneTouchCrud<User>("users");
```

#### Issue 4: Routes Not Working

**Error:**

```
404 Not Found on /users
```

**Solution:**

```typescript
// v2.0 requires explicit route registration
routes: {
  users: "/users"; // Must define routes
}
```

### Getting Help

If you encounter issues during migration:

1. Check the [API Reference](./API_REFERENCE.md)
2. Review [Examples](./EXAMPLES.md)
3. Join our [Discord Community](https://discord.gg/minder-data-provider)
4. Open an [Issue on GitHub](https://github.com/minder-data-provider/issues)

---

## Deprecation Timeline

| Feature           | v1.x | v2.0          | v3.0 (Future)  |
| ----------------- | ---- | ------------- | -------------- |
| `apiBaseUrl`      | ✅   | ⚠️ Deprecated | ❌ Removed     |
| Unified imports   | ✅   | ✅ Supported  | ⚠️ Discouraged |
| Old config format | ✅   | ⚠️ Deprecated | ❌ Removed     |

---

## Next Steps

After migration:

1. **Enable Debug Mode** to verify everything works
2. **Run Tests** to ensure functionality
3. **Monitor Performance** using new tools
4. **Enable Security Features** (CSRF, XSS protection)
5. **Optimize Imports** for smaller bundle sizes
6. **Review New Features** in the [API Reference](./API_REFERENCE.md)

---

## Summary Checklist

- [ ] Update package to v2.0
- [ ] Update configuration using `configureMinder`
- [ ] Change `apiBaseUrl` to `apiUrl`
- [ ] Simplify routes (use auto-generated CRUD)
- [ ] Update imports (use modular imports for smaller bundles)
- [ ] Add debug tools for development
- [ ] Enable security features
- [ ] Test application thoroughly
- [ ] Monitor bundle size improvements
- [ ] Review and adopt new features

---

For detailed examples, see the [Examples Guide](./EXAMPLES.md).
