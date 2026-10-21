# Claim: actual frame completion in the Arcade pauseUntil input test

CLAIMED — owner: Robot Lab delivery lane. Base: `93bb70a6d`.

Scope: only the `native pauseUntil consumes actual held controller input after
readiness` test in `test/arcade-import-truth-values.test.mjs`, its focused
regression evidence and this claim. No importer, exporter, runtime, supplier,
shared test helper or neighboring Arcade source-analysis change is included.

The full addon qualification reported `done = 0` after posting held input and
awaiting a previously started frame. The original receipt is preserved. Inspect
the scheduling assumption before implementation: authored initialization must
finish, the false predicate must remain pending, and actual VM frames must run
after the keyboard event before completion is asserted.

Retain the original 15-second bound and actual keyboard/predicate assertions.
Use bounded actual frame progress rather than sleeps, a larger timeout or a
retry of the whole test. Prove released input stays pending and held input
completes, including the case where the initialization frame already finished
before input is posted. Run the complete affected test module. If investigation
instead identifies a runtime defect, stop at this boundary and claim it
separately. Merge this claim before changing the test.
