# GitHub Actions Setup

**No secrets required.** Every workflow in this repository runs with the
default, automatically-provided `GITHUB_TOKEN` (or no token at all). There is
no `NPM_TOKEN` to create, and nothing in `.github/workflows/` publishes to npm —
publishing is a manual step the maintainer runs on their own machine. See
[`RELEASING.md`](../RELEASING.md) for that process.

> This file previously instructed readers to create an npm **Classic Token**.
> npm permanently revoked all classic tokens on 2025-12-09 — that instruction
> no longer works and has been removed. If you're looking for how releases get
> published now, that's [`RELEASING.md`](../RELEASING.md), not this file.

## Workflows in this repository

| Workflow | Trigger | What it does |
|---|---|---|
| [`ci.yml`](workflows/ci.yml) | Push to `dev`/`v3.0-dev`; PRs to `dev`/`test`/`main` | Lint, type-check, test, build across the supported Node matrix (20 & 22). |
| [`pr-checks.yml`](workflows/pr-checks.yml) | PRs to `test`/`main` | Additional PR-time validation before a release-track merge. |
| [`release-guard.yml`](workflows/release-guard.yml) | Push/PR to `main`; manual | Read-only check that `package.json`'s version and the topmost CHANGELOG.md section agree, plus SemVer validity. Warns (never fails) on an already-published version, a pre-release without its dist-tag reminder, or a pre-existing tag. Needs no secrets — see the acceptance check in the workflow file itself (`grep -c 'secrets\.'` returns 0). |
| [`release.yml`](workflows/release.yml) | Push of a `v*` tag; manual (`workflow_dispatch`) | Creates (or refreshes) the GitHub Release for a tag, using the `gh` CLI and the CHANGELOG section for that version. No npm token, no third-party action — just `gh` and the default `GITHUB_TOKEN`. The manual trigger is also the recovery path for any tag that doesn't get a Release automatically (see [why that can happen](../RELEASING.md#why-the-tag-push-must-come-from-a-human)). |
| [`canary.yml`](workflows/canary.yml) | Weekly schedule; manual | Scheduled canary checks against `dev`. |
| [`example-nextjs.yml`](workflows/example-nextjs.yml) | PRs touching `src/`, `providers/`, `package.json`, `tsup.config.ts` | Runtime smoke test against the Next.js example consumer. |
| [`wiki-sync.yml`](workflows/wiki-sync.yml) | Push to `dev` touching `docs/**` | Syncs `docs/` into the GitHub Wiki. |

## Publishing

Publishing to npm is **not** automated by any workflow above. The full sequence
— including the order (publish before tag, and why), failure handling, and the
pre-release dist-tag warning — lives in [`RELEASING.md`](../RELEASING.md).

## Troubleshooting

### A workflow didn't run when I expected it to

- Check the trigger conditions in the table above (branch, path filters).
- GitHub does not trigger workflow runs from events created by the default
  `GITHUB_TOKEN` (its own recursion guard). If a tag was pushed by an
  automation credential instead of a human one, `release.yml` won't fire on
  its own — recover it with `gh workflow run release.yml -f tag=v<version>`.

### Release Guard is failing on a PR

- **G1/G2 (fails the run):** `package.json`'s version needs a matching
  `## [<version>]` section in `CHANGELOG.md`, and that section needs to be the
  topmost one. This usually means either the version bump or the CHANGELOG
  entry was forgotten — add whichever is missing.
- **G3 (fails the run):** `package.json`'s version isn't valid SemVer.
- **G4–G6 (warnings only, won't block the run):** version already on npm,
  pre-release dist-tag reminder, tag already exists. These are informational —
  read the job summary for details.
