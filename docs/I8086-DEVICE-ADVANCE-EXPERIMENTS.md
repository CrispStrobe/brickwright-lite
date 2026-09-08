# 8086 device-advancement pass — 2026-09-08

Initial-pass outcome: no additional production optimization accepted. The shipped JS path,
vendor pin and GUI settings are unchanged by this pass. Benchmark candidates
live only under `scripts/lib/`; project execution does not import them.

Application means `CrispStrobe/brickwright-lite` (GUI, vendored engine and browser
measurements). Engine means `CrispStrobe/bw-board` (CPU/machine/device sources).
Both research branches are named `perf/i8086-device-advance`.

## Attribution

The prior mixed-workload profile attributed substantial time to `_advanceChips`,
including inlined device work. That is not evidence that traversal alone is
expensive. The new isolated probes execute 500,000 instruction-sized advancement
calls after an equal warmup, in fresh Chromium contexts, alternating baseline
and candidate order across five samples. They compare full device state,
fractional carry, and output-event count/hash, not merely elapsed time.

The unchanged-code control uses application baseline
`5ed83a313f5e497f6d5f6dcf0384dc205c9d9511`.
[Control run 34244533483](https://github.com/CrispStrobe/brickwright-lite/actions/runs/34244533483)
completed with matching state. Baseline median nanoseconds per advancement:

| Isolated configuration | Normal Chromium | 4× CPU throttling |
| --- | ---: | ---: |
| Counting-device dispatch | 6.2 | 26.6 |
| PIT, unprogrammed | 17.4 | 74.2 |
| PIT, one active counter | 23.8 | 100.4 |
| PIT, three active counters | 34.8 | 145.0 |
| CGA | 9.0 | 37.6 |
| PIT + CGA | 30.0 | 123.4 |

These are non-additive microbenchmarks, not whole-emulator speed or real-time
multipliers. They identify PIT work as the principal target among these devices.
They exclude CPU execution, rendering and most application overhead.

## Candidates and decisions

All four completed their browser state comparisons. Percentage changes below
are throughput changes from the median, not percentage changes in elapsed time.
Separated ranges mean the five-sample min/max ranges do not overlap; this is a
screening criterion, not a statistical confidence interval.

| Candidate | Evidence | Decision |
| --- | --- | --- |
| Indexed PIT counter loop | Idle +6%, active −3% at normal speed, both separated; no consistent throttled benefit | Reject |
| Separate cold per-tick helper | Several normal PIT cases −4% to −6%, separated | Reject |
| Cached CGA frame position | CGA −8% normal / −13% throttled, separated | Reject |
| Exact PIT cycle-conversion table | Three-counter +5% normal / +11% throttled, but active PIT −5% normal and PIT+CGA −15% throttled, separated | Reject |

Evidence: [indexed loop](https://github.com/CrispStrobe/brickwright-lite/actions/runs/34245103321),
[cold helper](https://github.com/CrispStrobe/brickwright-lite/actions/runs/34245107105),
[CGA cache](https://github.com/CrispStrobe/brickwright-lite/actions/runs/34245110500),
[conversion cache](https://github.com/CrispStrobe/brickwright-lite/actions/runs/34246198701).
Each run retains `i8086-execution/devices.json` with identities, raw samples,
observable states and comparisons. The conversion run measures application
commit `a514731e64293e1170d8de34a1a0e14b631e9c6d`.

The table cached the original arithmetic operation order for cycle costs
0..255, keyed by both oscillator clocks. It did not defer counter updates.
Its extra method guards, cache checks and dispatch still failed the general
performance bar. It is a microbenchmark prototype, not a complete alternative
machine scheduler: in that initial version its special dispatch tag was not
integrated with halt deadlines. The follow-up below repairs this omission;
the path remains benchmark-only, not a project execution option.

## Correctness and scheduling contract

The engine branch adds `docs/I8086-DEVICE-ADVANCE-CONTRACT.md` and
`test/i8086-advance-observability.test.mjs`. They pin immediate public state,
callback ordering, clock changes, gates, CRTC reprogramming, method replacement,
and callback-time attachment invalidation against an independent original
traversal. A negative fixture demonstrates that a future output deadline does
not permit stale public PIT counter fields or fractional carry.

General event-driven deferral remains disabled. It needs an opt-in device API
that materializes state at every observation boundary and prevents unmediated
reads of stale fields. Existing device objects do not meet that contract.

The application adds workload sanity tests and a 10,000-step conversion-cache
differential covering fractional costs, both changing clocks, fallback costs
and public `advanceMs` overrides. These test experimental arithmetic, not a
new production backend.

## Reproduction and next acceptance gate

Dispatch `i8086-execution.yml` on this branch with `block-mode=devices` for the
control, or `devices-pit-index`, `devices-pit-cold`, `devices-cga-cache`, or
`devices-pit-clock` for the isolated candidates. The ordinary `none` mode still
runs full CPU/machine/runner layers and completed sorting programs against the
promoted baseline. No rejected candidate was promoted to that acceptance stage.

The full unchanged-runtime control at application `0b0e3de7a` passed in
[run 34246553782](https://github.com/CrispStrobe/brickwright-lite/actions/runs/34246553782):
300 workload observations across 30 comparisons, plus 60 completed-program
observations. This validates the profiling harness, not a new speedup.
The engine contract/tests at `4f72ff4` passed full
[CI 34246446550](https://github.com/CrispStrobe/bw-board/actions/runs/34246446550),
including units, CPU vectors and the program corpus.
Application `0b0e3de7a` also passed
[CI 34246564642](https://github.com/CrispStrobe/brickwright-lite/actions/runs/34246564642):
build/unit tests, corpus and both browser suites. Deployment was skipped.
The closing commits only record these receipts and release the research lanes;
neither branch was merged or deployed in this pass.

The next useful investigation is the PIT counter's common active countdown
path and its call/guard costs in a full mixed workload. Any revised candidate
must first pass the per-tick oracle and instruction-observability contract,
then show a repeatable full-workload gain in normal and throttled Chromium.
Do not stack these rejected micro-optimizations or introduce batching based
only on output deadlines. Wasm remains sandbox research, not a project backend.

## Follow-up: preserve correct alternatives behind default-off gates

User request: try PIT countdown/call-overhead optimization, retain correct paths
for later investigation, and remove only genuinely broken implementations.

`scripts/lib/i8086-device-candidates.mjs` retains the indexed PIT loop, cold-tick
helper, CGA position cache and exact conversion cache. New `pit-inline` moves
the ordinary countdown decision into the chip's millisecond advancement loop,
while respecting custom counter methods. New `pit-mode3` puts the active binary
square-wave case first and falls back to the original counter method otherwise.
The additional `pit-mode3-null` variant returns immediately for unprogrammed
counters before that wrapper, addressing the measured idle-path overhead while
retaining the first mode-3 variant for comparison.
Neither defers state across calls. All are default-off and isolated from project
execution: `installDeviceCandidate('none')` changes no prototype, unknown names
fail, repeated installation is idempotent, and switching variants requires a
fresh process/browser realm. No runtime GUI toggle or default behavior changes.

Explicit workflow gates are `devices-pit-inline` and `devices-pit-mode3` for
isolated costs; `full-pit-inline` and `full-pit-mode3` exercise all execution
layers and completed sorting programs. The older `devices-*` gates remain.
The refinement uses `devices-pit-mode3-null` / `full-pit-mode3-null`.
Use the `8086 execution profile` workflow on `perf/i8086-device-advance`.

Repairs/removals, distinguished from mere slowness:

- Conversion cache: fixed millisecond halt-deadline handling and duplicate
  reads of overridden method getters. CPU-clock capture still precedes device
  callbacks, while PIT-clock changes and method replacements remain live.
- CGA cache: preserve signed-zero modulo behavior by not caching zero cycles.
- Deferred PIT scheduler: removed the executable batching implementation,
  because direct public counter reads can observe stale state. Its old factory
  now throws a named error and the old workflow choice is removed. Git history
  retains the implementation; the engine negative fixture retains the reason.
  This is not classed alongside slower-but-correct alternatives.
- Decoded/Wasm register-block sandbox paths are unchanged and remain bounded,
  opt-in research, not unrestricted machine backends.

`test/i8086-device-candidates.test.mjs` starts a fresh realm for each of the seven
variants. Each compares 4,000 instruction boundaries and callback traces with
an independent per-tick counter oracle and original machine traversal, across
modes 0..7, binary/BCD, both changing clocks, gates, snapshots, CRTC geometry,
method replacement and callback-time attachment. Halt horizons are compared
too. The separate 10,000-step clock-conversion test pins exact fractional state
and method-getter behavior. These are explicit tested contracts, not a claim
that arbitrary external extensions or untested hardware behavior are proven.
