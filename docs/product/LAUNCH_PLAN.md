# 3.0 Launch Plan — minder-data-provider

> Task **OSS-09** (BACKLOG.yaml). This is a plan, not an executed launch. Nothing here
> authorizes a publish, push, tag, or post — those remain owner-gated (STATUS.md: npm
> publish/release/tag/deploy and the GitHub secret-scanning unblock click are owner-only).
> Status labels follow BRIEF.md: **[Confirmed]** verified by repo state · **[Open]** not done
> · **[Owner]** owner decision/action required.

## 0. Version reality check (read first)

The package is **unpublished** and sits at `2.2.0-beta.0` (package.json); the top CHANGELOG
entry is `[2.2.0-beta.1] - Unreleased`. Per ROADMAP.md's version policy, **`3.0.0` is
specifically the M2 monorepo split (`core` / `react` / `server` / `providers/*` workspaces) with
a migration guide + codemod — "the only planned breaking release."** That split is task
**M2-03, still `backlog`** (BACKLOG.yaml). So "3.0" is not yet buildable.

This forces one **[Owner]** sequencing decision the rest of the plan hangs on:

- **Option L1 — launch the current single-package line first.** Cut a stable `2.3.0` (or
  `2.2.0` GA) of what already exists — 6 certified providers, zero-config `useMinder`, CLI,
  local-first — and treat the marketing "launch" as the public debut. Ship the 3.0 monorepo
  split later as the planned breaking release. **Lower risk; recommended.** The differentiators
  are already in the single package; the monorepo split is an internal packaging change users
  mostly feel through a codemod, not a reason to delay reaching them.
