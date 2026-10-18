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
loose parts are the only exception, by design. The suite takes about 1 s (22 tests). Measured
at 200 Hz (`STEP_MS` 5), on 2026-10-18.

## Results

| # | Machine (fixture) | What it tests | Expected (derivation) | Measured | Tolerance (why) | Verdict |
|---|---|---|---|---|---|---|
| 1a | `gears-compound-8-24-8-40.ldr` | compound train, direction | +1/15 = (−8/24)(−8/40) | +0.06667 | 1 % (gear constraint is exact; solver residual) | pass |
| 1b | `gears-24-8.ldr` | speed-up | −3 | −3.00000 | 1 % | pass |
| 1c | `gears-idler-24-24-24.ldr` | idler: direction, not ratio | +1 (idler −1) | +1.00000 | 1 % | pass |
| 2 | `load-worm-24.ldr` / `load-spur-8-24.ldr` | worm self-lock vs spur back-drive | worm holds (tan λ = m/2r_w = 0.125 < μ 0.4); spur falls, motor back-driven ×(−3) | worm 0.0000° in 3 s; spur arm 49.7°, motor −149.2° (−3.000) | worm ≤ 0.5°; spur > 30° and ratio ±1 % | pass |
| 3 | shipped `forklift.ldr`, hub clamped | rack and pinion | r·θ, r = m·z/2 = 4 mm (25.13 mm per turn), upwards | 37.626 mm for 538.95° (= r·θ) | 0.5 % | pass |
| 4a | `pendulum.ldr`, stand–beam contact off (control) | physical pendulum | T(A) = 4K(sin A/2)·√(I/mgd), I = m(18²+138²)/12 + m·60² LDU² (catalog box, 2.3 g): T0 = 0.3740 s, T(35.7°) = 0.3833 s | 0.3878 s at 35.7° (+1.2 %); amplitude kept 93.8 % after one period | 2 % (step error: 0.1 % at 1 kHz); ≥ 90 % kept | pass |
| 4b | `pendulum.ldr` as built | period, small damping | as 4a; ≥ 90 % amplitude per period | 36.9° → 28.3° → 21.9° (59.5 % kept); period +2.1 … +11.8 % | as 4a | **todo** |
| 5a | `four-bar-crank-rocker.ldr`, links' mutual contacts off (control) | crank-rocker kinematics | loop equation (circle intersection) for a 40/100/60/100 linkage; rocker −146.4° … −60.0° | worst 1.21° (at the rocker's limit) | 1.5° (hinge-chain compliance, step) | pass |
| 5b | `four-bar-crank-rocker.ldr` as built | the same | as 5a | worst 3.03° at 180 °/s, 4.7° at 60 °/s | 1.5° | **todo** |
| 6a | `balance-equal.ldr` | equal masses, equal arms | Σ m·g·x = 0: stays level | 0.0009° | 0.5° | pass |
| 6b | `balance-equal.ldr` | lever square to its pin | droop ≤ 1° (hole clearance) | droops 17.9° off the pin axis | 1° | **todo** |
| 6c | `balance-unequal.ldr` | heavier but smaller arm goes down | α0 = τ/I = −17.3 rad/s² from per-part masses (the beams' side goes down) | +23.0 rad/s² (the sensor side goes down); one-density model predicts +88.7 | sign; 15 % | **todo** |
| 7a | `drop-on-beams.ldr` at 20 cm | free fall | v = g·t = 1.4715 m/s at 0.15 s | 1.4658 m/s (−0.39 %) | 0.5 % (Jolt's default 0.05 s⁻¹ linear damping costs 0.4 %) | pass |
| 7b | `drop-on-beams.ldr` at 5 cm / 20 cm | lands on the beams | falls h, rests on the beams' tops | 50.35 / 200.20 mm | 1 mm (contact slop, rounded edges) | pass |
| 7c | `drop-on-beams.ldr` at 50 cm / 1 m | no tunnelling | falls h | 508.1 / 1008.2 mm: through the 8 mm beams to the floor | 1 mm | **todo** |
| 7d | rolling wheel on an incline | — | — | not built: the arena has no slope | — | skipped (as briefed) |
| 8a | shipped `driving-base.ldr` | straight drive | π·d per wheel turn, d = 56 mm (catalog radius 70 LDU): 351.93 mm for the encoders' 720.1°/720.2° | 351.81 mm, yaw 0.007° | 1 % (tyre creep, castor drag) | pass |
| 8b | shipped `driving-base.ldr` | spin in place | 360°·d/track per wheel turn, track 136 mm (wheels at x ±170 LDU): 296.49° | 296.42°, to the left | 1 % | pass |
| 9 | shipped `driving-base.ldr` + wall obstacle | robot into a wall | stops after the 50 mm gap (front = the colliders' most forward point) | 50.12 mm | 1 mm | pass |
| 10 | `motor-arm-stop.ldr` without its post, motor clamped, world obstacle | motor stall | arm stops at first touch (separating-axis sweep of the catalog boxes): +92.35° / −33.52°; hub reports the stall | +276.65° (passed through once, then stalled); −865.88° (passed through, not stalled) | 3° | **todo** |
| 11 | `motor-arm-stop.ldr`, motor clamped | self-collision: arm into its own frame | stops at first touch, +92.35° | 871.5° after 3 s: sweeps through the post | 3° | **todo** |

Gear trains also have older coverage in `test/bw-sim-gear-trains.test.mjs` (8:24, 8:24:8,
8:40, bevel 12:20, stall through a mesh). The suite has no bevel 20:20 machine. The rolling
incline is skipped because the arena is flat.

## Discrepancies and diagnoses

Each **todo** test states its expected value. It fails today and passes once its cause is fixed.

1. **Face-to-face neighbours on a shared pin rub (4b, 5b).** Collisions follow decision D2:
   every pair collides except the pairs in the mechanism's `noCollide` list
   (`contracts.js noCollidePairs`, `compile.js seatedBodyPairs`): bodies joined by a joint or
   coupling, and parts seated in each other's holes. Two beams on one pin are seated in the
   pin, not in each other, so they collide. They touch face to face, and Jolt makes contact
   constraints at zero gap; with the soft pin chain (item 2), those contacts carry normal force
   and friction. The pendulum loses about 6° per half swing to this. With only the stand–beam
   pair excluded (control 4a) it loses about 1° per half swing, all of it step dissipation. In
   the four-bar, friction under the coupler's weight pulls the rocker up to 4.7° off the closed
   form; with the links' mutual contacts off (control 5a) the error is 1.2°.
   *Possible fix:* add the bodies that share a shaft body to `noCollide`. This is a D2 policy
   change in `contracts.js`/`compile.js`, so it is not made here.
2. **A frictionless pin or a free axle is its own light body between two hinges (6b, 6c; part
   of 4b and 5b).** `mech/joints.js` and `islands.js` make a 0.25 g pin a body hinged to both
   beams. Outside gear islands the solver runs Jolt's default 10 velocity and 2 position
   iterations, which cannot hold a 9–24 g lever through it. The equal balance's lever droops
   17.9° off its pin axis, and the unequal one flops by up to 79°. Measured with every hinge
   at the gear islands' 30/10 iterations: the droop falls to 0.45° and the four-bar error to
   2.7°. *Possible fixes:* weld a frictionless pin that turns in two coaxial holes into one of
   its hosts (one hinge, no light body), or raise the iterations for hinge islands (costs
   solver time).
3. **The centre of mass is the colliders' volume centroid, not the parts' masses (6c).**
   `islands.js` places a body's origin at the mass-weighted part origins. `jolt-core.js` then
   builds one compound shape at a single density and overrides only the total mass
   (`EOverrideMassProperties_CalculateInertia`), so Jolt's centre of mass and inertia are the
   colliders' volume-weighted ones. A light, bulky part (the 8 g distance sensor, 642 000
   LDU³ of collider) outweighs 9 g of beams (192 000 LDU³), and the lever tips the wrong way.
   *Possible fix:* give each part's sub-shapes the density massGrams / volume and let Jolt
   compute mass and inertia (`CalculateMassAndInertia`). This changes every robot's centre
   of mass slightly.
4. **Tunnelling (7c).** Every body uses Jolt's `Discrete` motion quality. At 3.1 m/s (a 50 cm
   drop) a brick moves 16 mm per 5 ms step, twice the beams' thickness, and passes through
   them. *Verified fix:* `bcs.mMotionQuality = J.EMotionQuality_LinearCast` for dynamic bodies
   in `jolt-core.js`. With that one line, all four drops land within 0.2 mm and the rest of
   this suite gives the same results (the other bw-sim suites were not run with it). It is not committed: it changes every body in a module other lanes extend.
5. **Motorised hinges without gears get too few iterations (10).** A medium motor's arm,
   driven by the DC model into a static obstacle, passes through it: once and then stalls in
   one direction, and completely in the other. The geared case
   (`bw-sim-gear-trains` P5 §6) passes only because gear islands get 30/10. *Verified:* with
   `mNumVelocityStepsOverride` 30 and `mNumPositionStepsOverride` 10 on the motorised hinge's
   constraint, the arm stops at 95.2° and −34.4° against first touches of 92.35° and −33.52°,
   and the hub reports the stall. Not committed (`jolt-core.js`, solver cost).
6. **Self-collision across a joint (11).** `noCollide` works per body. The motor's hinge joins
   the housing body and the output body, so no part rigid with the housing (here a post
   pinned to it) ever collides with any part on the output (the arm). The arm sweeps through
   its own machine's frame. *Fix needed:* exclude only the parts at the joint (the motor's
   own output and housing colliders). That needs part- or sub-shape-level filtering, either a
   contact listener or splitting the colliders, so it is a design change.

