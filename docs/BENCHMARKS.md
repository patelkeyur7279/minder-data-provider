# Benchmarks — wrapper overhead

**TL;DR: `minder()` adds no measurable overhead beyond noise.** On localhost the difference
between `minder()` and calling `fetch`/`axios` directly is single-digit microseconds per call and
flips sign run to run — i.e. it is within measurement noise. Over a real network (round-trips of
tens of milliseconds) the wrapper cost is ~1000× smaller than the request itself and irrelevant.

> Reproduce: `node benchmarks/overhead.mjs`

## What is measured

`minder('route')` wraps a transport (axios by default, native `fetch` via
`{ transport: 'fetch' }`) with config resolution, route validation, a plugin bus, and result
normalization. The benchmark isolates **that wrapper cost** by hitting a **localhost** HTTP
server returning a small fixed JSON payload, so network time is ~constant and the delta is the
library's own work. All four cases are **interleaved per iteration with a rotating order**, so VM
warmup and connection-pool warmth affect each equally (an earlier naive version ran cases
sequentially and made whichever ran last look artificially faster — that was a measurement
artifact, not a real speedup).

**This is not a real-world latency benchmark.** It says nothing about network performance; it only
bounds the constant the library adds per call.

## Results (representative run)

`Node v22.19.0`, 4000 iterations/case after 500 warmup, localhost, Apple Silicon:

| case | median (ms) | p95 (ms) | mean (ms) | ops/sec |
|---|---|---|---|---|
| raw `fetch` | 0.0669 | 0.1317 | 0.0798 | ~12,500 |
| `minder({ transport: 'fetch' })` | 0.0696 | 0.1394 | 0.0854 | ~11,700 |
| raw `axios` | 0.0721 | 0.1431 | 0.0912 | ~11,000 |
| `minder()` (default/axios) | 0.0729 | 0.1371 | 0.0850 | ~11,800 |

Measured wrapper overhead (mean, over localhost): **fetch path ≈ +3 to +7 µs/call; axios path
within ±6 µs/call** — both within run-to-run noise (a second run showed +3.0% / +1.5%; the axios
path has measured slightly negative on some runs). Treat the honest conclusion as **"≈ a few
microseconds, indistinguishable from zero at real-world scale,"** not a precise percentage.

## Interpretation

- The per-call overhead (~single-digit µs) is **negligible** next to any real HTTP round-trip
  (10–100 ms), where it is a rounding error.
- Both transports perform comparably here; the native-`fetch` path exists mainly for edge/runtime
  compatibility (see [EDGE.md](./EDGE.md)), not raw speed.
- Don't cite a specific "% faster/slower" number — the honest claim is **no meaningful overhead**.

## A real bug this benchmark found

Writing this benchmark surfaced and fixed a genuine crash: `isFileUpload()` referenced the
browser-only globals `File`/`FileList` bare, so **any `minder()` call with a body (POST/PUT/PATCH)
threw `ReferenceError: FileList is not defined` in Node / SSR / edge** — server-side writes were
broken. It was masked because the jsdom test environment provides those globals. Fixed by guarding
each with `typeof` (matching the existing `FormData` check); regression test in
`tests/file-upload-detection-node.test.ts` runs in the Node environment. Benchmarks earn their keep.
