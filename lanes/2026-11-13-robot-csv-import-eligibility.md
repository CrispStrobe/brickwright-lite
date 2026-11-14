# Robot Lab CSV import permission changes

Status: DONE (implementation); qualification pending.
Owner: Codex, user-requested Robot Lab continuation.
Branch: `lane/robot-csv-import-eligibility-20261113`.
Base: `219fa45d8a0ebc7194a0d0d472b0fc924a461f94`.

The user requested coordination and source in one PR without a claim-only push.
Scope: `sim-lab-measurement-recorder.jsx` and
`test/bw-sim-recorder-import-eligibility.test.mjs`.

Discard pending CSV reads when a control pair, model-history capacity or replay
blocks importing, including when importing becomes available again before the
read settles. Reject file selections delivered during replay before reading.
Preserve normal CSV admission, recorder limits and selection restoration.

Validation: five real React DOM async-import tests plus sixteen existing
measurement-recording tests pass, with no skips. No model, solver, persistence
format or dependency changes. Exact-head hosted qualification remains pending.
