# Security Architecture, Threat Model & Risk Register

## Security architecture (target)

**Boundary rule:** private material (service-account files, webhook signing secrets, payment secret
keys, DB admin credentials, provider tokens) never enters a browser bundle. Enforcement layers:

1. **[Confirmed foundation]** `SecretRef` (`src/security/secrets.ts`): non-stringifiable secret
   references; `assertNoExposedSecrets()` rejects secret-shaped values in client config;
   `redactSecrets()` for logs. Extend to: provider config schemas, debug logger output (currently
   request bodies log unredacted — known defect, task S-03), CLI output, test snapshots.
2. **[Proposed]** Every provider package declares `clientSafe: []` / `serverOnly: []` config keys in
   its manifest; the config validator hard-fails a build/init that routes a `serverOnly` key to a
   client entry, with an error naming the secure alternative (server route / serverless handler).
3. **[Proposed]** `@minder/server` handlers own webhook signature verification (Stripe-style HMAC +
   timestamp tolerance), OAuth state+PKCE+redirect-URI validation, and token exchange. Client
   packages only ever see short-lived, least-privilege session material.
4. **[Confirmed]** Fail-closed client auth semantics (2.2.0-beta.1) + documented limitation:
   signature verification is server-side responsibility.

## Threat model (STRIDE-lite, top items)

| Threat | Vector | Mitigation | Status |
|---|---|---|---|
| Secret in browser bundle | Dev passes service key into client config | SecretRef + manifest boundary validation + CI secret-scan | Partially built (SecretRef **Confirmed**); manifest validation **Proposed** |
| Forged webhooks | Attacker posts to webhook route | Signature verification helper, mandatory in provider server handlers | **Proposed** |
| Token theft via XSS | Tokens in localStorage / script-readable cookies | Documented storage tradeoffs; httpOnly-cookie claim corrected (defect S-02); recommend server-session pattern per provider | Open defect |
| CSRF on server handlers | Cross-site POST to generated routes | Double-submit/csrf util exists but is client-only theater (audit); real server-side CSRF in `@minder/server` | **Proposed** |
| Credential leakage in logs | Debug mode logs request bodies verbatim | Wire `redactSecrets` into debug/network logs | Open defect (S-03) |
| Supply chain | Deps, postinstall | postinstall is read-only **[Confirmed]**; add lockfile policy, provenance publishing, `npm audit` gate (currently non-blocking) | Partial |
| Unsafe CORS | wildcard+credentials | Fixed 2.2.0-beta.1 (middleware + proxy generator refuse it) | **Confirmed fixed** |
| SSRF via provider config | Attacker-controlled base URLs in server handlers | URL allowlist validation in server package | **Proposed** |

## Risk register (product/engineering)

| ID | Risk | Severity | Mitigation / owner |
|---|---|---|---|
| RK-1 | Foundation defects (Rules-of-Hooks crash, preflight tax) alienate the few existing users before the provider vision ships | High | M0 fixes first — providers wait (ROADMAP) |
| RK-2 | Solo part-time maintainer + provider matrix = maintenance overload | High | Strict certification gate; max 2 providers until M3 plugin SDK lets community own adapters |
| RK-3 | Provider API drift breaks adapters silently | Medium | Contract tests against recorded fixtures + scheduled CI against provider sandboxes |
| RK-4 | Breaking changes on beta line churn users | Medium | Migration notes shipped with every `fix!` (in place for 2.2.0-beta.1); codemods from M2 |
| RK-5 | React Native claim without architecture proof | Medium | RN stays **Experimental** until example app + CI (charter rule) |
| RK-6 | Provider ToS / license conflicts (SDK redistribution, trademark use in package names) | Medium | Compliance check per provider before publishing (task S-05); MIT license **[Confirmed]** for our code |
| RK-7 | Context/knowledge loss (AI-assisted, single maintainer) | Medium | This docs/product tracker + plan files are the source of truth; every session updates STATUS.md |

## Provider certification checklist (gate for "Confirmed" status)

A provider integration ships only with: (1) framework/runtime support declared; (2) credential
inventory + storage location documented; (3) client vs server capability split enforced by manifest;
(4) least-privilege scopes documented; (5) setup + teardown guide; (6) threat notes + mitigations;
(7) mock + contract tests; (8) error/retry/rate-limit behavior defined; (9) version compatibility
policy; (10) runnable example app in CI. (Charter requirement — adopted verbatim.)
