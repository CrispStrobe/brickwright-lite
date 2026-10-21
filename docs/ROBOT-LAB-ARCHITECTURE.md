# Robot Lab architecture — from one driving base to every LEGO Technic machine and hub

Status: **design; slices R1, R2 and R3 built** (2026-10-17, `lane/simlab-r1-20261017`,
`lane/simlab-r2-20261017`, `lane/simlab-r3-20261017` — see "R1 as built", "R2 as built" and "R3 as built" in §7 for where the code deviates
from the interfaces below and why). Written 2026-10-17 on
`lane/simlab-arch-20261017`, after reading the S1 code as it stands on `main` (`268c6e118`).
Owner of record: unclaimed. Claim slices in `LANES.md` as usual.

This document says how the Robot Lab ("Sim Lab" in code: `overlay/scratch-gui/src/lib/bw-sim/`)
grows from one product (a SPIKE Prime driving base on a mat) into what the owner asked for:
working Technic **mechanisms** (cranes, shifting gearboxes, excavators, forklifts, the 1990
plotter, differentials, pneumatics, winches, turntables, linear actuators), driven by **every
LEGO hub generation** from the Technic Control interfaces and the RCX to SPIKE Prime, through
**every execution route** the repo has (Scratch extensions, text dialects, MicroPython, compiled
binaries, CPU/VM emulators). It overrides nothing in `docs/SIM-LAB-PLAN.md` that is built; it
replaces that plan's §5 non-goals for the slices below, and its A2/A4/F5 tasks (see §6).

Conventions. "Today" means the code at `268c6e118`. File paths are relative to
`overlay/scratch-gui/src/lib/bw-sim/` unless they start with `overlay/`, `docs/`, `test/` or
`scripts/`. Jolt facts are from the vendored `jolt-physics` **1.1.0** typings
(`packages/scratch-gui/node_modules/jolt-physics/dist/types.d.ts` in the follow worktree), not
from memory. Real-world device specs marked **~** are public approximate figures (catalogue
values and community bench measurements); every one must be re-measured or sourced before it
becomes a `DeviceModel` number, and the device registry carries a `source` field for exactly
that.

Contents

0. Summary of decisions
1. Target inventory: mechanisms and the physics each needs
2. Hub inventory
3. Execution routes and the port boundary
4. Gap analysis of today's contracts
5. Proposed contracts
6. Modularity plan: registries and the worker protocol
7. Roadmap in slices
8. Risks and decisions for the owner

---

## 0. Summary of decisions

1. **One boundary: the port.** Physics never talks to a hub implementation, a VM, an
   extension or an emulator. It talks to `PortDevice`s on a `VirtualHub`, through a
   per-step exchange of plain data (`PortIO`: actuator *drives* in, sensor *readings* and
   encoder counts out). Every route — Scratch extension, MicroPython, a compiled RCX binary
   in an H8 emulator, SPIKE firmware in an emulator — ends at that same port. The existing
   `VirtualSpikeHubState` becomes the first `VirtualHub` implementation through an adapter;
   nothing it does today changes.
