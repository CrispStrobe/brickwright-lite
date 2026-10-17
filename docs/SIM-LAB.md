# Robot Lab (beta) — LEGO® Technic models with physics

The Robot Lab simulates a model built from real LEGO Technic parts and lets a program drive it through the **virtual SPIKE Prime hub**, the same hub the SPIKE arena uses. Scratch blocks, DEVICE SPIKE pseudocode and imported SPIKE 3 programs reach it unchanged: they cannot tell the hub is simulated.

The code and its paths call it **Sim Lab** (`lib/bw-sim/`, `sim-lab-pane.jsx`); the tab the learner sees is **Robot Lab (beta)** / **Roboter-Labor (Beta)**.

How it is built, and what comes next, is in `docs/SIM-LAB-PLAN.md`.

## Using it (for kids and teachers)

1. Write a SPIKE Prime program in the Code tab (blocks or DEVICE SPIKE text). The reference model drives its wheels with ports **A (left, mounted mirrored) and B (right)**, like the arena's driving base, so `set movement motors A B` and `move forward 20 cm` work as in the arena.
   The **Model** list has the **SPIKE driving base**, the **Line follower** (the same base with a
   colour sensor on port **C** just ahead of the drive axle, for the Line Oval mat), the **Wall stopper**
   (the base with a distance sensor on port **D** looking ahead, for the Wall mat) and the **Colour
   explorer** (the base with a colour sensor on port **C** centred ahead of the axle, for the Colour
   Zones mat). Each of the last three comes with an example program: the examples are below.
2. Open the SPIKE simulator (**SPIKE arena** button in the Code tab) and pick the **Robot Lab (beta)** tab.
3. Press **Run**. As the arena's Start does, Run connects the program to the virtual hub and starts it on the green flag. **Pause** stops the program and the clock; **Reset** reloads the model.

**The line follower, ready to run.** Choose **Line follower** in the Model list and **Line Oval** in the Mat list, press **Load example program** (the pane offers it while no SPIKE program is loaded; it puts the program into the Code tab and builds the blocks, and moves the robot onto the Line Oval if it is not there yet), then press **Run**. The robot follows the black line round the whole oval, in about 23 s of simulated time. The program (`static/sim-lab/programs/line-follower.bw`):

```
DEVICE SPIKE

# Robot Lab: follow the black line around the Line Oval mat.
# Model: Line follower (wheels on A and B, colour sensor on C).
# The sensor rides the line's outer edge: on black steer right, on white steer left.
WHEN flag clicked:
  set movement motors A B
  FOREVER:
    IF spike color C is black THEN:
      start tank 30 15
    ELSE:
      start tank 15 30
```

It is a two-state follower: the colour sensor on C rides the line's outer edge, steering right while it sees black and left while it sees white. `test/bw-sim-line-follower-program.test.mjs` runs exactly this text through the Scratch VM, the spikeprime extension and the virtual hub on the shipped model and mat (100 of 100 centre-line checkpoints in order, lap in 22.6 s, at most 2.3 mm off the centre line); `scripts/verify-sim-lab-browser.mjs` does the same through the pane's buttons in the built app. Swapping the two `start tank` lines also works: the robot then follows the line's other edge.

**The wall stopper, ready to run.** Choose **Wall stopper** in the Model list, press **Load example program** (it puts the program into the Code tab, builds the blocks and moves the robot onto the **Wall** mat, 0.64 m from the wall), then press **Run**. The robot drives at the wall and stops about 9 cm before it. The program (`static/sim-lab/programs/wall-stopper.bw`):

```
DEVICE SPIKE

# Robot Lab: drive at the wall and stop before it.
# Model: Wall stopper (wheels on A and B, distance sensor on D looking ahead).
# The distance sensor measures in cm: stop as soon as the wall is closer than 10 cm.
WHEN flag clicked:
  set movement motors A B
  set movement speed 30
  start moving steering 0
  wait until (spike distance D) < 10
  stop movement
```

