# Robot Lab — qualify batch C (Final Squeeze)

Status: ACTIVE — claim and change in one PR.
Owner: Claude, Robot Lab qualification lane (batches C, B, A in turn).
Branch: `lane/robot-qualify-batchC-20261027`.
Base: `62489568202` (origin/main at claim time).

Scope: a reviewed judge in the new `scripts/lib/sim-lab-batchC-judges.mjs`;
its registration in `scripts/lib/robot-lab-qualification.mjs` (one import line
and one judge-map entry only, no validation logic); one dispatch line in
`test/bw-sim-qualification.test.mjs`; one contract in
`docs/data/robot-lab-qualification.json`; source fixtures under
`test/fixtures/model-files/final-squeeze-source/`; the registry move
(`sim-session.js` MODELS, `experimental-models.js`, dialect and extension
model lists); catalogue/lesson generator entries and regenerated outputs;
mechanism search entries; the registration tests that enumerate MODELS; and
promotion records in `docs/data/robot-lab-experimental-checkpoint.json`.

Model and program bytes stay unchanged. Reviewed and recorded, not promoted:
High Select (cold-settle back-drive needs a pose or program change) and
Obliquity Orrery (blocked by open #1460).

Not touched: #1483's models and `sim-lab-batch3-judges.mjs`, Phasor Twin,
Pivot Exchange and the shared harness validation.
