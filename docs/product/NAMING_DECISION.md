# 3.0 Positioning & Naming — Analysis for Owner Decision

> Task **OSS-01** (BACKLOG.yaml, status `blocked`, type `research`). This document **prepares
> analysis and a recommendation only**. It does **not** decide. **OSS-01 remains owner-gated** —
> the npm identity decision is the owner's (BACKLOG.yaml blocker note; STATUS.md: publish/release/
> tag are owner-only). Status labels follow BRIEF.md.

## Why this is on the table now

The `OSS-01` blocker was written when the product was being framed as an **"integration
framework"**, and its note reads: *"Name no longer matches the integration-framework scope."* But
the **2026-07-19 owner vision refinement** (STATUS.md) explicitly **re-centered the identity on
"the data layer between UI and ANY source (backend / local db / server / anything)"** and
**de-prioritized** the integration-framework/AI framing. The current README already ships this:
*"The universal React data layer."*

This matters for naming: under the *refined* vision, **`…-data-provider` is a reasonable fit again**,
not an obvious mismatch. The decision is therefore less "the name is wrong" and more "is there a
better identity to carry into 3.0, and is the cost worth it?" The natural forcing point is that
**3.0 is already a planned breaking release** (ROADMAP.md: the M2 monorepo split into
`core`/`react`/`server`/`providers/*`, with a migration guide + codemod — task **M2-03**,
`backlog`). Any rename is cheapest if it rides that one break rather than spending a separate one.

**⚠️ Network/owner to-check (blocks a final commitment, not this analysis):** npm name/scope
availability is **[Unknown]** — verifying whether `minder-data-provider` remains ours to publish
(it is unpublished at `2.2.0-beta.0`) and whether the **`@minder`** org scope (or alternatives like
`@minder-dev`, `@minderjs`) is free **requires a network check and an npm account the owner
controls.** Do not finalize B or a scoped-C without it. GitHub org/handle and domain availability
(mindertech.in is already referenced in package.json) are in the same to-check bucket.

---

## Option A — Keep `minder-data-provider` (single package, unchanged)

- **Discoverability / SEO:** *Neutral-to-good.* The literal string "react data provider" is what a
  developer types when they want exactly this; the name is descriptive and keyword-rich (keywords
  array already includes `data-provider`). **Con:** "provider" collides with React's own
  `Context.Provider` and with `react-admin`'s `dataProvider` concept — mild namespace confusion in
  search.
- **npm availability:** *Best.* It is the current (unpublished) identity; **[to-check]** but almost
  certainly still claimable by the owner. Zero risk of a naming land-grab surprise.
- **Migration cost:** *Zero.* No existing published users to move (near-zero adoption; the one
  documented user abandoned, 2026-06 — BRIEF.md). Nothing to codemod for the name itself.
- **Brand clarity:** *Weakest of the three.* "data-provider" undersells the actual surface (auth,
  secrets, providers, server handlers, local-first). It reads as "a fetch wrapper," which is exactly
  the under-positioning the launch is trying to escape.

## Option B — Rename to a "universal data layer" identity (likely scoped `@minder/*`)

Most coherent form: adopt the **`@minder`** scope and split at 3.0 into `@minder/core`,
`@minder/react`, `@minder/server`, `@minder/supabase`, etc. — which is **exactly the package
topology ROADMAP.md already plans for the M2 monorepo split.** So B is less a "rename" than
"give the already-planned split a scoped home."

- **Discoverability / SEO:** *Best long-term, weak short-term.* A clean `@minder/react` brand scales
  and signals a system, not a snippet. **Con:** you discard whatever SEO/history the
  `minder-data-provider` string accrues through launch, and a brand-new scope has zero search
  gravity on day one; you're buying future clarity with present obscurity.
- **npm availability:** *Highest risk.* **[to-check, blocking]** the `@minder` scope may be taken;
  scopes are first-come. Fallback scopes (`@minderjs`, `@minder-dev`) dilute the exact brand. This is
  the single fact that can veto B and cannot be resolved without the owner + network.
