# Robot Lab — qualify batch C (review records)

Status: ACTIVE — claim and change in one PR.
Owner: Claude, Robot Lab qualification lane (batches C, B, A in turn).
Branch: `lane/robot-qualify-batchC-20261027`.
Base: `62489568202` (origin/main at claim time).
Scope: review records in `docs/data/robot-lab-experimental-checkpoint.json` for
Final Squeeze, High Select and Obliquity Orrery. All three stay experimental:
Final Squeeze passed a knee-closure judge but its saved geometry fails the
library solid-overlap gate; High Select needs a pose or program change;
Obliquity Orrery is blocked by open #1460. Model and program bytes are unchanged.


Not touched: #1483's models and `sim-lab-batch3-judges.mjs`, Phasor Twin,
Pivot Exchange and the shared harness validation.
