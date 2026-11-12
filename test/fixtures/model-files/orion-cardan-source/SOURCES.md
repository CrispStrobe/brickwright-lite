# orion-cardan — source record

- **Origin:** the Orion double Cardan drive intake already in the Robot Lab experimental registry (CrispStrobe, BSD-3-Clause), from the 04–15 model archive (checkpoint `docs/data/robot-lab-experimental-checkpoint.json`). Program bytes are unchanged.
- **Adaptation at promotion (R2):** building steps only, its author STEP groups split into steps of at most six parts. Part placements, colours and IDs are unchanged; the MPD wrapper is regenerated from the LDR.
- **Law (`double-cardan-offset-v1`):** `judgeDoubleCardanOffset` in `scripts/lib/sim-lab-r2-judges.mjs`. two universal joints with equal bends β = 36.87° (from the compiled shaft directions), the middle shaft's forks in one plane and the output parallel to the input (Z arrangement): output − input = 0 and the middle shaft follows tan θ_m = tan θ / cos β, 12.76° peak to peak.
- **Disconnection** (`fork_middle_far` removed: the middle shaft's fork of the second joint, so the second cross is gone. Motor A still turns the input, but the output no longer follows it.)
- **Piece count:** 118, honest; qualification has no piece minimum (operator decision 2026-11-07).
