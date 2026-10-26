# Model API sparse sampling observation origin

Status: DONE (source candidate; exact-head hosted qualification and landing pending).
Owner: Codex, user-authorized model API sampling-origin follow-up.
Claim branch: `docs/api-sampling-origin-claim-20261026`; claim PR #1443 merged
as `078fde08e80b379bde1a045fb2444a28171bae5b` before implementation.
Source branch: `lane/model-api-sampling-origin-20261026`.
Base: `e88edba12dfbf61f855624c60d594ab253607f2f`.

A retained single-part API report with sparse 50 ms sampling places the first
program observation at scene time 25 ms but labels its elapsed time zero. The
runner observes after a 25 ms VM tick and labels it from a frame index that
starts at zero. The retained `coldMs=0` run does not demonstrate a wrong phase
value: its first track entry is the program snapshot, and the existing lookup
selects it. With a nonzero cold interval, an initial cold snapshot also changes
the frame-to-time relationship. This claim covers observation labels and phase
alignment only, not an alternate simulation clock or a change in physical
sampling cadence.

Scope after claim merge: `tools/model-api/native-runner.mjs`, a new focused
`test/model-api-sampling-origin.test.mjs`, `tools/model-api/README.md`, and
this claim. Derive sparse `elapsedMs` from actual observer time and preserve
phase from the observed snapshot/frame, rather than advancing it solely from
the corrected elapsed label. Cover cold frames, program-phase boundaries,
completion and a final partial interval. Preserve scene timestamps, existing 25 ms VM frames,
5 ms physics steps, sample interval and result caps, native execution, dense
physics-sample behavior, admission, output shape and all existing limits.
Require a baseline-failing phase-boundary regression and positive clock/order
controls without weakening existing source tests or oracle bounds.

No direct-VM helper, physics or engine source, dependencies or pins, worker
workflow, service configuration, credentials, production requests, deployment,
other model/API files or concurrent owners' work belongs to this lane. The
retained report remains an original observation; do not rewrite or replay it.
The implementation needs affected clean hosted actual-source/Jolt qualification,
independent one-shot original review, and every enabled exact-head check before
normal matched-head merge with verified parents and tree. The corrected labels
would not establish physical timing calibration or broader model admission.

The source candidate labels sparse rows and pose frames from the actual
post-tick scene time and retains each callback's track ordinal for phase. It
also labels an existing final partial row from its final observed track time.
The focused real-VM/Jolt tests cover cold-zero, nonzero cold, program/after
phase boundaries and the final partial row. The existing dense path, cadence,
limits and direct-VM helper are unchanged. The retained cold-zero report fails
the new elapsed-equals-scene-time invariant; it remains an unmodified original.
Actual hosted results and final merge proof must be added only after they exist.
