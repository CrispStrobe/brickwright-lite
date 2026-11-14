# Robot Lab pending CSV import identity changes

Status: DONE (implementation); qualification pending.
Owner: Codex, user-requested Robot Lab continuation.
Branch: `lane/robot-csv-import-identity-20261114`.
Base: `1b26bab9d969`.

The user requested coordination and source in one local commit without a
claim-only push. Scope: `sim-lab-measurement-recorder.jsx` and
`test/bw-sim-recorder-import-eligibility.test.mjs`.

Discard pending CSV reads across session, model-text, model-context or definition
changes, even if the original identity is restored before the read settles.
Retain a definition signature to detect in-place changes. Equivalent cloned
definitions and ordinary locale, observation, selection or pause updates preserve
legitimate pending imports. Existing import admission and recorder limits remain.

Validation: the new session-change regression failed on the original source;
seven real React DOM import tests and sixteen existing recording tests pass with
the fix, without skips. No model, solver, CSV format or dependency changes.
Exact-head hosted qualification remains pending.
