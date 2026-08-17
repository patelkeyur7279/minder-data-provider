# @minder/provider-firebase

The Firebase adapter for [Minder](../../README.md). Wires Firebase Auth and Cloud
Storage into Minder's stable capability hooks — `useAuth()`, `useStorage()` — so
you switch providers by config, not by rewriting integration code. This is also
the provider that activates Minder's credential-**FILE** path: a Firebase
**service-account JSON**, resolved server-only and reported as masked health.

- **Categories:** auth, database, storage
- **Runtimes:** web, node, edge
- **Frameworks:** react, nextjs, vite (React Native is **not** claimed — the native
  `@react-native-firebase/*` SDK is a **different** package, not this web SDK)
- **Peer dependency:** `firebase` `^10.0.0` (optional; loaded lazily)

> Status: **experimental (0.1.0)** until certified. See [`docs/providers/CATALOG.md`](../../docs/providers/CATALOG.md).

## Setup

1. **Create a Firebase project** at <https://console.firebase.google.com/>.
2. **Get your web config** (the public client config) from
   **Project Settings → General → Your apps → SDK setup and configuration**:
   `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`,
   `appId`. **All of these are PUBLIC** (see Security).
3. **Get a service-account JSON** (server-only, for admin operations / custom
   tokens) from **Project Settings → Service accounts → Generate new private
   key**. This downloads a `*.json` file. **Never commit it.** Minimum IAM roles
   for typical admin use: **Firebase Authentication Admin** (custom tokens) and,
   if you touch storage/firestore server-side, **Storage Admin** / **Cloud
   Datastore User** — grant only what you use.
4. **Install the SDK** (optional peer — only needed for the real, non-mock path):
   ```sh
   npm i firebase
   ```
5. **Configure Minder.** Put the whole (public) web config inline; reference the
   service-account credential FILE server-only (never paste its contents here):
   ```ts
   // minder.config.ts
   export default {
     apiUrl: 'https://api.example.com',
     providers: {
       firebase: {
         apiKey: 'AIzaSy-your-public-web-api-key',
         authDomain: 'your-project.firebaseapp.com',
         projectId: 'your-project',
         storageBucket: 'your-project.appspot.com',
         messagingSenderId: '000000000000',
         appId: '1:000000000000:web:0000000000000000000000',
         // server-only credential FILE — a path or base64 env, NOT raw JSON:
         serviceAccount: { kind: 'file', source: 'path', ref: process.env.GOOGLE_APPLICATION_CREDENTIALS },
       },
     },
   };
   ```
6. **Register the provider** once at startup, then use the hooks:
   ```ts
   import { registerFirebaseProvider } from 'minder-data-provider/providers/firebase';

   const unregister = await registerFirebaseProvider(); // reads providers.firebase
   // ...later, on teardown:
   unregister();
   ```
   See [`example.ts`](./example.ts) for a full walkthrough including `useAuth()`
   and the server-side masked health check.

### Mock mode (zero keys, zero account)

Develop the entire UI with no Firebase project by flipping one flag:
```ts
providers: { firebase: { mock: true } }
```
The same `useAuth()` / `useStorage()` hooks light up against in-memory mocks
(`firebase-mock://…` URLs and a `mock-user-1` session). Flip `mock` back to
`false` to go live — no code changes.

### Teardown / uninstall

`registerFirebaseProvider()` returns an `unregister()` that removes both
capability providers (auth, storage). Call it on app shutdown / HMR dispose. To
fully remove the provider, delete the `providers.firebase` config block, uninstall
`firebase`, and revoke the service-account key (see Credentials).

## Security

**The whole Firebase web config is PUBLIC — including `apiKey`.** Firebase's
`apiKey` is **not a secret**: it is a project *identifier* that Firebase
explicitly ships to the browser. It does not grant access on its own — access is
governed by **Firebase Authentication** and your **Security Rules** (Firestore /
Storage rules), not by hiding the key. This is the canonical "don't assume a key
named `apiKey` is a secret" case: a raw `apiKey` string in client config
**passes** Minder's config validation on purpose. Lock down access with Security
Rules, and restrict the key in the Google Cloud console (HTTP referrers / API
restrictions) if you want defense-in-depth.

**`serviceAccount` is server-only and must NEVER reach the client.** The
service-account JSON contains a real `private_key` that bypasses Security Rules.
It is declared `serverOnly` in this provider's manifest and typed as a
`CredentialInput`, so a raw service-account object or string placed in
client-reachable config is **rejected** by Minder's config validation (it names
the exact key and refuses to run). This adapter never ships or reads the
service-account on the client. On the server it is resolved via
`resolveCredential` and only ever surfaced as **masked health**
(`{ projectId, clientEmail: masked, hasPrivateKey }`) — the `private_key` is
**never** returned, logged, or echoed in any error.

**Security Rules note.** Because clients hold the public config, your Firestore
and Cloud Storage **Security Rules** are your real access boundary. Review and
test them for every collection and bucket path you expose.

No error thrown by this adapter echoes any configured value; credentials never
appear in logs, errors, or diagnostics (masked only).

## Credentials

| Key | Where to get it | Client-safe? | How to supply |
| --- | --------------- | ------------ | ------------- |
| `apiKey` / `authDomain` / `projectId` / `storageBucket` / `messagingSenderId` / `appId` | Console → Project Settings → General → Your apps | Yes (all PUBLIC) | inline in config |
| `serviceAccount` | Console → Project Settings → Service accounts → Generate new private key | **No — server only** | a `FileRef` — a filesystem path or a base64 env payload |

### Supplying the service-account credential FILE

Two server-only forms, both resolved by `resolveCredential` (never in the
browser):

- **Filesystem path** (Node): point at the downloaded JSON via the conventional
  `GOOGLE_APPLICATION_CREDENTIALS` env var —
  ```ts
  serviceAccount: { kind: 'file', source: 'path', ref: process.env.GOOGLE_APPLICATION_CREDENTIALS }
  ```
- **Base64 env** (edge/serverless where there is no filesystem): base64-encode the
  JSON into a single env var —
  ```sh
  base64 -i service-account.json | tr -d '\n'   # store as FIREBASE_SERVICE_ACCOUNT_B64
  ```
  ```ts
  serviceAccount: { kind: 'file', source: 'envJson', ref: 'FIREBASE_SERVICE_ACCOUNT_B64' }
  ```

**Rotation.** Rotate a service-account key from **Project Settings → Service
accounts** (generate a new key, deploy it, then delete the old key in the Google
Cloud console → IAM & Admin → Service Accounts → Keys). Update the file at the
`GOOGLE_APPLICATION_CREDENTIALS` path or the base64 env var — no client redeploy
is needed since the credential is resolved server-side. The public web config keys
rotate independently in the Firebase console.

**Teardown.** Delete the service-account key in the Google Cloud console, unset
`GOOGLE_APPLICATION_CREDENTIALS` (or the base64 env var), and remove the
`providers.firebase` config block to fully revoke this app's admin access.

**NEVER commit the service-account JSON** (add `*service-account*.json` to
`.gitignore`) and never place its contents in client config or any public
surface.
