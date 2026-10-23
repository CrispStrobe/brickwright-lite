# SineShuttle — validation and delivery record

**Native mechanism/program: PASS. Construction: PASS within the recorded digital scope. App/browser and physical build: UNTESTED.**

SineShuttle is a 105-part captured-block Scotch yoke with one SPIKE Prime hub and one medium angular motor on A. A fixed 16 mm crank drives a red follower across a blue translating yoke. The yoke is the passive output; both its X guides and the follower's Z guides are physically paired to prevent roll. Original work is credited to **CrispStrobe**, **BSD-3-Clause**. Standard LDraw geometry and rendered adaptations retain their separate notices.

## Distinct from the supplied collection

The selected collection is `brickwright-fixed-models-20261023-e6decb090.zip`: **81 assemblies and 91 example choices**, SHA-256 `f35fe109a1c013318cfb86c6ccd9e34fee694df7dd2ea1b2c2c6ed63251c3196`. The comparison inventories all 91 English mechanism descriptions, checks the closest actual model topologies and separately compares the earlier TwinTempo. See [the mechanism comparison](docs/collection-comparison.md) and [its source record](evidence/collection-comparison.json).

This assembly keeps the motor/crank axis fixed and lets its pin slide across the translating yoke. Quickstroke uses a finite offset connecting rod for unequal stroke timing; Ellipsa/Ellipse Engine ground their perpendicular guides as trammels; Crossglide uses an Oldham coupling to pass rotation between shafts; Circle Splitter/Crossline obtain straight-line markers through orbiting gears. SineShuttle shares the broad double-slider chain family with the trammels, but uses a different grounded-link choice and a different measured output. It does not claim a new abstract joint graph or the collection's first sinusoid.

## What the exact exported program did

The native registered compiler, Scratch VM, Robot Lab extension, virtual SPIKE hub, motor controller and Jolt physics executed the delivered `.bw` with the delivered `.ldr`. No handwritten command dispatcher or predicted output poses supplied the result. All four machine bodies remained dynamic on the floor.

| Leg | Absolute motor target | Requested speed | Measured yoke stroke | Measured transverse follower stroke |
| --- | ---: | ---: | ---: | ---: |
| Slow forward | 360° |30°/s|32.00104 mm|32.00009 mm|
| Fast forward |1080°|90°/s|32.01232 mm|32.00190 mm|
| Reverse home |0°|90°/s|32.01191 mm|32.00149 mm|

The run completed at **34.35 s of session time**, including 0.5 s cold observation. The record contains **1395 frames**, sampled every 25 ms, with 5 ms physics steps and another 0.5 s after completion. Final variables were `completed=1`, `failed=0`, `stage=4`; motor A was idle in **hold**. The finite program uses fresh unwrapped target-minus-angle moves, bounded correction attempts, ±1.5° arrival guards and a parallel 90 s watchdog.

| Independent observation | Result | Declared acceptance |
| --- | ---: | ---: |
| Overall yoke stroke |32.012323 mm|31–33 mm on each leg|
| Maximum sinusoidal output error |0.006218 mm|≤0.5 mm|
| Maximum follower planar error |0.002784 mm|≤0.5 mm|
| Slow/fast central-stroke duration ratio |3.000867×|2.7–3.3×|
| Slow outward/return central-stroke times |1.999945/1.999961 s|≤10% asymmetry|
| Fast outward/return central-stroke times |0.666459/0.666458 s|≤10% asymmetry|
| Yoke 3D return error |0.000168 mm|≤0.5 mm|
| Follower 3D return error |0.075100 mm|≤0.5 mm|
| Final encoder angle |-0.269159°|±1.5°|
| Maximum hinge anchor error |0.001919 mm|≤0.5 mm|
| Maximum hinge-axis mismatch |0.024869°|≤1°|
| Maximum horizontal chassis movement |0.006875 mm|≤2 mm|
| Minimum computed support margin |30.771 mm|Positive|

These small errors describe an idealized simulator, not achievable hardware precision. Timing uses interpolated crossings of the **measured yoke position**, from +8 mm to −8 mm and back. The first slow cycle and second fast cycle avoid the speed-change transient. The figure's theoretical sinusoid, if shown, is labelled as a prediction. [Full native result](evidence/qualification.json), [recording](evidence/qualification-recording.json), [trajectory CSV](evidence/qualification-trajectory.csv), and [predeclared contract](docs/qualification-contract.md) preserve the evidence.

Crank phase was measured independently from two part-local points; output and follower points were carried by their own observed bodies relative to the observed chassis. Unwrapped measured phase and encoder sign agreed within0.00001544°. Freezing the yoke in a deliberately altered recording reduced its apparent stroke to0.01056 mm and failed the useful-stroke gate. That is an observer check, not a separate physical experiment.

## Construction, retention and collision scope

The final construction observer found **no unresolved saved or swept solid intersections**, no additional shaft-region intersection outside real seated connector pairs, no unmatched male connectors and no overlapping separate coaxial male fasteners. It checks **371 analytically closed poses**, −5°…365° in 1° increments, using the native **1 LDU = 0.4 mm penetration tolerance**. The poses repeat each turn, covering every phase in the qualified −5°…1085° motor envelope. This is sampled primitive geometry, not continuous exact-mesh clearance.