2. **Motor drive has two levels, and the level is the hub's, not the motor's.** A *smart*
   hub whose controller is simulated in JS (today's SPIKE path) drives a port with a
   **velocity servo** command (`{mode:'servo', radPerSec}`, exactly today's behaviour,
   bit-identical). A hub whose firmware runs in an emulator, and every unregulated hub
   (RCX, WeDo, Technic Control, Power Functions), drives a port with a **PWM duty**
   (`{mode:'pwm', duty, decay}`) into a **DC-motor model** (torque–speed line, back-EMF
   braking). The motor's `DeviceModel` holds the electrical/mechanical numbers both use.
3. **Time is owned by the physics clock (5 ms steps), always.** A route is a
   *step-synchronous* client: before each step it is advanced to the step's start time
   (an interpreter runs its due ticks; an emulator runs exactly the cycles that fit), reads
   the readings of the previous step and writes drives. No route ever runs ahead of
   physics time. The worker's checkpoint/redo protocol (SIM-LAB-PLAN §4.9) is generalised
   from "the SPIKE controller state" to "every route's serialisable state" (§3.4).
4. **The compiler becomes registry-driven.** Connector kinds, edge rules, joint kinds,
   couplings (gear, rack, worm, chain, differential, clutch, rope, pneumatic) and devices
   are registered modules with data; adding a mechanism or a hub is data + one module, not
   an edit to `graph.js`/`gears.js`/`jolt-core.js`/`hub-bridge.js` (§6).
5. **Contract versions are explicit and old files keep meaning what they meant.**
   `PlacedModel` stays `version: 1` on disk where nothing new is used; `CompiledMechanism`
   goes to `version: 2` internally (never stored); `parts.json` gets `version: 2` with a
   loader that upgrades v1 entries. Every existing test and fixture stays valid (§5.7).
6. **Three things need more than stock Jolt 1.1.0**, and that is the main owner decision
   (§8): gears whose common frame turns about the gear axis (differentials, gear trains on
   a turntable, any gear on a yawing chassis with vertical axes), a load-bearing rope over
   moving sheaves, and a torque-limited slip clutch. Each has a stock-Jolt approximation in
   the early slices; the exact form needs either a custom Jolt WASM build with three small
   C++ constraints, or JS constraints in a step listener (weaker). Recommended: the custom
   build, after the slices that do not need it.

---

## 1. Target inventory: mechanisms and the physics each needs

### 1.1 What stock Jolt 1.1.0 offers (verified in the WASM typings)

| Jolt construct | Present | Useful members (from `types.d.ts`) | Used today |
|---|---|---|---|
| `HingeConstraint` | yes | limits + limit springs, `mMaxFrictionTorque`, motor (velocity/position, torque limits), `GetCurrentAngle`, `GetTotalLambdaMotor` | yes, `physics/jolt-core.js:257` |
| `SliderConstraint` | yes | limits + springs, `mMaxFrictionForce`, motor (velocity/position, force limits), `GetCurrentPosition`, `GetTotalLambdaMotor` | created, **never driven or read** (`jolt-core.js:312`) |
| `PointConstraint` | yes | ball joint | yes (castor), `jolt-core.js:329` |
| `FixedConstraintSettings` | yes | weld two bodies (toggle with `Constraint.SetEnabled`) | no |
| `ConeConstraint`, `SwingTwistConstraint` | yes | ball with angular limits (towball steering links, universal-joint approximation) | no |
| `SixDOFConstraint` | yes | per-axis free/fixed/limited, per-axis motors and friction | no |
| `GearConstraint` | yes | `mRatio`, axes, `SetConstraints(hinge1, hinge2)`; **couples world angular rates** | yes, `jolt-core.js:378` |
| `RackAndPinionConstraint` | yes | `mRatio`, hinge axis, slider axis, `SetConstraints(pinion, rack)` | **validated in the contract, silently ignored by the core** (`jolt-core.js:390–392` only records it) |
| `PulleyConstraint` | yes | two body points + two **world-fixed** points, `mRatio`, min/max length | no |
| `DistanceConstraint` | yes | min/max distance, limit spring (soft), `SetDistance`, `GetTotalLambdaPosition` | no |
| `PathConstraint` (+ `PathConstraintPathHermite`, `…PathJS`) | yes | body follows a curve, position motor | no |
| `VehicleConstraint` + `TrackedVehicleController` / `WheeledVehicleController` | yes | ray/shape-cast vehicle, tracks | no |
| Soft bodies (`SoftBodyCreationSettings`, rod stretch/shear, LRA) | yes | ropes/hoses as rods | no |
| `Constraint.SetEnabled`, `SetNumVelocityStepsOverride`, `SaveState/RestoreState` | yes | clutches, stiff gear chains, rewind | velocity override yes (`GEAR_VELOCITY_STEPS = 30`) |
| `GroupFilterTable` | yes | per-pair collision enable/disable | no — today **all dynamic–dynamic collisions are off** (`jolt-core.js:107`) |
| `ContactListenerJS`, `PhysicsStepListenerJS` | yes | contact forces (touch/force sensors, pen on paper), per-step JS hook | no |
| Custom C++ constraint | **no** (needs our own WASM build) | — | — |

Two facts about the *existing* use matter for every mechanism below:

- *(Superseded 2026-10-19, see "Gear meshes as built: the Jolt fork" at the end of this document.)* **Gears
  couple world rates.** Jolt's `GearConstraint` velocity part is `ω1·a1 + r·ω2·a2 = 0` with world
  angular velocities, exact only while the frame holding both axles does not rotate about the gear
  axes; and upstream it passes torque 1:1 and puts no reaction on the axles. The core now uses the
  fork's `GearMeshConstraint` for every mesh: rates relative to each gear's frame, torque × ratio,
  the reaction on the frames.
- *(Superseded.)* **Jolt 1.1.0 gear constraint diverges for `r < 1` or negative `r`**: that was the
  ratio bug (the fork's `GearConstraint` takes any ratio); the pair-ordering workaround is gone.

### 1.2 Mechanism catalogue

Each row: the mechanism, the LEGO parts it needs (none of the new ones is in `parts.json`
today except the worm `4716.dat`), and its physics mapping. "Stock" = buildable with stock
Jolt; "approx" = an approximation with stock Jolt, stated; "custom" = exact form needs a
custom constraint (§8 D1).

| # | Mechanism | Parts (LDraw ids to verify against the library) | Physics mapping |
|---|---|---|---|
| M1 | Spur / bevel gear mesh (exists) | 8/16/24/40T, 12/20T bevel, 36T/28T double bevel, 12T/20T double bevel | Since 2026-10-19 the fork's `GearMeshConstraint` (a tooth contact at the pitch point) on the two gear bodies, with both gears' hinges: exact on any frame, torque × ratio, reaction on the frame. (Was: stock `GearConstraint`.) |
| M2 | Gear train on a turning frame (crane slewing ring with a vertical gear inside the superstructure; any vertical-axis gear on a yawing robot) | as M1 | Built (2026-10-19): the same `GearMeshConstraint` — the rates are relative to the gears' frame, so a turning frame needs nothing extra (this is the §8 `ToothContact`, made in our Jolt fork). |
| M3 | Worm drive, **non-backdrivable** | worm 4716, 24T, worm gear box | `GearMeshConstraint` ratio `1/teeth` (worm = 1 start) at the worm's pitch point (was `GearConstraint`). Self-locking: the worm's hinge gets `mMaxFrictionTorque = holdTorqueNm` (Jolt applies hinge friction only while the motor is **off**), and a worm whose input is not motor-driven is held by that friction; a load on the wheel then cannot turn the worm. When the worm is motor-driven, back-driving would need `teeth × motor torque` — far above any realistic load, so the motor simply stalls first. Stock. Efficiency loss (real worms ~40–60 %) as an optional extra friction on the wheel hinge. |
| M4 | Rack and pinion (forklift mast, steering, plotter axis) | gear racks (1×4 3743 and longer racks), 8T/16T/24T pinion, rack guides (beams with holes, axle connectors as runners) | `SliderConstraint` (rack body in its guide; a rack in a beam's slot is a new connector kind `rack-slot`) + `RackAndPinionConstraint` (`ratio` m/rad = pitch radius in m). Stock — the core must create it (today ignored). Limits from the rack length (end stops). |
| M5 | Linear actuator (old 2790 / new 61927, 92693 mini) — **as built for the 92693 mini: see "Excavator as built" below** | LA housing, piston | Two bodies (housing, piston) + `SliderConstraint` with limits = stroke; input axle hinge + `RackAndPinionConstraint` with ratio = screw lead / 2π; self-locking as M3 via slider `mMaxFrictionForce`. The real LA's **end-of-stroke slip clutch**: approx = disable the rack-pinion (`SetEnabled(false)`) while the piston is at a limit and the input pushes outward, re-enable when it reverses (a 1-bit state in the core's checkpoint). **Custom** exact: torque-limited coupling. |
| M6 | Chain / track drive | chain link 3711, tread link 3873, sprockets (gear 8T/16T/24T/40T act as sprockets), track 57518 with sprocket 57519 | Chain between two sprockets on one frame = `GearConstraint` with **positive** ratio `teeth1/teeth2` (same direction). Links are rendered, not simulated. Stock. Tracks on a vehicle (approx): the sprocket and idlers become wheels with tread friction, coupled 1:1 by `chain` couplings, plus a non-colliding visual track. `TrackedVehicleController` is not used: it owns the whole vehicle, and here the compiler owns the bodies. **Chain built 2026-10-20** (kinds/chain.js, editor/chain-path.js; docs/ROBOT-LAB-UX.md §11): a `GearMeshConstraint` like a gear mesh (the contact outside the sprockets), except 1:1 sprockets: the fork's `GearConstraint` with both hinges (it was 27 % off at 16:24); links welded to the sprockets' frame (the view runs them round). **Treads built 2026-10-20**: 57518 round 57519 sprockets; links drawnOnly, each wrapped sprocket gets a wheel collider of the tread's outer radius with tyre grip. |
| M7 | Differential (car, open diff) | differential 28T/24T housing (62821 new, 6573 old), 12T bevel spiders, side gears | Mechanically: carrier hinge on the chassis, two side-gear hinges on the chassis (output half-axles), spider hinges on the carrier, four bevel meshes. The spider–side meshes are on a frame (the carrier) that turns about the side-gear axis — exactly M2's limit; stock Jolt gives the wrong relation. **Custom** (`ToothContact`). Approx (no custom build): a lumped **differential coupling** solved by a JS step listener as `ω_L + ω_R = 2·ω_C` (relative to the chassis) with velocity-level impulses each step: correct kinematics, weaker under load (not inside the solver iterations). Locked diff = `FixedConstraint` carrier–side gear. |
| M8 | Clutch gears and driving ring (shifting gearbox, Schaltgetriebe) | driving ring 6539, driving ring extension, driving-ring hub axle, 16T clutch gear 6542, 20T double bevel with clutch, changeover catch 6641, gear shift lever | Clutch gears spin freely on the hub axle: hinge (new connector kind `clutch-bore`). The ring is a body on a **slider** along the hub (new connector kind `ring-hub`) with **detents** (3 positions) as a slider position motor with a low force limit snapping to the nearest detent. A **`selectableCoupling`** per clutch gear: engaged when the ring's slider position is within ±0.6 mm of that gear's engage position; engaged = the gear's hinge to the hub axle is locked (hinge motor velocity 0, torque limit = `couplingTorqueNm`, ~0.5 N·m) — disengaged = motor off, free. The coupling state machine runs in the core per step and is saved in the checkpoint. Tooth alignment (the ring engages only at 4 angular positions) is modelled as: engagement waits until the relative angle is within ±10° of a multiple of 90°. Stock. |
| M9 | Turntable (crane slewing, excavator upper) — **as built (28T 99010/99009, 60T 18938/18939): see "Excavator as built"** | turntable 28T old (2856/2855), 56T large turntable (48452 / 18938+18939), small 24T | Two halves = a hinge (new connector kind `turntable-ring` pair, axis through the centre); the outer half's teeth are a `gear` of type `spur` (or `ring`) with its tooth count, meshing with a worm or a pinion (M1/M3). Stock. Bearing friction as hinge `mMaxFrictionTorque`. |
| M10 | Winch / rope / pulley (crane hoist) | string with end studs (several lengths), winch drum (a wedge belt wheel or a dedicated drum), hook, pulley wheels | Rope = **unilateral length constraint** `Σ|segments| + r_drum·θ_drum ≤ L0` through sheave points on bodies. Jolt's `PulleyConstraint` has world-**fixed** sheave points and no drum term, so it fits only a crane whose boom does not move. **Approx (stock, recommended for v1)**: `DistanceConstraint` from the hook body to the last sheave point (min 0 — slack allowed — max = current rope length), with `SetDistance` updated every step from the drum angle; the measured rope tension (`GetTotalLambdaPosition`/dt) is applied back to the drum as a torque `T·r` on the next step (one-step explicit coupling; stable because hoists are worm- or gear-reduced). Multi-segment ropes over boom-tip sheaves: rope length is split at the sheaves the compiler found, only the last segment is a real constraint, the others' lengths are geometric (they change when the boom luffs, and that change is added to `L`). **Custom** exact: a `Rope` constraint over moving sheaves. Soft-body rods: not for v1 (cost, and SaveState of soft bodies is unmeasured here). **Built 2026-10-20 as the v1 approximation** (kinds/rope.js, physics/rope.js; docs/ROBOT-LAB-UX.md §15): the model's `ropes` [drum, sheave…, hook]; last segment a DistanceConstraint with SetDistance each step from the drum angle and the measured other segments; tension back on the drum as T·r. |
| M11 | Rubber band | rubber bands (several sizes), as return springs and belt drives | Spring: `DistanceConstraint` min 0, max = rest length, `mLimitsSpringSettings` with the band's stiffness (pulls only). Belt drive over pulleys = `GearConstraint` ratio `r1/r2`, positive, with slip approximated by a lower velocity-step count. Stock. **Built 2026-10-20** (kinds/belt.js, editor/belt-path.js; docs/ROBOT-LAB-UX.md §12): the model's `belts`; a band round pulleys in one frame is a 'band' coupling (the chain's GearConstraint with 4 velocity steps), round two bodies a 'spring' (DistanceConstraint 0..d₀, soft beyond, 4k). |
| M12 | Pneumatics | pump (small 2797 / large 19475), cylinder (small 4692, large 2793/47224), switch/valve 4694, tank 75974, hoses, T-pieces, PF/Control+ compressor | Not a Jolt problem. A **lumped-pressure network** module (`fluid/`): nodes = hose-connected volumes with pressure state; valves switch connectivity (3 positions, a hinge with detents read like a sensor); pumps add air mass per stroke (pump = slider with a return spring, stroke volume); cylinder force = (p_A − p_B)·area applied as the cylinder **slider motor**: velocity mode, target ±large, force limits from the pressures, so Jolt does the dynamics and the end stops. Network state stepped once per physics step, saved in the checkpoint. Stock + module. **v1 built 2026-10-20** (kinds/pneumatic.js, UX §16): the 1 x 11 cylinder u9145c01 + 21828c01 ('pneu-bore' / 'pneu-rod' → a slider limited to its 120 LDU stroke), the valve 19474-f1 ('valve-lever': an axle in its pivot is a hinge whose angle is the 3-position state), `air-port`s, and the model's `hoses`. An ideal supply: the open outlet drives the slider motor at a flow speed with force p·A; shut holds. **v2 2026-10-20** (physics/air.js): the lumped network: ports joined by hoses, T-pieces (4697b) and tanks (75974, 37 cm³) hold n = p·V; a cylinder's stroke takes (p + p_atm)·A·L, its force is the network's p·A; a pump (2943bc01 + 2944c02, a sprung slider) adds p_atm·A per metre pushed in and feels p·A back; state in the checkpoint, pressures in the worker's poses and the readout. Still out: compressible air in the cylinder, venting, the PF/Control+ compressor. |
| M13 | Sliding joints (fork carriage, plotter carriage, telescopic boom) | beams on axles, axle connectors sliding on axles (frictionless), 6538 sliding on 3L axles | Axle in a **round** hole today is a hinge; a part that slides **and** turns on an axle needs a hinge+slider = Jolt `SixDOF` with rotation-about-axis and translation-along-axis free (new joint kind `cylindrical`). Stock. Axial friction and end stops from the axle's length (both connectors' extents are already in `PartMeta`). |
| M14 | Limit switch / touch sensor | RCX touch 879, NXT/EV3 touch, SPIKE force, Technic Control touch sensor | Contact-based, not a raycast: `ContactListenerJS` collects contact impulses on the plunger collider (a separate small body on a slider with a spring, so it really travels), pressed = plunger travel > threshold. Requires dynamic–dynamic collisions between plunger and robot parts (`GroupFilterTable`). Stock. |
| M15 | Pen and paper (plotter) | plotter pen holder (any Technic pen clip; the 1990 set used a felt pen in a holder), paper sheet | Pen = `MarkerDevice` (a point on a body + a "down" condition: tip within 0.4 mm of the paper surface, or a pen-lift slider at its lower limit). Each physics step with the pen down appends the tip's position in the **paper's frame** to a polyline (`world/paper.js`): the paper is a world object (static sheet, or a body moved by feed rollers). Rendered as a texture; read by the acceptance test as vectors. Stock (no physics beyond poses). **Built 2026-10-20** (view/pen-layer.js): any part marked `pen` (properties "Draws on the floor"; `0 !BW PEN`) draws its track wherever the lowest point of its colliders is within 1.2 mm of the floor (a rolling ball's tip under its centre); the strokes are the Robot Lab API's `drawing()` (cm). The floor is the paper; a moving paper sheet is not built. |
| M16 | Steering (Ackermann, towball links) | steering arms, towball 2736 + ball sockets (already have `ball`/`ballsocket`), rack | Rack-and-pinion (M4) + ball joints (exists) + hinges. Stock. |
| M17 | Shock absorbers / springs | shock absorbers 6.5L and 9.5L | Slider with limit spring (stiffness + damping). Stock. **Built 2026-10-20** (kinds/shock.js): the 9L shock absorber's cylinder 2909 and rod 2910 ('shock-bore' / 'shock-rod' → a slider), the stroke 40 LDU as the slider's limits, and a spring (150 N/m, damped) as the slider's position motor towards full extension (jolt-core; `joint.spring`). Test: a weight sinks mg/k, a heavy one bottoms out. The spring's own formed part (u9409-f1/f2) is not drawn. |
| M18 | Ratchet / one-way (crane pawl) | pawl on a gear | Hinge limit on a pawl body + contact; or a `oneWay` coupling flag on a hinge (motor locks one direction). Stock approx. |

### 1.3 Target machines

Each target lists the mechanisms it needs (§1.2 numbers), the hub/motor it is designed
around in the first form, and what makes it hard.

**T1 Crane (Kran) — tower or mobile, with slewing, luffing and hoist.**
Mechanisms: M9 turntable (slewing, driven by a worm, M3), M3 worm hoist with M10 rope and
hook, luffing by M5 linear actuator or a second winch, M2 if the slewing drive has vertical
gears on the superstructure (avoid in the first model: put the slewing motor on the base).
Loads: a 50 g weight with a hook loop (world `load`, §5.5); collision hook–load needs
dynamic–dynamic contact (M14 prerequisite).
Hard: rope over a moving boom tip (M10 approx), sway (the hook body on a rope swings: real,
and it is the fun part), worm self-locking holding the load when the motor stops.
*As built (2026-10-20, `crane.ldr`, `scripts/gen-crane-model.mjs`):* slewing and luffing, no hoist yet.
A SPIKE hub on the floor carries the Excavator's 28T turntable (8T on motor A, run at 10 % speed: a
direct 8:28 slew tips a loaded upper at full power) and posts; a 15L boom is luffed by a small linear
actuator (motor B, 1:1:1 to the spindle; the screw self-locks, so the boom holds with B stopped: 0.01 mm
of sag in 1 s); a hook (5L link + Technic brick 1 x 4) hangs on a frictionless pin at the tip. The
winch waits for ropes (M10, PR #1123): a drum on the upper and a rope over the tip then replace the
fixed link. The luffing range is the actuator's travel (120–180 LDU, the slider's limits −8/+16 mm from
the build: the boom from about 4° to past 70°); past an end the actuator's own slip clutch (the screw
coupling's 60 N) lets motor B turn on while the boom stays, as on the real model (physics/screw.js). The
end stops of lane/robot-lab-flex4 deliberately leave linear actuators out (they walk gears, chains, bands,
racks and shift forks only), so they do not stop motor B here.
`test/bw-sim-crane.test.mjs`.

**T2 Shifting gearbox (Schaltgetriebe) — 2-speed then 4-speed, as on the 8448/8880 cars.**
Mechanisms: M8 driving ring + clutch gears, M1 spur pairs, shift via changeover catch or a
servo/motor turning a shift drum (rack M4 or cam). Fixed frame (bench-clamped), so gears
are exact.
Hard: tooth alignment on engagement, the in-between neutral, and making the ratio
measurable: the acceptance test reads input and output encoders.

**T3 Excavator (Bagger).** Mechanisms: M9 turntable upper, M6 tracks (approx), boom/stick/
bucket on M5 linear actuators or M12 pneumatic cylinders, M2 if drive gears are vertical on
the upper. Load: a granular pile is out of scope; "dig" = push a box load / lift a bucket of
three 1×1 bricks (rigid loads).
Hard: tracks (approximated), many actuators (Control+ 42100 Liebherr has 7 motors across two
hubs: multi-hub, §5.1).

**T4 Forklift (Gabelstapler).** Mechanisms: M13 fork carriage on a mast (slider), M4 rack or
M10 chain/rope lift (two classic variants), M16 rear-axle steering, drive motors. Load: a
pallet (world `load`, §5.5) with fork pockets; fork–pallet contact needs dynamic–dynamic
collisions.
Hard: the load sits on the forks by friction only; contact stability at mm scale (the
speculative-distance lesson of S1, `jolt-core.js:135–141`).

**T5 The 1990 plotter.** The owner names "the 1990 LEGO Technic/Control set". The Technic
Control line of that time (Interface A 9750 with the Control I/II sets, and the 8094 Control
Center of 1990, whose own controller drives three motor outputs with record/playback) had a
pen plotter among its models. *Which* plotter (paper-feed rollers + one carriage axis, or a
flat XY table) is an owner question (§8 D7); the design supports both: M4 or friction-roller
paper feed, M13 carriage, a pen lift (small motor or solenoid-like M17 with a cam), M15 pen
and paper, and touch sensors (M14) as home switches. Hubs: the Technic Control interface
(9750 profile, §2) and, as the modern equivalent, SPIKE Prime.
Hard: 1 mm accuracy needs backlash-free gears (we have none modelled: good) and a feed that
does not slip (friction rollers are the risk; the XY-table variant is exact).

**T6 Differential car** (classic Technic 8860-style chassis or SPIKE-sized): M7 diff, M16
steering, M1, M17 suspension. Drives on the mats. Hard: the diff is the custom-constraint
case.

**T7 Pneumatic arm / press** (8868/8862 lineage): M12 pump-valve-cylinder, M1, manual pump
or compressor motor. Hard: the pressure model's tuning against the real feel (time to raise
the arm, holding when the valve is centred).

**T8 Ball-sorting / conveyor (WeDo/Boost classroom staple):** M6 belt over pulleys (M11),
colour sensor, small loads in numbers (performance check: 20 balls).

**T9 Robot arm with gripper (8094 Control Center's main model; SPIKE/RI arm)**: M9 base,
M3 worms, M1, a gripper on M4 or a cam; sensors as limit switches (M14).

### 1.4 Parts that must be added

Grouped, with the connector kinds they need (§5.3). None is in `parts.json` today except
4716 (whose mesh pair is refused, `mech/gears.js:221`).

- Gears and transmission: rack 1×4/1×7/1×10, worm + worm box, 16T clutch, 12/20T double
  bevel (with/without clutch), 36T double bevel, 28T old diff + 24T diff housing + new diff,
  driving ring + extension, driving-ring hub axle, changeover catch, turntables (2856/48452/
  new large), knob wheel, gear shift lever, universal joint (two hinges or a `SwingTwist`).
- Linear motion: linear actuators (old, new, mini), shock absorbers, axle connectors that
  slide.
- Ropes and springs: string with studs (3 lengths), hook, winch drum, pulleys, rubber bands
  (4 sizes).
- Pneumatics: small/large pump, small/large cylinder, switch, tank, T-piece, hose (as a
  connector-to-connector *link* item, not a part with geometry).
- Chain/tracks: chain link, tread link, sprocket wheel.
- Electronics by hub family (§2): hubs, motors, sensors, lamps, cables as *links*.
- World objects (not parts): pallet, hook load, paper sheet, balls, boxes (§5.5).

---

## 2. Hub inventory

Facts about the real hardware; then what the repo has. Numbers marked **~** are approximate
public figures (to be re-sourced, §0). "Smart" = the device reports identity and an encoder.

### 2.1 Hardware

The Technic Control rows (Interface A/B, 8094) and the pre-2000 dates are from general
knowledge, not from anything in the repo; they need the same sourcing as the device numbers
before a profile is written (§8 D6, D7).

| Family (year) | Ports | Port kinds and electrical | Typical devices (with ~specs) |
|---|---|---|---|
| **Technic Control Interface A** (9750, mid-1980s; Control I/II educational sets) | 6 outputs (0–5, usable as 3 bidirectional motor pairs) + 2 inputs (6, 7) | Outputs: on/off 4.5 V (later 9 V) per line, a motor is wired across two lines for direction; inputs: binary (touch, optosensor). No speed control except software PWM. Host: Apple II / IBM PC / BBC via a parallel card, polled by host software (Logo). | 4.5 V Technic motor (~6216m), touch sensor, optosensor with a striped wheel (crude encoder, counts per stripe), lamps |
| **Technic Control Center** (8094, 1990) | 3 motor outputs (A, B, C) | Self-contained controller with keypad, record/playback; no external sensors on the stock unit | 9 V motors (~2838: fast, ungeared, ~4000 rpm no-load, ~0.85 N·cm stall) |
| **Control Lab Interface B** (9751, ~1993) | 8 outputs (A–H) + 8 inputs (1–8) | Outputs: 9 V with 8 power levels; inputs 1–4 passive, 5–8 active (powered sensor, e.g. light, angle sensor with 16 counts/rev). Serial host link | 9 V motors, touch, light, angle (rotation), temperature, lamps, sound element |
| **CyberMaster** (8482, 1998) | 2 internal motors with tacho, 1 external output, 3 inputs | Like RCX inputs; IR/RF tower | built-in motors, touch |
| **RCX** (1.0/1.5/2.0, 1998–2001) | 3 outputs A, B, C; 3 inputs 1, 2, 3 | Outputs: 9 V, 8 power levels (PWM), float/brake/fwd/rev. Inputs: 10-bit ADC; passive (touch, temperature) or active (light, rotation — powered with gaps in which the ADC samples). Rotation sensor: 16 counts/rev, quadrature from the analog level | 71427 motor (~360 rpm no-load, ~6 N·cm stall), 43362 (~similar), micromotor; touch 879, light 9758, rotation 2977, temperature |
| **Scout** (9735, 1999) | 2 outputs A, B; 2 touch inputs + built-in light sensor | as RCX outputs; sensors fixed function; VLL output to Micro Scout | motors as RCX |
| **NXT** (2006) | 3 outputs A, B, C; 4 inputs 1–4 | Outputs: 9 V PWM + 2 tacho lines (quadrature, 1°). Inputs: analog (touch, light with LED, sound) and digital I²C (ultrasonic, compass, 3rd party); RCX sensors via converter cable | NXT motor (~170 rpm no-load at 9 V, ~50 N·cm stall, 1° encoder), touch, light, sound, ultrasonic (0–255 cm) |
| **EV3** (2013) | 4 outputs A–D; 4 inputs 1–4 | Outputs: PWM + tacho + auto-ID pins (large/medium/NXT motor identified). Inputs: UART sensors (self-identifying: colour, IR, ultrasonic, gyro), analog (touch), NXT I²C/analog | Large (~160–175 rpm, ~40 N·cm stall), Medium (~240–260 rpm, ~12 N·cm stall), both 1° encoders; colour, ultrasonic, IR, gyro, touch |
| **WeDo 1.0** (9580/9581 USB hub, 2009) | 2 ports A, B | Each port: a PF-style motor (PWM, no encoder) or a sensor identified by a resistor ID; host-polled over USB HID | WeDo motor (~PF M), tilt sensor (4 directions), distance sensor (IR, short range) |
| **Power Functions** (2007, IR receiver 8884) | 2 outputs (red/blue) per receiver, 4 channels | 9 V, 7 PWM speed steps; no feedback | M 8883 (~405 rpm, ~3.6 N·cm), L 88003 (~390 rpm, ~6.5 N·cm), XL 8882 (~220 rpm, ~14.5 N·cm), servo 88004 (±90°, 15 positions), lights, linear actuator via motor |
| **WeDo 2.0** (45300 Smarthub, 2016) | 2 ports A, B (LPF2) + internal RGB LED, piezo | LPF2: device IDs, modes, notifications over BLE (LWP3 v2-like) | WeDo medium motor (id 1, no encoder), tilt (34), motion (35) |
| **Boost Move Hub** (17101, 2017) | A, B internal motors (with encoders), C, D external; internal tilt | LPF2/LWP3 | internal motor (id 39), external interactive motor (id 38, 1° encoder), colour & distance (37), tilt (40) |
| **Powered Up City hub** (88009) / **Technic hub / Control+** (88012) | 2 ports A, B / 4 ports A–D + internal IMU | LPF2/LWP3 | train motor (2), L (46), XL (47) Control+ motors with encoders; Technic medium/large angular (75/76); lights (8); colour & distance (37) |
| **SPIKE Essential** (45609 small hub) | 2 ports A, B; internal IMU, RGB light | LPF2 + SPIKE 3 firmware | small angular motor (65, ~660 °/s, 1°), colour (61), 3×3 light matrix (64) |
| **SPIKE Prime** (45601, 2019) / **Robot Inventor** (51515, 2020; same electronics) | 6 ports A–F; internal IMU, 5×5 matrix, speaker, buttons | LPF2, absolute encoders on angular motors | medium angular (48; RI uses the dark version 75), large angular (49), small (65); colour (61), distance (62), force (63) — `devices/catalog.js` has 48 at 0.104 N·m / 176 rpm and 49 at 0.264 N·m / 168 rpm at the hub's 7.2 V (Philo's measurements, D6; R2 had 0.18 / 0.38 N·m), controller limits 1110 / 1050 °/s |

### 2.2 In the repo

Summary (details and file paths in §3.1):

| Family | Programming routes in the repo | Virtual hub state | Missing for the Robot Lab |
|---|---|---|---|
| SPIKE Prime / Robot Inventor | Scratch `spikeprime` (BLE/classic peripherals), `DEVICE SPIKE` pseudocode, SPIKE 3 Python conversion, Renode firmware program / NuttX / MicroPython (desktop), USB `hub.port` (hardware) | **yes**: `VirtualSpikeHubState` (`virtual-hub/spike-hub-state.js`, six ports, LPF2 ids in `classicPorts`, controller `spike-sim/independent-backend.js`) | only the Renode routes (lockstep, external shaft) and the Python runner's session lookup |
| SPIKE Essential | none (device ids only) | no | profile, 2-port hub state (reuse SPIKE state with `ports: ['A','B']`), small motor model |
| EV3 | `ev3comprehensive` (direct commands, LMS→RBF), `DEVICE EV3`, MakeCode EV3 import, ev3dev, stock ext; Renode AM1808 smoke model (ADC/buttons) | no | an EV3 VM (or Renode firmware), profile, devices |
| NXT | `legonxt` → hosted NXC compile → `.rxe` → real brick | no | an `.rxe` VM, profile, devices |
| RCX / Scout / CyberMaster | `legorcx` → NQC (**browser WASM**) → `.rcx` → IR tower | no (no emulator, no ROM) | an RCX bytecode VM (clean-room), profile, devices |
| Boost / Powered Up / Control+ / WeDo 2 | `legoboostunified`, `legopoweredup`, `wedo2unified`, stock exts — all to real BLE | no (SPIKE state stores Boost ids only) | LWP3 peripheral + state + controller |
| WeDo 1.0, Power Functions IR, Technic Control (Interface A/B, Control Lab, 8094) | none | no | profiles, devices, an L1 block set |

---

## 3. Execution routes and the port boundary

(§3.1 is the inventory of what exists; §3.2–§3.6 the design.)

### 3.1 The routes that exist (inventory, 2026-10-17)

Abbreviations: `G` = `overlay/scratch-gui/src`, `X` = `overlay/scratch-vm/src/extensions/crispstrobe`
(each `X/<name>/index.js` wraps an extension source string loaded by `X/adapter.js`),
`T` = `apps/tauri/src-tauri/src`. "Level" is where the route's I/O boundary sits today.
The repo's own status matrix is `docs/LEGO-ARCHITECTURE.md:84–93`; this table agrees with it.

| Family | Route | Entry | Executes where | Level today | Time model | Virtual hub? | Reaches the Robot Lab? |
|---|---|---|---|---|---|---|---|
| SPIKE Prime / RI | Scratch extension `spikeprime` (+ legacy ids migrated by `G/lib/spike-legacy-migration.js`) | `X/spikeprime/index.js` → `G/lib/virtual-hub/web-bluetooth-shim.js` → `spike-prime-peripheral.js` (SPIKE 3 GATT; tunnel Python decoded by the pattern matcher `spike-hub-commands.js:220`) or `spike-classic-scratch-link.js` (2.x JSON-RPC) | main-thread VM | **high-level** motor/sensor calls on `VirtualSpikeHubState` | VM steps; motors advance only in `stepMotors` | yes | **yes — the only route** (`sim-lab-pane.jsx:560–592` connects `spikeprime` and presses the flag) |
| SPIKE | `DEVICE SPIKE` pseudocode → spikeprime blocks | sb3-creator (`G/lib/sb3-creator*.js`), `G/lib/spike-runtime-ops.js` | converted in the browser, then as above | high-level | as above | yes | yes (the shipped examples are `.bw` `DEVICE SPIKE`) |
| SPIKE | SPIKE App 3 Python → blocks (Python is converted, not executed) | `G/lib/sb3-creator-spike3.js`, `G/lib/spike3-python-run.js` | VM | high-level | `VmStepClock` + 20 ms `setInterval` calling `arena.tick` or `hub.stepMotors` (`spike3-python-run.js:87–95`) | yes | indirectly: it looks for `__bwSpikeArena`, not `__bwSimLab` (`:91–95`) |
| SPIKE | "firmware program" (bounded Scratch subset → four-integer instruction ABI) | `G/lib/spike-arena/firmware-program.js`, `G/lib/spike-nuttx/upload-protocol.js`, `T/arena_inputs.rs:121–` (closed ABI) | desktop only: ARM guest in **Renode** (`T/renode_supervisor.rs`) | **peripheral level** inside Renode (LPF2 UART electrical port model, out of repo: `LegoLpf2ElectricalPort.cs`, cited `docs/SPIKE-STATUS-AND-LANES.md:502`, which samples the H-bridge drive); the GUI sees `brick-state/v1` frames (position, `speedDps`, `demandDirection`, `stalled`) | Renode free-runs (`emulation RunFor`); GUI polls `state.read` every 50 ms (`renode-arena-session.js:292–312`) and writes `arena.inputs.write {sensors, loads[percent], hub?}` | the arena's hub state with `clockOwner = 'renode'`; encoders written by `writeObservedMotor` (`virtual-hub/motor-telemetry.js:7`) | no — arena only (`renode-arena-bridge.js:88–95` moves the arena's wheels kinematically to follow the guest's encoders) |
| SPIKE | full NuttX firmware + embedded MicroPython | `SPIKE-NUTTX.md`, `G/lib/spike-nuttx/*`, `T/renode_supervisor.rs:598–620` | Renode STM32F413 | peripheral level (as above) | as above | as above | no |
| SPIKE | upstream MicroPython `LEGO_HUB_NO6` image (user-supplied) | `G/lib/spike-micropython/raw-repl.js`, `T/spike_micropython_uart.rs`, `G/lib/spike-arena/prime-hub-io.js` | Renode, raw REPL over a modelled UART | interpreter on the emulated MCU, I/O via `prime-hub-io/v1` | as above | as above | no |
| SPIKE | `DEVICE SPIKE` lines → `hub.port` MicroPython over USB | `G/lib/spike-usb-stream.js` | real hub | firmware API | wall clock | no | no (hardware) |
| EV3 | `ev3comprehensive` (direct commands; LMS→RBF compile) | `X/ev3comprehensive/index.js` | VM → real brick (Web Serial, Scratch Link, WS bridge, local HTTP) | direct-command bytecode | wall clock | no | no |
| EV3 | `DEVICE EV3` pseudocode, MakeCode EV3 import | `G/lib/ev3Dialect.js` (48 of 74 opcodes), `G/lib/bw-makecode/ev3-translate.js` | converts to `ev3comprehensive` blocks | — | — | no ("no virtual EV3", `ev3-translate.js:9–10`) | no |
| EV3 | ev3dev (`scratchtoev3` → ev3dev2 Python), stock `scratch3_ev3` | `X/ev3dev/index.js`, `packages/scratch-vm/src/extensions/scratch3_ev3` | real brick | Python API / high-level | — | no | no |
| EV3 | Renode AM1808 smoke model | `T/renode_supervisor.rs:633–664, 1211–1240`, `T/renode_brick_state.rs`, ops `renode.ev3.*` (`overlay/scratch-vm/src/extension-support/native-renode-capability.js:23–35`) | desktop Renode | register level: `ev3.analog.set-channel` (ADC 0–1023), buttons | Renode `RunFor` | ADC + buttons only | no consumer |
| NXT | `legonxt` → NXC → **hosted** compile to `.rxe` → upload | `X/legonxt/index.js` (`https://lego-compiler.vercel.app/compile`) | remote compiler; real brick | firmware bytecode on the brick | — | no VM, no emulator | no |
| RCX / CyberMaster / Scout (/Spy/Swan) | `legorcx` blocks → NQC → `.rcx` → IR tower | `X/legorcx/index.js`; `G/lib/nqc-runtime-hook.js` (`runtime.nqcCompile`, contract `(source, target) → {ok, bytes, log}`); `G/lib/nqc-wasm/compiler.js` (NQC in **browser WASM**, `NQC_TARGETS` `:39`); `G/lib/rcx-download-hook.js` (`runtime.rcxDownload`); `G/lib/rcx/rcx-protocol.js`, `rcx-serial.js` | compiler in the browser (hosted fallback); program runs on a real brick only | standard-firmware bytecode | — | **no**: no H8/300 emulator, no ROM model; `docs/LEGO-ARCHITECTURE.md:261–263`: emulation "nothing started", needs a user-supplied ROM | no |
| Boost / Powered Up / Control+ / WeDo 2 | `legoboostunified`, `legopoweredup` (hub types incl. Move Hub, Technic, WeDo2), `wedo2unified`; stock `scratch3_boost`, `scratch3_wedo2` | `X/legoboostunified/`, `X/legopoweredup/`, `X/wedo2unified/` | VM → real hub over BLE (through the shim, which passes to real Bluetooth: no LWP3 peripheral is registered) | LWP3 messages | — | no ("no shared LPF2 virtual transport/state", `LEGO-ARCHITECTURE.md:92`); `VirtualSpikeHubState` stores Boost device ids only (`spike-hub-state.js:109–111`) | no |
| SPIKE Essential | none (device ids only: 65, 0x40/0x41 in `legopoweredup`) | — | — | — | — | no | no |
| WeDo 1.0, Technic Control (Interface A/B, Control Lab, 8094), Power Functions IR | **none** | — | — | — | — | no | no |

Non-LEGO emulators exist (`G/lib/emu8051/`, `G/lib/labwired-engine.js`, `G/lib/bw-machines/`,
`G/lib/pico-*`) but none has a LEGO port model. In-repo `services/` has no LEGO compiler.

**Two consumers of one hub state already exist** and do different things with time: the
Robot Lab (Jolt, 5 ms fixed steps, `requestAnimationFrame` wall-clock dt capped at
`MAX_FRAME_MS = 50`, `sim-lab-pane.jsx:140, 539–550`) and the SPIKE arena (kinematic,
`STEP_MS = 5` in `arena-hub-bridge.js:25`, `VmStepClock` advancing a nominal 1000/30 ms per
VM step, `arena-clock.js:52`). The Renode routes take the clock away from both
(`clockOwner = 'renode'`) and make the **guest's** motor model authoritative: the arena
follows the guest's encoders. For the Robot Lab that direction is wrong (physics must own
the shaft), which is the central change for emulated routes (§3.5).

