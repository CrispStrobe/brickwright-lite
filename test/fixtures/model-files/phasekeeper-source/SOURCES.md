# phasekeeper — source record

- **Origin:** the nine-Technic intake already in the Robot Lab experimental registry (CrispStrobe, BSD-3-Clause; original supplied bytes under `test/fixtures/model-files/nine-technic-source/phasekeeper/`), reviewed natively before promotion.
- **Adaptations (made at intake, unchanged here):** the repairs recorded in `docs/ROBOT-LAB-NINE-MODELS-HANDOFF.md`. Shipped geometry and program are unchanged by promotion.
- **Law (`double-cardan-v1`):** the reviewed passive law of `scripts/lib/sim-lab-nine-intake-judge.mjs`.
- **Disconnection** (`joint_2_intermediate_yoke` removed): the passive law breaks while the powered input still completes its route.
