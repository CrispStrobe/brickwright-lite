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
   two hinges at 10 iterations could not hold a 9 g lever: droop 17.9°. *Fix:* a free pin is
   welded to its first partner: one hinge, the same kinematics. Droop 0.07°. (Since the merge
   with the excavator lane, which solved the same problem, the one mechanism is
   `mech/free-pins.js`, extended to pins with more than two partners.) Chosen over more iterations, which only reduced it (0.45° at 30/10,
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

## The Forklift's carriage (resolved 2026-10-19)

The left tine (2823 at x −60) and its 3L pin sat on the guide axle's own line (x −60, z 155 LDU), 13 LDU
under the guide's T holder and 32 under the guide, so with local filtering the carriage jammed after
5.2 mm of its 40 mm lift. The tines now hang on a cross beam in front of the mast: a beam 5 (32316,
x −20, y −14, holes z 155…235) pinned to the fork arm's two lower holes (z 155, 175), the 3L pin at z
215 carrying the tines at x −40 and 0 (still 40 LDU apart for the pallet's pockets). Their roots
(z 195…235) are 30 LDU in front of the T holder. The Warehouse pallet moved with them (world x −0.136,
z −0.016). Slider pairs are filtered locally now; the Forklift tests pass unchanged (40 mm lift: 39.82
against r·θ 40.03; held drift 0.013 mm; slip on the forks 0.00 mm).

## Integration with the gearbox lane (2026-10-19)

Merged with the gearbox lane, local filtering failed three gearbox tests: (1) the differential's
side gears, right axle and planets sit inside the casing's and cover's solid colliders, joined by
the carrier joints that kind makes without connector edges, so nothing said they were seated —
parts that interpenetrate at t = 0 are now excluded as nested; (2) the shipped `gearbox.ldr`'s
pointer (a thin 1 × 3 on the output axle at LDraw y −20) swept through the drive motor's housing
(its far end reaches 49 LDU from the axle, the housing is 10 LDU away), so the output could not
turn — it now sits at the top of a 12L output axle (3708, y −170), 25 LDU above the 16T gears.
Gearbox program: output/motor −0.3333 / −1.0000 (tooth ratios), the differential tests pass.

## Gear meshes: torque × ratio and momentum conserved (resolved 2026-10-19, the Jolt fork)

Until 2026-10-19 two gear bugs were open: Jolt's `GearConstraint` passed torque across a mesh 1:1
(`GearConstraintPart` applied λ, not ratio·λ, to body 2: rows 15 and 16 of round 2), and it is
angular-only, so no tooth reaction reached the axles' frame and a machine on a moving frame gained
angular momentum (the Excavator's base yawed 15–140° in a dig cycle; floating, it spun ≈ 285° while
only its bucket actuator ran). Neither can be fixed around the solver (tried and rejected: a SixDOF
tooth contact re-made every step — no warm start, did not converge against the hinges; the missing
impulses applied after each step — unstable).

The Robot Lab now runs on the Brickwright fork of Jolt (`jolt-physics` 1.1.0-bw.2, pinned by release
tarball and integrity; <https://github.com/CrispStrobe/JoltPhysics.js/blob/brickwright/gear-mesh/BRICKWRIGHT.md>,
Jolt v5.6.0 + the fix in <https://github.com/CrispStrobe/JoltPhysics>). Its `GearConstraint` passes
torque × ratio, and its new `GearMeshConstraint` is the mesh as a tooth contact at the pitch point:
an equal and opposite force pair, so torque scales with the ratio, the reaction loads each gear's
frame (the other body of its hinge), and momentum is conserved. Every mesh kind uses it
(`jolt-core.js` `meshGear`; ROBOT-LAB-ARCHITECTURE.md §1.2 has the details). Measured at 200 Hz:

| Check | Expected | Before (Jolt 1.1.0) | Now | Tolerance |
|---|---|---|---|---|
| row 15: 8:24 dyno, motor operating point | 16.253 rad/s | 11.796 rad/s | 16.205 rad/s (−0.30 %) | 1 % |
| row 16: mesh efficiency | η = 1 | 0.332 | 0.979 (207.0 mW in, 202.6 mW out) | 3 % |
| Excavator dig cycle: base yaw | < 10° | 139.4° | 5.0° (turntable −81.1° … +98.7°, back to 7.6°) | 10° |
| free-floating 8:24 gearbox, motor internal, no gravity: max abs(ΔΣL) / Σ abs(L_i) over 2 s | 0 | (the fork: 0.68 with GearConstraint) | 1.13e-3; 24T/8T relative to the frame −0.33328; the frame turned 151.5° | 2e-3 (integrator: no gyroscopic term; the gearbox without its mesh drifts 4e-3) |
| differential, one side held: the other side / casing (Willis) | 2 | 1.992 (240 iterations, re-made contact) | 1.9999 / 2.0000 | 2 % |

Two measured limits of the solver, handled in `jolt-core.js` and documented there:
- The fork's mesh can also pull back accumulated phase error from the hinge angles. Kept on across
  steps, that correction fought the rest of the solve: a stalled DC motor's arm on a driven 24T was
  pushed 7.7° into a static block (P5 §6 allows 6°), and the Excavator's bucket actuator chain rang
  and diverged (NaN) within a second. The phase is therefore re-based before every step: the mesh is
  exact in velocity and removes each step's drift; slip the solver cannot prevent (the stalled arm's
  impact: 10.5° of the 24T) stays slipped, as with the gear constraint.
- A light gear body between its hinge and a contact or a mesh gives way sideways: gear bodies get a
  solver mass of at least 20 g with their weight kept (as the actuators' parts already did). Without
  it the slew pinion slipped 17° of the turntable in a dig cycle and the stalled arm kept rocking.
- A mesh island solves with 120 velocity iterations (the carrier contact needed 240): with 30 the
  Excavator's boom left its law-of-cosines angle by 1.73°, with 120 by 0.73° (tolerance 1.5°).

Minor, recorded by the passing tests: Jolt's default linear damping (0.05 s⁻¹, not set by
`jolt-core.js`) acts as a weak, velocity-proportional air drag (−0.4 % on free fall at 0.15 s).

## Round 2: more machines

`test/bw-sim-validation-2.test.mjs`, fixtures `test/fixtures/bw-sim/machines-2/*.ldr` (each header
says how it is built) and four shipped models (`driving-base.ldr`, `wall-stopper.ldr`,
`colour-explorer.ldr`, `forklift.ldr`). The method is round 1's: real parts, real builds (the fixtures
pass `bw-sim-models-solid`; the suite's first test checks they compile with no diagnostics except
the loose parts that are the point of a machine), the real pipeline, and expected values derived in
the test from catalogue geometry and documented physics. The suite takes about 4 s (18 tests: since 2026-10-19 also the free-floating gearbox above).
Measured at 200 Hz on 2026-10-19.

| # | Machine (fixture) | What it tests | Expected (derivation) | Measured | Tolerance (why) | Verdict |
|---|---|---|---|---|---|---|
| 12 | `gear-train-243.ldr` | five 8:24 stages | (−8/24)^5 = −1/243; same ratio over both halves of 10 s; no creep while held | −1/242.999 (both halves); held 2 s: output 0.00000° | 0.5 % (exact kinematics) | pass |
| 13 | `worm-then-spur.ldr` | worm direction from the thread's hand, then 8:8 | right-hand thread: wheel = −k/((a_w × (P − C))·a) · worm, k = 1.25 LDU/rad; then −1: +1/24 about the output's axis | +0.04167 | 0.5 % | pass |
| 14 | `dyno-direct.ldr` (slip clutch held by its mesh) | DC motor on its torque–speed line | Philo's 9 V points → R, k_t, k_e → at 7.2 V τs 10.44 N·cm, ω0 18.46 rad/s; load 3.75 N·cm (the clutch's catalogue rating): ω = ω0(1 − τL/τs) = 11.832 rad/s | 11.800 rad/s (−0.27 %) at duty 1 | 1 % | pass |
| 15 | `dyno-geared.ldr` (8T drives the clutch gear, its axle held) | torque through a mesh | load at the motor 3.75/3 N·cm → 16.253 rad/s | 16.205 rad/s (−0.30 %); ring/motor 0.3333 | 1 % | pass (was todo: 11.796 rad/s, the direct bench's — torque 1:1) |
| 16 | `dyno-geared.ldr` | mesh efficiency | ideal spur gears: P_out/P_in = 1 | η = 0.979 (207.0 mW in, 202.6 mW out) | 3 % | pass (was todo: η = 0.332) |
| 17 | shipped `forklift.ldr`, hub clamped | force through rack and pinion (control for 15) | hold torque m·g·r = 14.8 g · g · 4 mm = 0.579 mN·m | carriage sinks at 0.9×, rises at 1.1× | ±10 % bracket | pass |
| 18 | shipped `driving-base.ldr`, A −300 °/s, B 150 °/s | differential steering on a circle | from the encoders: Ω = (v_R − v_L)/t = −30.882 °/s, R = t/2·(v_R + v_L)/(v_R − v_L) = 204.00 mm (outer/inner 2.000) | Ω −30.882 °/s, R 203.98 mm | 1 % | pass |
| 19 | the same run | hub yaw, gyro, encoder | yaw (cw) = −geometric yaw; ∫gyro z = geometric yaw; encoder A = the wheel's turn in the chassis | 92.646° vs −92.646°; −92.645°; −899.998° vs −899.998° | 0.1°, 0.5 %, 0.1° | pass |
| 20 | shipped `wall-stopper.ldr` + a 2 cm wall | distance sensor | ray distance D/cos ψ, mm; −1 outside 50 … 2000 mm: 30 mm → −1, 100, 300, 319.3 (20°), 391.6 (40°), 800, 1732.1 (1.5 m at 30°), 2.2 m → −1 | 100, 300, 319, 392, 800, 1732, −1 / −1 | 1 mm | pass |
| 21 | shipped `colour-explorer.ldr` on `colour-zones` | colour sensor | mat layout: white 10, red 9, yellow 7, green 6, blue 3, border black 0, off-mat white; white reflection 100·(1 − h/32 mm), h = 16.4 mm → 48.8 | all colours right; reflection 48 | exact; ±2 | pass |
| 22 | `tilt-table-tower.ldr` | tower tips at tan θ = (b/2)/h | COM 72.75 LDU above the table (catalogue colliders), half base 10 LDU: θc = 7.83° | tips at 7.38° one way, −7.43° the other (stood at 6.01° / −5.93°) | 0.5° (the 0.5° steps) | pass (was todo: 10.00° / 6.45°; margin 0.1°) |
| 23 | `carts.ldr` (robot pushes cart 1 into cart 2) | momentum in a collision | Σ m·v conserved (masses from the catalogue: 54.6 g each) | 7.413 → 7.387 g·m/s (−0.35 %) | 1 % (damping, 50 ms) | pass |
| 24 | `carts.ldr` | restitution | no body sets one: Jolt's 0, the carts leave together | e = 0.235 | e ≤ 0.05 | **todo** |
| 24c | `carts.ldr`, all mass in the bumper bodies (control) | the same | e = 0 | e = 0.010 | e ≤ 0.05 | pass |
| 25 | `carts.ldr`, cart 2 coasting | rolling resistance | a ≥ c_rr·g, c_rr ≥ 0.005 (rubber on a hard floor) | a = 0.0038 m/s² = 0.05·v (Jolt's default damping only) | — | **todo** |
| 26 | universal joint | ω2/ω1 = cos β/(1 − sin²β cos²θ) | — | not buildable: no cross/fork connector or coupling kind | — | **todo** |

Not built in this round: a crank-slider (needs a frame that holds the smooth toggle joint's
slide bores at the coupler's height), a scissor lift, a Watt's linkage, and a spur–bevel–worm train
over three axis directions (the motor's housing gives bearings along y and x only; a third needs a
Technic-brick frame). The stepped table of row 22 is the quasi-static form of the brief's "tilting
platform"; the arena still has no slope (round 1, 7d).

### Discrepancies and diagnoses (round 2)

7. **Gears pass torque 1:1 (15, 16). Resolved 2026-10-19** (the Jolt fork, section above; the
   diagnosis is kept as it was found). A gear constraint makes the driven
   gear turn at the tooth ratio, but the torque it passes is not scaled by that ratio: a load torque
   on the driven gear reaches the driver unchanged, whatever the teeth. Energy is not conserved: in
   row 16 the motor puts 3× the power into the 8:24 mesh that the slipping clutch takes out. So a
   reduction gear gives no torque gain — a crane's 1:243 lifts no more than its motor shaft could.
   *Minimal repro* (no motor, no hub): two wheels on hinges, a `GearConstraint` with mRatio 3, a weight
   on each at the same radius. Physics balances them at m2 = 3·m1; Jolt balances them at m2 = m1
   (raw JoltPhysics.js 1.1.0, measured), as does the compiled 8:24 bench, with any ratio either way.
   *Diagnosis:* Jolt's `GearConstraintPart` puts the ratio into the constraint (ω1 + r·ω2 = 0) and
   into the effective mass (r²), but applies λ, not r·λ, to body 2 (`ApplyVelocityStep`; upstream
   master reads the same). `jolt-core.js buildGearConstraint` uses it for every 'gear', 'worm' and
   non-carrier 'relativeGear' coupling. The `RackAndPinionConstraint` is correct (row 17). *Possible
   fixes:* build meshes as the planet-carrier path already does (a SixDOF tooth-point constraint,
   kinds/relative-gear.js, which is exact for forces), or patch the gear part upstream. Not made here:
   `jolt-core.js` is another lane's. Round 1 and the gear suites missed it because they measure
   kinematics only.
8. **A tower on a small footprint rocks and tips early or late (22). Passes since (measured
   2026-10-19, the same with Jolt 1.1.0 and the fork): 7.38° / −7.43°, 0.1° inside the tolerance.** The table stopped at 5–6°
   leaves the tower leaning 1.5°: the loaded edge sinks into Jolt's 0.2 mm penetration slop
   (`LEGO_PENETRATION_SLOP_M`), and on an 8 mm footprint that is atan(0.2/8) = 1.4°. With the table
   still and gravity tilted instead, it tips between 6° and 7° (θc 7.83°). The table's steps then set
   it rocking ±2°, so the tip angle depends on the direction (6.45° / 10.00°). *Possible fixes:* a
   smaller slop for small bodies, or more contact points per face. Not made here (`jolt-core.js`).
9. **A light body between hinges springs back (24).** Each cart's bumper is a 4.8 g beam hinged to
   two 25 g wheel sets. On impact the hinge chain stores the energy and returns it: e = 0.67 with
   restitution 0 when found, 0.235 now (2026-10-19). Not the body model: no body sets a restitution.
   The 20 g solver mass floor that gears and actuators use does not apply: in a collision the floored
   mass is the mass, and row 23's momentum would not be conserved. With the carts' mass moved into the bumper body (control 24c) e = 0.01. Momentum
   is conserved either way (23). This is round 1's bug 2 (soft pin chains), seen in a collision.
10. **No rolling resistance (25).** A free cart loses only Jolt's default 0.05 s⁻¹ damping
    (a = 0.05·v, a c_rr of about 0.0006 at 0.11 m/s), 10× less than a tyre on a hard floor. A coasting
    robot rolls about 10× too far. This is a model gap: rolling resistance would need a per-tyre
    torque c_rr·N·r (or wheel-body damping) in the core, and N, each tyre's normal load, is not read
    today (the core's contact listener sees contact points, not impulses). Still open.
11. **No universal joint (26).** The catalogue has the U-joint's ends but no part or connector for the
    cross, and no coupling kind joins two ends. This needs a new connector kind (a cross in two forks:
    two perpendicular hinges through one body, or a Jolt `SixDOF` with two rotations free).

Passing rows 12–14, 17–21 and 23 check the gear kinematics (including the worm's direction), the DC
motor model's operating point against Philo's numbers, rack force transmission, differential
steering, the IMU's yaw and gyro, the encoders, and the distance and colour sensor models. No product
code was changed in round 2. Every discrepancy is in `jolt-core.js` (7, 8, 10), in the body model
(9: `joints.js`/`islands.js`), or in the catalogue and kinds (11), and other lanes own all of them.
