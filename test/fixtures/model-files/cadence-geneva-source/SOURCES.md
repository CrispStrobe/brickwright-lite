# cadence-geneva — source record

- **Origin:** the Cadence Geneva clockwork intake already in the Robot Lab experimental registry (CrispStrobe, BSD-3-Clause), from the 04–15 model archive (checkpoint `docs/data/robot-lab-experimental-checkpoint.json`). Program bytes are unchanged.
- **Adaptation at promotion (R2):** building steps only, its author STEP markers removed so the instructions derive connected steps of at most six parts. Part placements, colours and IDs are unchanged; the MPD wrapper is regenerated from the LDR.
- **Law (`geneva-index-v1`):** `judgeGenevaIndex` in `scripts/lib/sim-lab-r2-judges.mjs`. four-slot external Geneva: crank 40 mm and centre distance 56.57 mm (= 40 mm / sin 45°) read from the compiled crank, roller and star shaft, so the roller enters each slot radially; the star turns 90° per crank turn while the crank is within ±45° of the line of centres (tan β = sin φ / (√2 − cos φ)) and dwells for the other 270°; the 8T star pinion, two 24T idlers and the 24T dial gear (tooth counts from the part catalogue) give dial = −star/3.
- **Disconnection** (`driver_pin_axle` removed: the axle the two rollers turn on. Motor A still turns the crank twelve times, but the star never moves, so the star no longer follows the Geneva law at the crank angle.)
- **Piece count:** 200, honest; qualification has no piece minimum (operator decision 2026-11-07).
