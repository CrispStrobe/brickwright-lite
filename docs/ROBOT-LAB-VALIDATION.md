# Robot Lab validation: test machines against closed-form physics

`test/bw-sim-validation.test.mjs` builds test machines from real LEGO parts
(`test/fixtures/bw-sim/machines/*.ldr`; each file's header says how it is built),
runs them through the real pipeline — LDraw → `parseModel` → `compile` (CompiledMechanism v2)
→ the Jolt core → the virtual SPIKE hub with its DC motor model where a motor drives — and
compares each against a value derived in the test from the parts' catalog geometry and
textbook physics. No expected value is read back from a simulation.

Every fixture passes `test/bw-sim-models-solid.test.mjs`, which walks `test/fixtures/bw-sim/`:
no overlapping colliders or meshes, no pin past its hole, no two pins in one hole. The suite's
first test checks that each one is connected and compiles without diagnostics; the drop test's
loose parts are the only exception, by design. The suite takes about 1.5 s (22 tests). Measured
at 200 Hz (`STEP_MS` 5), on 2026-10-18, after the fixes below (all 22 pass; before them 15 passed and
7 were `todo`).

## Results

| # | Machine (fixture) | What it tests | Expected (derivation) | Measured | Tolerance (why) | Verdict |
|---|---|---|---|---|---|---|
| 1a | `gears-compound-8-24-8-40.ldr` | compound train, direction | +1/15 = (−8/24)(−8/40) | +0.06667 | 1 % (gear constraint is exact; solver residual) | pass |
| 1b | `gears-24-8.ldr` | speed-up | −3 | −3.00000 | 1 % | pass |
| 1c | `gears-idler-24-24-24.ldr` | idler: direction, not ratio | +1 (idler −1) | +1.00000 | 1 % | pass |
| 2 | `load-worm-24.ldr` / `load-spur-8-24.ldr` | worm self-lock vs spur back-drive | worm holds (tan λ = m/2r_w = 0.125 < μ 0.4); spur falls, motor back-driven ×(−3) | worm 0.0000° in 3 s; spur arm 75.3°, motor −225.9° (−3.000) | worm ≤ 0.5°; spur > 30° and ratio ±1 % | pass |
| 3 | shipped `forklift.ldr`, hub clamped | rack and pinion | r·θ, r = m·z/2 = 4 mm (25.13 mm per turn), upwards | 37.626 mm for 538.95° (= r·θ) | 0.5 % | pass |
| 4a | `pendulum.ldr`, stand–beam contact off (control) | physical pendulum | T(A) = 4K(sin A/2)·√(I/mgd), I = m(18²+138²)/12 + m·60² LDU² (catalog box, 2.3 g): T0 = 0.3740 s, T(36.2°) = 0.3836 s | 0.3839 s at 36.2° (+0.1 %); amplitude kept 96.4 % after one period | 2 % (step error); ≥ 90 % kept | pass |
| 4b | `pendulum.ldr` as built | period, small damping | as 4a; ≥ 90 % amplitude per period | 36.9° → 36.2° → 35.6° (96.4 % kept); period +0.1 % | as 4a | pass (was todo: 59.5 % kept, +2.1 … +11.8 %) |
| 5a | `four-bar-crank-rocker.ldr`, links' mutual contacts off (control) | crank-rocker kinematics | loop equation (circle intersection) for a 40/100/60/100 linkage; rocker −146.4° … −60.0° | worst 0.03° | 1.5° (hinge-chain compliance, step) | pass |
| 5b | `four-bar-crank-rocker.ldr` as built | the same | as 5a | worst 0.03° | 1.5° | pass (was todo: 3.03° at 180 °/s) |
| 6a | `balance-equal.ldr` | equal masses, equal arms | Σ m·g·x = 0: stays level | 0.0000° | 0.5° | pass |
| 6b | `balance-equal.ldr` | lever square to its pin | droop ≤ 1° (hole clearance) | 0.07° | 1° | pass (was todo: 17.9°) |
| 6c | `balance-unequal.ldr` | heavier but smaller arm goes down | α0 = τ/I = −17.3 rad/s² from per-part masses (the beams' side goes down) | −19.11 rad/s² (+10.5 %) | sign; 15 % | pass (was todo: +23.0, the wrong way) |
| 7a | `drop-on-beams.ldr` at 20 cm | free fall | v = g·t = 1.4715 m/s at 0.15 s | 1.4658 m/s (−0.39 %) | 0.5 % (Jolt's default 0.05 s⁻¹ linear damping costs 0.4 %) | pass |
| 7b | `drop-on-beams.ldr` at 5 cm / 20 cm | lands on the beams | falls h, rests on the beams' tops | 50.18 / 200.18 mm | 1 mm (contact slop, rounded edges) | pass |
| 7c | `drop-on-beams.ldr` at 50 cm / 1 m | no tunnelling | falls h | 500.2 / 1000.1 mm | 1 mm | pass (was todo: 508.1 / 1008.2 mm, through the beams) |
| 7d | rolling wheel on an incline | — | — | not built: the arena has no slope | — | skipped (as briefed) |
| 8a | shipped `driving-base.ldr` | straight drive | π·d per wheel turn, d = 56 mm (catalog radius 70 LDU): 351.96 mm for the encoders' 720.2°/720.2° | 351.88 mm, yaw 0.005° | 1 % (tyre creep, castor drag) | pass |
| 8b | shipped `driving-base.ldr` | spin in place | 360°·d/track per wheel turn, track 136 mm (wheels at x ±170 LDU): 296.58° | 296.58°, to the left | 1 % | pass |
| 9 | shipped `driving-base.ldr` + wall obstacle | robot into a wall | stops after the 50 mm gap (front = the colliders' most forward point) | 50.05 mm | 1 mm | pass |
| 10 | `motor-arm-stop.ldr` without its post, motor clamped, world obstacle | motor stall | arm stops at first touch (separating-axis sweep of the catalog boxes): +92.35° / −33.52°; hub reports the stall | +94.24° / −34.22°, stalled | 3° | pass (was todo: +276.65° / −865.88°) |
| 11 | `motor-arm-stop.ldr`, motor clamped | self-collision: arm into its own frame | stops at first touch, +92.35° | 93.53°, stalled | 3° | pass (was todo: 871.5°, through the post) |

Gear trains also have older coverage in `test/bw-sim-gear-trains.test.mjs` (8:24, 8:24:8,
8:40, bevel 12:20, stall through a mesh). The suite has no bevel 20:20 machine. The rolling
incline is skipped because the arena is flat. Passing rows whose numbers moved with the fixes: the
spur arm falls further in 3 s (49.7° → 75.3°; part masses moved its centre of mass), the pendulum
control's period error fell from +1.2 % to +0.1 % and its amplitude kept rose from 93.8 % to 96.4 %
(the pin is no longer a body of its own), the four-bar control's error from 1.21° to 0.03°.

## Fixes made

Each was a `todo` test with its expected value; each now passes with that value and tolerance
unchanged. Step costs are node medians at 200 Hz (min of 5 runs); `docs/ROBOT-LAB-ARCHITECTURE.md`
("Validation fixes as built") has the design.

1. **Neighbours on one pin rubbed (4b, 5b).** D2's filter excluded joined body pairs only; two
   beams on a pin are each joined to the pin, not to each other, so their faces touched at zero
   gap and carried friction. *Fix:* `mech/collision-filter.js` groups connector endpoints joined
   by edges into axis groups; every body pair in one group is in `noCollide`. Pendulum 59.5 % →
   93.8 % kept per period (96.4 % with fix 2), four-bar 3.03° → 0.34° (0.03° with fix 2).
2. **A frictionless pin was its own light body (6b; part of 4b, 5b, 6c).** A 0.25 g body between
   two hinges at 10 iterations could not hold a 9 g lever: droop 17.9°. *Fix:* `mech/islands.js
   freeSpinnerWelds` welds a free spinner (the shaft of every edge it has, all hinges on one line,
   two or more partners, no gear/motor/sensor/hub) to its first partner: one hinge, the same
   kinematics. Droop 0.07°. Chosen over more iterations, which only reduced it (0.45° at 30/10,
   measured) and cost every hinge island.
3. **Centre of mass from collider volume (6c).** Jolt gave each compound one density: the 8 g,
   642 000 LDU³ sensor outweighed 9 g of beams; α0 +23.0 rad/s² (the wrong side down; −17.30
   expected). *Fix:* colliders carry their part's mass share (`massKg`, by volume; motors by
   `massFraction`), sub-shapes get density = massKg / volume. α0 −15.79 (−19.11 with fix 2,
   which stops the lever wobbling on its pin chain).
4. **Tunnelling (7c).** *Fix:* every dynamic body `EMotionQuality_LinearCast`. Drops land
   0.2 / 0.1 mm from h. Cost a fixed ~13 µs per step (shipped examples 35 → 48 µs; stress model
   +1.5 %); applied to all bodies: any body can be the fast one, and a slow one costs a compare.
5. **Motorised hinges got too few iterations (10).** *Fix:* 30 velocity steps and 0.33/ε
   position steps in [5, 40] per motorised hinge, ε = m·r² / (I_axis + m·r²) of its lighter
   body once the rotor inertia is on it (`jolt-core.js setMotorSteps`). First derived as 60/5
   (+1.4° / −0.9°); with fix 3 the arm's centre of mass moved and 60/5 crept to +9°: the
   rotor's 3e-4 kg·m² on an 8 g body leaves a contact ε = 0.011 of the turn per iteration, and
   only position steps converge it (5: +6.4°, 20: +2.8°, 30: +2.0°, 40: +1.5°; velocity 30–500
   not monotonic). The arm gets 30 (+1.89° / −0.70°), a SPIKE wheel 7. Shipped examples
   48 → ~68 µs per step.
6. **Self-collision off across a joint (11).** The exclusion was per body pair. *Fix:*
   `localNoCollide` lists the part pairs to keep apart (seated on one axis, or never brought
   together by the pair's motion: a hinge keeps intervals along its line and distance bands
   from it, a ball distance from its point); a pair with any other part pair goes to
   `noCollideParts` and is filtered per sub-shape by a Jolt SimShapeFilter (installed only
   then; no shipped example needs it, step time unchanged). Arm stops at 93.53°.

## Open: the Forklift's carriage (for the lead)

Slider pairs keep the per-body filter. Filtered locally, the shipped `forklift.ldr` jams: its
left tine (2823 at x −60) and the 3L pin under it sit on the guide axle's own line (x −60, z 155),
13 LDU below the guide's T holder (32039 at LDraw y −70) and 32 LDU below the guide axle itself.
The rack test then rose 5.4 mm of 37.6 mm and the 40 mm lift cannot happen. Moving the holder is
not enough (the guide is in the way too), and moving the tines off the line in this carriage
breaks their 40 LDU spacing, which the pallet's pockets need: with the 3L pin offset in the fork
arm the tines are 20 LDU apart (tried: the pallet is pushed at rest and lifts 41.0 mm against
r·θ 40.0); any 40 LDU placement collides with the upright (it takes the toggle's pins) or the
rack. The carriage needs a redesign with the mast behind the forks; then slider pairs can be
local too (`collision-filter.js`, one line).

## Integration with the gearbox lane (2026-10-19)

Merged with the gearbox lane, local filtering failed three gearbox tests: (1) the differential's
side gears, right axle and planets sit inside the casing's and cover's solid colliders, joined by
the carrier joints that kind makes without connector edges, so nothing said they were seated —
parts that interpenetrate at t = 0 are now excluded as nested; (2) the shipped `gearbox.ldr`'s
pointer (a thin 1 × 3 on the output axle at LDraw y −20) swept through the drive motor's housing
(its far end reaches 49 LDU from the axle, the housing is 10 LDU away), so the output could not
turn — it now sits at the top of a 12L output axle (3708, y −170), 25 LDU above the 16T gears.
Gearbox program: output/motor −0.3333 / −1.0000 (tooth ratios), the differential tests pass.

Minor, recorded by the passing tests: Jolt's default linear damping (0.05 s⁻¹, not set by
`jolt-core.js`) acts as a weak, velocity-proportional air drag (−0.4 % on free fall at 0.15 s).
