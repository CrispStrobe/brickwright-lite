# Orbital Loom in Robot Lab

Open **Robots → Examples**, search **Orbital Loom**, and choose Fivefold, Sevenfold, Elevenfold
or Eightfold. **Open model + program** loads the machine and the corresponding motor program.
Press **Run**. The virtual marker draws on the paper as both move; Reset clears the drawing and
restores the starting pose. Each motor is also available independently under **Motors**.

The supplied prototype contains 210 LEGO pieces, one SPIKE hub and two medium angular motors.
The adapted assembly uses **202 LEGO pieces**. Paper and marker are visual attachments, not LEGO
pieces. The geometry retains the original 32 mm offset between axes, `sqrt(512) ≈ 22.627 mm`
pen-crank radius, 60-tooth paper turntable and 20-tooth driving gear.

| Example | Paper turns | Pen turns | Nominal pen/paper ratio |
|---|---:|---:|---:|
| Fivefold | 1 | 5 | 5 |
| Sevenfold | 2 | 7 | 3.5 |
| Elevenfold | 4 | 11 | 2.75 |
| Eightfold | 3 | 8 | 8/3 |

The motor outputs face opposite ways. In the app's SPIKE program both shaft commands are
counterclockwise; the external 20:60 mesh reverses A, so the paper and pen both turn clockwise
viewed from above. A turns three shaft revolutions per paper revolution. The paired programs use
integer speed settings A=`3q` and B=`p`, with encoder distances A=`1080q` and B=`360p` degrees.
Nominal drawing time is about 32.4 simulated seconds for every preset. This is an adaptation to
the app's controller; it does not execute the supplied Pybricks program or install firmware.

The two velocity servos have transient tracking error. Tests measure the actual phase error and
closed path rather than claiming that they implement the supplied shared-time trajectory exactly.
The geometry judge uses both physical body poses and hinge angles throughout the run. It checks
`R(-paperAngle) × (axisOffset + R(penAngle) × crankVector)` in paper coordinates, the inner and
outer radii near 9.373/54.627 mm, completed turns, plane contact and closure. No predicted ink or
image from the supplied preview is included in the app.

## Repairs and simulator support

The first import stayed connected, but its paper did not turn: the simulator treated a double-bevel
gear exclusively as a perpendicular bevel mesh. Double-bevel metadata can now explicitly declare
both bevel and spur profiles. Geometry chooses the supported contact. Declared tooth-face widths
allow overlapping wide faces at the prototype's half-stud axial offset; the existing narrow-face
alignment rule remains for parts without both widths. Wrong spacing and separated faces are refused.
Existing perpendicular double-bevel tests remain in the regression set.

The 11×5 frame's collision rails were 24 LDU wide although its official geometry is 20 LDU wide.
Correcting the half-width from 12 to 10 LDU eliminates false clashes with the flush rails and
turntable. The two missing plate/tile metadata entries and six new official geometry files are
vendored from the already pinned LDraw release, with its hashes and attribution retained.

Detailed fastener checks found eight pairs of short pins sharing the same bore. Each pair is
replaced by one 3L pin through its mounting stack, saving eight pieces. Four frictionless 2L pins
clear the bearing/frame bore relief. A 3L drive axle replaces the over-inserted 4L axle while
retaining both half bushes. The instruction planner also handles the perpendicular-connector → stud-half-pin → plate chain
as separate insertion stages, keeps bushes with their axles and splits large pin callouts. The
source’s coarse assembly stages are replaced with a connected manual. The compiler reports two intentional `locked-hinges` welds: separated
smooth-pin axes rigidly locate the bearing and paper mounts. Their named part sets are asserted;
other diagnostics are not accepted as part of this model's qualification.

A new `0 !BW DRAW surfacePart penPart tipX tipY tipZ centreX centreY centreZ radius` comment binds
local pen and paper coordinates, all in LDU, to actual part transforms. The paper is a disk in the
surface part's local XZ plane. Physics-clock updates sample the carried nib in that moving frame independently of WebGL
frame rate; only new ink marks the view for repaint. This prevents a slow software renderer from
skipping the drawing. The layer splits the
stroke when it leaves the plane or disk, and clears it on Reset. This also works with large models'
invisible instancing proxies. Ordinary floor pens keep their existing drawing behaviour. Export
preserves supplied author/licence headers when a model is edited.

The virtual marker and paper follow rigid bodies; marker mass, ink friction, paper slip, elastic
bands, cable drag and bending are not simulated. These experiments qualify the digital mechanism
and trace geometry, not physical drawing quality or a hardware build.

## Provenance and verification

Credit **ORBITAL LOOM, CrispStrobe, 2026**, **BSD-3-Clause**. The owner confirmed that
this is their original work and specified this author/licence, superseding the generated source
README's OpenAI/CC BY wording. The bundled notice is `static/sim-lab/licenses/orbital-loom.txt`.
The source bricks-only MPD SHA256 is
`d2e22ef40af389d6e1580b3ace65968e390fd6eadac0488aee318adddbb0f539`.
The exact bricks-only source and original README are retained under
`test/fixtures/model-files/orbital-loom-source/` for reproducible adaptation. The Python controller,
PDF, preview and complete scene are references and are not newly bundled.

```sh
node --import ./scripts/lib/register-gui-scope.mjs scripts/adapt-orbital-loom.mjs test/fixtures/model-files/orbital-loom-source/orbital_loom_bricks_only.mpd output.ldr
node --import ./scripts/lib/register-gui-scope.mjs scripts/gen-robot-lab-catalog.mjs
node --import ./scripts/lib/register-gui-scope.mjs --test test/bw-sim-orbital-loom.test.mjs test/bw-sim-surface-drawing.test.mjs test/bw-sim-double-bevel-spur.test.mjs
node scripts/verify-sim-lab-browser.mjs --part=examples --examples=orbital-loom
```

All four VM programs, live Three.js drawing and frozen-paper negative control pass headlessly.
Six existing detailed mesh, fastener and shared-hole assertions restricted to this assembly pass.
The browser gate checks all four examples through the selector, actual worker motion and ink,
walks every generated instruction page and its 202-piece bill of materials, then operates both
manual motor controls and checks camera framing.

Final local qualification: 231 focused regression tests passed; the final physics-clock sampler
passed 11 focused tests plus its idle redraw control. The production GUI build, all four browser
programs (901–975 ink points each), both manual motors, initial framing, all 99 instruction pages,
the 202-piece bill and the English/German examples browser passed without page errors. Source
adaptation reproduces the bundled model byte for byte from the retained licensed fixture.
