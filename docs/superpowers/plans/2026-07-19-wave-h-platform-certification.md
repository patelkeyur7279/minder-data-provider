# Wave H — Platform Certification (Expo / Electron / Native)

> Governed by the master execution protocol (six-stage pipeline). Owner-approved 2026-07-19.

## Honest evidence ceiling (stated up front — no overclaiming)

The Expo and Electron **runtime toolchains are not installable in this environment** (heavy native
deps; Electron needs a display; Expo needs a device/simulator). A true on-device / GUI run cannot be
produced here, so RN/Expo/Electron will NOT be blanket-promoted to "Production Ready" or even
"Confirmed" on the strength of a simulated run that didn't happen. Instead each platform moves to a
status backed by exactly the evidence achieved.

Structural fact: `/electron` = `/web` + `ElectronStorageAdapter`; `/expo` = `/native` +
`ExpoStorageAdapter`. The platform-specific DELTA is the storage adapters — which sit at ~4-6%
coverage (audit reliability debt). That delta is the highest-value, fully-verifiable target.

## Tasks

- **H-01 (this wave, inline): Platform storage-adapter reliability tests.** ElectronStorageAdapter,
  ExpoStorageAdapter, NativeStorageAdapter tested via virtual mocks of their backing modules
  (electron-store / expo-secure-store / async-storage — uninstalled optional peers). Full CRUD +
  TTL expiry + namespace isolation + enumeration + graceful degradation when the backing module is
  absent. Closes the 4-6% → covered gap on the actual mobile/desktop delta. Acceptance: each
  adapter's public methods exercised; coverage of the three files >70%; gate green.
- **H-02: Dist-entry + edge-safety coverage for platform entries.** Extend the dist-entry guard to
  probe `/native`, `/expo`, `/electron` built entries (CJS+ESM export sanity — catches the
  HttpMethod-class interop regression on these entries). Confirm the entries build and their public
  surface loads.
- **H-03: react-native-web browser evidence (stretch — feasibility-gated).** IF a lightweight
  Vite + react-native-web setup builds the `/expo` (native) entry and renders `useMinder` in the
  browser MCP, that is REAL cross-platform proof (Expo's web target uses the same react-native-web
  path). If the toolchain proves too heavy/flaky here, document that honestly and rely on H-01/H-02
  evidence — do not fabricate.
- **H-04: Honest SUPPORT_MATRIX update.** Each platform's row reflects the evidence actually
  produced (e.g. "storage adapter unit-tested + entry build-verified; runtime device/GUI run not in
  CI"). No unearned promotion. If a defect is found in an adapter, fix it (TDD) — that IS the win.

## Protocol
Each task: author (TDD) → scope review → independent adversarial review → functional verification
→ full gate → evidence-recorded commit. Security/reliability findings are hard bounces.
