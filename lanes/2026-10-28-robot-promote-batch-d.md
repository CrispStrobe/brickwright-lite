# Robot Lab — promote batch D (High Select, Final Squeeze)

Delivery integration (2026-10-29): this scope is assembled on
`delivery/robot-editor-compat-20261029`. Original source history is preserved;
final hosted and main qualification is pending.

Status: CLAIMED — claim and change in one PR.
Owner: Claude, Robot Lab promotion lane.
Branch: `lane/robot-batchD-20261028`.
Base: `49dcf7e1a` (origin/main at claim time).

Scope: `scripts/lib/sim-lab-batchC-judges.mjs` (the batch C knee-press judge
from `f2d1cb546`, PR #1497, plus the new High Select judge `max-select-v1` and
its disconnection measure); one import line and two judge ids in
`scripts/lib/robot-lab-qualification.mjs`; one import and one dispatch line in
`test/bw-sim-qualification.test.mjs`; two contracts in
`docs/data/robot-lab-qualification.json`; source fixtures under
`test/fixtures/model-files/{final-squeeze,high-select}-source/`; the registry
move (`sim-session.js` MODELS, `experimental-models.js`, dialect and extension
model lists); catalogue/lesson generator entries and regenerated outputs;
mechanism search entries; the registration tests that enumerate MODELS; and
the records in `docs/data/robot-lab-experimental-checkpoint.json`.

Model bytes: Final Squeeze geometry is repaired for the library solid gate (shock
2.5 LDU lower on its axles, anchor spacer a half bush, platen axle 9L with its
lower retainer moved clear); program bytes unchanged. High Select bytes are
unchanged from #1455. The exchanged-input comparison `high-select-mirror` stays
experimental, as other promoted models' comparisons do.

Not touched: the qualification runner and harness validation, Phasor Twin,
Obliquity Orrery (its batch C review record is kept as written), and PR #1497's
own branch.
