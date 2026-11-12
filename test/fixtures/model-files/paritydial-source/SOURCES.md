# paritydial — source record

- **Origin:** the nine-Technic intake already in the Robot Lab experimental registry (CrispStrobe, BSD-3-Clause; original supplied bytes under `test/fixtures/model-files/nine-technic-source/paritydial/`), reviewed natively before promotion.
- **Construction repair (Q1/Q2, 2026-11-08):** axle_drive moved 20 LDU outward along its own axis (y -90 to -110) so it ends at the motor face like every promoted SPIKE motor axle; gears and bearings unchanged.
- **Law (`parity-dials-v1`):** the reviewed passive law of `scripts/lib/sim-lab-nine-intake-judge.mjs`.
- **Disconnection** (`gear_drive` removed): the passive law breaks while the powered input still completes its route.
- **Piece count:** 31, honest; qualification has no piece minimum (operator decision 2026-11-07).