The model is the driving base plus the distance sensor, held by real connections: two 15-hole beams pinned to the hub's four top holes, a 7-hole beam pinned across their front ends, and the sensor hung under that beam on two 3L pins. No two solid parts overlap, and the sensor is welded into the hub's body. `test/bw-sim-wall-stopper-program.test.mjs` runs exactly this text through the Scratch VM, the spikeprime extension and the virtual hub, and judges the robot's geometry, not the sensor's reading: at rest its foremost point and the sensor's ray origin are both 9.3 cm from the wall's face, and it never touched the wall. The same program with `< 1` stops 4.4 cm out (the sensor reads nothing closer than 5 cm, which the block reports as 0, and 0 is less than 1); with `< 0` it drives into the wall. *Challenge:* make it stop 20 cm before the wall.

**The colour explorer, ready to run.** Choose **Colour explorer** in the Model list, press **Load example program** (the robot moves onto the **Colour Zones** mat), then press **Run**. The robot turns to face the red corner, drives until its colour sensor sees red, rolls on into the square and lights the hub red. The program (`static/sim-lab/programs/colour-explorer.bw`):

```
DEVICE SPIKE

# Robot Lab: find the red square on the Colour Zones mat.
# Model: Colour explorer (wheels on A and B, colour sensor on C looking down).
# Turn left until the robot faces the red corner, drive until the sensor
# sees red, roll on into the square, stop and light the hub red.
WHEN flag clicked:
  set movement motors A B
  set movement speed 30
  reset yaw
  start tank -10 10
  wait until (spike angle yaw) < -130
  stop movement
  start moving steering 0
  wait until spike color C is red
  move forward 15 cm
  set center button light to red
```

The model is the driving base plus the colour sensor, looking down 16 mm above the floor and centred 32 mm ahead of the drive axle: a 5-hole beam pinned across the hub's front holes, the sensor on two 3L pins through it. `test/bw-sim-colour-explorer-program.test.mjs` runs exactly this text and checks that, at rest, both the drive-axle midpoint and the sensor's spot are inside the red square (measured: axle at (-0.28, -0.31), spot at (-0.30, -0.33)); the same program waiting for blue drives over the red square and on. *Challenge:* make it find the green square (it is at (-0.35, 0.35): turn the other way).

`scripts/verify-sim-lab-browser.mjs` runs both examples through the pane's buttons in the built app and judges them the same way.

If no SPIKE program is loaded when you press Run, the pane shows: *“No SPIKE program is loaded yet, so nothing tells the motors to turn. Write one in the Code tab and press ⇦ To blocks (or build it with blocks), then press Run — or drive the robot with the arrows below.”* The clock still runs, and the Drive pad works.

**Drive pad.** Below the 3D view, four arrow buttons ▲ ▼ ◀ ▶ and a **Speed** slider (10–100 %, step 10) drive the movement pair (A left, B right, as set in the hub) even with no program. Hold an arrow (or the keyboard arrow keys) to drive; the hub readouts show motor positions and sensor values. The slider sets the percent the pad uses for `percentToDps`.

**Mat selector.** A dropdown next to the model name chooses the floor pattern. The mats are in `bw-sim/world/mats.js`:
- **Plain** (`plain`, 1.2 × 0.8 m) — uniform white, the default when no mat is chosen.
- **Line Oval** (`line-oval`, 1.2 × 0.8 m) — a white field with a 20 mm black stadium line (two 0.6 m straights at z = ±0.25 m plus two 0.25 m semicircles). The robot starts **on the line** at (0, 0.25) heading +x, ready for a line follower.
- **Colour Zones** (`colour-zones`, 1.0 × 1.0 m) — four 0.3 m squares in the corners (red at (-0.35,-0.35), yellow at (0.35,-0.35), green at (-0.35,0.35), blue at (0.35,0.35)) plus a 20 mm black border, for colour-sorting tasks.