### 3.2 The three levels a route can meet the hub at

| Level | Who simulates the hub's motor controller | What crosses to physics | Routes |
|---|---|---|---|
| **L1 high-level calls** (`motor.run_for_degrees`, `OnFwd(OUT_A)`, LWP3 `StartSpeed`) | a JS **controller model** of that hub's firmware (SPIKE: `IndependentSpikeBackend`; to write: LWP3, NXT, EV3, RCX output semantics) | `servo` drives (SPIKE today) or `pwm` drives (RCX power levels, PF steps) | Scratch extensions through protocol peripherals, converted Python, pseudocode |
| **L2 firmware API / bytecode VM** (RCX standard-firmware opcodes, NXT `.rxe`, EV3 LMS, SPIKE `hub.port` MicroPython) | the VM implements the firmware's output/input semantics itself (it *is* the firmware model) | `pwm` drives (RCX/NXT/EV3 firmwares regulate in software around PWM) | NQC → `.rcx` in an RCX VM; NXC → `.rxe` in an NXT VM; LMS in an EV3 VM |
| **L3 peripheral / register** (STM32 timers + H-bridge, LPF2 UART, AM1808 ADC) | the real firmware binary in a CPU emulator (Renode today) | `pwm` duty read from the modelled H-bridge; encoder counts and sensor UART frames written into the modelled devices | SPIKE NuttX / MicroPython / firmware program in Renode; EV3 in Renode later |

