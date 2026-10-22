# Pendulum array and clutch load bench

Both original CrispStrobe / BSD-3-Clause machines ship with native programs,
English/German lessons, motor controls and connected building instructions.
Open **Robots → Examples**, choose the machine and load its model with program.
Reset before comparing runs. **Lesson** explains the experiment beside the view.

| Experiment | Pieces | Motors | Observable physics |
|---|---:|---:|---|
| Motor-excited pendulum array | 54 | 1, A | Free oscillation periods, distributed inertia, gravity and phase drift |
| Clutch load bench | 26 | 2, A/B | Limited friction torque, slip, load release and loss of angular indexing |

## Pendulum array

The motor turns a three-spoke support through a half turn and holds it for eight
seconds, then reverses through a half turn and holds again. Three freely hinged
arms continue swinging after their support stops. Red is 7L with a 48 mm
pivot-to-tip distance; yellow is 11L / 80 mm; blue is 13L / 96 mm. Smooth round
pins let the arms swing independently. The third spoke uses paired rails and
cross braces; shared 3L pins join its three-layer motor/beam/rail stack without
overlapping two shorter pins in the same hole.

For a uniform slender rod hinged at its end, the small-angle approximation is
`T = 2π sqrt(2L / 3g)`. This is a distributed rod, rather than a point bob on a
massless string. The real simulation includes the pins, beam collider mass
distribution, finite amplitudes and damping. Measured periods are roughly
0.38 / 0.49 / 0.52 seconds for the 48 / 80 / 96 mm arms. The lengths and periods
have the same ordering, and the approximate square-root scaling is observable.
Use slow motion to count cycles. Phase drift after the support stops creates
patterns; their apparent motion does not establish energy transport between
neighboring pendulums. The common support has finite servo compliance.

A manual A setting excites the arms. **Stop All** holds the motorised support;
it does not freeze the unpowered pendulums. No additional motor is hidden in an
arm, and no animation substitutes for its simulated pose.

## Clutch load bench

A drives a shaft through a white 24-tooth friction clutch. The outer ring meshes
with a 40-tooth output on B, so free running gives `ωB / ωA = -24/40 = -0.6`.
Red and blue pointers show the shafts. The clutch ring can turn separately from
its input shaft. Its nominal friction threshold is 0.0375 N·m, using the existing
supported clutch mechanism. This is a simulation parameter, not a measurement
of a particular physical LEGO clutch.

The native program starts with B coasting. After three seconds, B actively
returns to encoder zero and holds it while A continues driving. Allow the
return transient to finish: only then do the output and toothed ring stand
still while A slips inside the clutch. B releases after another three seconds;
transmission resumes, then A reverses. The relative shaft angle lost during
slip is not recovered. Torque limiting therefore does not preserve indexing.

The program deliberately uses an explicit position command for the holding
load. Configured run-completion hold is not assumed to change the separate
SPIKE `stop motor` command's behaviour. Direct motor controls can also explore
assisting and opposing inputs; Stop All holds both shafts. Real clutch slip
would dissipate work as heat; the simulator has no temperature or wear model.

## Qualification

The native programs run in the real VM and Jolt. Judges measure actual body
poses, verify pendulum lengths and repeated periods while the support is held,
and check free, loaded, released and reverse clutch stages. The input encoder
alone cannot pass: frozen output bodies are rejected as negative controls.
Every motor is also run at 60% in both directions, checking finite motion and
an upright connected base. Detailed mesh, fastener-depth and shared-hole
checks cover both models. The manuals have 22 / 15 connected pages and full 54 / 26-piece bills. The initial shared-pin failures were repaired in the
models; the tests were not relaxed.

Generator: `scripts/gen-oscillation-clutch.mjs`. Lessons are in
`docs/data/robot-lab-lessons.json` and generated with
`scripts/gen-robot-lab-lessons.mjs`. Focused tests:

```sh
node --import ./scripts/lib/register-gui-scope.mjs --test test/bw-sim-oscillation-clutch.test.mjs
node --test test/bw-sim-instructions.test.mjs test/bw-sim-lazy-catalog.test.mjs test/bw-sim-lessons.test.mjs
node scripts/verify-sim-lab-browser.mjs --part=examples --examples=oscillation-clutch,physics-workshops
```

The library has 43 choices over 35 distinct assemblies, including 14 selectable
examples above 50 pieces. These qualifications concern the simulator; physical
LEGO construction and hardware validation have not been performed.
