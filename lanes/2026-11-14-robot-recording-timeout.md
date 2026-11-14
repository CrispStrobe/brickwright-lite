# Robot Lab recording timeout without fresh readings

Status: DONE (implementation); qualification pending.
Owner: Codex, user-requested measurement/recorder continuation.
Branch: `lane/robot-recording-timeout-20261114`.
Base: `36e0048651cd`.

The user requested a local source batch with coordination in the same commit,
without a claim-only push. Scope: `measurements/recording.js` and
`test/bw-sim-measurement-recording.test.mjs`.

Enforce the existing sixty-second simulated-time recording limit even when
observations are unchanged or missing. Preserve real sample timestamps and
values; do not manufacture a reading at the deadline. Keep prior identity,
replay, time-reset and recording-window stop precedence.

Validation: both new deadline regressions failed on the original source;
nineteen focused recording tests pass with the fix, without skips. Coverage
includes stale/missing rows, paused updates, exact and exceeded boundaries,
empty recordings and future-window arming/completion/misses. No solver, model,
CSV format, threshold or dependency changes. Hosted qualification is pending.
