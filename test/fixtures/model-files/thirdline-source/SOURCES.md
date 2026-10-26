# Thirdline — source record

- **Origin:** the supplied `thirdline-addon.zip` (sha256 2d7e75ccf91ddececa0015fc13228fbee467b5300e941a4d60d1873aa09fb83a), CrispStrobe, BSD-3-Clause.
- **Adaptations:**
  - The licence line points at the packaged licence.
  - The program drops one SPIKE-extension block (`set motor stop action A hold`). The Robot Lab block on the next line, `lab stop motor A hold`, already holds the motor, and the qualification harness loads Robot Lab blocks only.
  - Geometry is unchanged.
- **Law:** Archimedes' marked-ruler (neusis) trisector. The ruler heading stays at one third of the input within 0.003° over inputs of 50–95°. Disconnection (`joint_B_pin` removed): the ruler departs from θ/3 by about 2°.
