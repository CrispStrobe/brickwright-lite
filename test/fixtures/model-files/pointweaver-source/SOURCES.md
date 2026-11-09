# pointweaver — source record

- **Origin:** the nine-Technic intake already in the Robot Lab experimental registry (CrispStrobe, BSD-3-Clause; original supplied bytes under `test/fixtures/model-files/nine-technic-source/pointweaver/`), reviewed natively before promotion.
- **Adaptations (made at intake, unchanged here):** the repairs recorded in `docs/ROBOT-LAB-NINE-MODELS-HANDOFF.md`. Motor-foot mount redesign before promotion (lanes/2026-11-08-robot-q3-pointweaver.md): the eight thin foot pads and the four rear rail-to-cross 2L pins removed, the motor assemblies lowered 10 LDU onto the base rails, each rear foot joined to rail and base cross by one 3L pin, each front foot to its rail by one 2L pin; the rear hub-section foot at z = -400 moved to z = -360 so it no longer shares the hub-mount hole; endpoint_marker_tip moved 10 LDU so its collar clears the thin marker. Program unchanged.
- **Law (`five-bar-v1`):** the reviewed passive law of `scripts/lib/sim-lab-nine-intake-judge.mjs`.
- **Disconnection** (`left_forearm` removed): the passive law breaks while the powered input still completes its route.
