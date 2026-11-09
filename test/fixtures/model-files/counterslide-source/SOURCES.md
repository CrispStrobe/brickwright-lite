# counterslide — source record

- **Origin:** the nine-Technic intake already in the Robot Lab experimental registry (CrispStrobe, BSD-3-Clause; original supplied bytes under `test/fixtures/model-files/nine-technic-source/counterslide/`), reviewed natively before promotion.
- **Construction repair (Q1/Q2, 2026-11-08):** the eight 3L pins are turned end for end in place so each collar sits at a beam face instead of inside a housing hole; each rack with its jaw pins and jaw is moved 3 rack teeth (23.56 LDU, 3 x 2.5 pi) away from its end-stop pin, keeping the tooth phase with the 8-tooth pinion. The law is unchanged (equal and opposite rack travel, 4 mm per radian); only the open-jaw datum is 23.56 LDU wider on each side.
- **Law (`opposed-racks-v1`):** the reviewed passive law of `scripts/lib/sim-lab-nine-intake-judge.mjs`.
- **Disconnection** (`drive_pinion_8t` removed): the passive law breaks while the powered input still completes its route.
- **Piece count:** 44, honest; qualification has no piece minimum (operator decision 2026-11-07).
