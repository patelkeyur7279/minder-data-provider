# Releasing

This is the maintainer-only process for cutting a release of `minder-data-provider`.
Publishing to npm is a **manual, owner-run step** — there is no CI token for it (see
[Why publishing is manual](#why-publishing-is-manual) below) — but GitHub stays the
authoritative release record: `main` is kept current, tags are correct, and every
tag gets a real GitHub Release.

## The sequence

1. `dev` is green (tests, lint, type-check all passing).
2. Open a PR: `dev` → `main`. CI (`ci.yml`) and [Release Guard](#release-guard) both
   run on the PR.
3. Merge the PR.
4. On `main`, locally: `npm run release:preflight` — read-only checks that
   `package.json`'s version, the CHANGELOG, and git/npm state are all consistent
   (see [Preflight checks](#preflight-checks) below). Fix anything it flags.
5. **Publish to npm** — the one irreversible step, done by hand:
   - Stable release: `npm publish`
   - Pre-release: `npm publish --tag <pre-id>` (e.g. `--tag beta`) — **never a
     bare `npm publish`** for a pre-release, see [the bold warning](#pre-release-publishes-are-the-most-expensive-typo-in-this-repo)
     below.
   - `prepublishOnly` runs the full local gate first (clean, build, bundle sizes,
     tests, `verify-build`, `verify:treeshake`) — nothing publishes until that's green.
6. `git tag -a v<version> -m "Release v<version>"`
7. `git push origin v<version>` — pushed with **your own git credentials**, not a
   bot token (see [Why the tag push must come from a human](#why-the-tag-push-must-come-from-a-human)).
8. Pushing that tag triggers [`release.yml`](.github/workflows/release.yml), which
   creates the GitHub Release automatically using the CHANGELOG section for that
   version. Confirm it appeared: `gh release view v<version>`.
9. `npm run release:verify` — read-only checks that the publish actually landed
   correctly (registry version, dist-tags, tag, Release — see
   [Post-publish verification](#post-publish-verification)). Run this after pushing the tag.

### Why publish-before-tag

Publishing to npm happens **before** tagging and pushing, which is the reverse of
what feels natural. This is deliberate:

- **Asymmetry of irreversibility.** An npm version number is consumed forever —
  unpublish is a 72-hour, policy-restricted escape hatch, and the number can never
  be reused. A git tag is a pointer you can delete with one command. Sequence the
  reversible step *after* the irreversible one, not before it.
- **The bad failure mode only exists in the tag-first order.** Tag first, then
  publish fails (2FA timeout, a red `prepublishOnly`, a registry 5xx) → you're left
  with a pushed tag and an auto-created **public GitHub Release announcing a
  version that does not exist on npm.** That's public, wrong, and racy for anyone
  who already saw the tag. Publish first, then a tag push fails → recovery is just
  re-running `git push origin v<version>`, and nothing public was ever wrong.
- **`prepublishOnly` is the real final gate.** Tagging before it passes would mean
  tagging a tree that hasn't cleared the same checks `npm run release:check` runs.
- **Nothing is lost by doing it this way.** The tag still names the exact commit
  that was published — main doesn't move between steps 5 and 7 — so "the tag marks
  the published commit" holds true either way.

## Pre-release publishes are the most expensive typo in this repo

**A bare `npm publish` on a pre-release version moves the `latest` dist-tag.**
Every pre-release publish MUST include `--tag <pre-id>` (e.g. `npm publish --tag
beta`). There is no undo for shipping a `2.2.0-beta.1` as `latest` to everyone who
runs a plain `npm install minder-data-provider` — check this every single time.

## Mid-publish failure handling

| Situation | What happened | What to do |
|---|---|---|
| `prepublishOnly` fails | Nothing published, nothing tagged | Fix on `dev`, re-merge. No cleanup needed. |
| OTP prompt times out | Nothing published | Re-run `npm publish`. |
| Upload succeeded, then the command errored | Ambiguous — may or may not be live | **Check before retrying:** `npm view minder-data-provider versions --json`. If the version is present, do **not** retry (you'll get `EPUBLISHCONFLICT`) — go straight to tagging. |
| Tag push failed | Publish succeeded, tag didn't reach origin | `git push origin v<version>`. |
| Tag pushed but no Release appeared | Usually means the push didn't come from a human credential | Run `release.yml` via `workflow_dispatch` with that tag — see [Recovery](#recovery-workflow_dispatch) below. This is the standing recovery path for *any* tag automation ever pushes. |

## Post-publish verification

`npm run release:verify` (read-only; defaults to the current `package.json`
version) checks:

1. `npm view minder-data-provider@<version> version` returns `<version>`.
2. `npm view minder-data-provider dist-tags --json` — stable: `latest ==
   <version>`; pre-release: the pre-release dist-tag `== <version>` **and**
   `latest` unchanged (this is the check that catches a forgotten `--tag`).
3. Cold-install smoke test (skipped by default — pass `--full` to run it): installs
   the published version into a scratch directory and resolves both the root
   entry and a subpath export, proving the `files` array and `exports` map
   survived the publish.
4. `git ls-remote --tags origin` shows `v<version>`.
5. `gh release view v<version> --json isPrerelease,body` — correct prerelease
   flag, body isn't the stub fallback.

One thing it will **not** flag as a problem: `npm view minder-data-provider@<version>
--json` will have **no** provenance/attestation block. That's expected under
manual publishing (see below) — not a regression.

## Preflight checks

`npm run release:preflight` (read-only, run from `main`) checks branch, clean tree,
sync with `origin/main`, valid SemVer, a matching and topmost CHANGELOG section,
that the version isn't already tagged or published, and reminds about the
pre-release dist-tag rule. Every FAIL is printed before the script exits
non-zero, so you see every problem at once instead of one at a time. On success it
prints the exact next commands, substituting the correct dist-tag for
pre-releases.

Neither `release-preflight.js` nor `changelog-section.js` ever publishes,
tags, or pushes anything — they only read files, git refs, and the anonymous npm
registry, and print what you should run yourself.

## Release Guard

[`release-guard.yml`](.github/workflows/release-guard.yml) runs on every push and
PR to `main` and on-demand. It's a fast, secretless, read-only sanity check — no
`npm ci`, no tokens, nothing but reading files and anonymous registry/git-ref
lookups:

| Check | Catches | On violation |
|---|---|---|
| G1 | `package.json`'s version has no matching `## [x]` CHANGELOG section | **fails the run** |
| G2 | The topmost CHANGELOG section isn't the current version (bumped version, forgot the entry — or the reverse) | **fails the run** |
| G3 | `package.json` version isn't valid SemVer | **fails the run** |
| G4 | Version is already on npm | warning only |
| G5 | Version is a pre-release (dist-tag reminder) | warning only |
| G6 | The tag already exists on origin | warning only |

G4–G6 are warnings, not failures — otherwise every ordinary docs-only push to
`main` after a publish would go red, and a guard that cries wolf gets ignored.
Its job summary always prints the copy-paste manual-publish command for the
current version, so it doubles as this runbook's entry point.

**Side benefit:** with the old auto-publish workflow gone, merging `dev` → `main`
is no longer an irreversible publish event. `main` is now a branch you can fix,
revert, and re-push like any other — publishing only happens when a human
deliberately runs it.

## Recovery: `workflow_dispatch`

Any tag — one automation just pushed, or one from months ago that never got a
Release — can be backfilled on demand:

```bash
gh workflow run release.yml -f tag=v2.1.4
```

Options: `overwrite=true` refreshes the notes on a Release that already exists;
`mark_latest=true` marks a stable backfill as the `latest` Release (default
`false`, so an old version can never silently steal the Latest badge — only the
version that's genuinely current should carry it).

`release.yml` only exists as a workflow once it's merged to the default branch —
`workflow_dispatch` isn't available for a workflow that only lives on a feature
branch.

### Known gap: some pre-2.2.0 beta versions have no tag

`2.1.5-beta.0`, `2.2.0-beta.1`, and `2.2.0-beta.2` were published to npm but never
tagged in git, and their exact source commits are not reliably recoverable — a
tag pointing at a guessed commit would be a false claim that outlives its own
usefulness. Betas are ephemeral and nobody archaeologies them months later; this
gap is recorded here rather than papered over with a guess.

### Backfill procedure: creating missing tags and Releases

Current status (verified 2026-08-17):
- **On npm but no git tag:** `2.2.0-beta.1`, `2.2.0-beta.2`
- **Git tag exists, no GitHub Release:** `v2.1.4`, `v2.2.0-beta.0`
- **Last GitHub Release on record:** `v2.1.3`
- **Local-only tag (never pushed):** `v2.0.3` — OPEN DECISION for owner (push or delete)

**Safe backfill order** (requires your own git credentials):

1. **For the local tag:** Decide whether to push `v2.0.3`:
   ```bash
   git tag -l v2.0.3                    # verify it exists locally
   # Either: git push origin v2.0.3     # push it to origin (triggers release.yml)
   # Or:     git tag -d v2.0.3          # delete it if it's not part of the release history
   ```

2. **For missing Releases on existing tags** (`v2.1.4`, `v2.2.0-beta.0`):
   ```bash
   gh workflow run release.yml -f tag=v2.1.4
   gh workflow run release.yml -f tag=v2.2.0-beta.0
   ```
   These use the `workflow_dispatch` trigger to create Releases from the CHANGELOG sections
   that already exist on those commits. Confirm they appeared: `gh release view v2.1.4`.

3. **For beta versions on npm with no git tag** (`2.2.0-beta.1`, `2.2.0-beta.2`):
   These cannot be backfilled with a true git tag because the exact commits are
   unknown. Document this gap in CHANGELOG as "published but untagged for historical
   reasons" rather than guessing a commit. These remain in the npm registry but outside
   the git history.

## Why publishing is manual

npm permanently revoked all classic access tokens in December 2025; granular
tokens now cap out at 90 days and require 2FA, which doesn't suit a background CI
job. npm's own 2026-recommended path for automated publishing is **Trusted
Publishing (OIDC)** — it works without any token at all. It is not implemented
here by design; publishing is deliberately kept a human step. It remains
available as a future option if that trade-off is ever revisited.

One consequence worth stating plainly: manual publishing **forfeits npm
provenance** — the "Built and signed on GitHub Actions" badge on the npm package
page disappears starting with the first manually-published version. Trusted
Publishing is the only path that restores it, and it is not implemented here for
the reason above.

## Why the tag push must come from a human

GitHub does not trigger workflow runs from events created by the default
`GITHUB_TOKEN` — this is GitHub's own recursion guard, and it's why the previous
automated pipeline's tag pushes never fired `release.yml` even though the tags
themselves showed up on GitHub. A tag pushed with your own git credentials
triggers it correctly. If a tag ever does get pushed by an automation credential,
[the `workflow_dispatch` recovery path](#recovery-workflow_dispatch) is what
brings its Release into existence.
