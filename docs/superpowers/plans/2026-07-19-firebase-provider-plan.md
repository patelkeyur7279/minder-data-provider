# Firebase Provider (Plan E — wave ⑤) Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Same protocol.

**Goal:** Firebase auth + Firestore + storage — and the FIRST activation of the credential-FILE path (service-account JSON), the reason Firebase is sequenced here.

**Architecture:** `providers/firebase/`. CLIENT side uses the Firebase Web SDK (`firebase`, optional peer) with the intentionally-public web config (apiKey, authDomain, projectId — all clientSafe; Firebase's "apiKey" is NOT a secret, it's a project identifier — document this explicitly, it's the canonical "don't assume 'key' means secret" case). SERVER side (admin operations, custom tokens) uses the service-account JSON via the `FileRef` CredentialInput (`{ kind:'file', source:'path'|'envJson' }`) resolved by resolveCredential — server-only, contents never logged/returned, schema-validated (type==='service_account', project_id, private_key present) with masked health only. AuthContract + StorageContract + a Firestore-backed data path; mock for all.

**Credential-file security (spec §credential files — the核心 of this wave):**
- Never accept/parse/upload/retain the file in browser code (resolveCredential already throws in browser).
- Server-side schema validation WITHOUT logging contents; a new `validateServiceAccount(obj): { valid, masked: { projectId, clientEmail: masked, hasPrivateKey } }` in the provider — returns MASKED health only, never the private_key.
- `registerClientSafeProviderKeys('firebase', ['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId','mock'])`; `serviceAccount` is serverOnly (a raw object/string in client config → hard fail).

| Wave | Task | Model | Files |
|---|---|---|---|
| 1 | E-01 provider dir + validateServiceAccount + FileRef server path + contracts + mock + tests | opus | providers/firebase/**, tests additions |
| 1 | E-02 packaging + CLI (entry, export, optional peer `firebase`, `minder add firebase` — env FILE guidance: GOOGLE_APPLICATION_CREDENTIALS path OR base64 env, snippet, dist-entry) | sonnet | package.json, tsup.config.ts, src/cli/index.cjs, tests/cli-minder.test.ts, tests/dist-entry-exports.test.ts |
| 2 | E-03 example (mock) + fresh-tarball proof + certification + Certified flip + catalog/matrix + a FileRef doctor demo (masked) | sonnet | examples/nextjs-app/**, scripts/generate-catalog.js, docs/providers/CATALOG.md, docs/product/SUPPORT_MATRIX.md, tests/generate-catalog.test.ts |

Acceptance: FileRef resolution server-only + never-log sentinel (service-account private_key never in any output); validateServiceAccount masked-only; the public-apiKey-is-not-a-secret case documented + tested (raw apiKey in client config PASSES, serviceAccount raw FAILS); certification 10/10; browser-verified mock; honest matrix (frameworks react/nextjs/vite; RN via react-native-firebase is a DIFFERENT SDK — not claimed).
