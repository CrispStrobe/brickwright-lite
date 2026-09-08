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

## Decisions and evidence

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
  interrupts. Accepted after Chromium run `34216833481`: string debugger
  +18.0% and peripherals +13.4% normally, with separated sample ranges;
  throttled bare core +14.2% and machine +16.9% also separated.
* The production benchmark now includes a separate unpaced-target phase.
  This intentionally excludes React/paint; the existing paced phase remains
  the UI responsiveness check. A mutation test rejects a no-progress target.

* Guarded RAM words: accepted in engine `6b7761d210698c8f392e28ce85d02c5d94ee676f`.
  Fast reads require ordinary RAM/ROM; writes require RAM outside video memory.
  Trace, replaced callbacks/memory, segment/page boundaries, MMIO and ROM writes
  fall back to the byte path. `fastWords: false` selects the reference path.
  Isolated 25-million-cycle Chromium run `34218453349`: normal string DOS,
  debugger and peripherals improved 22.1%, 20.9% and 65.2%; throttled string
  machine/DOS/debugger/peripherals improved 50.2–68.8%, separated ranges.
  Mixed workloads were essentially flat. These are workload-specific gains,
  not an application-wide multiplier.
* PIT deadlines: accepted correctness groundwork (`a1a22c43`). Deadline units
  now distinguish milliseconds from CPU cycles, account for fractional PIT
  phase, BCD counts and gated one-shots, and conservatively stop before edges.
  Unknown advancing devices veto skipping. Active instruction batching is OFF.
* Scoped PIT batching: implemented only in `scripts/lib/`, rejected for normal
  execution. Run `34219643563` was 65–71% slower in Chromium despite matching
  final states. Direct public counter-field reads can also observe deferred
  state; a negative test records that incompatibility. An earlier eligibility
  run failed on the CGA advancing device, then was corrected and rerun.
* Decoded blocks: benchmark-only, rejected. Run `34217670824` regressed
  throughput 46–77%; validation and dispatch costs outweighed decode savings.
* WebAssembly: implemented a bounded, self-validating register-block prototype,
  then a counted-loop version which keeps iterations inside Wasm. Seeded
  differential tests cover arithmetic flags, code mutation and cycle budgets.
  Initial blocks (`34217673170`) regressed 47–87%. Backedge-discovered counted
  loops (`34219049254`) reached 11.4× on the synthetic register-loop case,
  but mixed/word workloads regressed 19–25%. Kept as an opt-in benchmark,
  NOT imported by production; no claim of general MMIO/IRQ/debugger support.

## Final integration verification

The production candidate combines REP loops, guarded words and deadline fixes.
Engine [CI 34219643631](https://github.com/CrispStrobe/bw-board/actions/runs/34219643631)
passed units, all 646,000 8086 vectors, the 80186/V20 suite and 525 assembled
programs. Lite preserves its explicitly allow-listed machine divergences.
The scoped pin move retains the original engine ancestry and excludes unrelated
upstream changes; ROM bytes are unchanged and provenance is regenerated.

The browser comparison uses alternating A/B order, five fresh-context samples,
25 million guest cycles per sample and 1×/4× CPU throttling. It checks matching
retired state and reports absolute real-time throughput, not only percentages.
Three pinned third-party sorting programs add completed-program measurements
(reset/load/execution included, assembly excluded), checking exit, output and
memory state. These do not replace the larger correctness corpus.

Final combined source comparison and production webpack/browser CI are pending.
No default-branch merge or deployment has been performed.