- **Migration cost:** *Highest — but partially "free" if bundled into 3.0.* Import paths change for
  every consumer (`minder-data-provider` → `@minder/react` + peers). ROADMAP.md **already commits to a
  codemod for the 3.0 monorepo split**, so a name change folded into that same break reuses the
  migration users must do anyway. Doing B *separately* from M2-03 would waste a breaking release.
- **Brand clarity:** *Best.* Scoped packages communicate "a family / a platform," matching the
  "universal data layer" vision and the 6-provider surface far better than a single hyphenated name.

## Option C — Keep the npm name, add a strong tagline/brand

Publish as `minder-data-provider` but make **"Minder — the universal React data layer"** the
consistent brand line everywhere (README already does this; propagate to docs site, social, package
`description`, which today still reads the stale "hybrid Redux + TanStack Query data provider…").

- **Discoverability / SEO:** *Good, low-risk.* Keeps the keyword-rich install string *and* layers a
  memorable brand on top; you get the search benefits of both. **Con:** the install command and the
  brand say different things ("data-provider" vs "data layer") — a small, tolerable dissonance.
- **npm availability:** *Best (same as A).* No new scope to claim.
- **Migration cost:** *Zero.* Pure marketing/metadata; update `description` + keywords, no import
  changes.
- **Brand clarity:** *Good, not perfect.* The tagline does the heavy lifting; the package name stays
  a slightly literal artifact underneath. Strictly better than A, strictly less clean than B.

---

## Comparison at a glance

| Criterion | A — keep as-is | B — scoped `@minder/*` rename | C — keep name + brand tagline |
|---|---|---|---|
| Discoverability / SEO | Neutral–good | Best long-term / weak day-1 | Good (keyword + brand) |
| npm availability | Best | **Highest risk [to-check]** | Best |
| Migration cost | Zero | Highest (≈free if folded into 3.0) | Zero |
| Brand clarity | Weakest | Best | Good |
| Ties to planned 3.0 monorepo (M2-03) | None | Natural home | Independent |

---

## Recommendation (for owner sign-off — OSS-01 remains owner-gated)

**Adopt Option C now, and pre-commit to evaluating Option B at the 3.0 monorepo boundary — not
before.**

Concretely:

1. **For the public debut, ship as `minder-data-provider` (C).** Keep the accrued (soon-to-accrue)
   npm/search identity, take **zero** migration cost and **zero** availability risk, and let the firm
   brand line **"Minder — the universal React data layer"** carry positioning. First action item:
   update the package.json `description` (currently the stale "hybrid Redux + TanStack Query data
   provider for Next.js…") to match the vision — a metadata edit, not a rename. *(Noted as a
   follow-up; this document changes no files.)*
2. **Fold any scoped `@minder/*` rename into the already-planned 3.0 monorepo split (M2-03), or
   not at all.** ROADMAP.md is *already* going to break imports and ship a codemod at 3.0; that is the
   one moment a rename is nearly free, because users are already running the migration. Spending a
   *separate* breaking release purely on a name would be the worst outcome.
3. **Gate the B evaluation on the npm-scope to-check.** Before 3.0, the owner verifies `@minder`
   availability. If free → B becomes attractive (best brand clarity, migration piggybacks the split,
   and `minder-data-provider` can remain as a thin meta-package that re-exports for continuity). If
   taken → stay on C indefinitely; a diluted fallback scope buys little over a strong tagline.

**Reasoning in one breath:** the product is unpublished with near-zero adoption, so the *cost* of
renaming is uniquely low today — but so is the *benefit*, because there's no audience yet for the
brand to compound. The refined "data layer" vision already fits the current name well enough that a
rename isn't urgent, and the only genuinely clean, low-waste window to rename is the 3.0 monorepo
split you're already going to ship. So: brand hard now (C), decide the scoped rename at 3.0 once npm
availability is known (B), and never spend a standalone breaking release on a name.

**One-line recommendation:** *Keep `minder-data-provider` + a firm "universal React data layer"
brand for launch (C); fold any scoped `@minder/*` rename into the already-planned 3.0 monorepo
split (B) rather than a separate break — pending the npm-scope availability check. Owner-gated.*
