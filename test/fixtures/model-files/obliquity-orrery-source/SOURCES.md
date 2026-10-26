# Obliquity Orrery — source record

- **Origin:** the supplied experimental intake already in the Robot Lab experimental registry (CrispStrobe, BSD-3-Clause), reviewed natively and in the browser before promotion.
- **Adaptations:**
  - The licence line points at the packaged licence.
  - Geometry is unchanged.
  - Declared compiler issues (reviewed): `locked-hinges` beam_middle, post_mid_low_e, post_mid_low_w; `locked-hinges` hub, hub_pin_front, hub_pin_rear; `locked-hinges` beam_top, post_top_e, post_top_w; the compiler locks the redundant parallel-crank loop and two rigid frame loops, and the measured law is unaffected.
- **Law:** sin δ = sin 22.5°·cos(λ − 45°), within 0.01° over a quarter orbit. Disconnection (`crank_pin_B` removed): without the second crank pin the Earth turns and δ leaves the law by 26°.
