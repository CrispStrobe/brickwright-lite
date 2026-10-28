# bw-sim: rotor inertia on the hinge's relative rotation (#1494)

- Owner: Robot Lab physics lane (rotor-inertia fix).
- Scope: `overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js`, only the
  `setRotorInertia` path and its per-step coupling correction; new
  `test/bw-sim-rotor-inertia.test.mjs`; its entries in
  `scripts/lib/gui-scope-allowed.json`. Claim and change in one PR.
- Change: a motor's reflected rotor inertia Jr couples the housing and output
  bodies only through their relative rotation (kinetic energy ½·Jr·(ω2 − ω1)²).
  A clamped motor is unchanged (Jr on the moving body). When both bodies move,
  each body gets x chosen so the relative mode has exactly mu + Jr, and the
  motor impulse's momentum split is corrected after each step to the true
  2×2 inertia matrix.
- Not touched: the jolt-physics pin, materials, the step rate, contact code
  (#1435) and `QUALIFICATION_JUDGES`.
- Qualification: the new analytic regression; the full CI set with `ci:full`
  on the final head, every promoted model's verdict compared before and after.
