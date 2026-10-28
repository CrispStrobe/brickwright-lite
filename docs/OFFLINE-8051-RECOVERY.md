# Offline 8051 recovery progression

Owner: `fab-sdcc` (claimed 2026-08-30)

Status: all five checkpoints completed 2026-08-31. The upstream repair is
`emu8051-stc` `00fefb4`+`47c5041`; the accepted vendor is `5bf1cea15`; the
locally observed 25/25 production-browser gate and its CI wiring are
`491d2dcb6`. This document remains the acceptance contract for future toolchain
updates.

This is a four-to-six-hour recovery progression for the local SDCC WebAssembly
compiler and the production debugger path it gates.  A green unit test is not
the finish line: the shipped browser must compile Brickwright's generated C
without contacting the hosted compiler, attach the real emulator, and expose
the debugger evidence promised by the lesson.

Every checkpoint lands on the default branch as soon as its own definition of
done is met.  Upstream compiler changes land on `emu8051-stc/master`; consumer
and browser changes land on `brickwright-lite/main`.  CI builds are consolidated
around an accepted candidate artifact instead of using queued jobs as an
interactive debugger.  Local heavy builds run only after
`scripts/check-system-load.mjs` passes.

## Checkpoint 1 — isolate the compiler defect (60–90 minutes)

- Reduce the generated idle loop to the smallest C forms that separate parser,
  literal construction, comparison folding, and AST decoration.
- Run every form through the same seekable-stdin `--c1mode` path used by the
  browser and compare it with native SDCC.
- Add a regression which fails for the current binary and identifies the first
  invalid compiler invariant.  Do not encode a vague crash string as the only
  oracle.

Definition of done: a committed reproduction matrix names the minimal failing
form, a neighboring passing form, identical preprocessed input, and the exact
stage/invariant that diverges.  The test fails under a deliberate reintroduction
of the defect.

## Checkpoint 2 — repair and rebuild upstream (60–120 minutes)

- Fix the source, configuration, or link contract at the point proved by
  Checkpoint 1.  Do not weaken SDCC's assertion or rewrite generated user code
  to conceal compiler corruption.
- Rebuild from the pinned pristine SDCC 4.5.0 source with recorded Emscripten,
  host-width, linker, and source-patch provenance.
- Upload one candidate before acceptance tests so a failed gate remains
  diagnosable without rebuilding.

Definition of done: the exact Brickwright idle shape produces assembly; the
ordinary sample corpus completes all four stages; native and WASM Intel HEX
payloads are byte-identical; the comparison gate is mutation-proven; the
artifact and build provenance are retained by the successful upstream run.

## Checkpoint 3 — vendor and prove the consumer (45–75 minutes)

- Vendor the accepted four-module toolchain and packed runtime through the
  repository's sync path, with hashes and upstream commit recorded.
- Replace the deliberate known-defect assertion with a positive regression for
  the generated idle shape and retain compiler diagnostics coverage using a
  genuinely invalid program.
- Remove the browser gate's known-unwired exemption in the same checkpoint that
  wires it into the workflow.

Definition of done: release and debug compiles both complete locally without a
  hosted request; generated output and checked-in package copies agree; focused
  tests, provenance tests, gate-coverage tests, and `git diff --check` pass.

## Checkpoint 4 — production browser proof (60–90 minutes)

- Build the production application, load the shipped counter lesson, author its
  canonical program through the public block UI, and start local 8051 debug.
- Reject every external compiler POST rather than merely counting requests after
  the fact.
- Prove the debugger attaches to the compiled image and exposes source-linked
  task state, cycle stepping, and a real write-watchpoint transition.

Definition of done: the blocking browser gate passes against the production
bundle with exactly zero hosted compiler requests, the expected block count and
MCU, a meaningful cycle-step distinction, source/symbol-backed frame evidence,
and a named watchpoint hit containing address, previous value, and new value.
Failure screenshots remain uploaded.

## Checkpoint 5 — closure audit (30–45 minutes)

- Run the complete relevant Node test roster and the production gate after
  rebasing onto current `main`.
- Reconcile `PLAN.md`, the wave review, gate inventory, and toolchain provenance
  with the observed results only.
- Preserve unrelated generated translation and lockfile changes.

Definition of done: both repositories are clean except for explicitly preserved
user changes, their default branches match their GitHub remotes, every claimed
check has a command/run URL or artifact behind it, and no document calls D2
closed before the production gate is green.
