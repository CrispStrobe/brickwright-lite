# Coordinated physics machines

Eight owner-supplied original assemblies join the offline Robot Lab library,
with CrispStrobe / BSD-3-Clause credit, native programs, build instructions and
English/German lessons. Selecting an example also loads its program into Blocks
and sets the project title. Reset to the saved pose before each demonstration.

| Assembly | Pieces | Motors | Measured effect |
| --- | ---: | --- | --- |
| Mean Machine | 212 | A, B | Differential pointer computes the signed mean; equal, opposed and unequal inputs |
| Stepworks | 240 | A | Three walking-beam transfers advance the independent pallet about 45.5 mm |
| Stride Lab | 75 | A | Hoeken coupler: about 63.1 mm working stroke, 0.16 mm working deviation |
| Twinpoint | 117 | A, B | Parallel five-bar circle and bounded vertical line |
| Butterfly | 224 | A | Guided crosshead travels about 16.1 mm and flaps two wings |
| Tempo Loop | 85 | A | Two complete crank revolutions each way; instantaneous speed ratio about 0.560–2.020 |
| Tilt Lab | 161 | A, B | Nested powered gimbal moves an independent ball about 35 mm |
| Axis Plotter | 256 | A, B, C | Coordinated rack stages draw a calibration square and detached diagonal; C lifts the pen |

The library has 46 distinct assemblies and 54 selectable programs, with 108
complete offline lessons. Twenty-five example cards use more than 50 pieces.
The larger builds are actual model parts, including their mounts and fasteners.

## Design and runtime repairs

Source files are retained byte for byte under `test/fixtures/model-files/`.
`scripts/adapt-seven-machines.mjs` checks their hashes before reproducing the
shipped assemblies. Archive controllers and generators are treated as reference
data and are not executed or bundled. The owner confirmed original-work
CrispStrobe / BSD attribution; official LDraw part geometry retains its separate
licences and authorship.

Stride Lab replaces two overlapping short pins with one through-pin. Twinpoint
uses thin 9L links at its parallel joint. Butterfly gives its selected round bores
explicit `!BW SLIDE h0` annotations and braces the two guide axles with a keyed
tie. The annotation applies only to named bores on that placed part. Missing,
keyed and invalid bores are refused; existing ordinary round bores remain hinges.
Retained circular free pivots may fold only in a slider loop with freely coaxial
hinges. Geared, eccentric, noncircular, powered, frictional and limited shafts
retain their independent bodies. One reported locked bearing pair on the braced
Butterfly mount is expected and asserted.

Mean Machine adds the official 6573 differential case and measured metadata.
Its explicitly internal satellite gears do not produce a false unsupported-mesh
warning against their case; ordinary unsupported gear engagements remain errors.
The 39790 frame rail colliders follow the official 10 LDU half-width instead of
covering adjacent mounting parts. The normal mesh metadata accuracy tests retain
their existing tolerances.

Tilt Lab adds 22 real support parts beneath the outer gimbal. Removing these
parts reproduces a 16.3° cold-start drop. With them, the native program stays
within 7.8° on A and 10.2° on B, including startup, then returns level. Use ±6° A
and ±10° B for commanded edits. The free ball remains on the floor and within
the tray walls. The example demonstrates gravity and nested rotations; it does
not locate the ball or solve the maze automatically.

Floor markers now sample on simulation advances, alongside the rotating-paper
markers. The final browser calibration renders 257 square points and 53 diagonal
points even when display painting is busy.

Nested MPD import now preserves `!BW PEN` on a leaf part, allowing the Axis
Plotter's marker to survive both flat and nested model round trips. Axis Plotter
retains all 256 source parts and placements. Its default calibration runs two
disconnected strokes; optional native programs draw three curves and a 24-stroke
original pixel costume. All three run through the app's registering parser,
Scratch VM, bundled Robot Lab extension, motor API and Jolt bodies. Fresh encoder
feedback drives each target. A target error above 2° stops the program and holds
all motors. Reset before starting another drawing.

## Measurement and limits

Checks use actual body poses and joint closure, with frozen-output negative
controls. Axis Plotter's headless calibration square edge error is below 0.05 mm,
its diagonal error below 0.03 mm and rack/encoder discrepancy below 0.03 mm.
The three drawing runs finish in approximately 85, 119 and 362 simulated seconds.
The removable axle is a virtual marker; paper friction, ink and a physical pen's
fit require physical testing. The standalone source SVG tool is not an app UI.

Twinpoint uses the qualified clockwise/counterclockwise circle direction at
native speed setting 1; its largest observed loop closure error is about 0.49 mm,
with tip error about 0.67 mm. Butterfly uses one slow flap at native setting 1:
its 8 mm drive arm magnifies solver error, so its observed sweep is about 56.6°
against an ideal 53.1°. Its transient symmetry difference remains below 4°.
These are mechanism demonstrations with documented numerical resolution.
Stepworks includes real pallet slip, so three transfers fall short of the ideal
48 mm. Reload the pallet or reset afterward.

Tempo Loop ships the qualified continuous forward/reverse program. A separate
repeated stop/start experiment failed its position checks and is excluded from
the library. Lessons use Pause to observe the continuous run. No existing
physics assertion or geometry tolerance is relaxed to admit an assembly.

The focused controls are in `test/bw-sim-seven-machines.test.mjs`; the batch now
contains eight assemblies. The browser gate is
`node scripts/verify-sim-lab-browser.mjs --part=examples --examples=seven-machines`.
Detailed official-mesh overlap checks cover the eight added assemblies. Hosted
exact-head CI and composition with current main remain separate from local
simulation qualification; no physical LEGO build is claimed.
