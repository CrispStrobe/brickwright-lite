# helios-transmission — source record

- **Origin:** the Helios epicyclic transmission intake already in the Robot Lab experimental registry (CrispStrobe, BSD-3-Clause), from the 04–15 model archive (checkpoint `docs/data/robot-lab-experimental-checkpoint.json`). Program bytes are unchanged.
- **Adaptation at promotion (R2):** building steps only, its author STEP markers removed so the instructions derive connected steps of at most six parts. Part placements, colours and IDs are unchanged; the MPD wrapper is regenerated from the LDR.
- **Law (`willis-epicyclic-v1`):** `judgeWillisEpicyclic` in `scripts/lib/sim-lab-r2-judges.mjs`. stepped-planet epicyclic set without a ring: Willis (ω_out − ω_c)/(ω_A − ω_c) = (24/8)·(16/16) = 3, so ω_out = 3ω_A − 2ω_c; motor B's 20T gear drives the 28T carrier, ω_c = −(20/28)ω_B; the output stands still at ω_B = −(3·28/(2·20))·ω_A = −63°/s. Tooth counts come from the part catalogue.
- **Disconnection** (`control_gear` removed: motor B's 20-tooth gear that drives the carrier. Both motors still complete their routes, but the output no longer follows the law evaluated at the two encoders.)
- **Piece count:** 156, honest; qualification has no piece minimum (operator decision 2026-11-07).
