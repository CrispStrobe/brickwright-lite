# SineShuttle — declared qualification contract, revision 1

Copyright (c) 2026 CrispStrobe. SPDX-License-Identifier: BSD-3-Clause.

Declared before the complete freestanding native VM run. This contract is not a result.

## Physical question and frozen inputs

Can a fixed, motor-driven crank move a captured, freely pivoting follower across a translating yoke, producing a passive sinusoidal 32 mm stroke at two speeds and in reverse? Both perpendicular slides must be supported by two separated physical guides, with the chassis resting on its own base runners.

- Model: `models/sine-shuttle.ldr`, 105 placements; SHA-256 `926ff367e004a5bfae9173eab354e305d25e62a7f28c7ec1b47d5c766fcff6c2`.
- Program: `programs/sine-shuttle.bw`; SHA-256 `e0157ad0cf55b90cfc1c93a6ced47c4c805dd4f9de0b0ffb281832c12c2a45e7`.
- Selected runtime: `e8afd8281647bd5d06d31d9e01885d7d76a85412`; unchanged verified native runtime, as recorded in `evidence/runtime/`.
- Four dynamic assemblies: chassis, driven crank/rotor, red follower, blue yoke. One ground body, two true hinges, two sliders, no other couplings. One `SpikeVirtualHub` identified by part `hub`; one medium angular motor `motor_A`, explicit port A. There are no artificial fixed bodies or assembly weld directives.

## Datums and independent measurements

LDraw units are 20 LDU/stud and 0.4 mm/LDU; authored +Y points down. The native preparation may rotate the entire model. Measurement axes are therefore derived from the actual prepared part transforms, not assumed world axes.

| Role | Semantic part ID | Part-local point or direction |
| --- | --- | --- |
| Observed chassis frame | `hub` | Local origin; the body's measured pose carries the reference frame |
| Crank centre O | `crank` | `[0,0,0]` LDU |
| Actual crank pin C | `crank` | `[0,0,40]` LDU |
| Passive output Y | `yoke_end_-100` | `[0,0,0]` LDU |
| Sliding follower F | `follower_cross` | `[0,0,0]` LDU |
| Authored +X basis | `guide_x_-100` | Initial local `[0,0,0]` to `[20,0,0]` |
| Authored +Z basis | `guide_z_20` | Initial local `[0,0,0]` to `[20,0,0]` |
| Conservative support polygon | `base_runner_left`, `base_runner_right` | Local `[0,10,-140]`, `[0,10,140]` on each bottom face |

Each marker must belong to exactly one dynamic body. The motor's separate stator/rotor ownership is expected and is not used as a marker. All marker positions come from actual recorded body poses through `observeAddon`. Geometry and equations supply predictions only; they never replace recorded motion.

Radius r = 40 LDU = 16 mm. Saved crank points along authored +X, so geometric angle θ₀ = 0. With the verified motor sign, θ = −A, where A is the unwrapped encoder angle. Derive observed θ independently from `atan2((C−O)·ez, (C−O)·ex)` and unwrap it. Check x(Y−O) = r cos θ, x(F−O) = r cos θ and z(F−O) = r sin θ. The yoke's other two coordinates remain fixed. The two sliders must retain their initial relative orientation. The finite crank has two dead centres per turn, but motor actuation crosses them; no connecting rod creates a quick-return asymmetry.

## Program, bounds and runtime

The exact `.bw` bytes must pass the registered compiler, execute through the real Scratch VM and Robot Lab extension, use the simulated SPIKE hub/controller, and drive native Jolt physics. Inspect loaded block registration rather than trusting the harness's literal `unsupported: []`. This fixed-session harness supplies `lab start` as an already-running session; it does not test browser lifecycle loading/reset or SPIKE hardware transport.

The sequence is 0→360° at 30°/s; 360→1080° at 90°/s; 1080→0° at 90°/s. Each leg holds for 0.5 s and checks arrival. Every move uses a fresh unwrapped target-minus-angle; at most two 12°/s corrections are allowed. Startup must be within ±1°; arrival guards use ±1.5°. A parallel 90 s watchdog holds and ends a stalled experiment. Final state is completed=1, failed=0, stage=4, port A idle and controller in hold.

