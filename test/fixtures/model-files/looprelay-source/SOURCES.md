# looprelay — source record

- **Origin:** the nine-Technic intake already in the Robot Lab experimental registry (CrispStrobe, BSD-3-Clause; original supplied bytes under `test/fixtures/model-files/nine-technic-source/looprelay/`), reviewed natively before promotion.
- **Construction repair (Q1/Q2, 2026-11-08):** axle_input moved 10 LDU outward along its own axis (y -100 to -110) so it ends at the motor face like every promoted SPIKE motor axle; gears and bearings unchanged.
- **Law (`chain-reversal-v1`):** the reviewed passive law of `scripts/lib/sim-lab-nine-intake-judge.mjs`.
- **Disconnection** (`chain_input16` removed): the passive law breaks while the powered input still completes its route.
- **Piece count:** 54, honest; qualification has no piece minimum (operator decision 2026-11-07).
