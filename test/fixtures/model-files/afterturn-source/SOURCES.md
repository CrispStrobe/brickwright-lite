# Afterturn — source record

- **Origin:** the supplied experimental intake already in the Robot Lab experimental registry (CrispStrobe, BSD-3-Clause), reviewed natively before promotion.
- **Adaptations (made at intake, unchanged here):** the licence line points at the packaged licence. Geometry and program are unchanged; the model opts in to the native rotor (`0 !BW ROTOR_INERTIA native`, #1573).
- **Law (`afterturn-shape-cycle-v1`):** zero yaw angular momentum on the free platform: each wheel stroke turns the platform by −Iw/J(B) per wheel degree, with Iw and J(B) computed from the compiled part masses and the slider-crank pose (0.02608 at B = 0, 0.02746 at B = 70°); the closed cycle leaves −900°·(Iw/J(70) − Iw/J(0)) ≈ 1.25°, the inverse undoes it, and the fixed-mass control (afterturn-fixed-masses) keeps none.
- **Disconnection** (`rod_left`, `rod_right` removed): the carts no longer follow the crank, and the wheel strokes leave the predicted ratios.
- **Earlier figures:** the supplier's 4.6625° cycle came from the #1494 rotor double count (motor rotor inertia added to both the platform and the wheel); it is not the physical value.