Both sliders have two separated 12L axle guides. Their moving eyes stay fully engaged throughout the closed linkage's ±16 mm centre travel, leaving **8 mm nominal clearance to end holders** at each extreme. Guide-end geometry alone would allow ±24 mm, but the assembled crank loop cannot reach those disconnected-carriage positions. Bushes and holders retain the guides. The free crank/follower pivot has **0.4 mm total nominal axial endplay**. There is no physical motor-angle stop at 360° or 1080°; the crank can repeat its cycle in either direction. Software guards are not physical retainers.

The unmodified native compiler filters chassis/crank and chassis/yoke contacts as whole body pairs; crank/follower and follower/yoke retain the native lists of 6 and 18 enabled part-pair contacts. No authored collision exemption, solver modification or frozen free body was added. The separate construction observer does **not** consult those dynamics filters. A further independent bounds check covers all **1,944 part pairs** in the two wholly filtered groups: 1,933 separate through invariant axial/radial or transverse bounds, 8 separate over the yoke's closed path, and the remaining 3 are intended axle/bore seats. There are no unexplained filtered intersections. These bounds enclose the native primitives, not exact manufactured surfaces. See [collision-policy review](evidence/collision-policy.json), [construction details](docs/construction.md) and [construction evidence](evidence/construction.json).

The cold interval began with native `lastStopAction=brake`; controller modes were stop/idle, not a free/coast release. Maximum cold output drift was0.002556 mm and cold encoder drift stayed within 0.00034°. Computed mass is 266.5 g and the minimum support margin is 30.77 mm, using the native collider mass distribution and measured body poses, not weighed hardware. The motor's integral cable has a stated fixed route down a rear post but no flexible collision model.

## Five separate acceptance layers

| Layer | Status | Coverage |
| --- | --- | --- |
| Export |PASS|Exact LDR/BW hashes; 105 placements; 20 part/colour combinations; native catalog and EN/DE lesson loading;see final package receipt for deterministic regeneration, CRC and archived/tested byte equality|
| Construction |PASS within scope|Interfaces,fastener ownership,retention, key phase and 371 sampled ideal collider poses|
| Native mechanism/program |PASS|All 9 predeclared gates; real compiler→VM→hub/controller→Jolt; 1395 independently observed frames|
| App |UNTESTED|No browser run, application build or gallery installation; local lesson/schema checks are separately PASS|
| Physical build |UNTESTED|No assembled hardware, fit, friction, load capacity, efficiency or durability evidence|

The native log records warnings for the headless VM's unavailable default cat costume/sound assets. There were no compiler errors/warnings, missing executable primitives/hats or VM runtime errors. This run makes no sprite or audio-rendering claim. Fixed-session `lab start` uses an already-running host; scene loading/reset, browser controls and hardware transport were not tested.

## Identity and reproduction

- Model SHA-256: `926ff367e004a5bfae9173eab354e305d25e62a7f28c7ec1b47d5c766fcff6c2`.
- Program SHA-256: `e0157ad0cf55b90cfc1c93a6ced47c4c805dd4f9de0b0ffb281832c12c2a45e7`.
- Runtime commit: `e8afd8281647bd5d06d31d9e01885d7d76a85412`; Node v24.19.0, npm 11.9.0, Scratch VM 4.8.115, Jolt 1.1.0-bw.6.
- Collection manifest source: `e6decb09005b6eff1eea29695028136408c3cd7c`. The collection specifies no runtime requirement; ancestry between these commits was not inferred. Compatibility was checked against the selected runtime and actual delivered model.
- The verified runtime was reused unchanged. Prior setup/Quickstroke evidence is labelled `prior-*`; it was not rerun or presented as this machine's result.

Place `sine-shuttle/` and the prepared `brickwright-lite/` beside each other. From `sine-shuttle/`, run `python3 build/build_model.py` to regenerate geometry, BOM and the complete placement ledger. From `brickwright-lite/`, run:

```sh
node --import ./scripts/lib/register-gui-scope.mjs ../sine-shuttle/build/check-construction.mjs .
node --import ./scripts/lib/register-gui-scope.mjs ../sine-shuttle/build/qualify.mjs . qualification-reproduced
```

The qualifier refuses to overwrite an existing run; use a fresh suffix. See README for exact import/run steps and the other compiler/schema commands. From `sine-shuttle/`, `python3 build/write-summary.py` regenerates this report and the compact machine-readable record, and `python3 build/package.py` creates/verifies the final ZIP. [Package check](evidence/package-check.json) records reproducibility and archive equality; SHA256SUMS binds the packaged members without a self-hash cycle.

The model/program are delivered as an isolated add-on. Installing its proposed catalog record and lesson files requires a later application integration; import the LDR/BW and open `lessons.html` directly for the current experiment. Actual assembly instructions and the six native-mesh stage illustrations are included in the ZIP.