- **Option L2 — hold the launch until 3.0 monorepo (M2-03) lands.** Cleaner story ("3.0, the
  universal data layer"), but gates public debut on an unstarted, breaking, solo-maintained
  refactor. **Higher risk; not recommended for first debut.**

The rest of this document is written to be valid under either option; where it matters, it flags
which. Wherever it says "3.0 launch" it means *the public debut*, which under L1 may carry a 2.x
version number.

---

## 1. Positioning

**One-liner (from README + BRIEF.md):**

> **Minder — the universal React data layer. UI → `MinderDataProvider` → any backend, local
> data, or service. One API call to enterprise.**

**Core value prop (grounded in BRIEF.md "Product principle"):** developers own their UI, business
rules, provider accounts, and credentials; Minder owns the *wiring* — one hook (`useMinder`) for
fetching/auth/caching, one CLI command for certified third-party integrations, and one config for
plugins, secrets, and edge-safe server handlers — **"when you need them, and not before"**
(README Golden Path). The escalation ladder is the pitch: Level 0 is a one-line `useMinder(url)`
with no config; Level 3 is secret-boundary enforcement and webhook-verifying server handlers. Same
library, adopted incrementally.

**Three proof points that are [Confirmed] in-repo (do not over-claim beyond these):**

1. **Zero-config to enterprise on one ladder.** `useMinder("https://…/users")` works with no
   provider/registry (M1-01, verified); `configureMinder` named routes; `npx minder add stripe`;
   plugins + `secret()` server handlers. All shipped and tested.
2. **A real secret-safety boundary, not a slogan.** `secret()` + `assertNoExposedSecrets` throw at
   `configureMinder()` time on a secret-shaped value routed to the client, naming the offending key
   (`src/security/secrets.ts`; SECURITY_GUIDE.md; M1-02 verified). This is the honest wedge vs.
   "just use the SDK."
3. **6 providers on a published 10-point certification gate.** Supabase, Stripe, Clerk, Firebase,
   Razorpay, Sentry — each mock-mode example + secret-sentinel tested
   (`scripts/certify-provider.js`; SUPPORT_MATRIX.md). Mock mode means you build the whole UI with
   zero keys and zero provider account.

**Honesty guardrails for all launch copy (SUPPORT_MATRIX.md is the source of truth):**

- Only **React 19 (web)** is **Confirmed**. Next.js, Native/Expo, Electron, Node are
  **Experimental**; App Router/RSC is **Partial** (provider-wrapper pattern only); edge is
  **Inferred-works**. Launch copy must not imply "works everywhere" — link the Support Matrix.
- Provider "Certified" = **mock-mode example + contract tests in CI**, not live-service E2E (which
  needs real credentials and is explicitly out of CI). Say so.
- Benchmarks: the preflight-tax improvement is a **structural 2.00× on localhost** (STATUS.md
  latency demo), not a general "2× faster." Cite it precisely or not at all.

---

## 2. Comparison-page outlines

Three pages, honest by design (BRIEF.md non-goal: no universal-framework claims). Each ends with an
explicit "**when the alternative is the right call**" section — reviewers on HN/Reddit punish
one-sided comparisons, and fairness is the credibility play.

### 2A. Minder vs. hand-rolled fetch/axios

- **What you build by hand, every project:** base-URL/config plumbing, loading/error state,
  retry/backoff, auth header injection + token refresh, cache/dedupe, request cancellation,
  offline handling, webhook signature verification on the server.
- **What Minder collapses it to:** `useMinder(route)` returns `{ data, loading, error }`;
  `error.raw` still gives you the underlying `AxiosError` (M1-01). Retry default is a sane `1`
  (M0-02). CLI-scaffolded server handlers verify webhook signatures for you.
- **The security angle hand-rolling usually gets wrong:** secret-in-bundle. Minder throws at config
  time; a hand-rolled `fetch` silently ships the key. This is the strongest single bullet.
- **Where hand-rolled is genuinely better (say it):** smallest possible dependency footprint; total
  control; no abstraction to learn; nothing to certify. If you make one request and never touch
  auth/cache/webhooks, `fetch` is the right tool — and Minder's Level 0 is deliberately a thin
  wrapper, not a wall.

### 2B. Minder vs. per-provider SDKs used directly (Stripe, Supabase, Firebase, …)

- **Direct-SDK friction Minder targets:** each SDK has its own client init, its own env-var
  conventions, its own client-vs-server boundary you must get right yourself, and no shared testing
  story. Wiring Stripe checkout + webhook verification by hand is the canonical time sink.
- **What Minder adds *on top of* the same SDKs:** a uniform capability surface (`useAuth`,
  `useCheckout`, `useStorage`, `useLive`), `npx minder add <provider>` scaffolding (`.env.example`,
  config snippet, real Next.js route files), and **mock mode** so the UI is buildable with no keys.
- **Escape hatch is first-class (disarms lock-in fear):** `getProviderClient()` returns the raw
  underlying SDK client — you are never boxed out of a native feature.
- **The boundary is enforced, not documented:** `serverOnly` keys hard-fail if routed to a client
  entry (SUPPORT_MATRIX capabilities; SECURITY_GUIDE.md).
- **Where the direct SDK is better (say it):** newest provider features land in the SDK first and may
  not be surfaced by Minder's capability layer yet; only 6 providers are certified — anything else is
  a custom provider you write yourself (`docs/providers/CUSTOM.md`); and you take a dependency +
  abstraction you'd otherwise not have. Deep, single-provider apps may not need the uniform layer.

### 2C. Minder vs. @tanstack/react-query alone

- **Framing (critical for fairness):** this is **not** "instead of." Minder **uses**
  `@tanstack/react-query` as its caching layer — it is a **required peer dependency** (README;
  SUPPORT_MATRIX: "TanStack Query caching — Confirmed"). The honest comparison is "React Query alone"
  vs. "React Query + Minder's layer on top."
- **What React Query intentionally does *not* provide (Minder's additive layer):** a transport +
  base-URL/route registry, an auth/token-refresh layer, a secret boundary, provider integrations +
  CLI scaffolding, server-side webhook handlers, local-first persistence
  (`source: 'local-first'`, I-01).
- **What you give up vs. raw React Query (say it):** a thin, universally-understood API that the
  whole ecosystem already knows; direct control of every query/mutation option; and one fewer
  abstraction layer. Teams already fluent in React Query who don't need auth/providers/secrets/server
  handlers should likely just use it directly — Minder earns its place only when you want that extra
  surface. Also note: you still mount a `QueryClientProvider` yourself, so Minder does not hide
  React Query from you.

---

## 3. Channels plan

Sequence assumes the launch artifact is live first (published package OR a public repo + StackBlitz
demo). **All posts are owner-authored/owner-posted — "Publishing/posting public content" is
owner-gated.** These are drafts and outlines only.

### 3A. Show HN

- **Title:** "Show HN: Minder — a universal React data layer (UI → any backend/local/service)".
  Avoid superlatives; HN downvotes hype.
- **Body (short):** the problem (every React app re-wires fetch/auth/cache/webhooks); the Level 0→3
  ladder; the secret-boundary demo (the one-liner that throws on a leaked key is the memorable hook);
  the honest support surface ("React 19 web is Confirmed; everything else is labeled Experimental —
  here's the matrix"); free/MIT/solo-maintained. Link the StackBlitz.
- **Prep for comments (HN will probe these — have honest answers ready):** "why not just React
  Query?" (answer: 2C — we build on it), "why not the SDK directly?" (2B + `getProviderClient()`),
  bundle size (core.mjs ~4K, packed 252kB — STATUS.md M0-06), "is this AI slop?" (point to the
  certification gate, tests count, and the honest SUPPORT_MATRIX as evidence of rigor). **Be present
  in-thread for the first few hours** — HN launches live or die on author responsiveness.

### 3B. Reddit — r/reactjs and r/nextjs

- **r/reactjs:** framework-agnostic angle. Lead with the `useMinder` ladder and local-first; do
  **not** lead with providers (reads as promo). Flair as a project/showcase; follow subreddit
  self-promotion rules. A short "what I learned building a data layer on top of React Query" framing
  outperforms a feature dump.
- **r/nextjs:** lead with the concrete Next.js win — `npx minder add stripe` scaffolds real route
  handlers + webhook verification; the App Router/RSC honesty (provider-wrapper pattern works today;
  direct client-export-into-RSC caveat is documented — NEXTJS_APP_ROUTER.md). Being upfront about the
  RSC caveat *before* someone finds it builds trust.
- **Cadence:** stagger, don't cross-post same-day. Respond to every substantive comment.

### 3C. dev.to / Hashnode article outline

Working title: **"Stop re-wiring fetch, auth, and webhooks in every React app."**

1. Hook: the 4 things every React project re-implements (fetch state, auth refresh, cache, webhook
   verification).
2. Level 0: `useMinder(url)` with literally no config — running in <2 min.
3. Level 1–2: named routes → `npx minder add stripe` → `useCheckout()`, all in mock mode with zero
   keys.
4. The security payoff: paste a real key into a client-reachable config → it throws at config time,
   naming the key. Short screen recording.
5. Honesty section: what's Confirmed vs Experimental (embed the matrix); it builds on React Query,
   not against it.
6. CTA: repo, StackBlitz, "custom provider in ~30 lines" (`docs/providers/CUSTOM.md`).
- Cross-post canonical to dev.to, mirror to Hashnode with `canonical_url`.

### 3D. Twitter/X thread outline

1. Hook + the one-liner positioning + a 6-sec GIF of `useMinder(url)` returning data with no setup.
2. "Level 0 → Level 3, same library, adopt only what you need" — 4-line code carousel.
3. The secret-boundary throw (the screenshot people quote-tweet).
4. `npx minder add stripe` → mock-mode checkout with no keys → flip `mock:false`.
5. Honesty flex: a screenshot of the SUPPORT_MATRIX ("we label what's Confirmed vs Experimental").
   Counter-intuitively the strongest tweet — transparency is the differentiator vs. hype-libraries.
6. CTA: repo + StackBlitz + "free, MIT, feedback wanted." Tag no one; let it stand on the demo.

---

## 4. Pre-launch readiness checklist (tied to real repo state)

Cross-referenced to SUPPORT_MATRIX.md and BACKLOG.yaml. **[Confirmed]** = evidence in repo;
**[Open]** = task not done; **[Owner]** = owner action.

### Blockers — launch cannot happen until these clear

- **[Owner] Publish + tag the package.** Currently unpublished at `2.2.0-beta.0`. Cutting a stable
  public version and `npm publish` are owner-gated (STATUS.md spec rule). Nothing has been
  published/released/tagged.
- **[Owner] GitHub secret-scanning unblock click.** Pushes to `origin/dev` are blocked; ~85+ local
  commits are waiting (STATUS.md). **No CI workflow has had a first green run on GitHub yet** — so
  every "in CI" claim below is *locally* green, not *GitHub*-green, until this clears. This is the
  single highest-leverage unblock: it converts the whole launch story from "passes on my machine" to
  publicly-verifiable.
- **[Open] Decide L1 vs L2** (§0). If L2, add M2-03 (monorepo split + codemod) as a hard dependency —
  it is `backlog` and breaking.

### Docs — mostly done

- **[Confirmed] README golden-path** rewrite (Wave G).
- **[Confirmed] CHANGELOG.md** exists and is detailed (top entry `[2.2.0-beta.1] - Unreleased` — needs
  a real release entry at publish time).
- **[Confirmed] Migration guide** (`docs/MIGRATION_GUIDE.md`), **SECURITY.md** with a real GitHub
  Security Advisories reporting path (the "empty contact" noted in RISKS_AND_THREAT_MODEL.md is
  **stale** — it's populated), **CONTRIBUTING.md**, **CODE_OF_CONDUCT.md**, provider **CATALOG.md** +
  **CERTIFICATION.md** + **CUSTOM.md**.
- **[Open] Real docs site (OSS-02)** — `backlog`. Docs currently live in a GitHub wiki. Not a launch
  blocker, but the wiki links in the README should resolve publicly before debut (gated on the push).

### Runnable examples in CI

- **[Confirmed, local] Next.js example app** builds green from a fresh pack (M1-06, verified);
  `example-nextjs.yml` workflow exists. **[Open]** promotion of Next.js to **Confirmed** in
  SUPPORT_MATRIX awaits the *first green GitHub run* (blocked on the push).
- **[Open] Other platform examples in CI.** `examples/` contains web, nextjs-app, expo, electron,
  react-native, nodejs, custom-provider, mock-api dirs, but **only Next.js has a CI leg.** Expo +
  Electron runtime runs are **H-05 (`backlog`)** and can't be automated in the current toolchain
  (STATUS.md Wave H). Edge Worker example is R-04 follow-up (`backlog`). **Launch copy must keep
  these Experimental/Inferred.**
- **[Open] OSS-03** (30-sec wow demo + `npm create minder-app` + StackBlitz links) — `backlog`. The
  StackBlitz repro/demo is referenced by every channel above; **treat OSS-03 as a launch dependency**,
  not optional.

### Benchmarks

- **[Open] `docs/BENCHMARKS.md` does not exist yet** (being written in parallel per the task; **OSS-05
  is `backlog`**). The only benchmark currently in-repo is the STATUS.md preflight latency demo
  (structural 2.00× on localhost, zero preflights). **Launch requirement:** BENCHMARKS.md must land,
  be reproducible, and be cited *precisely* (no "2× faster" generalization). Until it does, comparison
  page 2A should cite only the structural preflight fact, not throughput numbers.

### Support-matrix honesty

- **[Confirmed]** SUPPORT_MATRIX.md is evidence-based and current (Wave H kept platforms Experimental
  rather than over-claiming). This is a launch *asset* — feature the honesty, don't paper over it.
  The README Platform Support table is consistent with it.

### Community + supply-chain infra

- **[Confirmed] Issue templates + PR template** exist (`.github/ISSUE_TEMPLATE/`,
  `pull_request_template.md`). **[Open]** the rest of **OSS-04** (Discussions enabled,
  good-first-issue triage, maintainer guide, RFC process) — `backlog`. Enable Discussions before
  linking it (package.json already advertises a discussions URL).
- **[Open] OSS-06 supply-chain trust** (`npm publish --provenance`, 2FA note, advisories flow) —
  `backlog`. `publish.yml` exists; wire provenance before the first publish. **Do at publish time.**
- **[Open] OSS-07 funding rails** — `backlog`. Optional for debut.

### Product-validation caveat (not a blocker, but shapes messaging)

- **[Open] R-02 developer interviews (≥5)** — `backlog`. Personas P1/P2 and the integration-pain
  hypothesis remain **[Inferred]** (BRIEF.md). Keep launch claims about "the dominant time sink"
  hedged; let the launch itself be the validation signal.

---

## 5. Success metrics + rough sequence

### Metrics (set the bar honestly — this is a solo, unpublished, near-zero-adoption starting point)

- **npm:** weekly downloads trend (baseline 0). Realistic first-30-day target: hundreds/week, not
  thousands. Watch install-to-retained (downloads that persist past week 1) over raw spikes.
- **GitHub stars:** directional interest signal. A Show HN front-page or a strong r/reactjs thread
  might yield low-hundreds of stars; treat >250 in month 1 as a strong outcome, not a floor.
- **Issue quality (the metric that matters most for a solo maintainer):** ratio of reproducible
  issues (ideally on the StackBlitz repro template — OSS-09 scope) to noise; time-to-first-response;
  count of "how do I…" that map to a docs gap (each is a docs backlog item). Good first-week issues =
  real adoption; a flood of low-quality issues without a repro template is a maintainer-overload risk
  (RK-2).
- **Qualitative:** does any comment independently articulate the value prop back (esp. the
  secret-boundary or the Level 0→3 ladder)? That's product-market-fit signal worth more than stars.

### Rough sequence

1. **Unblock (Owner):** click the GitHub secret-scanning unblock → push → confirm CI (ci.yml,
   example-nextjs.yml) goes green on GitHub. Promote Next.js to Confirmed in SUPPORT_MATRIX only after.
2. **Finish launch dependencies:** BENCHMARKS.md (OSS-05) lands + reproducible; OSS-03 StackBlitz demo
   + repro template live; wire provenance (OSS-06) into publish.yml; enable Discussions.
3. **Decide L1 vs L2** and cut the release: stable version, real CHANGELOG entry, tag — **Owner
   publish**.
4. **Soft launch:** dev.to/Hashnode article + X thread first (lower stakes, shakes out doc gaps and
   first issues).
5. **Show HN** on a weekday morning US time; author present in-thread for the first hours.
6. **Reddit** r/reactjs then r/nextjs, staggered a day+ apart, after HN feedback has hardened the FAQ.
7. **Iterate:** triage issues into BACKLOG.yaml daily for the first week; convert every "how do I…"
   into a docs fix; fold recurring objections back into the comparison pages.

---

## Appendix — evidence map (traceability)

| Claim in this plan | Grounded in |
|---|---|
| Zero-config `useMinder`, `error.raw`, axios escape hatch | M1-01 verified (BACKLOG.yaml) |
| Secret boundary throws at config time | M1-02 verified; `src/security/secrets.ts`; SECURITY_GUIDE.md |
| 6 certified providers, mock mode, sentinel-tested | M2-01/02/CLERK/FIREBASE/RAZORPAY/SENTRY verified; SUPPORT_MATRIX.md |
| 10-point certification gate | `scripts/certify-provider.js`; RISKS_AND_THREAT_MODEL.md §Provider certification |
| Only React 19 web Confirmed; rest Experimental/Partial | SUPPORT_MATRIX.md |
| Preflight latency structural 2.00× localhost | STATUS.md M0 latency demo; M0-01 (BACKLOG.yaml) |
| Bundle core.mjs ~4K / packed 252kB | STATUS.md Wave 3; M0-06 |
| Local-first `source: 'local-first'` | I-01 verified; docs/LOCAL_FIRST.md |
| CLI `minder add/init/doctor` | M2-04 verified; `bin/minder.js` |
| 3.0 = monorepo split, breaking, planned | ROADMAP.md version policy; M2-03 `backlog` |
| Publish/push owner-gated; unpublished; ~85 commits waiting | STATUS.md standing authorization + open blockers |
| BENCHMARKS.md absent; OSS-03/04/05/06 backlog | filesystem; BACKLOG.yaml |
