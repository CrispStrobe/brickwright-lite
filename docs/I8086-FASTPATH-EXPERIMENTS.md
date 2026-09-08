# 8086 fastpaths, phase 2

Baseline Lite: `abc4634dad85b570ea64b979fcb67d32194c3fd3`.
Baseline engine: `492e6782ee92f1ad351d64afcf16cfc224a5d508`.
Work is on Lite `perf/i8086-execution` and engine `fable/i8086-fastpaths`.
No default-branch changes or deployment. This is a measured experiment log,
not a promise that every candidate will ship.

## Acceptance plan

1. Expand production measurements: distinguish paced UI throughput from
   unpaced webpack-target throughput; preserve heartbeat/provenance checks.
   Expand representative executable workloads and record absolute RT rates.
2. Evaluate an unobserved debugger run loop with configuration-epoch escape
   for re-entrant observers. Keep the instrumented interpreter as reference.
3. Evaluate dedicated MOVS/STOS loops preserving byte callbacks and interrupts.
4. Establish correct device-deadline units and observability prerequisites;
   test any batching against per-instruction advancement, including fractional
   phase and callback snapshots. Do not hide an incompatible state change.
5. Evaluate guarded RAM access and decoded-block execution independently.
6. Build a bounded WebAssembly translation experiment; measure guards,
   compilation and fallback costs, not only a compiled arithmetic loop.
7. Retain only repeatable improvements. Run upstream vectors/corpus and full
   Lite build/browser checks on the final integrated runtime revision.

## Evidence in progress

* Fast runner: five new differential cases, including re-entrant code
  breakpoints, stepping and recorder installation; 20 focused tests pass.
  Chromium run `34216385933` compared this alone against phase 1. Rejected:
  every range overlapped, including unchanged control layers. Debugger mixed
  medians improved 4.1% normally but regressed 1.4% throttled; throttled
  string-debugger regressed 7.6%. Candidate and its candidate-specific test
  remain available in experimental commit `54f32c3bf`, not in the final source.
* Dedicated MOVS/STOS: engine `e00d877`, upstream CI `34216385584` green
  (units, 8086 vectors, 80186/V20 vectors, 525-program corpus). Differential
  test preserves overlap, wraps, prefix order, bus access traces and mid-REP
  interrupts. Browser performance is still required before acceptance.
* The production benchmark now includes a separate unpaced-target phase.
  This intentionally excludes React/paint; the existing paced phase remains
  the UI responsiveness check. A mutation test rejects a no-progress target.
