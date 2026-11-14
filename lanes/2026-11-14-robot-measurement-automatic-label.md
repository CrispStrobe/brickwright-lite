# Robot Lab automatic measurement names

Status: DONE (implementation); qualification pending.
Owner: Codex, user-requested Robot Lab continuation.
Branch: `lane/robot-measurement-automatic-label-20261114`.
Base: `36e2d3b7c593`.

The user requested coordination and source in one PR without a claim-only push.
Scope: `sim-lab-measurements.jsx` and
`test/bw-sim-measurement-automatic-label.test.mjs`.

New measurements with a blank name retain the existing canonical quantity token
so their display name follows locale and quantity changes. Typed names and older
stored translated names remain authored text; no heuristic migration is applied.

Validation: four real React DOM add/edit/locale/custom-name tests and twenty-three
existing measurement UI tests pass, without skips. No schema, CSV format, solver,
model or dependency changes. Exact-head hosted qualification remains pending.
