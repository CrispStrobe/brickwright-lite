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
