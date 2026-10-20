# Motorised mechanics machines

Four original builds turn concepts from the supplied `lego_technic_mechanics_ideas` catalogue
into controllable Robot Lab examples. Open **Robots → Examples**, search their names, and choose
**Open model + program**. Press **Run** for the experiment; **Motors** exposes a separate control
and stop button for every motor. Reset before repeating the experiment.

| Example | Pieces | Motors | What to control and observe |
|---|---:|---|---|
| Motorised crank-rocker | 15 | A | Turn the crank continuously; the blue rocker oscillates through roughly 86°. |
| Parallel-motion lift | 23 | A | Sweep ±45°; the yellow tray stays level while following an arc. Physical stops protect the linkage's assembly branch. |
| Screw crane with powered slew | 44 | A, C | A raises/retracts the boom; C slews left and right. Five screw-drive turns give about 6 mm of actuator extension; 105° of C gives 30° of slew. |
| Pivot-steered rover | 30 | A, B, C | A/B drive the mirrored rear motors; C steers the front bogie. The program drives two opposite curves and centres the steering. |

These counts include every physical part instance, including motors, hub, pins and internal
actuator components. The library also retains the larger 59-piece chain transmission, 56-piece
flywheel differential and 85-piece excavator. This batch uses the parts needed for each mechanism.

## Experiments and limits

The crank-rocker uses link lengths 40/100/60 LDU with 100 LDU between fixed pivots. A motor carries
the 40 LDU crank around complete revolutions; the output reverses direction twice per cycle.
The test independently intersects the two linkage circles to predict the rocker angle throughout
both forward and reverse runs. This is the rotary-to-oscillating conversion described in
[CMU's planar linkage chapter](https://www.cs.cmu.edu/~rapidproto/mechanisms/chpt5.html).

The lift has opposite pivot spacings of 100 LDU and equal 80 LDU side links. Its tray retains its
orientation; the path has both horizontal and vertical displacement. Over ±45°, geometry predicts
`2r sin(45°)` of lateral sweep and `r(1 − cos(45°))` of rise. The motor moves the real closed linkage;
the tray is not animated to a prescribed path. Braced stops prevent powered overrun through a flat
change point, where an unrestrained parallelogram could change assembly branch.

The crane combines a small Technic screw actuator with an 8-tooth pinion driving a 28-tooth
turntable. The program raises the boom, slews ±30°, returns to centre and retracts. Tests compare
actual actuator travel with input turns and verify both boom height and platform angle. The
actuator lead uses the app's existing small-actuator calibration, about 1.206 mm per input turn.
The broad pinned base supports this unloaded teaching rig; the experiment measures motion rather
than a rated payload or a calibrated tipping threshold.

The rover uses wagon-style pivot steering, with independent front half-shafts. Compare its bogie
geometry with the catalogue's Ackermann steering idea: this build turns the complete front axle.
Keep steering commands within ±20°. The two rear motors face opposite ways, so forward motion uses
A counterclockwise and B clockwise. Equal rear speed settings can cause tyre scrub in a turn;
the acceptance check measures opposite real curves rather than assuming ideal no-slip Ackermann
kinematics. The front motor housing and wheel bearings have clearance throughout the example.

## Implementation and qualification

All four LDraw assemblies and programs are original Brickwright work under BSD-3-Clause, based on
our existing reference modules and catalogue part geometry. No external CAD, notebook payload or
third-party model is redistributed. The source catalogue contains 96 ideation records; these four
examples implement a selected batch, with measured acceptance criteria.

`scripts/gen-mechanics-machines.mjs` recreates the assemblies and refuses compiler issues or
collider overlaps. Models are registered in all three Robot Lab model lists and in the generated
bilingual examples catalogue. The new **Linkages & motion conversion** topic groups the rocker
and lift. Programs and models ship with the app's static examples and work offline.

```sh
node --import ./scripts/lib/register-gui-scope.mjs scripts/gen-mechanics-machines.mjs
node --import ./scripts/lib/register-gui-scope.mjs scripts/gen-robot-lab-catalog.mjs
node --import ./scripts/lib/register-gui-scope.mjs --test test/bw-sim-mechanics-machines.test.mjs
node scripts/verify-sim-lab-browser.mjs --part=examples --examples=mechanics-machines
```

The tests run every program through the actual Scratch VM, virtual hub and Jolt core. Each build
also undergoes a two-second run with all motors at 60%, including a powered-overrun check against
the lift's physical stops. Assertions require finite poses, a connected assembly, an upright base,
completed motor commands, and the intended output motion. An encoder-only substitute with a frozen
tray fails the judge. The existing instruction suite checks connected, buildable step order and a
complete bill of materials. The existing geometry suite covers real-mesh separation, fasteners
remaining inside their bores and no two shafts filling one hole.

The browser gate loads each model and its program through visible Examples controls, runs all four
in the physics worker and applies the same independent equations to observed poses. It captures
the finished assemblies and checks that every motor's mixer control is available. Physical LEGO
construction and hardware motor acceptance remain separate from these simulator checks.
