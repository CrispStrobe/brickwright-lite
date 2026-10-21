# Guided Robot Lab experiments and dynamics machines

Choose **Robots → Examples → Read lesson**, or **Lesson** beside the current model.
Every one of the 43 example choices has an English and German lesson bundled with
its model. Like Circuit's example introductions, each lesson explains what to
observe, provides a short experiment, explains the physics and its applications,
and asks a prediction question with a revealable answer. Related examples let
learners compare mechanisms. Presets include their own operating description.

Reading a lesson leaves the current model running. **Open model + program** loads
the registered example without automatically starting it. The reader sits beside
the view on larger screens and becomes a closable drawer on narrow screens. It
also opens in Build mode. Content loads only when requested, from local bundled
JSON; no lesson service or remote content is needed. Failed loads offer a retry.

Edit `docs/data/robot-lab-lessons.json`, then run
`node scripts/gen-robot-lab-lessons.mjs`. The generator's `--check` mode and
`test/bw-sim-lessons.test.mjs` check both languages, registered examples, related
links and generated assets. The prose is original CrispStrobe / BSD-3-Clause.

## Two new experiments

| Model | LEGO pieces | Motors | Experiment |
|---|---:|---:|---|
| Pulse Percussion | 130 | 1, A | Cam contact lifts three gravity beaters; angular spacing produces a rhythm. |
| Centrifugal governor | 34 | 1, A | Two free arms rise farther as shaft speed increases; reversing preserves the outward tendency. |

The library now has 43 selectable examples representing 35 distinct assemblies;
14 selectable examples exceed 50 pieces. Pulse is adapted from the owner's
120-piece original. Ten pinned support pieces connect its console at floor level.
The native program runs two shaft turns at each of three speeds (approximately
15, 30 and 45 rpm). Physical poses show about 18.3 mm lift per beater, six strikes
per channel and phase intervals near 89°, 91° and 180°. This is a visual impact
experiment; the simulator does not synthesise sound or predict acoustic pitch.

The original governor has a wide rotor and two 9L free arms, with their pivots
136 mm from the shaft and arm tips 64 mm below the pivots at rest. Its program
runs approximately 28, 55 and 83 rpm, then reverses at the middle setting.
Measured mean arm inclinations are about 7°, 26° and 47°, and 27° in reverse.
Centripetal acceleration grows with angular speed squared. These distributed
arms are not ideal point masses; the example demonstrates the governor mechanism
without a throttle linkage or closed-loop speed regulation. During transitions,
body poses deviate by up to 2.0 mm from the ideal hinge radial locus in the test.

## Supporting repairs and verification

The smooth round `3673` pin uses an axial cylinder collider matching its official
8-LDU radius. Its former rectangular collider had corners that entered adjacent
beams as the hinge rotated. Geometry tests check the actual part envelope and
rotation clearance, including the old collider as a failing control. Other pin
metadata and the peer-owned Jolt/compiler/collision implementation are unchanged.

Long shafts with many retaining bushes are split into connected instruction
pages of at most six parts. Collars may follow their supporting shaft. A
perpendicular pin-hole connector may first seat on an axle and receive a beam
later, or first seat in a beam and receive its axle later. Independent connector
graph tests verify support and insertion order rather than requiring simultaneous
installation of both interfaces.

The dynamic tests run native programs in the real VM and Jolt, check actual output
body motion as well as motor angles, and reject a frozen-output negative control.
Focused detailed mesh/fastener checks cover both new models. Browser gates run
programs in the worker, operate motor controls and Stop All, check initial framing,
walk all 64 percussion / 14 governor instruction pages, and verify the complete 130 / 34-piece parts lists. Lesson browser
checks cover English/German, prediction reveal, model/program loading, live
simulation, preset changes, failed fetch/retry and narrow-screen Build use.

Useful commands:

```sh
node --import ./scripts/lib/register-gui-scope.mjs --test test/bw-sim-dynamics-machines.test.mjs test/bw-sim-round-pin.test.mjs test/bw-sim-lessons.test.mjs
node --test test/bw-sim-instructions.test.mjs test/bw-sim-lazy-catalog.test.mjs
node scripts/gen-robot-lab-lessons.mjs --check
node scripts/verify-sim-lab-browser.mjs --part=examples --examples=dynamics-machines,lessons,physics-workshops
node scripts/verify-sim-lab-browser.mjs --part=layout
```

These are simulation qualifications, without a physical LEGO build, acoustic
validation or hardware-motor test. Release acceptance remains subject to the
integration branch and hosted checks.

The library also includes a [54-piece pendulum array and two-motor clutch load bench](ROBOT-LAB-OSCILLATION-AND-CLUTCH.md), with the same guided lesson format.
