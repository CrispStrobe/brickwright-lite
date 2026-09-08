# 8086 execution optimization, September 2026

This pass measures host execution cost with UI pacing removed. It does not
change guest clocks, instruction timings, or the debugger's wall-time budget.
The production browser benchmark remains the acceptance check for UI latency.

## Reproduction and evidence

`.github/workflows/i8086-execution.yml` runs `scripts/profile-i8086-execution.mjs`
in Chromium against two explicitly identified source trees. Five fresh-context
repetitions alternate baseline/candidate order at normal and 4x CPU throttling.
The mixed, word/stack and REP-string workloads run through bare CPU, machine,
DOS, debugger and peripheral configurations. The peripheral case programs a
PIT while masking delivery so its architectural result remains comparable.
It measures advancement cost; interrupt correctness is tested separately.

Each run must advance its memory heartbeat after warm-up. Comparisons require
identical cycle counts, registers, heartbeat and whole-memory hash. Timings
exclude setup and state hashing. Separate Chrome CPU profiles exclude hashing
as well, and can be opened directly in DevTools. Sampling is never enabled
during a timed comparison. These are source-module engine diagnostics, not
measurements of webpack startup, React, rendering, or a physical phone.

The initial A/A control, hosted run `34196975249`, used identical engine code
from Lite `1d849ee9bc03565cba16e3012ca4fa0629df5b44` on both sides. The mixed
baseline medians for one second of guest work were 18.1 ms core, 21.9 ms
machine, 30.6 ms DOS and 33.6 ms debugger. At 4x throttle those were 78.8,
98.0, 140.3 and 142.6 ms. The A/A variation is retained in the raw receipt;
small differences must not be described as wins. That first run's sampled
profiles included post-run hashing; subsequent profiles exclude it. Its
peripheral configuration had an unprogrammed PIT, also corrected subsequently.

## Candidate decisions

* Prefix dispatch: evaluate two masked prefix-classification checks before
  the ordinary opcode path. Preserve all eight prefixes, both CPU variants,
  the single-fetch contract, 16-bit IP wrap and bus traces. Upstream
  `f2c89fc32c2ac747d8c073c742f68153ee0d1cc1` passed CI run `34197350409`
  (unit tests, 8086 vectors, 80186/V20 vectors and real-program corpus).
  Accepted from Chromium run `34197418847`: mixed debugger median wall time
  fell 33.2 to 30.4 ms at normal speed (9.2% throughput gain), and 186.5 to
  162.4 ms under 4x throttle (14.8%). Bare-core gains were 18.6% and 13.0%.
  Word-heavy debugger gains were 4.5% and 6.3%; string-heavy differences
  overlap observed variation and are not credited. Every compared state
  matched. The scoped Lite sync changes only `i8086.js` and its source pin;
  35 focused Lite workload, debugger, checkpoint and replay tests passed.
* Word access: only activate after attributing a material memory cost.
  A fast path must preserve segment and physical wrap, MMIO side effects,
  ROM protection, write watches, traces and display invalidation.
* DOS timer listener caching: direct memory access and bulk/state restore
  make cache invalidation part of correctness. Moving the deadline check
  alone cannot remove steady-state lookups in an unhooked program: the last
  delivered tick remains zero, so the deadline stays overdue. Dedicated
  tests now pin late-hook, masking, unhooking and timer-owner behavior.
* Peripheral batching: the PIT's `nextWake()` reports device ticks while
  `advanceMs()` consumes milliseconds. A safe scheduler must convert units
  and preserve fractional phase, I/O observations and interrupt boundaries.
* Workers, dynamic translation and lazy flags remain conditional on the
  resulting profiles. They introduce independent behavior and validation
  requirements; they are not prerequisites for a smaller interpreter change.
