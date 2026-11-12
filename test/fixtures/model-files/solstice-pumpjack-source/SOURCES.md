# solstice-pumpjack — source record

- **Origin:** the Solstice walking-beam pump intake already in the Robot Lab experimental registry (CrispStrobe, BSD-3-Clause), from the 04–15 model archive (checkpoint `docs/data/robot-lab-experimental-checkpoint.json`). Program bytes are unchanged.
- **Adaptation at promotion (R4):** start-guard pose repair. The saved pose was not a gravity rest: the unpowered cold settle turned the crank 5.9° in 500 ms (12.6° in 1 s). The crank is re-posed to its rest at −75° and the pitman, walking beam, pump rod and piston are placed by solving the linkage at that crank angle; it now moves 0.13° in 3 s. Link lengths, pins, parts, colours and IDs are unchanged; the MPD wrapper matches the LDR.
- **Law (`walking-beam-v1`):** `judgeWalkingBeam` in `scripts/lib/sim-lab-r4-judges.mjs`. A crank-rocker (crank 16 mm, pitman 64 mm, beam arms 48/56 mm, pump rod 64 mm, all from the compiled pin joints); for each observed crank angle the closed loop fixes the beam angle and the piston position on its slider. Predicted swing 42.40°, stroke 40.58 mm.
- **Disconnection** (`pin_P` removed: the crank pin, so the pitman is no longer driven. Motor A still turns the crank a full turn, but the beam no longer follows the loop.)
- **Piece count:** 93, honest; qualification has no piece minimum (operator decision 2026-11-07).