Use `{mat:'plain', autoPorts:false}`, and compare the complete resulting mechanism with ordinary preparation. The truthful CrispStrobe attribution is unchanged. No runtime, solver, collision-filter or mass edits are allowed. Record effective solver, friction, body masses and native local collision exclusions. All four assemblies remain dynamic. Use 5 ms physics steps, recorded every 25 ms, 500 ms cold observation, at most 92 s program budget and 500 ms final hold. The initial native controller state is brake, not a free/coast release; record its actual state and cold drift.

The qualified encoder envelope, including overshoot, is −5…1085°. This is an experiment boundary, not a physical angular stop: the assembled crank can repeat indefinitely in either direction. Linkage closure bounds both slider centres to ±40 LDU. Independent guide-support bounds are ±60 LDU, leaving 20 LDU = 8 mm beyond each operating extreme before an eye meets its support. Both eyes stay fully engaged. Bushes/holders retain the guides; the crank pivot has 1 LDU = 0.4 mm total nominal axial endplay. Do not claim that software guards supply physical retention.

## Acceptance gates

1. Exact frozen input hashes, 105 parts, four dynamic bodies plus one floor, two hinges and two sliders, no couplings, no import diagnostics, correct explicit hub/port, and ordinary/unassisted mechanism equality.
2. No compiler errors/warnings, missing executable primitives/hats, VM runtime errors or failed session. Actual VM finishes before 91 s and reaches the stated completed/hold state.
3. At least 1,000 recorded frames; at least 20 cold and 20 after frames; every body position/rotation finite. All three legs are represented with more than 350°, 710° and 1070° measured angle travel respectively.
4. On each leg, both actual slider strokes are between 31 and 33 mm. Output/follower final 3D return errors are at most 0.5 mm, and final encoder error is at most 1.5°.
5. Maximum yoke cosine-law error and follower planar circular-law error are each at most 0.5 mm. Crank radius error is at most 0.25 mm. Yoke transverse/out-of-plane drift and follower-to-yoke unwanted transverse displacement are at most 0.5 mm. Slider orientation deviation is at most 1°. Independently observed crank phase plus encoder angle differs by at most 1°.
6. Maximum true hinge anchor mismatch is at most 0.5 mm and hinge-axis mismatch is at most 1° throughout the recording.
7. From the first program frame, chassis horizontal displacement is at most 2 mm and rotation is at most 2°. Encoder remains inside −5…1085°. Cold encoder remains within ±1°. The centre of mass computed from the native per-collider mass distribution, carried by the actual body poses, remains inside the conservative runner support polygon; report margins and the modelling scope rather than claiming a hardware mass measurement.
8. Compare the central half of the actual output stroke, +8→−8 mm and −8→+8 mm. Linearly interpolate time at crossings of observed positions. Use the slow first cycle A=0…360° and the second fast cycle A=720…1080° to avoid acceleration into the fast leg. Both crossings must exist in both directions. Outward/return durations differ by no more than 10% of their mean within each selected cycle; the mean slow/fast duration ratio is 2.7…3.3. Expected ideal durations are 2 s and 2/3 s, but only observed crossing times count as measurements.
9. A deliberately altered recording with the yoke body frozen at its first pose must fail the useful-stroke check. This tests the observer, not physical causality.

Construction is separately checked using real connector interfaces, fastener occupancy/retention and 371 analytically closed collider poses from −5° through 365° in 1° increments. The cycle repeats throughout the program envelope. The native 1 LDU penetration tolerance and sampled, non-continuous coverage must be stated. Analytical clearance checks are not measured physics trajectories.

## Result boundaries and failure handling

Report Export, Construction, Native mechanism/program, App and Physical build separately. Browser import/controls/rendering and physical assembly are UNTESTED unless actually performed. Native lesson schema loading is a separate local check and does not imply app integration. A frozen-frame/direct-API mechanism prototype remains development evidence.

If a gate fails, preserve that run and this contract. Diagnose it, predeclare any revision, and requalify affected claims; never quietly relax the original gate or relabel a failed run.