- **Wall** (`wall`, 1.2 × 0.8 m) — the plain white floor with a blue wall 4 cm thick, 15 cm high and 60 cm wide standing across it at x = 0.4 m (its face toward the robot at x = 0.38 m). The robot starts at (-0.3, 0) heading at the wall (+x). The wall is an obstacle the mat carries (`obstacles` in `mats.js`): choosing the mat puts it into the scene.

Choosing the line-oval mat puts the robot on the line, the wall mat puts its drive axle 0.68 m before the wall face; the other mats start at (0,0) heading 0.

**Open .ldr…** loads your own model from any LDraw editor (LeoCAD, BrickLink Studio's LDraw export, including MPD files with `0 FILE` submodels; Studio meta like `0 STEP`, `!LDCAD`, `!STUDIO`/`PE_TEX` and `0x2RRGGBB` direct colours are ignored). Parts the Robot Lab does not know, loose geometry and mirrored parts are listed under **Notes about this model** and skipped; the rest still runs. A motor or sensor is bound to a hub port by a meta line before its part line:
```
0 !BW PORT A
1 71 -100 10 80 0 1 0 1 0 0 0 0 -1 54696p01.dat
```

Without WebGL the pane says so and the simulation still runs (encoders and yaw keep working; only the picture is missing).

**Saved with the project.** “Save to your computer” stores the model the Lab shows (the Build scene, or the model being simulated) inside the `.sb3`, as its LDraw text, in the `simLab` section of the Brickwright bundle (`lib/bw-project-bundle.js`; record in `bw-sim/model/sim-lab-persist.js`). Opening the project restores it byte-for-byte; a project without one opens the reference driving base. Vanilla Scratch ignores the entry. Saving (`serializeModel` in `bw-sim/model/ldraw-model.js`) writes a flat single-file model (first FILE is main, submodels expanded), not an MPD.

## Seeing the model

Kids cannot read `motor-without-port`; the Lab shows what a model is made of and what is wrong with it (`bw-sim/mech/insight.js` computes it, `bw-sim/view/insight-layer.js` draws it, the words are in `components/tw-pseudocode/sim-lab-insight-text.js`, EN and DE):

- **Notes about this model** lists every issue as a sentence for children ("SPIKE medium angular motor is not plugged into the hub yet: click here, then choose a port (A–F) on its label"). An issue that names parts (`parts` on the diagnostic or refusal) is a link: in Build it selects those parts and frames them, in Simulate they pulse orange for 3 s. In Build the list comes from compiling the editor's model 150 ms after the last edit (about 8 ms for 72 parts).
- **Before you press Run:** a box above the view says when no motor is plugged in, there is no hub, or the model falls apart (two or more loose groups, or loose parts that are a quarter of the model). A part is **loose** (`loose-part`) when no joint links its body, directly or through others, to the hub's body.
- **Show ports** (on by default): a badge next to every motor and sensor with its hub port, or **?** when it has none. In Build a click on a badge selects the part and opens a port picker (none, A–F).
- **Show how it moves** (off by default): every rigid body in its own pastel colour (parts in one colour move together), each hinge axis as a thin arrow (red: a motor's, blue: a free hinge), a blue dot at a ball joint, and a violet line between meshing gears with their tooth ratio ("1:3"). In Simulate the marks ride on the moving bodies.

## Building instructions

Kids who built a robot in the Lab (or opened an example) can build it for real: **Instructions** (next to Simulate / Build; **Bauanleitung** in German) opens the model on show as the pages of a LEGO manual.

- **Each step** shows the parts built before in their colours, a little paler, and the parts new in this step in full colour, outlined in orange. The camera always looks from the front-right above and frames the new parts with the model around them. A **Parts needed** box lists the step's new parts with their pictures (the Build palette's, in the part's colour) and counts; axles carry their length in a circle ("4" for an axle 4), straight beams their holes, a 3L pin its 3.
- **Previous / Next** or **← / →** turn the pages ("3 / 12"); **Esc** closes. The last page is the **parts list**: every part with its count and its EN/DE name.
- **Print / Save as PDF** draws every step into one page in a new window (one picture per step, then the parts list) and opens the browser's print dialog; choose "Save as PDF" there. Pop-ups must be allowed for the page.

**The step order** (`bw-sim/instructions/steps.js`, pure). A model whose LDraw file has `0 STEP` (or `0 ROTSTEP`) lines is built in those steps: `model/ldraw-model.js` keeps them as `model.steps` and writes a `0 STEP` after each step when it saves, so they survive Build and the project file (a model without them is written exactly as before). Parts added since come after them, in derived steps. Otherwise the steps are worked out from the connector graph (`mech/graph.js`):

1. the hub first (or, without one, the heaviest part);
2. then a breadth-first walk over the structural parts (beams, motors, sensors, wheels, gears, connectors), neighbours being parts that touch directly or through pins and axles;
3. a pin, axle or bush goes on in the step where the *second* part it joins does: a pin with the beam it holds on, an axle with the wheel it carries (one that sits in another, such as a bush on an axle, counts with it);
4. about four parts per step, at most six unless one part brings more fasteners; a one-part step joins the step before when that stays within six;
5. an editor group (`0 !BW GROUP`) whose parts hold together on their own is a **sub-assembly**: built on its own pages right before the step that attaches it;
6. a part that touches nothing built starts a step marked loose ("This part does not connect to the rest yet").

Every derived step is buildable: each new part touches a part built before, directly or through other new parts of the same step. `test/bw-sim-instructions.test.mjs` checks this on the S1 driving base and every shipped model (every part once; pins and axles with what they join; the bill of materials counts the model), the `0 STEP` fixture `test/fixtures/bw-sim/driving-base-steps.ldr`, groups and loose parts. The pictures are `view/instructions-view.js`; the dialog is `components/tw-pseudocode/sim-lab-instructions.jsx` (words in `sim-lab-instructions-text.js`); the print page is `instructions/print-page.js`. All of it is in the lazy Sim Lab chunk (`scripts/verify-boot-payload.mjs`); `scripts/lib/sim-lab-instructions-gate.mjs` drives it in the built app.

## Build mode

Build is a small CAD editor (`bw-sim/editor/editor-view3d.js`; arithmetic in `editor/transform-math.js`). Every change goes through the editor command stack; a change to several parts is one `moveMany`/`batch` command, so one Ctrl+Z undoes it.

**Mouse**
- **Click a part** selects it. If it is in a group, the whole group is selected.
- **Shift+click** adds or removes a part (or its whole group). **Click empty space** clears the selection; **Esc** also clears.
- **Shift+drag on empty space** draws a box; parts whose centres lie inside are added to the selection.
- **Drag a part** slides the selection on the work plane (the floor or the top face of another part), grid-snapped.
- **Gizmo:** when a part is selected, three coloured arrows (X red, Y green, Z blue) and planes move it along axes or in planes (W for move, E for rotate). Coloured rings turn it (see R/T below). Dragging the gizmo shows the “Moving x…/Turning …” status.
- **Magnet:** a single part dragged or placed near a matching hole or axle shows a green ghost and snaps there on release (all connector pairs that would connect are counted). **Hold Alt** to turn the magnet off. A pin must be within 0.5 LDU sideways and centred along the shaft; a placed part that would overlap another is refused (see below).
- **Camera:** left-drag on empty space or right-drag orbits; middle-drag or Shift+right-drag pans; wheel zooms toward the pointer.

**Palette (`components/tw-pseudocode/sim-lab-palette.jsx`)** — after Tinkercad's shape panel.
- Each part is a **tile with a picture** drawn from its real LDraw geometry in the placed colour (Light Bluish Grey), edges on, from the front-right above (`view/part-thumbnails.js`: one offscreen WebGL renderer, a picture per part drawn when its tile scrolls into view or its category is opened, a few ms per frame, kept as a data URL for the page's life). Without WebGL the tiles show names only. The tooltip gives the full name and the part number.
- **Search** filters by EN and DE name and part number, ignoring case and umlaut spelling (`zahnrad`, `zaehne`, `beam 7`, `Lochbalken 7`, `3647`); a number matches a whole number in the name (`beam 7` is not `beam 17`), three digits or more also the start of a part number (`editor/palette.js` `searchPalette`).
- **Recently used** — the last six parts placed this session, newest first.
- **Click a tile, then click in the view** to place (Shift+click keeps the tool), or **press a tile and drag it into the view**: the same ghost (magnet, resting on top, overlap refusal) follows the pointer and letting go places the part. Letting go outside the view, or **Esc** during the drag, places nothing.
- Categories are collapsible and keep their open state across a search.

**Keyboard (onKey)**
- **R / Shift+R** — turn 90° about the vertical (world Y). If the selection is a single part sitting on a pin or axle, it turns about that connection's axis instead.
- **T / Shift+T** — tip 90° about the horizontal axis facing the camera (the closer of world X or Z).
- **F** — fit the selection (or the whole model) in view; **Home/Top/Front/Side** buttons do the same with fixed directions.
- **Ctrl+Z / Ctrl+Y** (or Shift+Ctrl+Z) — undo / redo one command step.
- **Ctrl+D** — duplicate the selection one hole pitch (20 LDU) along +X.
- **Ctrl+C / Ctrl+V** — copy/paste the selection (each paste steps one hole pitch further; the clipboard survives mode switches).
- **Ctrl+A** — select all.
- **Ctrl+G** — group the selection (needs ≥2 parts); a click on any member then selects the whole group. Stored as `0 !BW GROUP <id> <name>` plus `0 !BW IN <groupId>` before each member's type-1 line (see `bw-sim/model/ldraw-model.js`; exact syntax below). Groups do not nest; a part belongs to at most one group.
- **Shift+Ctrl+G** (or **Ctrl+Shift+G**) — ungroup every group the selection touches (one undo step).
- **Delete / Backspace** — delete the selection (a batch of deletes, one undo step; a group left with <2 members dissolves).
- **Esc** — stop a placing tool or clear the selection.

**Build bar (sim-lab-pane.jsx)**
- **Move (W) / Turn (E)** toggle the gizmo mode.
- **Grid** — 1 / 5 / 10 / 20 LDU (default 10 = half a hole pitch).
- **Turn ↻ (R)** and **Tip (T)** — same as the keys, for the mouse.
- **Group / Ungroup** — buttons for Ctrl+G / Shift+Ctrl+G (disabled unless the selection qualifies).
- **Duplicate / Delete** — same as Ctrl+D / Delete.
- **Undo / Redo** — same as Ctrl+Z / Ctrl+Y.
- **Home / Fit (F) / Top / Front / Side** — camera views.
- **Save .ldr** — downloads `my-model.ldr` (the editor's current model, title `Robot Lab model`).
- When one part is selected, a **Port** dropdown (none / A–F) binds a motor or sensor; it is only shown for motors and sensors.
- The Build and Simulate tabs switch modes; Simulate compiles the built model and starts the session.

**Overlap and what may sit inside**
A move, turn or place that would make two solid parts intersect is refused: the status says *“Would go into <target>: let go and it stays where it was”* and on release nothing changes. The test is exact primitive SAT on the PartMeta colliders (box / cylinder / sphere, tolerance 1 LDU), ignoring the parts the move is meant to connect to.

What *is* allowed to occupy the same space: a part whose collider is meant to sit inside another part, as in the real Technic system — pins in pinholes, axles in axleholes or through pin holes, and the **castor ball** (52629.dat, sphere radius 24 LDU) in its socket (ball-and-socket on 39370.dat). Those are not overlaps; they are connector pairs that the snap system recognises.

**Groups in LDraw text**
`bw-sim/model/ldraw-model.js` writes and reads:
```
0 !BW GROUP <id> <name>
0 !BW IN <groupId>
0 !BW ID <placedId>
0 !BW PORT A   // for motors/sensors only
1 <color> <x> <y> <z> <a> <b> <c> <d> <e> <f> <g> <h> <i> <file>
```
Groups are declared before the parts, in definition order. Each member carries `0 !BW IN <groupId>` on the line before its type-1 line (like `!BW PORT`). Unknown or malformed group metas become **refusals** (`bad-group`, `duplicate-group`, `unknown-group`), not crashes. A model without groups writes no `!BW` group lines and round-trips byte-identically.

## What is simulated

- Rigid parts merge into bodies; axles in round holes, frictionless pins and
  motor shafts become hinges; a castor ball rolls freely in its socket; spur
  and bevel gears that mesh are coupled with their tooth ratio.
- Gears transmit only when both axles turn in the same part (the frame: a
  beam, or the motor housing and everything pinned to it). A gear rigidly
  joined to the part its partner turns in locks the pair (warning
  `gear-on-frame`: the two become one rigid body); gears whose axles turn in
  two separate parts are not coupled (`gear-frames-differ`). The coupling
  works both ways: a blocked output stalls the motor at its torque limit.
  Limit: exact while the frame does not itself turn about the gear axes; on a
  frame that does (gears on a turntable) the gears are off by the frame's
  rate. Test gearboxes: `test/fixtures/bw-sim/gears/`, run by
  `test/bw-sim-gear-trains.test.mjs` with the motor housing clamped (a static
  body made of model parts is the machine's frame: it does not collide with
  the machine's moving parts).
- Motors: the hub's own motor controller decides each motor's speed (ramps,
  holds, run-to-position, stop actions); the hinge turns under the motor's
  torque limit, and the **encoder reads what the wheel actually did**.
- The hub's yaw (`motion_sensor`, `hub.motion`) follows the hub body.
- **Sensors (via raycast in `bw-sim/sensors.js`, ignoring the robot's own bodies; ground colour via `createMat(ground.mat).colorAt(x,z)` when a mat is chosen):**
  - **Distance (port D, device 62):** ray forward up to 2.5 m; distance in mm, rounded; outside 50–2000 mm → -1.
  - **Colour (port C, device 61):** ray down up to 32 mm; if it hits the ground or a coloured body within that range, reports its `color` id (0 black, 3 blue, 6 green, 7 yellow, 9 red, 10 white) and `reflection` (0–100, 100 for white, 5 for black on the mat, scaled by `1 - d/0.032`), plus `red`/`green`/`blue` (0–1024). Beyond 32 mm → colour -1, reflection 0.
  - **Force (port F, device 63):** ray along the plunger up to 10 mm; if it hits within 2 mm, `force = 100·(1 - d/0.002)` (0–100), `pressed` when >10; otherwise 0.
  - **IMU (motion_sensor):** pitch/roll from the hub body's quaternion, `faceUp` (0 top … 5 bottom), `angularVelocity` and `acceleration` (milli-g) derived from body motion and gravity.
- **Mats and obstacles (`bw-sim/world/`):** the Mat selector above; obstacles are static box bodies (compile option `obstacles: [{id, shape:'box', size:[w,h,d], position:[x,y,z], yawDeg, color}]`) — colour is a SPIKE colour id 0–10 shown as a box mesh; the S1 driving base collides and stops against them, and the distance sensor's ray meets them. A mat may carry obstacles (`createMat(id).obstacles`, same shape); `prepareModel` compiles them with the model, which is how the Wall mat's wall gets into the scene.
- Not yet simulated: flexible parts (belts, hoses), worm and rack gears beyond spur/bevel, and the colour sensor's ambient-light modes.

## The parts it knows (45)

From `overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json` (grouped by `category`; English name and LDraw file):

- **axle (8):** Technic axle 2 notched (32062.dat), Technic axle 3 (4519.dat), Technic axle 4 (3705.dat), Technic axle 5 (32073.dat), Technic axle 6 (3706.dat), Technic axle 8 (3707.dat), Technic bush (3713.dat), Technic half bush (4265c.dat)
- **beam (14):** Technic beam 11 (32525.dat), Technic beam 13 (41239.dat), Technic beam 15 (32278.dat), Technic beam 2×4 L-shaped (32140.dat), Technic beam 3 (32523.dat), Technic beam 3×5 L-shaped (32526.dat), Technic beam 5 (32316.dat), Technic beam 5×3 H-shaped with ball socket (39370.dat), Technic beam 7 (32524.dat), Technic beam 9 (40490.dat), Technic frame 5×11 open centre (39794.dat), Technic frame 5×7 open centre (64179.dat), Technic thin liftarm 1×3 (6632.dat), Technic thin liftarm 1×4 (32449.dat)
- **connector (4):** Technic axle and pin connector perpendicular (6536.dat), Technic axle and pin connector perpendicular 3L with 2 pin holes (42003.dat), Technic axle and pin connector perpendicular 3L with centre pin hole (32184.dat), Technic axle connector with axle hole (32039.dat)
- **gear (6):** Technic gear 12 tooth bevel (6589.dat), Technic gear 16 tooth (94925.dat), Technic gear 20 tooth bevel (32198.dat), Technic gear 24 tooth (3648.dat), Technic gear 40 tooth (3649.dat), Technic gear 8 tooth (3647.dat)
- **hub (1):** SPIKE Prime hub (45601.dat)
- **motor (2):** SPIKE large angular motor (54675.dat), SPIKE medium angular motor (54696p01.dat)
- **other (1):** Technic ball 19 mm for ball castor (52629.dat)
- **pin (4):** Technic axle pin with friction (43093.dat), Technic pin 3L with friction (6558.dat), Technic pin with friction (2780.dat), Technic pin without friction (3673.dat)
- **sensor (3):** SPIKE colour sensor (37308.dat), SPIKE distance sensor (37316.dat), SPIKE force sensor (37312.dat)
- **wheel (2):** Wheel 56×14 with medium azure tyre (SPIKE Prime) (39367p01.dat), Wheel 88×14 with medium azure tyre (SPIKE Prime large) (49295p01.dat)

Every connector in that file is checked against the part's LDraw mesh by `test/bw-sim-part-meta.test.mjs`.

Adding a part: add it to `parts.json` (measure it with `bw-sim/ldraw/ldraw-geometry.js`; never copy connectivity data from BrickLink Studio, LDCad or another database), then run `npm run sync:ldraw -- --from <extracted complete.zip> --source-sha256 <hash> --source-date <date>` and `npm run sync:ldraw:check`.

## Geometry and licence

Part geometry is a curated subset of the official **LDraw Parts Library** (CC BY 4.0, some files dual CC BY 2.0 / 4.0), vendored unmodified in `overlay/scratch-gui/static/ldraw/` with its licence texts; see `THIRD-PARTY-NOTICES.md`. Physics is **Jolt** (MIT). LEGO® is a trademark of the LEGO Group, which does not sponsor, authorize or endorse this project.

## Checks

**Unit (bw-sim):** 27 files in `test/bw-sim-*.test.mjs`, each a pure check of one area:
- `bw-sim-contracts.test.mjs` — PlacedModel, CompiledMechanism and CompiledModel validators.
- `bw-sim-editor-overlap.test.mjs` — build moves/turns/places that would intersect are refused; pins/axles/ball may sit inside.
- `bw-sim-editor-ports.test.mjs` — copies of motors/sensors keep a sensible port (free keeps, taken gets first free, six full → none, three at once distinct, beam none, undo restores).
- `bw-sim-editor.test.mjs` — editor commands and undo/redo (place, move, delete, clone, recolor, setPort).
- `bw-sim-editor-v2.test.mjs` — multi-select, groups and grid arithmetic.
- `bw-sim-gear-trains.test.mjs` — spur and bevel gear couplings and ratios.
- `bw-sim-groups.test.mjs` — group/ungroup/rename, merge, dissolve, clone, moveMany, LDraw group syntax and refusals.
- `bw-sim-imu.test.mjs` — hub pitch/roll/faceUp/yaw from body pose.
- `bw-sim-ldraw-model.test.mjs` — LDraw parse/serialize, MPD sub-models, ports, groups, refusals, byte-identical round-trip.
- `bw-sim-line-follower.test.mjs` — line-oval colour readings along the centre line.
- `bw-sim-mats.test.mjs` — mat sizes, colours and reflection for the three mats.
- `bw-sim-mech.test.mjs` — compiler: islands, hinges, gears, sensors, locked-hinge merging.
- `bw-sim-model-insight.test.mjs` — every issue code in the sources has an EN and DE sentence; issues name their parts (motor without a port, gear-on-frame, a loose part); body tints, hinge-axis segments and gear ratios against the compiled mechanism; compile time for 72 parts.
- `bw-sim-overlap.test.mjs` — primitive SAT for box/cylinder/sphere colliders.
- `bw-sim-part-meta.test.mjs` — every connector and collider against its LDraw mesh.
- `bw-sim-persist.test.mjs` — sim-lab LDraw text saved with the project and reopened byte-identically.
- `bw-sim-physics-cast-ray.test.mjs` — raycast for sensors and distance.
- `bw-sim-physics-core.test.mjs` — Jolt body and hinge creation, stepping.
- `bw-sim-physics-worker.test.mjs` — worker message protocol.
- `bw-sim-render-quality.test.mjs` — part-geometry and material fidelity.
- `bw-sim-s1-driving-base.test.mjs` — the S1 driving base drives, turns and hits a wall.
- `bw-sim-scene3d.test.mjs` — Sim Lab 3D view, mat texture and obstacle meshes.
- `bw-sim-sensors.test.mjs` — distance/colour/force readings from a running core.
- `bw-sim-session.test.mjs` — session tick, snapshot, time and yaw.
- `bw-sim-snap-rotate.test.mjs` — magnet snapping and `rotateAboutSnap`.
- `bw-sim-snap.test.mjs` — snap candidates (pins, axles, studs, ball).
- `bw-sim-world.test.mjs` — mats and obstacles in the compiled mechanism and scene.

Plus `test/bw-sim-persist.test.mjs` ↔ `test/project-bundle-archive.test.mjs` (real bundle writer/reader) and `scripts/verify-boot-payload.mjs` (Jolt and the Sim Lab view stay out of the first load, chunk `bw-sim-lab`).

**Browser (after a GUI build):**
- `npm run verify:sim-lab` — `scripts/verify-sim-lab-browser.mjs` loads the reference driving base with a WebGL view, runs with no program (hint shown, robot stays put, Drive pad moves it), chooses the line-oval mat (robot on the line), checks palette place/snap/undo, palette pictures (drawn, lazily), search, drag from the palette onto the floor and onto a beam hole, Esc cancelling a drag, Build→Simulate compile, a green-flag Scratch program drives with physical encoders, saved model reopens byte-identical, project load replaces the model, no-WebGL fallback still runs.
- `scripts/lib/sim-lab-insight-gate.mjs` — port badges in both views, "Show how it moves" (overlay objects and red axis pixels) in both, unplugging a motor from its badge lists the issue, the issue selects the motor, the badge's picker plugs it back in, "Before you press Run" with no motor, the issue pulses the motors in Simulate.
- `scripts/lib/sim-lab-cad-gate.mjs` — `npm run test:sim-lab-cad` places a part on the floor, drags the gizmo, turns with R/ring, slides on the work plane, Shift+multi-select and box-select, groups/ungroups, pins snap from above and beams stack, pushing into the hub is refused.