Minor, recorded by the passing tests: Jolt's default linear damping (0.05 s⁻¹, not set by
`jolt-core.js`) acts as a weak, velocity-proportional air drag (−0.4 % on free fall at 0.15 s).
The hinge at 200 Hz dissipates about 3 % of a pendulum's amplitude per period (0.5 % at 1 kHz).

## Fixes made

None in product code. Every discrepancy lies in `jolt-core.js`, `contracts.js`/`compile.js`
(the collision policy) or `joints.js`/`islands.js` (the body model). Those are shared, and
other lanes are extending the core with new kinds. The two one-line fixes measured above (4, 5)
are recorded with their effect for the owners to apply.

## Round 2: more machines

`test/bw-sim-validation-2.test.mjs`, fixtures `test/fixtures/bw-sim/machines-2/*.ldr` (each header
says how it is built) and four shipped models (`driving-base.ldr`, `wall-stopper.ldr`,
`colour-explorer.ldr`, `forklift.ldr`). The method is round 1's: real parts, real builds (the fixtures
pass `bw-sim-models-solid`; the suite's first test checks they compile with no diagnostics except
the loose parts that are the point of a machine), the real pipeline, and expected values derived in
the test from catalogue geometry and documented physics. The suite takes about 4 s (17 tests).
Measured at 200 Hz on 2026-10-19.

