# Wave J — Golden-Path DX (low-experience-developer pillar)

> Six-stage protocol. Parallel subagents, disjoint file locks, independent adversarial review before commit.

- **J-01 (Opus): error-message DX pass.** Audit the ad-hoc `throw new Error('[Minder] …')` and bare
  MinderError throw sites added recently (zero-config config-missing, NO_PROVIDER_FOR_CAPABILITY,
  local-first, etc.). Give the genuinely-lacking ones the same *what happened → how to fix → docs link*
  quality the typed MinderError subclasses already have. Report what was already fine vs improved — no
  make-work. Lock: src/hooks/useMinder.ts, src/hooks/contracts.ts, src/errors/MinderError.ts, tests.
- **J-02 (Sonnet): local-first discoverability.** A `docs/LOCAL_FIRST.md` guide + a runnable example
  page for `source: 'local-first'` in the Next.js example app, so the I-01 feature is findable. Lock:
  docs/LOCAL_FIRST.md (new), examples/nextjs-app/** , README.md (one link).
- **J-03 (later): `minder doctor` beginner expansion.** Turn doctor into a first-debugging tool
  (common setup-mistake checks + fix suggestions). Lock: src/cli/index.cjs, tests/cli-minder.test.ts.

Acceptance per task: TDD where behavior changes; every claim source-verified; no dead links (guard
exists); no "all SDKs"/unearned claims; full gate; independent adversarial review ACCEPT before commit.
