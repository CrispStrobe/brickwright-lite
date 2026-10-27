# Final Squeeze — source record

- **Origin:** the supplied experimental intake already in the Robot Lab experimental registry (archive `final-squeeze-complete.zip`, CrispStrobe, BSD-3-Clause), reviewed natively and in the browser before promotion.
- **Adaptations (made at intake, unchanged here):**
  - The licence line points at the packaged licence.
  - The program's start guard was widened from 0.5° to 2°, because the unpowered preloaded shock back-drives the input about 1.4° before the program starts; stage 1 drives to the absolute 0 target, so the route is unchanged.
  - Geometry is unchanged.
- **Law:** equal-link knee closure s(α) = L1·cos α + √(L2² − (L1·sin α − e)²), with L1 = L2 = 32 mm and e = 0 read from the compiled joints. Platen advance 12.76 mm against 12.77 mm predicted; the five settled 5° steps (3.406, 3.025, 2.579, 2.134, 1.698 mm) match the closure within 0.002 mm.
- **Disconnection** (`passive_link` removed): the input still turns 24.9°, but the platen moves only 1.03 mm of the 12.76 mm the knee would give.