**The boundary is the same at all three levels: a port carrying a drive one way and
readings the other** (`VirtualHub`, §5.1). What differs is only which side runs the
controller. The rule that keeps physics honest: **the shaft angle is always physics'**.
A route never integrates motor positions itself while the Robot Lab runs; at L1 the JS
controller reads the encoder physics wrote (today's `hub-bridge.js:138–143`), at L2/L3 the
VM or the emulated device reads it the same way.

### 3.3 Time: one owner, step-synchronous clients

**Owner.** The physics clock owns simulated time, as today (`hub-bridge.js:12–28`, "one
clock"). Its quantum is the physics step `STEP_MS = 5`. Every route is a client that is
advanced *to* a physics step boundary, never past it:

```
for each 5 ms step k (t_k = k·5 ms):
   for each hub h:  h.advanceTo(t_k)        // the route runs everything due before t_k
   drives = ∪ h.readDrives()                // constant during the step (zero-order hold)
   physics.step(5 ms)                       // actuators, couplings, fluid, Jolt
   readings = probes(state at t_k+1)
   for each hub h:  h.writeReadings(readings of h's ports)
```

**What `advanceTo` means per route kind.**

| Route kind | `advanceTo(t)` | Reads its inputs | Determinism |
|---|---|---|---|
| L1 JS controller (SPIKE today) | `stepMotors(5)` — the controller's internal 1 ms ticks (`independent-backend.js:398`) | the encoder of the previous step | deterministic (pure JS) |
| L1 Scratch VM itself | **not** stepped by physics: the VM runs on its own frame loop and talks to the controller synchronously; its commands land in the controller state between physics batches. This is exactly today's behaviour and why the worker protocol redoes a batch when the controller state changed (SIM-LAB-PLAN §4.9 step 5). | readings of the last applied step | deterministic *given* the VM's command timing; the VM's timing is wall-clock-driven (as today) — test with the existing lockstep harness (`session.idle()`) |
| L2 bytecode VM (RCX/NXT/EV3) | run the VM's instruction budget for 5 ms of firmware time: `cycles = ⌊t·rate⌋ − executed` (an RCX VM at its documented ~1 ms task scheduler slice runs 5 slices) | readings of the previous step; its own timers are derived from `t` | deterministic: the VM is pure JS and stepped only here |
| L3 CPU emulator (Renode) | `emulation RunFor "0.005"` (virtual time), then read the H-bridge duty from the port model | encoder counts and sensor frames written into the device models before `RunFor` | deterministic in Renode virtual time; **requires lockstep** instead of today's free-run + 50 ms poll (§3.5) |

**Running ahead or behind.** A client never runs ahead: `advanceTo` is the only way its time
moves, and the target is the physics step. If a client is *slow* (an emulator that cannot do
5 ms of virtual time in 5 ms of wall time), physics waits for it — simulated time slows
down, nothing is dropped, exactly like today's worker batches ("simulated time simply
waits"). The pane's frame clamp (`MAX_FRAME_MS = 50`) and the worker's `MAX_BATCH_STEPS = 20`
(`sim-session.js:96`) then drop wall time, not simulated time. A real-time factor is shown in
the pane when it falls below 0.9.

**Reading latency is one step for every route.** A drive commanded in step k sees readings of
step k−1, as today. That is physically right (a real controller samples, then outputs) and
uniform, so the same program gives the same physics whatever the route — with one documented
exception: a route whose real hardware samples slower (RCX inputs ~3 ms, LPF2 modes 10–100 ms)
gets its device model's `periodMs` hold on top (§5.2), which is fidelity, not latency.

### 3.4 The worker protocol for any route

Today (SIM-LAB-PLAN §4.9): the SPIKE controller stays on the main thread, the worker steps a
**mirror** imported from `exportMotorState(hub)`, the main thread **replays** the real
controller over the returned frames and checks `diverged == 0`; a changed controller state
while a batch is in flight → `redo` from a Jolt checkpoint.

Generalised, with no change for SPIKE:

1. A route is either **main-resident** (it must stay where the VM is: the Scratch VM's L1
   controllers) or **worker-resident** (it has no reason to be on the main thread: L2 VMs,
   and the L3 lockstep driver's state machine).
2. Main-resident hubs work as today, through their `VirtualHub` adapter: `exportState()`
   replaces `exportMotorState`, `stateKey()` replaces `motorStateKey`, `importState()` into a
   mirror of the same adapter class in the worker. The frames are `PortReading[]` +
   `HubPoseReading` per hub per step; replay calls `advanceTo` + `writeReadings` per frame.
3. Worker-resident hubs run **only** in the worker, inside the step loop. Their state is part
   of the worker's checkpoint (`exportState()` at `checkpoint()`, `importState()` at
   `rollback()`), so a redo caused by a main-resident hub replays them exactly. Their outputs
   to the UI (an RCX LCD, a VM's variables, a "program finished") come back in the frame as
   an opaque per-hub `ui` blob.
4. L3 (Renode) is a separate process: it cannot be checkpointed by Jolt's `SaveState`. Two
   options, owner decision §8 D3: (a) Renode **snapshots** (`Save`/`Load` of the emulation)
   per batch — correct, expensive; (b) the L3 hub is the **only** clock-relevant route in its
   scene and the batch is never redone: the L3 driver runs physics in lockstep with Renode
   one step at a time, the VM-side redo trigger cannot occur because nothing on the main
   thread commands that hub. (b) is what the design assumes; mixing an L3 hub with a
   main-resident hub in one scene is refused with a diagnostic until (a) exists.
5. Physics determinism (bit-identical rollback, measured in
   `test/bw-sim-physics-worker-session.test.mjs`) is preserved because every new piece of
   per-step state registers `save/restore` (§6.4) and all route clients are stepped only
   from the loop.

### 3.5 Per-route plan

| Route | Plan | Level | Where | Slice |
|---|---|---|---|---|
| SPIKE Scratch / pseudocode / converted Python | unchanged behind `SpikeVirtualHub` | L1, servo | main | R1 |
| SPIKE 3 Python runner | teach `spike3-python-run.js:91–95` to find the Robot Lab session (`__bwSimLab`) as it finds the arena, so it never steps motors itself while the Lab owns the clock | L1 | main | R1 |
| LWP3 hubs (Boost, PU, Technic, WeDo 2, SPIKE Essential via LWP3) | an **LWP3 peripheral** registered in the existing shim (`registerVirtualPeripheral`, `web-bluetooth-shim.js:204`), scoped by the traffic `legoboostunified` / `legopoweredup` / `wedo2unified` send (SIM-LAB-PLAN A2's inventory-first rule), over an `Lwp3HubState` with an LWP3 motor controller (`StartSpeed`, `StartSpeedForDegrees`, `GotoAbsolutePosition`, acc/dec profiles, `brake/float/hold` end states) and `LwpVirtualHub` adapter | L1, servo (Boost/Control+/angular) or pwm (WeDo 2 medium motor id 1: no encoder) | main | R8 |
| RCX (and Scout/CyberMaster as NQC targets) | **an RCX standard-firmware bytecode VM in JS**, clean-room from LEGO's published RCX bytecode documentation (the opcodes NQC emits): 10 tasks, 8 subroutines, 32 globals, timers, events (RCX2), outputs with 8 power levels + float/brake/direction, inputs with sensor type/mode (raw/bool/percent/rotation/celsius). `runtime.rcxDownload` gets a virtual target ("Robot Lab RCX") that loads the `.rcx` image the in-browser NQC (`nqc-wasm`) produced into the VM instead of the IR tower. **No ROM, no H8 emulation, no GPL code** (brickEmu is not used). `RcxVirtualHub` exposes outputs A–C (pwm, 8 levels) and inputs 1–3 (passive/active, ADC 0–1023 from device encoders). | L2, pwm | worker | **R5 — the early emulated-route proof** |
| NXT | the same shape: an `.rxe` VM (NXT firmware bytecode, from LEGO's published NXT executable file specification) fed by the existing hosted NXC compile (`X/legonxt`) — network needed; a local NXC/NBC WASM build is an option like nqc-wasm. Outputs A–C with tacho (1°), NXT motor regulation (speed/sync) inside the VM; inputs 1–4 analog + I²C ultrasonic. | L2, pwm | worker | R11 |
| EV3 | `ev3comprehensive`'s direct commands into an **EV3 VM** for the LMS opcodes the extension and the RBF compile use (LEGO's published EV3 firmware developer documentation; clean-room). Outputs A–D, inputs 1–4 with UART sensor modes. Alternative: the Renode AM1808 model (L3) once it boots real firmware. | L2, pwm | worker | R12 |
| SPIKE in Renode (firmware program, NuttX, MicroPython) | **lockstep driver**: the Robot Lab, not a 50 ms poll, drives Renode: per step `arena.inputs.write` gains `encoders` (position from physics) and `RunFor 0.005`; `state.read` gains the per-port **H-bridge duty** the electrical port model already samples. The guest's own motor model must accept an external encoder (an "external shaft" mode in `LegoLpf2ElectricalPort.cs`, out-of-repo `renode-infrastructure-spike-prime`). `SpikeFirmwareVirtualHub` exposes A–F as pwm. Desktop only. | L3, pwm | main (talks to Tauri) | R13 |
| Technic Control Interface A/B, 8094, WeDo 1.0, PF IR | no programming route exists. Add as **profiles + an L1 "Logo-like" block set** later (a small Scratch extension with on/off/direction/power per output and binary/analog inputs: they were host-polled devices, so an L1 model is faithful). | L1, pwm | main | R14 |

### 3.6 What makes the boundary hold

- **No route touches physics objects.** The only types crossing are `PortDrive`,
  `PortReading`, `HubPoseReading` (plain data). A test asserts that `bw-sim/physics/**` and
  `bw-sim/mech/**` import nothing from `virtual-hub/`, `spike-*`, `rcx/` or route modules,
  and that route modules import nothing from `bw-sim/physics/**` (an import-graph test like
  `test/no-dead-overlay-modules.test.mjs`). *Built in R1:*
  `test/bw-sim-hub-boundary-imports.test.mjs` — transitive, worker URLs included; the hub
  side's composition points (`hub-bridge.js`, `sim-worker-protocol.js`, the worker entry
  `physics-worker.js`) therefore live beside `physics/`, not in it.
- **Same model, different routes, same physics.** The acceptance for R5 is a *cross-route*
  check: the same driving base (with the motor/port profile of each hub) driven 50 cm by
  (a) a SPIKE `DEVICE SPIKE` program and (b) an NQC program in the RCX VM ends within the
  tolerance its motors' different speeds predict, and the physics core sees nothing but
  drives.
- **Hub-state authority.** While a session runs, every `VirtualHub` refuses
  self-advancement (today: `clockOwner = 'native'` and `_assertClock`,
  `independent-backend.js:61–69`); the arena's and Renode's paths keep their own owner values,
  and a session refuses to start while another owner holds the hub (diagnostic, not a race).

---

## 4. Gap analysis of today's contracts

Per file, what is SPIKE- or driving-base-specific, and what must be generalised. Line
numbers are at `268c6e118`.

### 4.1 `contracts.js`

| Fact today | Where | Why it blocks the targets | Change |
|---|---|---|---|
| `HUB_PORTS = ['A'..'F']`, used by `validatePartMeta` (hub.ports), `validatePlacedModel` (part.port), `validateCompiledMechanism` (motor.port, sensors[].port) | `:39`, `:248`, `:285`, `:348`, `:379` | RCX ports are `A B C` + `1 2 3`, NXT `A B C` + `1–4`, EV3 `A–D` + `1–4`, Interface A `0–7`, Interface B `A–H` + `1–8`. One namespace of six letters also cannot say *which* hub (multi-hub, T3). | Port ids become strings validated against the **bound hub's `HubProfile`**, not a constant. A port reference is `{hub, port}`; `hub` defaults to the model's only hub. `HUB_PORTS` stays exported as the SPIKE profile's port list for old callers. |
| `CONNECTOR_TYPES` fixed list of 8 | `:37` | no rack, worm, clutch, turntable ring, pneumatic port, rope anchor, sliding bore | replaced by the connector-kind registry (§6.2); the constant stays as the v1 subset. |
| `GEAR_TYPES = spur, bevel, worm, rack` | `:38` | no ring/turntable, sprocket, clutch-gear flag, double-bevel (meshes as spur *and* bevel), differential housing | `gear` becomes a list (`gears[]`: a double bevel is two tooth sets), with `type` from the coupling registry. |
| `SENSOR_KINDS = distance, color, force`; `sensor` is one ray (`origin`, `direction`) | `:40`, `:106` | RCX light (reflected light %, raw ADC), rotation sensor (counts, on an axle — not a ray), touch (contact, not a ray), temperature, gyro, IR seeker, sound, ultrasonic NXT (cm, cone), tilt (WeDo/Boost) | sensors move to `DeviceModel` (§5.2) with a **probe** (ray, cone, contact, axle-angle, body-pose, none) and a device-specific encoder of readings. |
| `motor` = `{output, outputColliders, maxTorqueNm, maxSpeedDegPerSec, deviceId?}`; `deviceId` documented as "48 medium, 49 large" | `:93–98` | electrical model missing (no-load speed vs voltage, stall torque, gearing inside the housing, encoder resolution, PWM levels); `deviceId` is an LPF2 number that RCX/NXT/EV3/PF/Interface-A devices do not have | `motor` keeps the mechanical split (`output`, `outputColliders`: those are part geometry), the numbers move to `device: '<deviceModelId>'` (§5.2, §5.4). |
| `hub` = `{ports}` only | `:99` | no profile id, no port kinds, no internal devices (IMU, lights, internal motors of Boost/CyberMaster) | `hub: {profile: 'spike-prime'}` + internal devices; ports come from the profile. |
| `CompiledMechanism.joints`: hinge, slider, ball; motor only on hinges | `:152–155`, `:340`, `:347` | sliders cannot be driven (LA, pneumatic cylinder), no fixed/cylindrical/swing joints, no limits, no friction, no springs | §5.3 joint kinds with limits/friction/spring; actuation moves out of the joint into `actuators[]`. |
| `gears`: `gear` and `rackAndPinion` only | `:156–157`, `:362–369` | worm (one-way), chain, differential, clutch, rope, pneumatic are couplings too | `couplings[]` with `kind` from the coupling registry; `gears` stays readable as the v1 alias. |
| `sensors[]` with SPIKE kinds | `:159` | as above | `devices[]` bound to `{hub, port}` with probe data. |
| bodies have no collision group; `color` is a SPIKE colour id `0..10` | `:332` | loads, pallets and paper need collisions with robot parts; mats/obstacles reuse SPIKE colour ids | bodies gain `collisionGroup` and `role` (`robot`, `frame`, `ground`, `obstacle`, `load`, `paper`); `color` becomes `surface: {colorRgb, reflectance}` with the SPIKE id derived by the SPIKE device model. |
| `version: 1` everywhere | `:273`, `:316` | needs a migration story | §5.7. |

### 4.2 `mech/` (compiler)

| File | Fact | Gap |
|---|---|---|
| `graph.js:37–47` `edgeKind` | Hard-coded pairs: pin/pinhole (friction→rigid, else hinge), axle/axlehole rigid, axle/pinhole hinge, stud/antistud rigid, ball/socket ball. The editor's snap (`editor/snap.js:9, 225, 334`) imports the same function — good: one rule, but closed. | New kinds (rack in slot → slider, clutch bore → coupling hinge, ring hub → slider, turntable ring → hinge, sliding axle connector → cylindrical) must be **registered**, not added as `if`s. |
| `graph.js:91–146` | A part with `meta.motor` is split into housing and `#out` nodes with an internal hinge; the internal edge carries `motor.port`. | Generalise as **part-internal joints** declared in PartMeta (`internalJoints[]`): motor (hinge), linear actuator (slider), turntable (hinge), shock absorber (slider), pneumatic cylinder (slider), pump (slider), switch (hinge with detents), driving-ring hub. The motor becomes one instance. |
| `graph.js:136–142` | `motor-without-port` from the placed part's `port`. | Port validity checked against the hub profile; a motor on an *input* port (RCX input 1) is a `port-kind-mismatch` diagnostic, not silence. |
| `joints.js:133`, `:169` | The emitted `joint.motor` copies `port`, `maxTorqueNm`, `maxSpeedRadPerSec` and **drops `deviceId`** that `graph.js:139` put on the edge. So `hub-bridge.js:214` (`deviceId ?? MEDIUM_MOTOR`) reports **48 for the large motor 54675 too**, and the SPIKE controller then scales percent speeds with 1110 °/s instead of 1050 (`spike-sim/independent-backend.js:5–12`). No test catches it (`test/bw-sim-sensors.test.mjs` checks only sensor ids). | Fix in slice R0 (a one-line bug, independent of this design): carry `deviceId`, add a test with a large motor. |
| `joints.js:121–186` | Hinge edges between one island pair: collinear → one hinge; non-collinear → lock (weld). | Keep; add: a hinge plus a parallel slider edge between the same pair → `cylindrical`; two slider edges collinear → one slider. |
| `gears.js:161–170`, `:199–270` | Mesh detection for spur/spur and bevel/bevel; worm/rack → `unsupported-gear` warning (`:221`); "common frame" rule; `gear-on-frame` lock; `gear-frames-differ` warning. | Becomes the **coupling inference** pipeline with one detector per coupling kind (§6.3): spur, bevel, worm–wheel, rack–pinion, chain (two sprockets + chain links between them), clutch (gear on clutch bore + driving ring nearby), differential (housing part with internal spiders), rope (string connector anchored to drum). `gear-frames-differ` stays as the M2 diagnostic until the custom constraint exists, then becomes a `ToothContact`. |
| `islands.js:13` | `MOTOR_OUTPUT_MASS_FRACTION = 0.15` fixed for every motor. | per-part `internalJoints[].massFraction` (or per-collider masses). |
| `compile.js:35–78` | Ground: a static 2 × 2 m box under the lowest collider. | World module owns the floor; tables (plotter on a table), raised bench for gearboxes; ground size from the mat. |
| `compile.js:223–277` | Obstacles: static **boxes** only, colour 0..10. | World objects with roles (static obstacle, dynamic load, paper), shapes (box, cylinder, sphere, compound), mass, friction (§5.5). |
| `compile.js:284–302` | Sensors from `meta.sensor` + `pl.port`; sorted by port letter. | Devices from the device registry, bound to `{hub, port}`. |
| `insight.js` | Issue words and run blockers assume one hub ("no hub", "A–F" in `sim-lab-insight-text.js:18–20, 33`). | Text parameterised by the hub profile's port labels. |

### 4.3 `physics/`

| File | Fact | Gap |
|---|---|---|
| `jolt-core.js:107` | `DisableCollision(LAYER_DYNAMIC, LAYER_DYNAMIC)`: no robot part touches another dynamic body. | Forklift–pallet, hook–load, gripper–ball, plunger–robot all need dynamic–dynamic contact. Proposal: dynamic–dynamic **on**, with a `GroupFilterTable` that disables pairs connected by a joint/coupling (and, by default, all robot–robot pairs of one mechanism, which is today's behaviour), and enables robot–load, load–load. Self-collision of robot parts stays off in v2 (S1's whole tuning assumes it). |
| `jolt-core.js:257–311` | Hinges: limits never set; `mMaxFrictionTorque` never set; unmotorised hinges get a ±1e6 N·m motor torque limit. | Joint limits, friction, springs from the joint record. |
| `jolt-core.js:312–328` | Sliders: created with ±1e6 limits, no motor, not in `snapshot()`, not in `posesOf` (`sim-worker-protocol.js:92–96` reads only hinges), no `jointState`. | Slider state (position, velocity), motor, limits, friction, in snapshot and protocol. |
| `jolt-core.js:390–392` | `rackAndPinion` entries are accepted by the validator and not created. | Create `RackAndPinionConstraint` (normalised ratio, `SetConstraints`). |
| `jolt-core.js:443–499` | Motor modes: velocity, position (P-controller in JS, `kp = 10`), coast, brake, hold — on **hinges** only; the hub bridge uses only `velocity` (`hub-bridge.js:128`). Coast is "not modelled" by the bridge (`hub-bridge.js:125`). | Actuator model with two drive levels (servo, pwm/DC-motor) and coast/brake per §5.2; sliders actuated the same way. |
| `jolt-core.js:673–691` | `checkpoint()` saves Jolt state + hinge bookkeeping. | Must also save: slider bookkeeping, coupling state machines (clutch engaged, LA slip, rope lengths), the fluid network, pen polylines (append-only: save the length), device-internal state (DC motor current if modelled, sensor filters). One `SaveState` registry: every module that keeps per-step state registers `save()/restore()` (§6.4). |
| `sim-worker-protocol.js:39`, `:115–116` | The worker imports `VirtualSpikeHubState` directly and builds a SPIKE mirror; `exportMotorState`/`importMotorState` read `backend._controllers`, `classicPorts`, six ports fixed (`:75`). | The mirror becomes "whatever the route's `VirtualHub` implementation exports" through a generic `exportState()/importState()` (§3.4). |
| `physics-host.js` | Message types `load`, `sim-load`, batch. | Grows by: route state blobs, device-reading frames that are not SPIKE-shaped, paper deltas (§6.5). |

### 4.4 `hub-bridge.js`, `sensors.js`

- `hub-bridge.js:41` `PORTS = 'ABCDEF'`; `:48` `MEDIUM_MOTOR = 48`; `:70–75` motors are
  hinges with `motor.port`; `:117–131` the controller is `hubState.stepMotors` and its output
  is `data.motors[i].degPerSec`; `:138–171` the frame is SPIKE-shaped (positions in degrees,
  heading, SPIKE IMU, sensor readings `[port, kind, values]`); `:210–223` `plugMotors` writes
  SPIKE `data.sensors[i] = {kind:'motor', deviceId}`; `:232–248` `applyFrame` writes SPIKE
  fields. **Everything here is the SPIKE adapter**, and stays so: it becomes
  `hubs/spike/spike-virtual-hub.js` behind the `VirtualHub` interface (§5.1), and the
  generic `SimHubBridge` loses all SPIKE knowledge. *(Done in R1.)*
- `sensors.js:29` `SENSOR_DEVICE = {color:61, distance:62, force:63}`; distance −1 outside
  50–2000 mm; colour = SPIKE colour ids from `world/mats.js` `colorAt` (ids 0..10 with
  `reflection`); force 0..100; IMU in SPIKE axes and milli-g (`:31–78`). These are **device
  models of three SPIKE devices** and the SPIKE hub IMU, and move into the device registry
  as such. The physical probe (raycast, ignore own bodies) is generic and stays.
- `hubBodyOf` (`sim-session.js:86–89`): the first body containing a part with `meta.hub`.
  Multi-hub needs one IMU body per hub.

### 4.5 `virtual-hub/`, `spike-sim/`

- `VirtualSpikeHubState` (`virtual-hub/spike-hub-state.js:32–143`): six ports by index,
  `data.motors[6]`, `data.sensors[6]`, `classicPorts[6] = [deviceId, values]`, SPIKE IMU,
  display, buttons; `stepMotors(dt)` is the one clock (`docs/SPIKE-ARENA.md`, "The hub
  contract"). It is already a good *hub state*; what it lacks is a hub-neutral face. It is
  kept and wrapped, not rewritten — the arena and every SPIKE route depend on it.
- The controller (`spike-sim/independent-backend.js`) is SPIKE's firmware behaviour in JS
  (ramps, holds, stall timer, run-to-position). Other smart hubs (NXT, EV3, Boost/PU) have
  *different* controllers (NXT's speed regulation and "brake"/"float" semantics; EV3's
  `OUTPUT_SPEED` vs `OUTPUT_POWER`; LWP3's `StartSpeed`/`GotoAbsolutePosition` with
  acc/dec profiles). Each hub profile brings its own controller or none (§5.1).

### 4.6 Editor, views, instructions, persistence, world

- Editor: port picker "none, A–F" (`docs/SIM-LAB.md` "Build bar"; `editor/editor-state.js:63–112`
  hands out free ports A..F for copies); badges show the port letter; snap via `edgeKind`
  (good). Needs: port lists from the hub profile, a hub picker when there are several hubs,
  cable/hose **links** as editor objects (pneumatic hoses, ropes: connector-to-connector
  items without their own placement), and new snap kinds from the registry (rack in slot,
  ring on hub, rope anchor).
- Views (`view/insight-layer.js`): draws hinge axes and gear lines; needs slider axes, rope
  lines, hoses, couplings by kind, pen traces.
- Instructions (`instructions/steps.js`): order by connector graph; links (hoses, strings)
  must appear as steps (connect A to B) after both ends exist.
- Persistence: `simLab` record `{ldraw, name?, mat?}` (`model/sim-lab-persist.js`). New data
  that belongs to the model (hub bindings, links, world objects placed by the user, program
  route per hub) must be in the LDraw text as `0 !BW` meta lines (format of record, D7) or
  in new optional record fields (`world`, `routes`). Unknown fields are already dropped by
  the reader: an old reader opening a new project loses them silently, which is acceptable
  only because the LDraw text keeps the model; §5.7 says which goes where.
- World (`world/mats.js`): four mats, colours are SPIKE ids (`mats.js:5–12`), obstacles are
  boxes carried by a mat (`createMat(id).obstacles`). Needs: world objects with dynamics
  (loads), surface colours as RGB + reflectance (so RCX light % and EV3 RGB can be derived),
  paper, a bench/table, and scenarios (a mat + objects + a start pose + a checker).

---

## 5. Proposed contracts

TypeScript-like, to be written as JSDoc typedefs in the files named. Everything is plain
JSON-able data (structured-clone safe) unless marked as an interface.

### 5.1 Hubs: `HubProfile` (data) and `VirtualHub` (interface)

File: `hubs/hub-profile.js` (typedefs + validator), one data module per family under
`hubs/<family>/profile.js`.

```ts
/** Static description of a hub family. Pure data, registered in the hub registry. */
interface HubProfile {
  id: string;                    // 'spike-prime', 'spike-essential', 'robot-inventor', 'rcx',
                                 // 'scout', 'cybermaster', 'nxt', 'ev3', 'wedo1', 'wedo2',
                                 // 'boost-move', 'pu-city', 'pu-technic', 'pf-ir',
                                 // 'tc-interface-a', 'tc-interface-b', 'tc-control-center'
  name: {en: string, de: string};
  parts: string[];               // LDraw files of the hub's body ('45601.dat', '884.dat'…)
  ports: PortSpec[];
  internalDevices: InternalDevice[];   // IMU, lights, matrix, speaker, internal motors (Boost A/B)
  clock: {
    controllerStepMs: number;    // the hub firmware's control period it pretends to run:
                                 // SPIKE 5, NXT 1, EV3 2… Physics step must divide it or equal it.
    sensorPeriodMs?: number;     // how often readings update (RCX: per-input scan, LPF2: mode rate)
  };
  /** Which drive level the hub's ports accept from its route (see §0.2). */
  drive: 'servo' | 'pwm';
  /** Program routes that can bind to this hub (ids in the route registry, §3). */
  routes: string[];
}

interface PortSpec {
  id: string;                    // 'A', '1', '0', 'red' — exactly what programs call it
  label: {en: string, de: string};
  kind: 'output' | 'input' | 'lpf2' | 'ev3-output' | 'ev3-input' | 'nxt-output' | 'nxt-input'
      | 'rcx-output' | 'rcx-input' | 'pf-output' | 'wedo1' | 'tc-output-pair' | 'tc-input';
  /** Device classes this port accepts (device registry `class`), checked by the compiler. */
  accepts: DeviceClass[];
  /** Electrical limits the device models need. */
  supplyVolts: number;           // 9 for RCX/NXT/PF, 7.2–8.3 for LPF2 Li-ion, 4.5 for Interface A
  pwmLevels?: number;            // 8 for RCX (0..7), 7 for PF, undefined = continuous
  identifies: 'lpf2-id' | 'ev3-autoid' | 'resistor-id' | 'none';
}

type DeviceClass = 'motor' | 'servo-motor' | 'linear-actuator' | 'lamp' | 'sensor-passive'
                 | 'sensor-active' | 'sensor-digital' | 'sensor-lpf2' | 'pneumatic-valve-actuator';

interface InternalDevice { device: string; port: string /* virtual port id, e.g. 'imu', 'A' on Boost */; body: 'hub' }
```

```ts
/**
 * The ONE runtime boundary between physics and any program route (§3). Implemented once per
 * hub family by an adapter around that family's state (SPIKE: VirtualSpikeHubState). The
 * bridge calls it once per physics step, in this order:
 *   1. advanceTo(t)        — the route runs up to the step's start (§3.3)
 *   2. readDrives()        — what every actuator port is told to do during this step
 *   3. (physics steps)
 *   4. writeReadings(r)    — encoders, sensors, IMU of the state after the step
 * Nothing else crosses. The interface is synchronous; a route that needs async work runs it
 * between batches, never inside a step.
 */
interface VirtualHub {
  readonly profile: HubProfile;
  readonly id: string;                         // the hub's placed-part id in the model
  /** Bind the model's devices to ports (from CompiledMechanism.devices); returns refusals. */
  plug(bindings: PortBinding[]): Diagnostic[];
  advanceTo(tMs: number): void;                // route time catches up to physics time
  readDrives(): PortDrive[];                   // one per bound actuator port
  writeReadings(readings: PortReading[], hubPose?: HubPoseReading): void;
  publish(): void;                             // one notification to UI/VM per batch (today: changed())
  /** Everything the route+controller needs to redo a batch (structured-clone safe). */
  exportState(): unknown;
  importState(state: unknown): void;
  stateKey(state: unknown): string;            // equal keys ⇒ identical drives (today motorStateKey)
  dispose(): void;                             // hand the clock back (today clockOwner restore)
}

interface PortBinding { port: string; device: string /* DeviceModel id */; partId: string }

type PortDrive =
  | {port: string, mode: 'servo', radPerSec: number}          // ideal speed servo (today's SPIKE path)
  | {port: string, mode: 'pwm', duty: number /* -1..1 */, decay: 'brake' | 'coast'}  // DC motor
  | {port: string, mode: 'coast'} | {port: string, mode: 'brake'}
  | {port: string, mode: 'lamp', level: number /* 0..1 */}
  | {port: string, mode: 'valve', position: -1 | 0 | 1};       // electric pneumatic valve (PF/Control+ era mods)

type PortReading =
  | {port: string, kind: 'encoder', angleRad: number, radPerSec: number}     // motor shafts
  | {port: string, kind: 'probe', device: string, raw: ProbeResult}          // the device model
  // encodes `raw` into the hub-specific value (SPIKE colour id, RCX ADC 0..1023, NXT cm…)
  ;

interface HubPoseReading { quat: Quat; angVel: Vec3; linAcc: Vec3; headingDeg: number; gravity: Vec3 }
```

Who implements what:

| Implementation | Wraps | Drive level | Status |
|---|---|---|---|
| `hubs/spike/spike-virtual-hub.js` | `VirtualSpikeHubState` + `IndependentSpikeBackend` (unchanged) — `advanceTo` = `stepMotors(5)` per step; `readDrives` = `data.motors[i].degPerSec` as `servo`; `writeReadings` = today's `applyFrame` | servo | **built** in R1 (refactor, bit-identical; deviations in §7 "R1 as built") |
| `hubs/spike/spike-firmware-hub.js` | a SPIKE firmware emulator's port peripherals (§3) | pwm | later slice |
| `hubs/rcx/rcx-virtual-hub.js` | the RCX route's output/input model (§3) | pwm (8 levels) | slice R5 |
| `hubs/lwp3/…`, `hubs/nxt/…`, `hubs/ev3/…`, `hubs/wedo1/…`, `hubs/tc/…` | per §3 | per profile | later |

The SPIKE adapter makes the generic bridge produce exactly today's frames; `test/bw-sim-*`
stay green unchanged (that is R1's acceptance).

### 5.2 Devices: `DeviceModel`

File: `devices/device-model.js` (typedefs, validator), data in `devices/catalog/*.json`, one
module per *probe* kind and per *encoder* family.

```ts
interface DeviceModel {
  id: string;                    // 'spike-medium-angular', 'rcx-71427', 'nxt-motor', 'ev3-large',
                                 // 'pf-m', 'tc-4.5v-motor', 'rcx-light-9758', 'rcx-rotation-2977',
                                 // 'spike-color', 'ev3-gyro', 'wedo2-tilt', 'pneumatic-valve'…
  class: DeviceClass;
  parts: string[];               // LDraw files that are this device
  ids?: {lpf2?: number, ev3?: number, wedo1ResistorOhm?: number};   // what the hub reports
  source: string;                // where the numbers come from (datasheet, measurement doc) — required
  motor?: DcMotorSpec;
  sensor?: SensorSpec;
  lamp?: {watts: number};
}

/** A permanent-magnet DC motor with an internal gearbox, as seen at the output shaft. */
interface DcMotorSpec {
  nominalVolts: number;          // 9 (RCX/NXT/PF), 7.2/8.3 (LPF2 battery)
  noLoadRadPerSec: number;       // at nominalVolts, output shaft
  stallTorqueNm: number;         // at nominalVolts, output shaft
  encoder?: {countsPerRev: number, absolute: boolean};   // NXT/EV3/LPF2 angular: 360; RCX rotation sensor: 16 (separate device)
  rotorInertiaKgM2?: number;     // reflected to the output; default derived from mass
  /** Gearbox friction torque at the output (makes coast stop; the "holding" of an unpowered motor). */
  frictionTorqueNm: number;
  /** For the existing servo path: the controller's top speed (°/s) the hub uses for percent. */
  servoMaxDegPerSec?: number;    // SPIKE 48: 1110, 49: 1050, 65: 660 — today in independent-backend.js:5–12
}

/** How a device senses: the generic physical probe + the family-specific value encoding. */
interface SensorSpec {
  probe:
    | {kind: 'ray', origin: Vec3, direction: Vec3, maxM: number}                     // SPIKE distance, colour (today)
    | {kind: 'cone', origin: Vec3, direction: Vec3, halfAngleDeg: number, maxM: number, rays: number}  // ultrasonic NXT/EV3
    | {kind: 'contact', plungerJoint: string, pressedM: number}                      // touch: plunger slider travel
    | {kind: 'axle-angle', connector: string}                                        // RCX/Control-Lab rotation sensor
    | {kind: 'body-pose'}                                                            // gyro, tilt, IMU
    | {kind: 'surface', origin: Vec3, direction: Vec3, spotRadiusM: number, maxM: number} // light/colour: averages the mat colour over a spot
    | {kind: 'none'};                                                                // temperature, sound: fixed or UI-set
  /** Pure function id in the encoder registry: ProbeResult → the value the hub reports. */
  encoder: string;               // 'spike-color', 'rcx-light-raw', 'nxt-ultrasonic-cm', 'wedo2-tilt', …
  periodMs?: number;             // sample rate; readings hold between samples (RCX ~3 ms per input)
  noise?: {sigma: number, seed: 'scene'};   // deterministic noise only (seeded per scene)
}

type ProbeResult =
  | {kind: 'ray', distanceM: number | null, body?: string, surface?: Surface}
  | {kind: 'contact', travelM: number, forceN: number}
  | {kind: 'axle-angle', angleRad: number}
  | {kind: 'body-pose', quat: Quat, angVel: Vec3, linAcc: Vec3}
  | {kind: 'surface', distanceM: number | null, rgb: [number, number, number], reflectance: number};

interface Surface { rgb: [number, number, number]; reflectance: number /* 0..1 */; spikeColorId?: number }
```

**How a motor maps to physics** (`physics/actuators.js`, new, called by the core each step):

- `servo` drive (today): hinge motor `Velocity`, target `radPerSec` clamped to
  `servoMaxDegPerSec`, torque limit `±stallTorqueNm` (today's `maxTorqueNm`). Bit-identical to
  `jolt-core.js:477–482` when the numbers are the same.
- `pwm` drive: every step the actuator computes the DC-motor torque at the measured speed,
  `τ = τs·(u − ω/ω0)` with `u = duty · V_supply / V_nominal` (clamped ±1), and applies it as a
  hinge motor in `Velocity` mode with target `sign(τ)·ω0·|u|` and torque limits `[0, |τ|]` on
  the right side — so Jolt cannot exceed the DC curve, and the curve is re-evaluated every
  5 ms (explicit, one step lag; stable because `τs/ω0 · dt / I` is small for these motors;
  verified per motor in the slice's test). `decay: 'brake'` with `duty = 0` → back-EMF
  braking torque `−τs·ω/ω0` (shorted winding); `coast` → only `frictionTorqueNm`
  (hinge `mMaxFrictionTorque`, motor off).
- Linear actuator / pneumatic cylinder: same, on a slider (`mMaxForceLimit`).
- Encoder: `angleRad` from the hinge's unwrapped angle, quantised to `countsPerRev` by the
  *hub adapter* (the SPIKE adapter keeps today's float degrees; an emulated NXT gets integer
  ticks — §3.5).

### 5.3 Joints, couplings and connectors

File: `contracts.js` (v2 typedefs), the registries in §6.

**Connectors** (PartMeta, LDraw frame). `type` is a registered connector kind; the registry
says which kinds pair up and what edge they make.

```ts
interface ConnectorV2 {
  id: string; type: ConnectorKind; position: Vec3; axis: Vec3; length?: number;
  friction?: boolean;            // as today (pin)
  /** kind-specific data, validated by the kind's module */
  data?: Record<string, unknown>;
}
type ConnectorKind =
  // v1 (unchanged meaning)
  | 'pinhole' | 'axlehole' | 'axle' | 'pin' | 'stud' | 'antistud' | 'ball' | 'ballsocket'
  // new
  | 'rack-teeth'        // along `axis`, `length`; data: {pitchLdu}; meshes with a pinion (coupling, not edge)
  | 'rack-slot'         // a guide a rack (or a beam) slides in → slider edge
  | 'slide-bore'        // round bore that slides AND turns on an axle (axle connectors, 6538 on round) → cylindrical
  | 'clutch-bore'       // gear bore that turns freely on a driving-ring hub axle → hinge + selectable coupling
  | 'ring-hub'          // the driving-ring hub's outer surface the ring slides on; data: {detentsLdu: number[]}
  | 'ring-bore'         // the driving ring's bore
  | 'turntable-ring'    // two halves of a turntable pair coaxially → hinge
  | 'worm-thread'       // worm surface; meshes with a spur's teeth at 90° (coupling)
  | 'pneumatic-port'    // hose end on a pump/cylinder/valve/tank; data: {chamber: 'A'|'B'|'out'|'in'}
  | 'hose-end'          // the end of a hose link
  | 'rope-anchor'       // where a string end is fixed (drum, hook, beam); data: {drumRadiusLdu?}
  | 'sheave'            // a pulley groove a rope runs over; data: {radiusLdu}
  | 'cable-plug' | 'cable-socket';   // electrical (old 9 V studs/2×2 plates, NXT/EV3 RJ12, LPF2): topology only
```

**Joints** (CompiledMechanism v2, world frame). Joints connect bodies; they no longer carry
the motor (actuation is a separate list).

```ts
type JointV2 = {id: string, body1: string, body2: string | 'world', point: Vec3} & (
  | {type: 'hinge', axis: Vec3, limits?: [number, number], frictionNm?: number, spring?: Spring}
  | {type: 'slider', axis: Vec3, limits?: [number, number], frictionN?: number, spring?: Spring,
     detents?: number[] /* m along axis, snapping force in `spring` */}
  | {type: 'cylindrical', axis: Vec3, limits?: [number, number], frictionN?: number, frictionNm?: number}  // Jolt SixDOF
  | {type: 'ball'}
  | {type: 'swing', axis: Vec3, coneHalfAngleRad: number}       // Jolt Cone / SwingTwist (towball links, U-joint approx)
  | {type: 'fixed'}                                             // Jolt Fixed; also the target of locks
);
interface Spring { stiffness: number; damping: number; restPosition?: number }
```

**Actuators** bind a hub port to a joint (replacing `joint.motor`):

```ts
interface ActuatorV2 {
  id: string;
  joint: string;                    // hinge, slider or cylindrical
  hub: string; port: string;        // the VirtualHub + port that drives it
  device: string;                   // DeviceModel id (DcMotorSpec)
  sign: 1 | -1;                     // device positive vs joint positive (today implicit, hub-bridge.js:30–34)
}
```

**Couplings** (replacing `gears`). Every coupling kind is one module in the coupling registry
with: an inference detector (compiler side), a validator, and a physics builder (core side).

```ts
type CouplingV2 = {id: string, parts?: string[]} & (
  | {kind: 'gear', joint1: string, joint2: string, ratio: number}            // today's 'gear' (Jolt Gear)
  | {kind: 'rackAndPinion', hingeJoint: string, sliderJoint: string, ratio: number /* m/rad */}  // Jolt RackAndPinion
  | {kind: 'worm', wormJoint: string, wheelJoint: string, ratio: number,
     holdTorqueNm: number /* self-locking: hinge friction on wormJoint while unpowered */, efficiency?: number}
  | {kind: 'chain', joint1: string, joint2: string, ratio: number /* > 0 */}                  // Jolt Gear, same sense
  | {kind: 'toothContact', body1: string, body2: string, contactLocal1: Vec3, contactLocal2: Vec3,
     tangentLocal1: Vec3, phaseJoint1: string, phaseJoint2: string}                           // CUSTOM (§8 D1): frame-relative mesh
  | {kind: 'differential', carrierJoint: string, side1Joint: string, side2Joint: string}      // approx path: JS lumped constraint
  | {kind: 'selectable', hubJoint: string /* axle body hinge */, ringJoint: string /* slider */,
     gears: {joint: string, engageAtM: number}[], toleranceM: number, couplingTorqueNm: number,
     indexAngles: number /* 4 for the driving ring */}
  | {kind: 'slipLimit', inner: string /* coupling id */, maxTorqueNm: number}                 // LA clutch, approx by enable/disable
  | {kind: 'rope', drumJoint: string, drumRadiusM: number,
     path: {body: string | 'world', localPoint: Vec3, sheaveRadiusM?: number}[],              // anchor → sheaves → hook
     restLengthM: number, stiffness?: number}                                                  // approx: Distance + explicit drum torque
  | {kind: 'spring', body1: string, local1: Vec3, body2: string, local2: Vec3, restM: number, stiffness: number, damping: number}  // rubber band (Jolt Distance soft)
  | {kind: 'pneumatic', network: string}                                                       // members listed in fluid networks
);
```

`toothContact` is the exact general mesh (spur, bevel, worm, on any frame) that replaces
`gear` once the custom constraint exists; until then `gear` is emitted where exact, and
`gear-frames-differ` / `gear-on-turning-frame` diagnostics name the cases that are not.

**Pneumatic networks** (`fluid/network.js`):

```ts
interface FluidNetwork {
  id: string;
  volumes: {id: string, m3: number, atmosphere?: boolean}[];          // hoses+tanks lumped per node
  links: {a: string, b: string, conductance: number}[];               // hose/T-piece connectivity
  valves: {id: string, joint: string /* switch lever hinge */, positions: Record<'-1'|'0'|'1', [string, string][]>}[];
  pumps: {id: string, joint: string /* plunger slider */, strokeM3PerM: number, checkInto: string}[];
  cylinders: {id: string, joint: string /* slider */, areaA: number, areaB: number, chamberA: string, chamberB: string}[];
}
```

### 5.4 PartMeta v2 (`part-meta/parts.json` `version: 2`)

Additive fields; every v1 entry is valid v2 by the upgrade rule in §5.7.

```ts
interface PartMetaV2 extends PartMetaV1 {
  /** Several tooth sets per part (double bevel = spur + bevel; turntable top = ring 56T). */
  gears?: {type: CouplingToothType, teeth: number, axis: Vec3, center: Vec3, connector?: string /* which bore it turns on */}[];
  /** Movable sub-bodies inside one part (motor shaft, LA piston, turntable top, cylinder rod, pump plunger, switch lever, shock rod). */
  internalJoints?: {
    id: string; type: 'hinge' | 'slider';
    point: Vec3; axis: Vec3;                     // part frame (LDU)
    movingConnectors: string[];                  // today motor.output
    movingColliders: number[];                   // today motor.outputColliders
    massFraction: number;                        // today MOTOR_OUTPUT_MASS_FRACTION
    limitsLdu?: [number, number]; detentsLdu?: number[];
    springNPerM?: number; frictionN?: number; frictionNm?: number;
    actuatedBy?: 'device' | 'fluid' | 'none';
  }[];
  /** The electronic device this part is, and its port class (device registry id). */
  device?: string;
  /** Hub profile this part is (hub registry id). */
  hubProfile?: string;
  /** Pneumatic chambers etc. referenced by connectors' data. */
  fluid?: {chambers: {id: string, m3: number}[]};
  /** Rope/string items: rest length and stiffness for a string part. */
  rope?: {lengthLdu: number, stiffnessNPerM: number};
}
type CouplingToothType = 'spur' | 'bevel' | 'worm' | 'rack' | 'ring' | 'sprocket' | 'crown';
```

`motor` (v1) is read as `internalJoints: [{type:'hinge', movingConnectors: output,
movingColliders: outputColliders, massFraction: 0.15, actuatedBy:'device'}]` + `device` from
`deviceId` (48 → `spike-medium-angular`, 49 → `spike-large-angular`). `sensor` (v1) as
`device` with a `ray` probe at `origin`/`direction`. `hub.ports` (v1) as
`hubProfile: 'spike-prime'`. The **file** is migrated once (a script), so the loader's
upgrade path is only for user catalogs and old fixtures.

#### 5.4.1 Parts from the whole LDraw catalogue (2026-10-19)

The palette ships the parts in `parts.json`; the palette's **+** adds any of the ~23,700
parts of the LDraw.org Parts Library at run time (owner decision 2026-10-19: fetch from the
ldraw-stl mirror; parts the deriver cannot connect are offered as decoration).

- **Source.** `ldraw/ldraw-catalog.js` reads the ldraw-stl mirror
  (https://crispstrobe.github.io/ldraw-stl/library/, built weekly from the official
  `complete.zip` by https://github.com/CrispStrobe/ldraw-stl): the CC BY files only,
  unmodified, one zip cut into chunks; one HTTP range request per file. `fetchLDrawClosure`
  takes vendored files from `static/ldraw/` (ldraw-lock.json lists them, so nothing else is
  asked for there) and the rest from the catalogue (`setLDrawFallback`).
- **Metadata.** The deriver moved from `scripts/derive-part-meta.mjs` to
  `part-meta/derive.js` (the script is its command line; output byte-identical).
  `part-meta/catalog-parts.js` runs it with `selfCheck` in a worker
  (`part-meta/catalog-worker.js`, 20 s budget). A part that passes is a normal derived part.
  One that does not becomes a **decoration** (category `decoration`, no connectors,
  `deriveColliders`' envelope or its bounding box as colliders, at least 0.5 LDU thick, mass
  from the mesh volume): a free body that rests and collides but joins nothing.
- **Persistence.** Added parts are kept per device (`localStorage` `bw-sim-catalog-parts`,
  with the library build and the files' attribution) and are in `CATALOG` from the start. A
  model naming a part no catalogue piece has derives it from the catalogue when it is opened
  (`sim-lab.js catalogFor`), so a model made elsewhere opens the same.
- **Policy.** `BW_REMOTE_PARTS_POLICY=deny` (webpack.config.js) builds the app without the
  catalogue; it is data, not code, so it is separate from the remote-code policies and their
  receipt. The About dialog shows it.
- **Licence.** Every library file is CC BY 4.0 or CC BY 2.0 + 4.0. The app renders parts
  (2D, which LDraw.org does not count as an adaptation) and saves models as references.
  The palette's catalogue view names, for each added part, every fetched file's author,
  licence and source; the About dialog's LDraw entry says where the files come from.

### 5.5 The world

File: `world/world.js` (contract), `world/mats.js` (stays), `world/objects.js`,
`world/paper.js`, `world/scenarios/*.js`.

```ts
interface WorldV2 {
  version: 2;
  floor: {mat: string | null, sizeM: [number, number], friction: number, heightM?: number /* a table */};
  objects: WorldObject[];
  paper?: Paper[];
  start?: {x: number, z: number, headingDeg: number, anchor?: 'drive-axle' | 'hub' | 'origin'};
}
type WorldObject = {id: string, pose: {position: Vec3, yawDeg?: number, quat?: Quat}, surface?: Surface,
                    friction?: number} & (
  | {role: 'obstacle', shape: Shape}                                   // static (today's obstacles, any shape)
  | {role: 'load', shape: Shape | Shape[], massKg: number, grip?: 'hook-loop' | 'pallet-pockets'}  // dynamic: pallet, 50 g weight, ball
  | {role: 'fixture', shape: Shape, attachTo?: string}                // a bench clamp: welds a model part to the world
);
type Shape = {shape: 'box', size: Vec3} | {shape: 'cylinder', radius: number, height: number} | {shape: 'sphere', radius: number};
interface Paper {
  id: string; sizeM: [number, number]; pose: {position: Vec3, yawDeg: number};
  body?: 'static' | 'dynamic';          // dynamic: moved by feed rollers (friction)
  strokes: {width: number, color: string, points: [number, number][] /* paper frame, m */}[];   // written by pen devices
}
```

The mat stays the floor's texture and colour function, but `colorAt` returns a `Surface`
(rgb + reflectance; the SPIKE colour id is derived by the SPIKE colour encoder), so an RCX
light sensor and an EV3 RGB mode read the same mat. A **scenario** is a world + a checker
(the acceptance tests in §7 are scenarios). The `fixture` role replaces "a static body made
of model parts is the machine's frame" (`jolt-core.js:93–97`): today a test clamps a gearbox by
making a body static; a user clamps it by placing a fixture.

### 5.6 The route binding

```ts
/** Which program route drives which hub in this project (stored with the project, §5.7). */
interface RouteBinding { hub: string /* hub part id */; route: string /* route registry id */; options?: unknown }
```

The pane picks the route from the hub's profile and the Code tab's language (today it is
implicitly "spikeprime extension on the SPIKE hub", `sim-lab-pane.jsx:560–582`).

### 5.7 Versioning and migration

| Data | Today | Change | Old data |
|---|---|---|---|
| LDraw model text (format of record) | `0 !BW PORT A`, `!BW GROUP/IN/ID` (`model/ldraw-model.js`) | Add `0 !BW PORT <port> [HUB <hubPartId>]`, `0 !BW LINK <kind> <partId>:<connector> <partId>:<connector> [len]` (hoses, strings, cables), `0 !BW HUBROUTE <hubPartId> <routeId>`. Unknown `!BW` metas stay refusals-not-crashes (today's rule). | `!BW PORT A` with one hub means that hub. A file without new metas round-trips byte-identically (existing test `bw-sim-ldraw-model.test.mjs`). |
| `PlacedModel` (in memory) | `version: 1`, `part.port?: 'A'..'F'` | `version: 2` only when hubs/links are present: `port?: {hub?: string, port: string}`, `links?: Link[]`. `validatePlacedModel` accepts both; `version: 1` keeps its exact checks. | v1 objects valid as is. |
| `PartMeta` / `parts.json` | `version` field present, entries v1 | file `version: 2`, entries may use v2 fields; `upgradePartMeta(v1)` (pure) | test fixtures with v1 metas keep working through the upgrade. |
| `CompiledMechanism` | `version: 1` | `version: 2` (joints v2, `actuators`, `couplings`, `devices`, `fluid`, bodies with `role`/`collisionGroup`). Never stored. The core accepts v1 by upgrading (`gears`→`couplings`, `joint.motor`→`actuators` with the SPIKE device). | Every existing core test builds v1 mechanisms by hand (`test/bw-sim-physics-core.test.mjs`, gear fixtures): they run through the upgrade; their numbers must not change (bit-identity check in R2). |
| `simLab` project record | `{ldraw, name?, mat?}` | add optional `world?: WorldV2` (user-placed objects; when absent: the mat's world as today), `routes?: RouteBinding[]`. | Reader already drops unknown fields (`sim-lab-persist.js` "Unknown fields are dropped"); new fields are optional. A newer project opened by an older build loses world objects and route choices but keeps the model. |
| Worker protocol | `sim-load {mechanism, hubBody, stepMs}`, batches with SPIKE `exportMotorState` | `sim-load {mechanism, hubs: [{id, profile, body}], stepMs}`, batches carry `{hubs: {id: state}}` | in-repo protocol, both ends ship together; no persisted compatibility needed. |

---

## 6. Modularity plan: registries and the worker protocol

### 6.1 Module layout (target)

```
bw-sim/
  contracts.js                  v1 + v2 typedefs, validators, upgrade functions (pure)
  registry/                     the five registries (plain Maps filled by `register*` at import)
    connectors.js  couplings.js  joints.js  devices.js  hubs.js  routes.js
  kinds/                        one module per connector/coupling kind: data + detector + builder
    pin-axle.js (v1 rules moved from graph.js)   spur.js  bevel.js  worm.js  rack.js
    chain.js  clutch.js  differential.js  rope.js  spring.js  turntable.js  slide.js
  mech/                         compiler: graph → islands → joints → couplings (calls the registry)
  physics/
    jolt-core.js                bodies, joints, collision groups, step, checkpoint (generic)
    builders/                   Jolt construction per joint kind and per coupling kind
    actuators.js                servo / pwm DC-motor / linear / valve drives
    state-registry.js           save/restore of every per-step module (§6.4)
  fluid/network.js              pneumatics (pure, stepped by the core)
  devices/                      device models: probes (generic) + encoders (per family)
    probes/ray.js cone.js contact.js axle-angle.js body-pose.js surface.js
    encoders/spike.js rcx.js nxt.js ev3.js lwp3.js wedo1.js tc.js
    catalog/*.json              DeviceModel data
  hubs/                         HubProfile data + VirtualHub adapters
    spike/  lwp3/  rcx/  nxt/  ev3/  tc/
  routes/                       route clients (VMs, lockstep drivers), never imported by physics
    rcx-vm/  nxt-vm/  ev3-vm/  renode-lockstep/
  hub-bridge.js                 generic SimHubBridge: N VirtualHubs ↔ core (no SPIKE knowledge)
  sim-worker-protocol.js        worker batches/replay over VirtualHub states (R1: outside physics/)
  physics-worker.js             the worker entry: physics host + hub registry (R1: outside physics/)
  world/                        floor/mats, objects, paper, scenarios
```

### 6.2 Registries

Each registry is a `Map<string, Module>` populated by side-effect-free `register()` calls in
an index module that the Sim Lab chunk imports. A module is data plus pure functions:

```ts
interface ConnectorKindModule {
  kind: ConnectorKind;
  validate(c: ConnectorV2): string[];
  /** Pairs this kind makes with another kind: the edge (rigid|hinge|slider|cylindrical|ball|none)
   *  and the geometric test (today geometryMatchesShaftHole and the ball/stud distance tests). */
  pairs: {with: ConnectorKind, edge: EdgeKind, match(a, b): boolean}[];
  snap?: {...};                 // editor hints: alignment axis, rotation steps (today snap.js)
}
interface CouplingKindModule {
  kind: CouplingV2['kind'];
  /** Compiler side: find instances in the islands/joints (spur/bevel: today's meshContact). */
  detect(ctx: CompileContext): {couplings: CouplingV2[], welds: [string, string][], diagnostics: Diagnostic[]};
  validate(c: CouplingV2, m: CompiledMechanismV2): string[];
  /** Core side: create Jolt constraints/state; return a stepper if it has per-step logic. */
  build(J, core: CoreContext, c: CouplingV2): {step?(dt): void, save?(): unknown, restore?(s): void, destroy(): void};
}
interface JointKindModule { type: JointV2['type']; validate; build(J, core, j); state?(j): {position, velocity} }
interface DeviceModule { id: string; model: DeviceModel; probe: ProbeModule; encode(r: ProbeResult, hub: HubProfile): unknown }
interface HubModule { profile: HubProfile; createVirtualHub(opts): VirtualHub }
interface RouteModule { id: string; hubs: string[]; residency: 'main' | 'worker' | 'external'; create(hub: VirtualHub, opts): RouteClient }
```

The compiler's fixpoint (`compile.js:179–197`: islands → joints → gears, welding until it
settles) stays; the gear pass becomes "for each registered coupling kind in priority order,
`detect`". The **v1 behaviour is the first set of modules**: `pin-axle.js` contains exactly
`edgeKind` and `geometryMatchesShaftHole` (moved, not changed), `spur.js`/`bevel.js` contain
today's `meshContact` and `meshRatio`, so the v1 golden tests (`test/bw-sim-mech.test.mjs`,
`test/bw-sim-gear-trains.test.mjs`) are the move's acceptance.

**Adding a hub** = a `hubs/<family>/profile.js` (data), an adapter implementing `VirtualHub`,
device entries in `devices/catalog/`, and (if new) an encoder module. No edit to the
compiler, the core or the bridge. **Adding a mechanism** = a connector kind and/or coupling
kind module + part metadata. No edit to `graph.js`/`gears.js`/`jolt-core.js`.

### 6.3 Compiler pipeline (v2)

1. Graph: nodes per placed part **and per internal joint body** (generalises the motor
   split, `graph.js:91–146`); edges from the connector registry; **links** (hoses, strings,
   cables) as typed edges that never make islands.
2. Islands: union of rigid edges (unchanged).
3. Joints: hinge/slider/cylindrical/ball/swing groups, collinearity merge, locks (unchanged
   logic, more kinds).
4. Couplings: registry detectors in order spur, bevel, worm, rack, chain, turntable ring,
   clutch (needs the ring slider), differential (housing part), rope (needs links), spring,
   pneumatic (needs links). Welds from detectors re-run the fixpoint (as `gear-on-frame`
   does today).
5. Devices and actuators: from `PartMetaV2.device` + placed `port` + the hub profile;
   `port-kind-mismatch`, `port-taken`, `hub-missing` diagnostics.
6. World: floor, objects, paper from `WorldV2` (not compile options any more).
7. Validate (`validateCompiledMechanism` v2) and emit.

### 6.4 Per-step state registry (rewind-safe by construction)

Every module that keeps state from one physics step to the next registers
`{key, save(): structuredClone-able, restore(s)}` with the core. `checkpoint()` = Jolt
`SaveState` + every registered module's `save()`; `rollback()` the reverse. Today's ad-hoc
saves (`jolt-core.js:673–691` hinge bookkeeping, `hub-bridge.js:174–184` heading/IMU memory)
become the first two registrants. New registrants: slider bookkeeping, clutch engagement and
index wait, LA slip state, rope lengths and last tension, worm hold state, fluid pressures,
pen-down flags and stroke lengths (strokes are append-only: save the lengths, truncate on
restore), device sample-and-hold buffers, worker-resident route VMs. A test runs a scenario
with every coupling kind, checkpoints at a random step, runs, rolls back, reruns, and
asserts bit-identical snapshots (extends `test/bw-sim-physics-worker-session.test.mjs`).

### 6.5 Worker protocol growth (`sim-worker-protocol.js`, `physics/physics-host.js`)

Since R1 the protocol module and the worker entry are `bw-sim/sim-worker-protocol.js` and
`bw-sim/physics-worker.js` (moved out of `physics/`, which must import no hub, §3.6);
`physics-host.js` carries hub states and frames as opaque data and gets `createSimRunner`
injected. The *load* and *batch* rows' v2 shapes below are built (without `residency`,
`routeInit`, `world`, `ui`, `paperDelta`, `couplingState`, which come with the slices that need
them); a frame is `{t, hubs: {id: {drives, readings, pose}}}` — `drives` so the replay can check
the main-thread hub chose what the mirror did (today's `diverged` check, now generic).

| Message | Today | v2 |
|---|---|---|
| load | `sim-load {mechanism, hubBody, stepMs}` → `sim-loaded {t, bodies, joints, sensors}` | `sim-load {mechanism, hubs: [{id, profile, body, residency, routeInit?}], world, stepMs}` → `sim-loaded {t, bodies, joints (hinge + slider + cylindrical states), readings per hub}` |
| batch | `{steps, hub: exportMotorState(hub), redo?}` → frames `{motors, heading, rate, imu, sensors}` + poses | `{steps, hubs: {id: exportState()} (main-resident only), redo?}` → frames `{hubs: {id: {readings, pose, ui?}}}` + poses + `paperDelta` (new stroke points since the last batch) + `couplingState` (for insight: clutch engaged, rope length, pressures) |
| poses | Float64 bodies×7 + joints×2 (hinges only, `posesOf` `:87–99`) | joints×2 for every joint kind with a scalar DOF (slider position, cylindrical: 2 values → joints×2 + extra block) |
| route I/O | — | `route-load {hub, image}` (an `.rcx`/`.rxe` image into a worker-resident VM), `route-ui` events (LCD, sound) in frames |

---

## 7. Roadmap in slices

Each slice is independently testable and shippable; acceptance is mechanical (node `--test`
unless marked *browser*). **C** marks contract slices that must land before the slices that
depend on them. Every slice keeps all existing `test/bw-sim-*` green unchanged unless it says
which expectation it changes and why.

**R0 — bug: large motor reports device 48.** Carry `deviceId` through `joints.js:133/169`.
*Accept:* a model with 54675 on port A reports `classicPorts[0][0] === 49` and
`percentToDps(0, 100) === 1050`. (Independent of everything; land first.)

**R1 (C) — VirtualHub boundary, SPIKE adapter, generic bridge.** `hubs/hub-profile.js`,
`hubs/spike/profile.js`, `SpikeVirtualHub` wrapping `VirtualSpikeHubState` unchanged;
`SimHubBridge`/`HubReplay` rewritten against `VirtualHub`; worker protocol carries
`hubs: {id: state}`; `spike3-python-run.js` finds the Lab session.
*Accept:* every existing Sim Lab test passes **bit-identically** (the worker-session test
compares frames to the last bit); an import-graph test proves physics/mech import no hub or
route module; a fake 2-port test hub (in `test/fixtures`) drives the driving base through the
same bridge with `pwm` drives stubbed to servo.

*R1 as built (2026-10-17, `lane/simlab-r1-20261017`).* Files: `hubs/hub-profile.js` (typedefs,
`validateHubProfile`), `hubs/spike/profile.js`, `hubs/spike/spike-virtual-hub.js`
(`SpikeVirtualHub` around the unchanged `VirtualSpikeHubState`; `plugMotors`, `applyFrame`,
`export/importMotorState` and the SPIKE IMU encoding moved here), `registry/hubs.js`
(`HubRegistry`) + `hubs/index.js` (the built-in families), `physics/actuators.js`
(`applyDrive`), and the generic `hub-bridge.js` / `sim-worker-protocol.js`. Accepted by: every
existing Robot Lab test unchanged and green; per-tick hashes of every pose, joint and hub field
for the four shipped models (in-thread and worker), a raw-bridge run and the line follower's VM
program equal before and after the refactor; `test/bw-sim-hub-boundary-imports.test.mjs`;
`test/bw-sim-hub-boundary.test.mjs` (a fake two-port **pwm** hub, `test/fixtures/bw-sim/two-port-test-hub.mjs`,
drives the S1 base through the same bridge, worker protocol and `SimSession`, bit-identical
in-thread vs. protocol, redo included). Where the code deviates from §5.1/§6, and why:

- **`PortReading` encoder carries `deltaRad`** (the change over the step) beside `angleRad`.
  Every LEGO encoder is incremental and a program may reset its count; the SPIKE hub's position
  is `base + Δ·180/π` with its own base. Recomputing Δ from two `angleRad` values on the hub
  side would not be bit-identical to today's arithmetic.
- **`PortBinding` is `{port, class: 'motor'|'sensor', ids: {lpf2?}, sensor?}`**, not
  `{port, device, partId}`: there is no device registry yet (§5.2), so a binding carries the
  identity the hub reports (as `DeviceModel.ids` will). R2 replaces it with the device id.
- **Probe readings carry v1 values**: `{kind: 'probe', device: <v1 sensor kind>, raw}` where
  `raw` is `sensors.js`'s measurement already in SPIKE units; the SPIKE adapter only adds the
  LPF2 id. The probe/encoder split of §5.2 lands with the device registry.
- **`HubPoseReading` is `{headingDeg, rateDegPerSec, quat?, angVel?, linAcc?, gravity?}`**:
  `linAcc` excludes gravity (`(v − v_prev)/dt`, computed on the physics side because it needs
  the previous step's velocity, which is rollback state); the hub derives its IMU. The pose
  fields are absent when the body cannot be read (the IMU then keeps its value, as before).
- **`advanceTo(t)` takes the END of the step about to be simulated** (the route runs its
  controller over the step and decides the held drive), so the SPIKE adapter's
  `stepMotors(t − t_prev)` is exactly today's `stepMotors(5)`. §3.3's pseudo-code reads it as
  the step's start; the meaning (zero-order hold, one step of reading latency) is the same.
- **`exportState()` includes the route's time** (`timeMs`), so a mirror's `advanceTo` steps the
  same interval as the main-thread hub.
- **`pwm` drive, R1 stand-in**: `physics/actuators.js` sets a velocity target `u·ω0` under the
  stall-torque limit (duty 0: `brake` holds, `coast` frees the hinge) — right no-load speed,
  right stall torque, not the torque–speed line or back-EMF braking. R3 replaces that branch;
  the drive data stays. (So D5's SPIKE→pwm move is an adapter change plus R3's actuator.)
- **Hub family of a model**: a hub part's metadata may name `hub.profile`; without it the hub
  is `spike-prime`. R1 binds every motor and sensor to the one hub on the first hub body;
  `SimHubBridge` refuses a second hub until R2's `{hub, port}` references exist.
- **Composition outside `physics/`**: `sim-worker-protocol.js`, the worker entry
  `physics-worker.js` and `startPhysicsWorker` (now in `sim-lab.js`, same chunk name) moved so
  that `physics/` imports no hub (§3.6). `SimHubBridge`/`HubReplay` still accept the pre-R1
  `{hubState, hubBody}` options (wrapped by the registry's default family), which is why no
  existing test changed.
- `spike3-python-run.js` skips a hub a Lab scene drives (`window.__bwSimLab.hubState`), paused
  or running.

What R2 should know: drives are bound by `joint.motor.port` and readings by
`mechanism.sensors[].port` in `hub-bridge.js` (`portBindings`, `SimHubBridge` constructor) —
the two places `actuators[]`/`devices[]` with `{hub, port}` replace; `HubPoseReading` is per
hub body, so multi-hub only needs the bindings. The worker-session test and the hash check are
the bit-identity guard for the upgrade path.

**R2 (C) — CompiledMechanism v2 + registries, v1 behaviour as modules.** Joints v2,
`actuators`, `couplings` (gear, rackAndPinion), `devices`, body `role`/`collisionGroup`;
`upgradeMechanismV1`; connector/coupling/joint registries with `pin-axle`, `spur`, `bevel`
modules moved verbatim; `parts.json` v2 file migration script (motor→internalJoints+device,
sensor→device, hub→hubProfile) with v1 upgrade in the loader.
*Accept:* golden tests of `bw-sim-mech`, `bw-sim-gear-trains`, `bw-sim-contracts` unchanged;
hand-built v1 mechanisms in `bw-sim-physics-core.test.mjs` give identical snapshots through
the upgrade; a schema test that every `parts.json` entry is v2-valid and that the
migration of the v1 file is idempotent.

*R2 as built (2026-10-17, `lane/simlab-r2-20261017`).* Files: `contracts.js` (PartMeta v2 and
CompiledMechanism v2 typedefs, `upgradePartMeta`, `upgradeMechanismV1`, `mechanismV1`, the v2
validators, the `part*` accessors every reader uses), `devices/catalog.js` (the five SPIKE devices),
`registry/kinds.js` (`ConnectorKindRegistry`, `CouplingKindRegistry`, `JointKindRegistry`),
`kinds/pin-axle.js` (`edgeKind`, `shaftEngagement` with the short-shaft and blind-hole rules,
the ball/stud distance tests, `solidColliders` and the collider regions — moved from
`mech/graph.js` and `editor/overlap.js`, which re-export them), `kinds/spur.js`, `kinds/bevel.js`,
`kinds/gear-mesh.js` (today's `meshContact` branches and `meshRatio`, moved), `kinds/index.js`
(`BUILTIN_KINDS`, `withKinds`), `scripts/migrate-parts-v2.mjs`; `parts.json` is `version: 2`.
The compiler takes `opts.kinds`; the physics core reads `actuators`/`couplings` only (a v1
mechanism is lifted on entry); the bridge binds by `{hub, port}`. Accepted by: every bw-sim test
green; per-step hashes of every pose and joint of every physics core every bw-sim test creates
(112 cores), the R1 session hashes (four shipped models in-thread and in the worker, a raw-bridge
run, the line follower's VM program) and the compiler's output for the shipped models and all
fixtures, equal before and after (with the v1 and with the migrated v2 `parts.json`);
`test/bw-sim-parts-v2.test.mjs`, `test/bw-sim-mechanism-v2.test.mjs`,
`test/bw-sim-kinds-registry.test.mjs` (a toy connector kind and a toy `belt` coupling from
`test/fixtures/bw-sim/toy-kinds.mjs`, compiled without touching `mech/`). Where the code
deviates from §5.3–§5.7/§6.2–§6.3, and why:

- **`compile()` emits v1 unless asked for v2** (`{version: 2}`; `prepareModel`, i.e. the app, asks).
  The golden compiler tests pin a v1 mechanism's top-level keys (`bw-sim-mech` "clean output"),
  and they are R2's acceptance. Internally there is one pipeline; v1 is the v2 result's v1 view.
- **CompiledMechanism v2 keeps the v1 fields** (`gears`, `sensors`, `joint.motor`) as a derived
  view (`mechanismV1Aliases`), checked by the v2 validator to agree with `couplings`, `devices`
  and `actuators`. Views, insight, the pane and many tests read them; the core and the bridge do
  not. A reader moves to the v2 fields when it needs something v1 cannot say (a hub, a new kind).
- **`hubs: [{id, profile, body}]`** is a v2 field §5.3 did not list: an actuator's `hub` must
  name something. `hubs[0]` (the first body carrying a hub, as `hubsOf`) is the hub a port without
  one means; with no hub part, `hub` is `null` (the scene's one hub drives it, as in v1).
- **`ActuatorV2` carries the device's numbers resolved** — `maxTorqueNm` (stall torque),
  `maxSpeedRadPerSec` (servo top speed), `ids` — beside `device`, so the core and the worker need
  no device catalogue. `device` is `null` for a lifted v1 motor that names no catalogue device.
- **Devices** are `devices/catalog.js` (a JS module: node tests read it without JSON modules),
  and hold only what PartMeta v1 held: `motor.{stallTorqueNm, servoMaxDegPerSec}`, `ids`,
  `sensor.{kind, encoder}`. The DC-motor fields of §5.2 are optional until sourced (D6) — the D5
  slice adds them. **A probe's geometry stays in PartMeta** (`probe: {kind: 'ray', origin,
  direction}`), not in `DeviceModel.sensor.probe`: it is where *this part* senses from (v1
  fixtures have their own origins). `devices[]` in the mechanism are the sensors only (motors are
  `actuators`), with `sensor` = the v1 measurement `sensors.js` makes.
- **PartMeta v2 `device` may be an inline DeviceModel**: `upgradePartMeta` maps a v1 motor to the
  catalogue device whose numbers are exactly its own, else keeps its numbers inline (a v1 test
  motor at 600 °/s is no catalogue device). The shipped file names catalogue ids only (schema test).
- **`internalJoints[].point/axis` are optional**: the migration copies the output axlehole's
  (the compiler then transforms them exactly as it transformed the connector); absent, the v1
  centroid rule applies. The compiler builds one device-actuated hinge per part (the motor); other
  internal joints come with the parts that need them (LA, turntable). `gear` stays single
  (`gears[]`, `fluid`, `rope` arrive with the first part that needs them).
- **Registries are instances** (as `HubRegistry`): `kinds/index.js` `BUILTIN_KINDS` and
  `withKinds(base, {connectors, couplings, joints})`. A connector pair rule lives on the shaft
  kind (`pairs: [{with, edge, match}]`; the registry tries a as the shaft, then b — v1's order).
  Coupling modules are keyed by `id` (spur and bevel both emit `kind: 'gear'`) and are either a
  **`mesh`** (tooth types → contact; `mech/gears.js` applies the shared common-frame /
  gear-on-frame rules) or a free **`detect(ctx)`** run after the meshes (welds re-run the
  fixpoint). The core's builders are not registry-driven yet (R3: it builds `gear`, accepts
  `rackAndPinion`, refuses other kinds); the joint registry is validation-only. The editor's snap
  still calls the verbatim `edgeKind` (registry-driven snapping is R16).
- **Collision data for D2**: bodies get `role` (`robot`, `frame` — a static body of parts, the
  clamped gearbox — `ground`, `obstacle`) and `collisionGroup` (`model` | `world`), and the
  mechanism a **`noCollide`** list: sorted body pairs joined by a joint, plus the two gear bodies of
  each coupling (a registered kind may say `bodies(c, joints)`). R3 builds its pair filter from it.
- **Multi-hub data**: PlacedModel `version: 2` allows `port: {hub, port}` (any port id: the hub's
  `plug` refuses one its profile lacks); a `hub` naming a non-hub part is the `port-hub-unknown`
  warning. The bridge binds each hub's actuators and sensors by `{hub, port}` (one hub: everything,
  as R1) and no longer refuses several hubs; `SimSession`/`hubsOf` still run the first hub, and the
  LDraw `!BW PORT … HUB` meta is R16's — so two-hub models exist in memory and in tests, not yet in
  files or the pane.
- **Tests changed** (expectations unchanged): `bw-sim-mech`'s large-motor test read the device id
  from the raw file's `motor.deviceId`, which v2 no longer has — it reads the catalogue id the
  part's `device` names; `bw-sim-part-meta` checks the motor's `internalJoints` and the sensors'
  `probe` against the meshes (and that the probe check sees all three sensors, since a v1 filter
  would now pass vacuously); `bw-sim-instructions` finds the hub by `hubProfile`.

What R3 should know: read `actuators` (not `joint.motor`) and `couplings`; `noCollide` + `role` +
`collisionGroup` are the D2 inputs; a coupling kind's physics builder is the missing half of the
coupling registry (`rackAndPinion` first); `upgradeMechanismV1` is the entry for every hand-built
v1 mechanism, so the v1 tests keep exercising the v2 path. The D5 DC model reads the motor's
device from `actuators[].device` → `devices/catalog.js`, where the DC fields are optional today.

**R3 (C) — Physics core v2: sliders, limits, friction, collision groups, state registry,
DC-motor actuator.** Slider state/motor/limits/friction in the core and protocol;
`RackAndPinionConstraint` built; `GroupFilterTable` (robot–robot off by default, robot–load
on); `actuators.js` with `servo` (today) and `pwm` (DC curve); `state-registry.js`.
*Accept:* (a) a motor-driven pinion moves a rack 10 cm with `|v_rack − r·ω| < 1 %`;
(b) a slider with limits stops at them within 0.5 mm under a 0.5 N push;
(c) DC model: an RCX-71427-spec motor with no load reaches `ω0·u ± 3 %` at duty 1 and 0.5,
stalls at `τs ± 3 %` against a clamped arm, and with `decay:'brake'` stops a 20 g·cm²
flywheel faster than with `coast` (both measured);
(d) a dynamic 50 g box resting on a beam carried by a hinge is lifted with it (robot–load
contact works) while robot parts still do not collide with each other;
(e) checkpoint/rollback bit-identity with sliders and rack.

*R3 as built (2026-10-17, `lane/simlab-r3-20261017`; (c), the DC model, is D5's — see "D5 as
built").* Files: `physics/jolt-core.js`, `physics/state-registry.js`, `contracts.js`
(`BODY_ROLES` + `load`; joint fields; `noCollidePairs(…, seated)`), `mech/compile.js` (the
connector edges into `noCollide`), `sim-worker-protocol.js` (slider states in the poses).
Accepted by `test/bw-sim-sliders.test.mjs` and `test/bw-sim-collisions.test.mjs`. Where it
deviates, and why:

- **D2 overrides (d)'s "robot parts still do not collide"**: everything collides except the
  `noCollide` pairs (joints, couplings, and the compiler's connector edges between two bodies,
  i.e. parts seated in each other's holes). The filter is a Jolt `GroupFilterTable` — one
  group, sub-group = body index — so it is decided in C++ in the broad phase, no JavaScript
  per contact. Measured (5 ms steps, physics only, median of 5): S1 driving base 6.0 → 6.0 ms
  per simulated second, 2.3 contact manifolds per step, none robot–robot; the 42-body gear
  train 73.1 → 73.8 ms, 0 manifolds. A contact-listener filter (no pair filter, reject in
  `OnContactValidate`) costs 6.0 → 11.1 ms on the base and 4.2× on the gear train, which
  then computes 82 manifolds per step between jointed overlapping parts only to drop them.
  **Limit (for R4+):** the filter is per BODY pair, as the owner decision states it; a part
  cannot hit a body it is jointed to, anywhere (a one-link arm on a motor cannot hit the
  chassis that holds the motor; a forearm on that arm can). A per-collider rule (seated
  colliders at t = 0 + contact normal along the hinge axis) would need the listener path.
  *Resolved 2026-10-18:* the filter is local per part where it must be (see "Validation fixes as
  built" below: `noCollideParts`, a SimShapeFilter only for those pairs).
- **Expectations changed:** `bw-sim-physics-core` "a static body made of model parts is the
  machine frame" asserted that a frame does not push an overlapping *unjoined* moving body;
  under D2 only a *joined* one is left alone (the test now checks both, plus the obstacle).
  No other test changed: in the four shipped models and the gear fixtures every robot–robot
  body pair is jointed or coupled, so no new contact exists (measured with the contact log).
- **Joint fields** (optional, v1 and v2): hinge `limits` (rad, within [−π, π]) and `frictionNm`
  (also the default coast friction of a motorised hinge); slider `limits` (m), `frictionN`,
  `maxForceN`, `maxSpeedMPerSec`. Limits count from the start pose, so min ≤ 0 ≤ max.
- **Slider motor**: `core.setMotor(slider, {mode: 'velocity'|'position'|'coast'|'brake'|'hold',
  mPerSec, m, maxForceN})` — the force limit from the command or the joint; there is no slider
  *actuator* (hub port) yet: `actuators[]` stays hinge-only until R9's linear actuator.
  `jointState(slider)` = `{position, velocity}`; snapshots, `posesOf` and `MirrorCore` carry it.
- **Rack and pinion**: body1 = the hinge's side not shared with the slider, body2 = the
  slider's; `r = 1/|ratio|`, the ratio's sign in the slider axis; 30 velocity / 10 position
  iterations like a gear, the pinion's inertia floored like a gear's. `SetConstraints` (Jolt's
  position drift correction) is not called: Jolt reads the hinge angle and slider position in
  their own sign conventions, which the signed axes here do not match. Measured drift over
  10 cm: none at the reported precision (|v − r·ω| < 1e-5 relative); a loaded rack held for
  a long time (R4's forklift) should measure it.
- **State registry** (§6.4): `clock`, `hinges` (incl. D5's torque/damping/friction and the
  rotor inertia), `sliders` (incl. the motor force limit, which Jolt's SaveState skips) and,
  when recorded, `contacts`; `core.registerState(key, {save, restore})` for coupling modules.
  The collision filter is fixed at construction and has no per-step state.
- **Contact log** `createPhysicsCore(…, {recordContacts: true})` + `contactPairs()`: a JS
  callback per contact, for tests and benches only.
- The Technic rack 3743 is not in the vendored LDraw subset and the full library is not on
  the build machine: R3's tests use primitive colliders (8T pinion r = module·z/2 = 4 mm).

What R4 should know: the compiler must emit a `slider` joint (rack in `rack-slot`) and a
`rackAndPinion` coupling with `ratio = ±r_pitch`; the core builds both and keeps the pair
apart. Give the slider `limits` from the rack's length and the mast's stops. The fork–pallet
contact works (D2); the forks and the mast are jointed, so they cannot collide with each
other — model mast stops as slider limits, not as touching parts.

**R4 — Worm and rack in the compiler; the forklift.** `worm.js` (worm–spur detection at 90°,
ratio 1/teeth, self-lock hold friction), `rack.js` (rack-teeth vs pinion detection, slider
from `rack-slot`), parts: racks, worm box, a fork, `slide-bore` axle connectors;
`world/objects.js` with `load` objects (a pallet 60×40×10 mm, 30 g, with pockets).
*Accept:* **T4 forklift**: a SPIKE medium motor through 8T→rack raises a pallet by 40 mm
(± 1 mm of `r·θ`), holds it when the motor holds, and lowers it; the pallet stays on the
forks (no relative slip > 2 mm over the cycle). **Worm**: with a 24T worm wheel on an arm
loaded 0.05 N·m, the arm turns `θ_worm/24 ± 1 %` when driven, and when the motor coasts it
does not move by more than 0.5° in 5 s.

*R4 as built (2026-10-17, `lane/simlab-r4-20261017`).* Files: `kinds/slide.js` (connector
`slide-bore`), `kinds/worm.js` (connector `worm`, coupling `worm`), `kinds/rack.js` (connector
`rack-teeth`, coupling `rackAndPinion`), `kinds/tooth-parts.js`; `mech/joints.js` (slider joints from
slider edges), `mech/compile.js` (detector `limits`, loads), `physics/jolt-core.js` (the `worm`
builder), `world/objects.js` (loads, the pallet), `world/mats.js` (`warehouse`), the Forklift example
(`static/sim-lab/models/forklift.ldr`, `programs/forklift.bw`). Parts: racks 64781 (1×13) and 3743
(1×4), smooth toggle joint 48496, fork 2823; 4716's `gear: {type: worm}` became a `worm` connector.
Accepted by `test/bw-sim-forklift.test.mjs` (T4 through the VM, the SPIKE controller and the DC model:
pallet +39.82 mm, r·θ 40.03 mm — the 0.2 mm is the pockets' clearance over the tines —, held 5 s
drifting 0.012 mm, back to −0.01 mm, slip 0.00 mm; negative controls), `test/bw-sim-worm.test.mjs`
(driven 1/23.93; coasting 0.0004° in 5 s, braked 0°; hold 0: falls 75.7°), `test/bw-sim-slide-rack.test.mjs`,
the part-meta checks of the new connectors, and the browser `examples` gate. Where it deviates, and why:

- **No `rack-slot`; the guide is a `slide-bore` on an axle.** LEGO has no beam slot a rack runs in that
  the compiler could see; the smooth toggle joint's eyes are made for an axle to run free in. A
  `slide-bore` on an axle is a `slider` edge; one slider joint per body pair, its travel measured from the
  connectors (each bore stays on its axle — one per axle is enough —, and stops at any other part seated
  on that axle), then narrowed by the rack to its teeth. The slider locks the bore's turn about the axle
  (a cylindrical pair, §5.3, is not built): exact on two guides, an approximation on one (the Forklift
  has one guide; the pinion holds the rack's other side).
- **The worm's self-lock** is a gear mesh (1/teeth, signed by the thread's hand, measured from the
  mesh; since 2026-10-19 a `GearMeshConstraint` at the worm's pitch point, which has no friction) plus a hold on the WHEEL's hinge, decided per step: while the motor that drives the worm (its own
  hinge's, or the first actuated hinge a chain of gear couplings reaches) commands motion, no hold; while
  it coasts or brakes, or nothing drives the worm, friction `holdTorqueNm/|ratio|` on the wheel's hinge
  (Jolt applies hinge friction while the hinge's own motor is off: the wheel has none). Physics: a LEGO
  worm's lead angle (≈ 7°) is below plastic's friction angle (11°–19°), so its back-efficiency is
  negative — no wheel torque turns it; a torque on the worm does. `WORM_HOLD_TORQUE_NM` = 0.1 N·m at the
  worm (2.4 N·m at a 24T) is an estimate, above anything a SPIKE motor puts through a train. Forward
  efficiency (real worms 40–60 %) is not modelled. The hold is per-step state (`worms`, rollback-exact).
  A worm island gets 120 velocity iterations: with 30 a 0.05 N·m arm on a worm-driven 24T ran 1.49 % fast
  over 1.6 s (the plain `gear` kind too), with 120 0.28 %.
- **Rack topology limit**: Jolt's RackAndPinionConstraint couples WORLD rates; the coupling is exact while
  the pinion's frame neither turns about the pinion axis nor moves along the rack — a fixed motor driving
  a moving rack (the Forklift). A pinion climbing a fixed rack (motor on the carriage) is not that case.
- **The 8T and the rack are half a hole apart**: a 64781's pitch line is 5 LDU from its face, so with an
  8T (r 10) the rack's centre plane is 15 LDU from the pinion's axis — every part on the carriage sits
  5 LDU off the frame's grid. The Forklift bridges it the way builders do, with an axle connector (32039)
  placed along an axle (`guideTee` on `guideStub`), which holds the guide axle at the carriage's offset.
- **Loads** are a mat's, like obstacles (`warehouse` carries the pallet where the Forklift's tines are
  on its start pose); bodies with `role: 'load'`, drawn in their body's group. `withBodyRoles` keeps a
  role the compiler set.
- **One part's own two pins** in two holes (48496: LDraw draws them frictionless) lock as before but
  without the `locked-hinges` warning: a mount, not a hinge the builder meant to turn.
- **Measured for R3's note**: a held, loaded rack (the motor in SPIKE hold, 45 g on the carriage)
  drifts 0.012 mm in 5 s — no drift correction needed; `SetConstraints` stays unused.

What R6/R7 should know: couplings that are connectors (`worm`, `rack-teeth`) are free detectors in
`kinds/` that reuse `gearHinges` (now in `kinds/gear-mesh.js`) for the frame rules; a detector may bound a
joint's travel (`limits`); the core's coupling builders are still an if-chain in `jolt-core.js`
(`buildGearConstraint` was the shared gear part; since 2026-10-19 `meshGear`). A worm-driven turntable (R7 slewing) and a worm winch get
the self-lock for free; the hold acts on the wheel's hinge, so a wheel that is itself motorised is not
handled. A clutch (R6) is a per-step decision like the worm hold: register its state with
`core.registerState` and act before `Step` (see `applyWormHolds`). The editor's snap still uses the v1
edge rule (no snapping onto slide-bores yet, R16).

**R5 — The emulated-route proof: RCX bytecode VM + RCX profile.** `routes/rcx-vm/`
(clean-room interpreter of the standard-firmware opcodes NQC emits for RCX2: tasks, vars,
timers, `SetOutput/OnFwd/Off/Float/SetPower`, sensors type/mode, `Wait`), `hubs/rcx/`
(profile: outputs A–C pwm with 8 levels, inputs 1–3), devices `rcx-71427` motor,
`rcx-touch`, `rcx-light`, `rcx-rotation` (axle-angle probe, 16 counts/rev); the virtual
`rcxDownload` target; an RCX hub part (or a placeholder brick with correct mass if the LDraw
part is not in the curated subset). VM is worker-resident.
*Accept:* (a) the NQC program `task main(){ OnFwd(OUT_A+OUT_C); Wait(200); Off(OUT_A+OUT_C); }`
compiled by the in-repo `nqc-wasm` and run in the VM drives an RCX driving base (71427
motors, wheels 43.2 mm) a distance within 3 % of the DC-model prediction for 2 s at full
power; (b) `until(SENSOR_1 == 1);` on a touch sensor at the front stops the robot against
the Wall mat's wall within 5 mm of contact; (c) **cross-route**: the same chassis with SPIKE
motors and a `DEVICE SPIKE` program, and with RCX motors and the NQC program, both reach the
wall stop; physics code identical (asserted by the import-graph test); (d) rollback with
the VM in the checkpoint is bit-identical.

**R6 — Clutch gears and the driving ring; the shifting gearbox.** `clutch.js`
(`selectable` coupling), parts: driving ring, hub axle, 16T clutch gears, changeover catch;
`fixture` world object (bench clamp).
*Accept:* **T2**: a 2-speed gearbox on a bench, input motor at 300 °/s, ring moved to
position 1 then 2 by a second motor (or by the test through the changeover catch's hinge):
measured output/input ratios equal the tooth ratios r1, r2 within **3 %** (averaged over 2 s
after engagement); in neutral the output turns < 1° while the input turns 360°; engagement
waits for tooth alignment (no step in output angle > the 10° window).

**R7 — Turntable, rope/winch (approx), hook load; the crane.** `turntable.js`, `rope.js`
(Distance + explicit drum torque, §1.2 M10), parts: turntables, string, hook, drum, pulley;
`load` with `hook-loop` grip (a ring collider the hook catches).
*Accept:* **T1**: a worm-driven winch lifts a 50 g load by 10 cm (rope length change
`r_drum·θ ± 2 mm`), and when the motor stops the load does not drop more than 1 mm in 5 s;
a slewing turntable driven by a worm turns the boom 90° (± 1°) with the load swinging and
settling (amplitude decays); the drum motor's measured torque rises with the load
(50 g vs 100 g: ratio 2 ± 15 %). The `gear-on-turning-frame` diagnostic fires for a crane
with a vertical gear on the superstructure.

**R8 — LWP3 hubs (Boost, Powered Up/Technic, WeDo 2).** SIM-LAB-PLAN A2 as written
(inventory doc first), `Lwp3HubState`, its controller, the LWP3 peripheral in the shim, the
`LwpVirtualHub` adapter, profiles and devices (ids 1, 37, 38, 39, 46, 47, 75, 76).
*Accept:* `legopoweredup` blocks connect to "Virtual Technic Hub" in the Robot Lab and drive
a Control+ L motor model on port A by `motor A run for 360°`: the encoder ends at 360 ± 2°;
a WeDo 2 medium motor (no encoder) runs a belt conveyor; byte-level tests per A2's DoD.

**R9 — Linear actuators, springs, pneumatics; the excavator arm and the pneumatic arm.**
LA (slider + screw coupling + slip state), rubber band `spring`, `fluid/network.js`, parts.
*Accept:* **T7**: 10 pump strokes raise a cylinder-driven arm carrying 20 g by its full
stroke within the network model's predicted stroke count ± 1; the arm holds with the valve
centred (drop < 1 mm in 10 s) and falls when vented; an LA driven by a motor extends its
full stroke in `stroke/lead·2π/ω ± 3 %` and the motor does not stall at the end (slip).
**T3** (arm only, tracks later): boom + stick on two LAs lift a 30 g bucket load 5 cm.

**R10 — Pen and paper; the plotter.** `MarkerDevice`, `world/paper.js`, paper rendering,
touch-sensor home switches (contact probe on a plunger slider), parts for pen holder.
*Accept:* **T5 (XY-table variant)**: a program draws a 5 cm square; the recorded polyline's
corners are within **1 mm** of the commanded square and edges within 0.5 mm of straight;
the pen-up moves leave no trace. Paper-feed variant: 5 cm square within 2 mm (friction feed).
Hubs: SPIKE (R1) and, after R14, Technic Control.

**R11 — NXT VM; R12 — EV3 VM.** As §3.5, each with a profile, devices and the acceptance:
the driving base drives 50 cm and stops on the Wall mat by ultrasonic (NXT: cm; EV3: cm/in),
the same scenario as R5 (c). R11 needs the hosted compiler or a local NXC WASM build (§8 D4).

**R13 — SPIKE firmware in Renode, lockstep (desktop).** §3.5: `RunFor 0.005` per step,
encoder in / duty out, external-shaft mode in the out-of-repo port model.
*Accept (desktop, gated like the existing Renode checks):* the same `DEVICE SPIKE` program
through the firmware-program ABI and through the Scratch route ends the line-follower lap
with the same checkpoint sequence; encoders agree with physics to 1°.

**R14 — Technic Control, WeDo 1.0, Power Functions profiles + an L1 block set.** Interface
A (6 outputs as 3 pairs, 2 binary inputs), 8094 (3 outputs), Interface B (8 outputs with 8
levels, 8 inputs), WeDo 1.0 (2 ports, resistor-ID devices), PF IR (2 outputs × 4 channels).
*Accept:* the plotter (R10) driven through the Interface A profile with optosensor counting.

**R15 — Differential and gears on turning frames, exact.** After §8 D1: `toothContact`
(custom constraint) replaces `gear` where the frame turns; `differential` uses it.
*Accept:* **T6**: an open diff on a bench, carrier driven at 200 °/s, one output held: the
other turns at 400 ± 2 °/s; both free and equal load: both 200 ± 2 °/s; on a car, a 0.5 m
radius turn gives wheel speed ratio `(R+w/2)/(R−w/2) ± 3 %`. The S1 driving base and all
gear fixtures unchanged. (Without D1: the JS lumped-diff approximation with the same
kinematic acceptance but a 5 % tolerance and a note.)

**R16 — Multi-hub, editor and instructions for links.** Port picker per hub profile, hub
picker, link tools (hose, string, cable), insight overlays for new kinds, instruction steps
for links, `!BW LINK`/`!BW PORT … HUB` metas. *Browser* acceptance: build a 2-hub excavator
(Control+ ×2) in the editor, save, reopen byte-identically, both hubs drive their motors.

Order and dependencies: R0 → R1 (C) → R2 (C) → R3 (C) → {R4, R5, R6} in parallel → R7 →
{R8, R9, R10} → {R11, R12, R13, R14} → R15 (after D1) → R16 (editor work can start after R2
for the parts and kinds that exist).

---

## 8. Risks and decisions for the owner

**Decisions** (each blocks the slice named):

- **D1 — Custom Jolt WASM build?** (blocks R15 exact form; improves R7). Three small C++
  constraints — `ToothContact` (frame-relative gear mesh: differentials, gears on
  turntables/yawing chassis), `Rope` (length over moving sheaves with a drum term),
  `SlipCoupling` (torque-limited gear/rack: LA clutch) — need our own build of
  JoltPhysics.js (MIT; emscripten toolchain, a vendored pin, a size/iOS check under
  SIM-LAB-PLAN F3). Alternative: JS constraints in `PhysicsStepListenerJS` (outside the
  solver iterations: kinematically right, weak under load; acceptance tolerances loosen to
  5 %). Recommendation: custom build, but only when R15 is next.
- **D2 — Dynamic–dynamic collisions.** Turning them on for robot–load pairs (R3) changes the
  contact budget and the S1 tuning assumptions. Recommendation: on for loads only; robot
  self-collision stays off (a known, documented non-goal).
- **D3 — Emulated routes and rewind.** L3 (Renode) cannot be rewound by Jolt; either Renode
  snapshots per batch (cost unknown) or "an L3 hub is alone in its scene" (recommended).
  Also: the lockstep change needs the out-of-repo `renode-infrastructure-spike-prime` port
  model to accept an external shaft angle — a change in another repo.
- **D4 — NXT/EV3/RCX VMs from public documentation.** Clean-room JS VMs written from LEGO's
  published bytecode/executable specifications (as SIM-LAB-PLAN §7 allows for LWP3 docs:
  "may be read"); no GPL firmware or brickEmu code consulted. NXT needs the hosted NXC
  compiler (network) or a local NXC WASM build (like `nqc-wasm`). Owner to confirm the
  licence stance and whether a network-dependent route is acceptable for the Lab.
- **D5 — Which drive level for SPIKE long-term.** Keep the ideal servo (today, matches the
  arena) or move SPIKE to its controller → pwm → DC model (more realistic stalls and
  sag, different numbers from the arena). Recommendation: keep servo; the DC model is for
  unregulated hubs and emulated firmwares.
- **D6 — Device numbers.** Every `DeviceModel` needs a cited `source`. Who measures (a bench
  with real motors, or published community measurements)? Until then values marked **~** in
  §2 are placeholders and acceptance tests compare against the model's own prediction, not
  the real motor.
- **D7 — "The 1990 plotter".** Which set and which mechanism (paper-feed rollers or XY
  table, which pen lift), and whether the Technic Control interface (R14) must drive it in
  the first plotter slice. R10 builds the XY variant on SPIKE first.

**Risks** (with the tripwire that catches them):

| Risk | Tripwire |
|---|---|
| Stiff gear chains with sliders/racks/worms do not converge at 5 ms (the S1 lesson needed 30 velocity steps for gears, `jolt-core.js:79–85`) | each coupling module's acceptance includes a loaded case; `GEAR_VELOCITY_STEPS` generalised per coupling and measured |
| The explicit DC-motor torque (one-step lag) oscillates for light, fast motors (2838: ~4000 rpm, tiny inertia) | R3 (c) per-motor stability test; fall back to sub-stepping the actuator inside the step |
| Bit-identical rollback breaks with JS-side state (fluid, ropes, VMs) | §6.4 registry + the all-kinds rollback test |
| Friction-driven paper feed and fork–pallet friction at mm scale are not accurate | acceptance for the exact variants first (XY plotter, pockets), friction variants with looser tolerances |
| Performance with many bodies (excavator, 2 hubs, tracks): today 42 bodies ≈ 50 ms work per simulated second (SIM-LAB-PLAN §4.9 table) | per-slice bench line in `scripts/bench-sim-lab-worker.mjs`; real-time factor shown in the pane |
| Part metadata volume (rack, clutch, pneumatics, turntables are complex meshes) | the existing geometric validator (`test/bw-sim-part-meta.test.mjs`) extended per new connector kind before parts are added |
| Scope: 15+ hub families | profiles are data; only R5 (RCX) and R8 (LWP3) are needed to prove the boundary; the rest is demand-driven |

### Owner decisions (2026-10-17)

- **D2 → everything collides.** Robot–load contact AND robot self-collision. Bodies joined by a
  joint (hinge, slider, ball, the motor's housing/output pair) and parts sitting in each other's
  holes must not collide with each other — R3 builds a pair filter from the compiled joints and
  connector edges (not a blanket group rule), measures the cost on the S1 base and the gear
  trains, and re-tunes where contacts change behaviour, stating each changed expectation.
- **D4 → clean-room VMs from LEGO's published specifications; NXT may use the hosted NXC
  compiler** until a local WASM build exists.
- **D5 → the DC-motor model for SPIKE too.** SPIKE's controller drives a `pwm` DC model like
  every other hub (the ideal servo stays only as a test fixture). This is its own slice after
  R3: arena and Robot Lab numbers will differ from today's; every changed expectation is
  re-derived and named in the commit, never silently loosened.
- **D7 → the XY plotter on SPIKE first (R10), and later the 1990 set 8094 (Control Center)
  plotter** with the Technic Control interface (R14).
- **D6 → Philo's LEGO motor comparison** (https://philohome.com/motors/motorcomp.htm) is the
  source for motor numbers; LEGO's sheets and Pybricks' identified models are kept as cross-checks.
  See "D6 as built".
- D1, D3: open (not yet needed).

### D5 as built (2026-10-17, `lane/simlab-dc-20261017`)

- **Drive.** `hubs/spike/profile.js` `drive: 'pwm'`. The SPIKE controller is two layers:
  the unchanged `spike-sim/independent-backend.js` (shared with the kinematic arena) is the
  **trajectory generator** (ramps, run for degrees/time, run to position, hold, stop actions),
  run by `SpikeVirtualHub.advanceTo` on a *reference* angle; `hubs/spike/spike-motor-controller.js`
  is the **feedback loop** on the physics encoder: `duty = ωr/ω0 + (Kp·e + Ki·∫e + Kd·(ωr − ω))/τs`
  (Pybricks' structure: track a reference angle, so a slowed motor catches up), anti-windup,
  reference drag at 1.5·τs of P, stall = saturated and < 20 °/s for 200 ms (reported to the
  backend as its load input). Gains are torques (8, 40, 0.3 of duty for the medium motor),
  grid-searched on the DC model with the 5 ms hold over 2.5e-4…3e-3 kg·m²; above ~5e-3 the
  loop rings during ramps. Brake/coast are passive H-bridge states (duty 0); hold is the loop
  on a fixed angle. A position command completes when the shaft is within 1° and slower than
  30 °/s (backend hook `positionSettled`, unset in the arena).
- **DC model.** `physics/actuators.js` `pwm` → core `torque` mode `τ = τs·u − (τs/ω0)·ω`, solved
  implicitly by Jolt as one soft position motor (backward Euler; a braked flywheel decays 7 %
  slower than the continuous exponential at τ = 33 ms). Duty is clamped to ±1, `u = duty·V/V_nom`
  is not (a 9 V port runs a 7.2 V motor faster). Coast: Jolt hinge friction = gearbox friction.
  The rotor's reflected inertia J is added about the axis to both moving bodies of the hinge
  (`setRotorInertia`; exact unless both turn together about the axis). As a term in the motor
  constraint instead, the gear constraint could not hold a light 24T against a wall (measured).
- **Numbers** (superseded by "D6 as built" below; the v2 device catalogue `devices/catalog.js`, each field with `sources`;
  `devices/dc-motors.js` resolves an actuator's DC model): ω0 at 7.2 V and the 360-count encoder
  from LEGO's fact sheets (medium 185 rpm, large 175 rpm; the 7.2 V test supply is stated on the
  medium sheet and assumed for the large); τs medium 18 N·cm (LEGO); gearbox friction
  (0.021 / 0.023 N·m) and rotor inertia (3.0e-4 / 1.2e-3 kg·m²) from Pybricks' identified
  observer models (community measurement). The large motor's τs stays R2's 0.38 N·m (the v2
  migration pins it), marked estimated: LEGO's sheet says 0.25, Pybricks' model 0.45 — for D6. Not modelled: hub current limit,
  battery sag, backlash, speed-dependent friction.
- **Core fix found on the way.** Jolt gives a body with principal moments under 1e-6 kg·m² the
  inertia of a 1 m sphere (0.4·m): gears, the castor ball, small arms were ~1000× too heavy
  rotationally (the ideal servo hid it; with real torques the castor ball's spin drove a braked
  base). `jolt-core.js fixSmallInertia` restores the shape's inertia; gear bodies are floored
  at 3e-5 kg·m² and gear islands get 10 position iterations (solver conditioning, measured).

### D6 as built (2026-10-17, `lane/simlab-motors-20261017`)

- **Source.** Philo's page returns HTTP 403 to tools; it was read from the Internet Archive snapshot
  `web.archive.org/web/20260918072225/…/motorcomp.htm` (SHA-1 digest `MCQCRRXD…`, the same
  content in every 2026 snapshot). Every value is cited `philohome-motorcomp@2026-09-18`; only
  measured numbers are recorded (`DeviceModel.measured.philo`), none of the page's prose.
- **Model** (`devices/catalog.js`): `i = (u − k_e·ω)/R`, `τ = k_t·(i − i0)` at the output, so
  `τs(V) = k_t·(V/R − i0)`, `ω0(V) = (V − R·i0)/k_e`, slope `k_t·k_e/R` independent of V.
  `fitDcModel` takes R from the 9 V stall current, k_t from stall torque/(stall − no-load
  current), k_e from the 9 V no-load point, τf = k_t·i0. `dcLineAt(motor, V)` gives the line at
  any supply; `physics/actuators.js` drives `duty·τs(V_port)` with damping `k_t·k_e/R` (D5's
  `u = duty·V/V_nom` scaling is gone: a 9 V port gives Philo's 9 V numbers, not 9/7.2 of the
  7.2 V ones). The friction sits inside the driven line scaled by |duty| (exact at 0 and ±1).
- **Supplies** (`HUB_SUPPLY_VOLTS`, all marked estimated): SPIKE 7.2 V (7.3 V Li-ion less the
  H-bridge drop; LEGO's test supply; 8.3 V full adds 17–18 %); RCX, NXT, EV3, PF battery box,
  Powered Up / Technic / Move hub 9 V (6 alkaline cells; their Li-ion/NiMH packs 7.2–7.4 V).
- **SPIKE fits** (Philo 9 V: M 228 rpm, 0.10 A, 13.5 N·cm, 0.85 A; L 213 rpm, 0.11 A,
  33.5 N·cm, 1.8 A): medium R 10.59 Ω, k_t 0.180 N·m/A, k_e 0.333 V·s/rad, τf 18.0 mN·m →
  at 7.2 V τs 10.44 N·cm, ω0 176 rpm (R2: 18 N·cm, 185 rpm; −42 %); large R 5.00 Ω, k_t
  0.198, k_e 0.379, τf 21.8 mN·m → 26.4 N·cm, 168 rpm (R2: 38 N·cm, 175 rpm; −31 %). Philo's
  load points (4.48 / 8.47 N·cm, 4.5–12 V): speed residuals medium −4…+12 % (9 V: 152 vs 138 rpm,
  +10 %), large −5…+2 %; currents over-predicted 9–31 % (k_t from the stall point is below what
  the load points imply; he calls his stall torques "very imprecise"). LEGO's sheets at 7.2 V:
  no-load speeds −5 / −4 %, max-efficiency speeds −13 / −14 % (sheet tolerance ±15 %); medium
  stall torque 42 % below LEGO's 18 N·cm (Pybricks: 16 N·cm), large +5 %. Friction agrees with
  Pybricks (18.0 vs 21.4, 21.8 vs 23.2 mN·m); rotor inertia stays Pybricks' (Philo has none).
- **Other motors** (catalogue entries, no parts, for future hubs): 2838, 71427, 43362, 47154,
  5292 (outer output, 1240 rpm), NXT, EV3 L/M, PF M/L/XL/Train, PUP medium (LPF2 1) and train (2),
  Boost interactive (38) and Move-hub (39), Control+ L (46) and XL (47); Pybricks' inertia where it
  has a model (NXT, EV3, Boost, Control+). At 9 V every one is within 15 % of its own load point
  (worst Boost external −15 %); at 4.5 V the old motors fall far below the line (friction rises at
  low speed). Not added: micromotor 2986 (the line through its points misses its load point by
  56 %), E-motor, 9V/RC train motors (outside the motors named for D6).
- **What changed in behaviour** (same checks, same bounds; measured old → new): DC tests (a) no-load
  1108 → 1055 °/s medium, 1047 → 1002 large (ω0 1110 → 1058, 1050 → 1006); (b) τs 18 → 10.44,
  38 → 26.36 N·cm; (c) brake to 10 % 85 → 130 ms, 145 → 195 ms (τ = I·ω0/τs grows), coast 245 →
  280 ms, 845 → 860 ms; (e) hold deflection 1.72 → 1.06°, 4.11 → 3.06° (half the smaller τs);
  (f) recovery 30 → 10 ms, 70 → 65 ms; (d), (g) unchanged. Wall stopper 9.0 → 8.6 cm (the brake's
  back-EMF damping fell 39 %, the base rolls 4 mm further; window 8–12 cm). Line follower lap
  22.5 s / 22.6 s unchanged (30 % speed, far from saturation), colour explorer red square at
  4.7 → 4.8 s, gear ratios exact, 8-24 stall still stalls (blocked −0.24 → −0.06 °/s), R3
  rack/slider tests do not use the DC model. The SPIKE motors at 7.2 V top out at 1058 / 1006 °/s,
  below the API's 1110 / 1050 °/s: a 100 % command saturates the duty (a fresh 8.3 V battery
  reaches 1247 / 1172 °/s).
- **v1 files.** PartMeta v1 held 0.18 / 0.38 N·m; `DeviceModel.v1` keeps them, and the v1→v2
  migration recognises exactly those numbers on exactly those parts as the catalogue motor.
- Tests: `test/bw-sim-motor-catalogue.test.mjs` (self-consistency, Philo's 9 V numbers transcribed
  independently, load-point residuals, LEGO cross-check with documented disagreements, sources).

### Gear mechanics as built (2026-10-18, `lane/simlab-gearbox-20261018`)

- **The generalised gear rule** (`mech/gears.js`): a mesh fixes the two gears' rotation
  *relative to a frame F that holds both axes* — Willis, `(ω₂ − ω_F)·â₂ = ratio · (ω₁ − ω_F)·â₁`.
  The v1 common-frame case (both hinges turn in F) is unchanged and bit-identical (every shipped
  model and fixture compiles to the same mechanism as before; checked by hashing them). Two
  more cases are found and emitted as the coupling kind `relativeGear` (`kinds/relative-gear.js`):
  **chain** — F is reached through hinges coaxial with a gear (a clutch gear free on its axle,
  the axle turning in the gearbox frame; a slip clutch's gear on its axle); **carrier** — both
  hinges turn in F, but a gear's body also turns coaxially in a body heavier than F, so F turns
  about that gear's axis (the differential casing riding its side axles; an arm swinging about a
  gear's axle). Anchors are tooth points fixed in F one pitch radius from each axis, so |ratio|
  is the tooth ratio even where LDraw seats a bevel off its pitch cone (the official
  differential seats its 12T satellites 17 LDU from the apex; `kinds/bevel.js` SEAT_TOL_LDU 2).
- **Physics** (`physics/jolt-core.js`, since 2026-10-19): every `relativeGear` is the fork's
  `GearMeshConstraint` between the two gear bodies (the same as the 'gear' kind). A carrier mesh
  (both hinges turn in F) gets those two hinges, so F carries the reaction and the mesh is exact
  however F moves (a held-side differential: 1.9999× / 2.0000× the casing for Willis' 2). A chain
  mesh (the gear's own hinge turns in an axle, not in F) gets no hinges — its frames count as at
  rest, exact while F does not turn, as before. (Until 2026-10-19: a GearConstraint, and for a
  carrier a SixDOF tooth-point contact re-made before every step with 240 velocity iterations,
  1.992×.)
- **Clutches**: `kinds/transmission.js` — the driving ring's spline bore on a ridged joiner is a
  slider; `dogClutch` locks the clutch gear's hinge (a friction of 2.5 N·m) while the ring's
  teeth are ≥ 4 LDU in its socket, and narrows the ring's travel to the sockets' depth;
  `shiftFork` couples the catch's hinge and the ring's slider (linearised swing, 2.3 % at the full
  8 LDU). `kinds/slip-clutch.js` — the 24T clutch gear's hub is a hinge with friction
  3.75 N·cm (stamped 2.5–5 N·cm; Munafo, LUGNET 1999). `kinds/gear-seat.js` — the differential's
  satellite cradles (hinges) and its cover's clip (rigid), read from LDraw's assembly 65414c01.
- **Closed loops**: every mesh is an equation between two gears' rates in a frame; union-find
  with rate factors finds loops. A consistent loop is kept (both paths carry load); an
  inconsistent one locks (`gear-loop-locked`), its gears welded to the frame.
- **Parts** (derived, `scripts/derive-part-meta.mjs` "transmission parts" section): clutch gears
  18946, 81346, 2471, 35185 (sockets measured by rays; 6542a/b refused: both faces measure as
  sockets, which one carries the teeth is not measurable), peghole bevels 87407, 65413, driving
  ring 6539, changeover catch 6641, slip clutch 76019, differential casing 65414; the joiners
  6538a/b gain a spline and a cylinder collider. Not done: the older differentials 6573/62821
  (no LDraw assembly places their satellites), the 3L ring 18947 and its joiner 18948, the rotary
  catch 35188, double bevels meshing as spur gears, worm/rack inside carriers.
- Tests: `test/bw-sim-gearbox.test.mjs`, `test/bw-sim-gearbox-program.test.mjs`.

### Validation fixes as built (2026-10-18, `lane/simlab-validate-20261018`)

The six faults `test/bw-sim-validation.test.mjs` found (docs/ROBOT-LAB-VALIDATION.md has the
numbers per machine); all 22 of its tests pass with their original expectations and tolerances.

- **Collision filter (D2, refined).** `mech/collision-filter.js`. (1) *Axis groups:* connector
  endpoints joined by an edge are one group (a pin and the holes on it, an axle and everything on
  it; a motor's housing and output share its axis). Every body pair in one group joins
  `noCollide`, jointed or not: two beams on a frictionless pin are hinged to the pin, not to each
  other, and rubbed face to face. (2) *Local exclusion* (`localNoCollide`): for each noCollide body
  pair the compiler lists the PART pairs to keep apart — parts seated in one axis group (a motor's
  two halves count as one part), parts that already interpenetrate at t = 0 by more than the contact
  slop (`nested`: a differential's side gears and planets inside its casing's solid envelope; a
  coupling kind's carrier joint has no connector edge to say they are seated), and parts the pair's relative motion can never bring together: a
  hinge keeps each part's interval along its line and its distance band from it (exact for boxes:
  the corners projected across the line), a ball keeps distance from its point. If that is every
  part pair the body pair stays whole in the `GroupFilterTable` (C++, broad phase); otherwise it is
  in `CompiledMechanismV2.noCollideParts` ([bodyA, bodyB, [[partA, partB], …]]; colliders carry
  `part`) and `jolt-core.js` refuses those sub-shape pairs in a Jolt `SimShapeFilterJS`. The filter
  is JavaScript per sub-shape pair of every body pair in the narrow phase (0.19 µs a call; ~2,000
  calls a step on the 2,054-part stress model, +28 %), so it is installed only when a mechanism
  has such a pair. Couplings stay whole; slider pairs are local since the Forklift's tines moved
  off its guide axle's line (2026-10-19).
- **Centre of mass and inertia.** `mech/islands.js` gives each collider `part` and `massKg` (its
  part's mass shared by volume; a motor's halves split by `massFraction`); `jolt-core.js` sets each
  sub-shape's density to `massKg / volume`, so Jolt's compound mass properties are the parts'
  (parallel-axis per sub-shape). The total stays `massKg` (override, CalculateInertia). A mechanism
  without tags keeps one density. Every robot's centre of mass moved a little; the shipped
  examples' tests are unchanged.
- **Free spinners.** One mechanism, `mech/free-pins.js` (the excavator lane's; the validation lane's
  `islands.js freeSpinnerWelds` was removed at the merge): a body made only of shaft parts (no solid
  collider, no teeth or tooth connector) whose joints are two or more motorless hinges on one line to
  different bodies is welded to the first of them, inside the topology fixpoint. It judges the BODY
  with its compiled joints, so it also covers a pin rigid with a bush, and it knows the screw and
  turntable kinds; the validation lane's case of three beams on one pin was added (two or more
  joints, not exactly two). Balance droop 0.07°, pendulum period +0.1 %.
- **Motion quality.** Every dynamic body of up to `CCD_MAX_COLLIDERS` (8) colliders is
  `EMotionQuality_LinearCast` (cast only when it moves more than `mLinearCastThreshold` 0.25 of its
  inner radius in a step). Cost: a fixed ~13 µs per step (35 → 48 µs on the shipped examples, +1.5 %
  on the stress model). Bigger bodies are Discrete (2026-10-20): a compound's inner radius is its
  thinnest sub-shape, so a real set's 500-part frame was swept nearly every step — 350–600 ms a step
  on the 4x4 Off-Roader and a wheel loader, 15–30 ms Discrete (CPU time, same motors turning, nothing
  flung).
- **Solver iterations of motorised hinges.** The rotor's reflected inertia (3e-4 kg·m²) on a few
  grams of output makes a contact's impulse mostly translate the body (the hinge takes it back):
  per iteration the turn a contact must stop shrinks only by ε = m·r² / (I_axis + m·r²)
  (`motorEpsilon`; a beam-5 arm 0.011, a SPIKE wheel 0.048, a chassis ≈ 0.8). Measured on the stall
  bench, velocity steps hardly matter and are not monotonic (300 let the arm through); position
  steps push the arm back out (5: +6.4°, 20: +2.8°, 30: +2.0°, 60: +1.2° past first touch). A
  motorised hinge gets 30 velocity steps and 0.33/ε position steps in [5, 40], set when the rotor
  inertia is (`setMotorSteps`): the arm 30, a wheel 7. Position steps are the cost (they re-solve
  every contact of the island).
- *(Superseded the same day by the Jolt fork, below.)* **Meshes on a moving frame (merge with the excavator lane, 2026-10-19).** Jolt's GearConstraint
  couples the gear bodies' WORLD rates; a frame turning about the gear axes at Ω drives the gears
  (1 + |ratio|)·Ω wrong relative to it. A 'gear' coupling of parallel, vertical axes (external mesh)
  whose shared frame is dynamic is now built as the gearbox lane's tooth contact (`movingFrameMesh` →
  the relativeGear carrier path, re-made at the frame's pitch point every step), plus a slip memory:
  the re-made contact starts offset along its tangent by the arc the hinges' angles say has slipped,
  so its position steps pull the mesh back (without it the slew mesh slipped 8–14° in a dig cycle).
  Measured: slew motor −336° / +293° → turntable +96 / −84 expected at 8/28, +99.5 / −84.9 seen.
  Horizontal-axis meshes on moving frames (an actuator's 16T pair on a boom) keep the gear
  constraint they were tuned with — a documented limit.
- *(Resolved by the Jolt fork, below: 5.0°.)* **Open: the Excavator's base yaw.** With the mesh exact, the dig cycle's base yaws far beyond the
  test's 10° (139° measured; 68.7° with every validation fix off): the upper structure's moment about
  the turntable axis (≈ 2.0e-3 kg·m², point masses) is ~5× the base's (≈ 3.8e-4), so a free base turns
  ~75° against a 90° swing, and the floor's grip (≈ 0.3 N·m: 0.47 kg on tyres 70 mm out) is below the
  slew's peak torque (≈ 0.37 N·m: the 0.10 N·m stall × 3.5). The lane's 4.1° came from the world-rate
  error acting as a spring on the base's yaw, and was hypersensitive (4–85° with unrelated solver
  changes). The model (heavier/wider base, slower slew) or the bound needs the lead's decision.
- **Cost overall** (median step, min of 5 runs, node, 200 Hz): shipped examples 35–38 → 67–70 µs,
  Forklift 52 → 51 µs, 2,054-part stress model 1,329 → 1,366 µs (+2.7 %).


### Excavator as built (2026-10-18, `lane/simlab-excavator-20261018`)

The T3 machine with wheels (tracks are later, M6): `static/sim-lab/models/excavator.ldr`, written by
`scripts/gen-excavator-model.mjs` from a few numbers, with `programs/excavator.bw`. Six SPIKE medium
motors: A/B wheels, C slew, D boom, E stick, F bucket.

- **Turntable (M9), `kinds/turntable.js`.** LDraw draws a turntable's halves assembled on one origin
  (their meshes nest without interpenetrating there, which the shipped-model mesh check confirms), so
  the deriver gives the top half a `turntable-ring` and the bottom a `turntable-race` connector at
  that origin on the y axis; ring + race (centres 0.5 LDU, axes 1°) is a `hinge` edge. The top half's
  teeth are an ordinary spur `gear` (60 or 28 teeth, counted on the mesh by the metadata test; tip
  0.75 LDU short of module 1, allowed 1 LDU), so a pinion meshes through `kinds/spur.js` and the
  common-frame rule applies unchanged: the pinion's axle turns in the base the bottom half is fixed
  to, and the top half turns in that base through the turntable hinge. The halves' colliders (a disc,
  a hub, the mounting blocks) overlap where the meshes interleave; `TURNTABLE_NEST` is a coupling
  module that emits no coupling, only `placedMesh` for the editor's overlap rule. Parts: 18938/18939,
  99010/99009 (derived, with their pin holes).
- **Linear actuator (M5), `kinds/screw.js` + `physics/screw.js`.** The small actuator is three LDraw
  parts: body 92693c01, spindle 92695, piston 92696. Connector kinds: `screw-bearing` (body) +
  `screw-spindle` (spindle) = hinge; `la-bore` (body's front bore) + `la-rod` (piston) = slider;
  `screw-nut` (the piston's rear end). The coupling `screw` (a spindle on a hinge in frame F, a nut on
  its thread on a body that slides in F) has `ratio = σ·(−hand·lead/2π)·(a·s)` m/rad, the slider's
  travel narrowed to the thread. Lead: LDraw's contracted/extended assemblies give the stroke (60 LDU
  = 24 mm), a measured 7165° per full stroke (Eurobricks, 2023, six encoder readings) gives 19.90
  turns: 1.206 mm per turn; right-hand assumed (LDraw draws no thread). Lead angle 9.1° on the 2.4 mm
  rod, below plastic's friction angle (μ 0.2–0.35): self-locking; η = tan λ / tan(λ + φ) ≈ 0.35.
  Physics, all relative to the actuator's body (a world-rate RackAndPinionConstraint would move the
  stick's actuator with the boom): the slider's limits are pinned each step to x* = x0 + ratio·(θ − θ0)
  (hard constraints), its motor runs at ratio·ω; a load averaged over 50 ms above the clutch force
  (60 N, a stated modelling number: no published measurement found) slips the clutch; at an end stop
  x* stops while the spindle turns on; the held force costs the spindle |F|·|ratio|/η of torque
  (explicit, one step). The island gets 60/10 solver iterations, and the actuator's parts and what is
  hinged to them at least 20 g of solver mass with their gravity factor scaled back (a 0.4 g piston
  between a hard limit and a boom let its hinge open 3 mm).
- **Free pins (`mech/free-pins.js`).** A frictionless pin or axle that only joins two parts on one
  line is welded to one of them: one hinge instead of a 0.25 g body between two (a loop of such
  bodies sagged ±4° at rest).
- **Gear changes (for the gearbox lane to know).** `kinds/gear-mesh.js` `meshRatio` takes gear 2's
  lever as its pitch radius (a mesh 0.3 LDU off nominal no longer bends the tooth ratio:
  28/8 = 3.5, not 3.6); `mech/gears.js` reports `unsupported-gear` for a spur–bevel pair only where
  the pitch circles come within a module of touching. Nothing else in gears.js changed.
- **Limits.** The slew drive is an 8T on the 28T (no worm: no room for one under the turntable with
  a SPIKE motor), back-drivable: the arm's loads turn it a few degrees under the motor's hold (the
  example's swings are −81°/+99° for a commanded ±90°, see the test). *Since 2026-10-19:* a spur mesh
  with vertical axes on a moving frame (this slew mesh) is a tooth contact relative to the frame, not
  Jolt's world-rate gear constraint (see "Validation fixes as built"), and the base's yaw is open (below). The floor is rigid,
  so "digging" is the teeth reaching the floor; there is no soil. Wheels, not tracks. The motors
  are on the frame/boom/stick, each driving its actuator's pivot axle through 16T gears and a 12T
  bevel pair inside the actuator's fork.
- Tests: `test/bw-sim-linear-actuator.test.mjs`, `test/bw-sim-turntable.test.mjs`,
  `test/bw-sim-excavator.test.mjs`; the model is in `test/bw-sim-models-solid.test.mjs` and the
  instructions tests like every MODELS entry.

### The Jolt fork, 1.1.0-bw.3 (2026-10-20): a bounce across two bodies, restitution per material pair

`jolt-physics` is **1.1.0-bw.3** (same pinning as below: `scripts/integrate.mjs` URL + sha512, the GUI lockfile).
Two additions, both documented in the forks' `BRICKWRIGHT.md` files: (3) JoltPhysics `a40ff0b`,
`JobResolveCCDContacts` leaves a CCD impact that would bounce while the body touches another body as well to the
next step's discrete solve (a brick landing across two beams turned over; single-body bounces and impacts that do
not bounce are upstream's bit for bit); (4) JoltPhysics.js `MaterialPairs` (bindings only): restitution from a
material-pair table, a body's material in its user data. The core installs the table from `contracts.js
restitutionOf` (`physics/materials.js`); a Jolt build without it falls back to Jolt's max rule. Results:
docs/ROBOT-LAB-VALIDATION.md "Materials".

### Gear meshes as built: the Jolt fork (2026-10-19, `lane/simlab-next6-20261019`)

Owner decision: patch Jolt in our fork. `jolt-physics` is now **1.1.0-bw.2**, the Brickwright fork
of JoltPhysics.js (<https://github.com/CrispStrobe/JoltPhysics.js>, branch `brickwright/gear-mesh`,
`BRICKWRIGHT.md`), built against <https://github.com/CrispStrobe/JoltPhysics> (Jolt v5.6.0 + the
fix). It is pinned to its release tarball by URL and sha512 (`scripts/integrate.mjs`
`JOLT_PHYSICS_URL` / `JOLT_PHYSICS_INTEGRITY`; the GUI lockfile must carry exactly that integrity,
and npm checks the bytes before unpacking; `test/fetch-pinning.test.mjs` lists the site). MIT, as
upstream. Everything but the gear constraints is bit-identical to 1.1.0 (the fork's regression scene).

- **What the fork fixes.** Upstream `GearConstraintPart` applied λ, not ratio·λ, to gear 2: torque
  crossed a mesh 1:1 (an 8:24 train put 3× the load on its motor; ratios < 1 or negative diverged).
  And a gear constraint is angular-only: no reaction on the axles, so a machine on a free frame gained
  angular momentum. The fork's `GearConstraint` passes torque × ratio; its new `GearMeshConstraint` is
  the mesh as a 1-D tooth contact at the pitch point P along the line of action n:
  n·(V2(P) − V1(P)) = 0, each V the gear's material point velocity written relative to its frame (the
  other body of its hinge). The impulse is a force pair at P: torque × ratio, the reaction on the
  frame(s), momentum conserved. Parallel axes (spur, internal): P from the ratio on the line of
  centres. Crossed axes (worm, bevel): P given (`mContactPoint`), n chosen so the ratio holds.
- **The core** (`physics/jolt-core.js` `meshGear`, `hingeMesh`): every 'gear', 'worm' and
  'relativeGear' coupling is a `GearMeshConstraint` between the two gear bodies. Axes are the hinge
  axes signed by the gear's side (+ on body2), so the contract ratio ω(joint2) = ratio·ω(joint1) is
  `mRatio` as it is — no pair ordering, no axis flip. `SetConstraints(hinge1, hinge2)` hands over each
  gear's hinge (its other body is the frame); a chain relativeGear (the gear's own hinge turns in an
  axle, not in F) hands over none. Worm: `mContactPoint` on the common perpendicular of the axes,
  the wheel's pitch radius (0.5 mm per tooth) from the wheel's axis; the self-lock hold is unchanged
  (the mesh has no friction). A 'gear' bevel (crossed axes, no pitch point in the coupling): P in the
  plane of the axes at P − O ∝ a1 − ratio·a2 — the pitch speeds are then ratio : 1, and with both gears
  in one frame the reaction is a couple, so P's scale does not matter. Deleted: `buildGearConstraint`
  and its |ratio| ≤ 1 swap, `movingFrameMesh` with its per-step re-made contact and slip memory, the
  carrier SixDOF contact (`anchorRelativeGears`, `CARRIER_VELOCITY_STEPS` 240). Rack and pinion is
  unchanged (Jolt's was right).
- **Phase re-based every step.** The fork's mesh can also correct accumulated phase error from the
  hinges' angles (Baumgarte, in the position steps). Kept across steps that correction fought the rest
  of the solve: a stalled DC motor's arm on a driven 24T went 7.7° into a static block (the contact on
  a light arm gives way before the mesh does), and the Excavator's bucket actuator chain rang and
  diverged (NaN) within a second of curling. `SetConstraints` is called again before every step, so
  the position steps remove each step's own drift; slip the solver cannot prevent stays slipped (the
  stalled arm's impact: 10.5° of the 24T), as it did with the gear constraint.
- **Solver floors.** Gear bodies get a mass of at least 20 g (`GEAR_MIN_MASS_KG`, weight kept by the
  gravity factor, inertia kept; screw.js does the same for an actuator's parts): a light gear between
  its hinge and a contact or a mesh is pushed sideways and turns only a little per iteration (without
  it the slew pinion slipped 17° of the turntable in a dig cycle and the stalled arm kept rocking).
  `GEAR_MIN_INERTIA` 3e-5 re-measured and kept (1e-5 and 3e-6 let the stalled arm bounce off its
  block). A mesh island solves with `MESH_VELOCITY_STEPS` 120 (the Excavator's boom left its
  law-of-cosines angle by 1.73° with 30, 0.73° with 120).
- **Results** (docs/ROBOT-LAB-VALIDATION.md): 8:24 dyno 16.205 rad/s for 16.253 (was 11.796), η 0.979
  (was 0.332); Excavator dig-cycle base yaw 5.0° (was 139.4°), swings −81.1° / +98.7°; a free-floating
  gearbox keeps its angular momentum to 1.1e-3 of its parts' spin (the integrator's residual: Jolt has
  no gyroscopic term); Willis 1.9999. `core.bodyAngularMomentum(id, about)` reads a body's L with the
  solver's mass and inertia.
- **Cost** (node, 200 Hz, µs per step over a 3 s run with every motor turning, min of 3 runs
  alternating Jolt 1.1.0 + the old core and the fork + this core): Excavator 2048 → 1705 (−17 %),
  Differential 611 → 427 (−30 %), Two-speed gearbox 468 → 568 (+21 %: 120 iterations instead of 30),
  Forklift 121 → 118; models without gears and the 2,054-part stress model unchanged within the
  noise (60–80 µs; 1855 → 1891).