| # | Machine (fixture) | What it tests | Expected (derivation) | Measured | Tolerance (why) | Verdict |
|---|---|---|---|---|---|---|
| 12 | `gear-train-243.ldr` | five 8:24 stages | (−8/24)^5 = −1/243; same ratio over both halves of 10 s; no creep while held | −1/242.999 (both halves); held 2 s: output 0.00000° | 0.5 % (exact kinematics) | pass |
| 13 | `worm-then-spur.ldr` | worm direction from the thread's hand, then 8:8 | right-hand thread: wheel = −k/((a_w × (P − C))·a) · worm, k = 1.25 LDU/rad; then −1: +1/24 about the output's axis | +0.04167 | 0.5 % | pass |
| 14 | `dyno-direct.ldr` (slip clutch held by its mesh) | DC motor on its torque–speed line | Philo's 9 V points → R, k_t, k_e → at 7.2 V τs 10.44 N·cm, ω0 18.46 rad/s; load 3.75 N·cm (the clutch's catalogue rating): ω = ω0(1 − τL/τs) = 11.832 rad/s | 11.800 rad/s (−0.27 %) at duty 1 | 1 % | pass |
| 15 | `dyno-geared.ldr` (8T drives the clutch gear, its axle held) | torque through a mesh | load at the motor 3.75/3 N·cm → 16.253 rad/s | 11.796 rad/s — the direct bench's speed; ring/motor 0.3333 | 1 % | **todo** |
| 16 | `dyno-geared.ldr` | mesh efficiency | ideal spur gears: P_out/P_in = 1 | η = 0.332 (444.7 mW in, 147.5 mW out) | 3 % | **todo** |
| 17 | shipped `forklift.ldr`, hub clamped | force through rack and pinion (control for 15) | hold torque m·g·r = 14.8 g · g · 4 mm = 0.579 mN·m | carriage sinks at 0.9×, rises at 1.1× | ±10 % bracket | pass |
| 18 | shipped `driving-base.ldr`, A −300 °/s, B 150 °/s | differential steering on a circle | from the encoders: Ω = (v_R − v_L)/t = −30.882 °/s, R = t/2·(v_R + v_L)/(v_R − v_L) = 204.00 mm (outer/inner 2.000) | Ω −30.882 °/s, R 203.98 mm | 1 % | pass |
| 19 | the same run | hub yaw, gyro, encoder | yaw (cw) = −geometric yaw; ∫gyro z = geometric yaw; encoder A = the wheel's turn in the chassis | 92.646° vs −92.646°; −92.645°; −899.998° vs −899.998° | 0.1°, 0.5 %, 0.1° | pass |
| 20 | shipped `wall-stopper.ldr` + a 2 cm wall | distance sensor | ray distance D/cos ψ, mm; −1 outside 50 … 2000 mm: 30 mm → −1, 100, 300, 319.3 (20°), 391.6 (40°), 800, 1732.1 (1.5 m at 30°), 2.2 m → −1 | 100, 300, 319, 392, 800, 1732, −1 / −1 | 1 mm | pass |
| 21 | shipped `colour-explorer.ldr` on `colour-zones` | colour sensor | mat layout: white 10, red 9, yellow 7, green 6, blue 3, border black 0, off-mat white; white reflection 100·(1 − h/32 mm), h = 16.4 mm → 48.8 | all colours right; reflection 48 | exact; ±2 | pass |
| 22 | `tilt-table-tower.ldr` | tower tips at tan θ = (b/2)/h | COM 72.75 LDU above the table (catalogue colliders), half base 10 LDU: θc = 7.83° | tips at 10.00° one way, 6.45° the other | 0.5° (the 0.5° steps) | **todo** |
| 23 | `carts.ldr` (robot pushes cart 1 into cart 2) | momentum in a collision | Σ m·v conserved (masses from the catalogue: 54.6 g each) | 7.413 → 7.387 g·m/s (−0.35 %) | 1 % (damping, 50 ms) | pass |
| 24 | `carts.ldr` | restitution | no body sets one: Jolt's 0, the carts leave together | e = 0.669 | e ≤ 0.05 | **todo** |
| 24c | `carts.ldr`, all mass in the bumper bodies (control) | the same | e = 0 | e = 0.010 | e ≤ 0.05 | pass |
| 25 | `carts.ldr`, cart 2 coasting | rolling resistance | a ≥ c_rr·g, c_rr ≥ 0.005 (rubber on a hard floor) | a = 0.0054 m/s² = 0.05·v (Jolt's default damping only) | — | **todo** |
| 26 | universal joint | ω2/ω1 = cos β/(1 − sin²β cos²θ) | — | not buildable: no cross/fork connector or coupling kind | — | **todo** |

Not built in this round: a crank-slider (needs a frame that holds the smooth toggle joint's
slide bores at the coupler's height), a scissor lift, a Watt's linkage, and a spur–bevel–worm train
over three axis directions (the motor's housing gives bearings along y and x only; a third needs a
Technic-brick frame). The stepped table of row 22 is the quasi-static form of the brief's "tilting
platform"; the arena still has no slope (round 1, 7d).

### Discrepancies and diagnoses (round 2)

7. **Gears pass torque 1:1 (15, 16). New, and the largest.** A gear constraint makes the driven
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
8. **A tower on a small footprint rocks and tips early or late (22).** The table stopped at 5–6°
   leaves the tower leaning 1.5°: the loaded edge sinks into Jolt's 0.2 mm penetration slop
   (`LEGO_PENETRATION_SLOP_M`), and on an 8 mm footprint that is atan(0.2/8) = 1.4°. With the table
   still and gravity tilted instead, it tips between 6° and 7° (θc 7.83°). The table's steps then set
   it rocking ±2°, so the tip angle depends on the direction (6.45° / 10.00°). *Possible fixes:* a
   smaller slop for small bodies, or more contact points per face. Not made here (`jolt-core.js`).
9. **A light body between hinges springs back (24).** Each cart's bumper is a 4.8 g beam hinged to
   two 25 g wheel sets. On impact the hinge chain stores the energy and returns it: e = 0.67 with
   restitution 0. With the carts' mass moved into the bumper body (control 24c) e = 0.01. Momentum
   is conserved either way (23). This is round 1's bug 2 (soft pin chains), seen in a collision.
10. **No rolling resistance (25).** A free cart loses only Jolt's default 0.05 s⁻¹ damping
    (a = 0.05·v, a c_rr of about 0.0006 at 0.11 m/s), 10× less than a tyre on a hard floor. A coasting
    robot rolls about 10× too far. This is a model gap: rolling resistance would need a per-tyre
    torque (or wheel-body damping) in the core.
11. **No universal joint (26).** The catalogue has the U-joint's ends but no part or connector for the
    cross, and no coupling kind joins two ends. This needs a new connector kind (a cross in two forks:
    two perpendicular hinges through one body, or a Jolt `SixDOF` with two rotations free).

Passing rows 12–14, 17–21 and 23 check the gear kinematics (including the worm's direction), the DC
motor model's operating point against Philo's numbers, rack force transmission, differential
steering, the IMU's yaw and gyro, the encoders, and the distance and colour sensor models. No product
code was changed in round 2. Every discrepancy is in `jolt-core.js` (7, 8, 10), in the body model
(9: `joints.js`/`islands.js`), or in the catalogue and kinds (11), and other lanes own all of them.
