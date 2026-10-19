# Robot Lab (beta) — LEGO® Technic models with physics

The Robot Lab simulates a model built from real LEGO Technic parts and lets a program drive it through the **virtual SPIKE Prime hub**, the same hub the SPIKE arena uses. Scratch blocks, DEVICE SPIKE pseudocode and imported SPIKE 3 programs reach it unchanged: they cannot tell the hub is simulated.

The code and its paths call it **Sim Lab** (`lib/bw-sim/`, `sim-lab-pane.jsx`); the learner sees the **Robot Lab** / **Roboter-Labor** tab.

## Where it lives

The Robot Lab is **its own editor tab**, after Blocks, Costumes, Sounds, Code and Circuit (and FPGA when that is switched on): `components/tw-pseudocode/robot-lab-tab.jsx`, appended last in `gui.jsx` so no existing tab index moves (its own index is 5, or 6 with the FPGA tab). The 3D view fills the tab. The tab costs nothing until it is first shown: the pane and its toolbar arrive then (chunk `bw-robot-lab`), the scene, the catalogue and the 3D views after that (chunk `bw-sim-lab`), the physics in its worker (`bw-sim-physics-worker`, Jolt in `bw-sim-jolt`) — `scripts/verify-boot-payload.mjs` checks all four stay out of the first load and out of the arena's chunk. Once shown, the tab stays mounted: the model, the camera and a running program survive a trip to the Code tab.

**One hub, one world.** The Robot Lab and the SPIKE arena (right pane, **SPIKE arena** button in the Code tab) share one virtual SPIKE hub (`lib/virtual-hub/shared-spike-hub.js`), so they never both drive it. The arena no longer embeds the Lab: it offers **Open in Robot Lab**, which shows the tab. While the Robot Lab holds a session the arena is not mounted and says *“The Robot Lab tab is driving the virtual hub now…”*, with **Show the Robot Lab** and **Use the arena here**; the latter closes the Lab's session (its model is saved with the project first) and the tab then offers **Open the Robot Lab here**. The hand-over is three window events named in `lib/robot-lab-events.js`. *Why not show the Lab inside the arena as well:* two views of one session would need two WebGL contexts and two render loops on school hardware, and the arena's own mat would still be a second world; one session in one place, with a button from the other, is the honest model.

**The program it runs** is the project's, on the green flag (Run), through the project's hub: today the virtual SPIKE Prime, behind the VirtualHub boundary (docs/ROBOT-LAB-ARCHITECTURE.md R1); the tab knows nothing SPIKE-specific, so other hubs plug in at that boundary.

## The toolbar

One row of grouped icon buttons (`sim-lab-toolbar.jsx`, words in `sim-lab-toolbar-text.js`, EN and DE). Every button has its name as its accessible name and a tooltip with the name and the shortcut, e.g. *“Turn 90° (R)”* / *“Um 90° drehen (R)”*, *“Undo (Ctrl+Z)”* / *“Rückgängig (Strg+Z)”*. Icons are inline SVG strokes, as the Code tab's icon is: no icon font, no new dependency.

- **Mode** — a segmented control: **Simulate · Build · Instructions**.
- **Simulate:** **Run/Pause**, **Reset**; **View**: Home, Fit, Top, Front, Side; **Show**: ports, how it moves (switches); **File** menu (Open a model…, Save as .ldr / .mpd / .io). Under the toolbar one line holds the Model and Mat lists, the program route (desktop), **Load example program** and the status.
- **Build:** **Edit**: Move with arrows (W), Turn with rings (E), Turn 90° (R), Turn back 90° (Shift+R), Tip 90° (T); **Arrange**: Delete, Duplicate, Copy, Paste, Select all, Group, Ungroup, Cancel (Esc); **Undo / Redo**; **View**: Home, Fit (F), Top, Front, Side, Grid; **Show**: ports, how it moves; **Tools**: mirror ↔ / ⇅, Hide (H), Isolate (I), Show all (Shift+H), Measure (M), Eyedropper (K); **Panels**: Parts, Properties, Shortcuts (?); **File**. Under the toolbar: the selection as a chip, its Port list, the hidden-parts chip, and a one-line hint of what a click will do now.
- **Help (?)** at the right end holds what used to be the paragraph above everything: what the Lab is, and how to move the view (and, in Build, how to select and the full shortcut sheet).
- **Narrow panes.** From 1000 px wide the toolbar may take a second row and shows everything; narrower it keeps one row and the rarer tools go to **More** (⋯), with their names and shortcuts; below 720 px the Lab is compact (the parts palette is a drawer over the view, notes fold to one line). Under a finger every button is at least 40 × 40 px.
- **Side panels (Build).** The parts palette is a panel left of the view and the properties a panel on its right (from 1280 px; narrower they open over the view); both close from the toolbar and are resized with the app's pane divider (`gui/pane-divider.jsx`; double-click closes).

## Moving the view

The same in Simulate and Build (`lib/bw-sim/view/camera-nav.js`):

| Input | Does |
|---|---|
| Left-drag on empty space, middle-drag | orbit about the target |
| Right-drag; Shift+drag in Simulate | pan (in Build, Shift+drag draws a selection box, so Build pans with the right button) |
| Wheel | zoom toward the pointer |
| One finger / two fingers | orbit / pinch-zoom and pan |
| ← → ↑ ↓ on the focused view | orbit 15° (in Build only with nothing selected) |
| Shift+arrows | pan a tenth of the view |
| + / − | zoom in / out |
| Home · Fit (F) · Top · Front · Side | the whole model from that side; Fit keeps the direction |

In Build a press on a part (or on the gizmo) belongs to the part: a drag there moves the part and leaves the camera.

How it is built, and what comes next, is in `docs/SIM-LAB-PLAN.md`.

## Using it (for kids and teachers)

1. Write a SPIKE Prime program in the Code tab (blocks or DEVICE SPIKE text). The reference model drives its wheels with ports **A (left, mounted mirrored) and B (right)**, like the arena's driving base, so `set movement motors A B` and `move forward 20 cm` work as in the arena.
   The **Model** list has the **SPIKE driving base**, the **Line follower** (the same base with a
   colour sensor on port **C** just ahead of the drive axle, for the Line Oval mat), the **Wall stopper**
   (the base with a distance sensor on port **D** looking ahead, for the Wall mat), the **Colour
   explorer** (the base with a colour sensor on port **C** centred ahead of the axle, for the Colour
   Zones mat) and the **Maze runner** (the base with a distance sensor on port **D** looking ahead and a
   colour sensor on port **C** looking down, for the Maze mat). Each of the last four comes with an
   example program: the examples are below.
2. Open the **Robot Lab** tab (or press **Open in Robot Lab** in the SPIKE arena).
3. Press **Run**. As the arena's Start does, Run connects the program to the virtual hub and starts it on the green flag. **Pause** stops the program and the clock; **Reset** reloads the model.
   The program's clock is the simulation's: `wait 2 seconds` is 2 s of simulated time on every computer. When a computer cannot simulate in real time, the whole program runs slower and the status line says how fast, e.g. *“0.40× real time”* (*“0,40× Echtzeit”*); what the robot does stays the same.

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

The model is the driving base plus the distance sensor, held by real connections: two 15-hole beams pinned to the hub's four top holes, a 7-hole beam pinned across their front ends, and the sensor hung under that beam on two pins seated in its blind side holes. No two solid parts overlap, and the sensor is welded into the hub's body. `test/bw-sim-wall-stopper-program.test.mjs` runs exactly this text through the Scratch VM, the spikeprime extension and the virtual hub, and judges the robot's geometry, not the sensor's reading: at rest its foremost point and the sensor's ray origin are both 9.3 cm from the wall's face, and it never touched the wall. The same program with `< 1` stops 4.4 cm out (the sensor reads nothing closer than 5 cm, which the block reports as 0, and 0 is less than 1); with `< 0` it drives into the wall. *Challenge:* make it stop 20 cm before the wall.

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

The model is the driving base plus the colour sensor, looking down 16 mm above the floor and centred 32 mm ahead of the drive axle: a 5-hole beam pinned across the hub's front holes, the sensor on two pins through it, seated in the sensor's blind side holes. `test/bw-sim-colour-explorer-program.test.mjs` runs exactly this text and checks that, at rest, both the drive-axle midpoint and the sensor's spot are inside the red square (measured: axle at (-0.28, -0.31), spot at (-0.30, -0.33)); the same program waiting for blue drives over the red square and on. *Challenge:* make it find the green square (it is at (-0.35, 0.35): turn the other way).

**The sumo robot, ready to run.** Choose the **Colour explorer**, the **Sumo ring** mat (a white disc with a black band, inner radius 0.335 m and outer radius 0.385 m; the robot starts at the ring centre), put the program below into the Code tab and press Run. The robot drives forward until its colour sensor sees the black band, backs up a little, turns a quarter turn away and drives again — and never leaves the ring. The program (`static/sim-lab/programs/sumo.bw`):

```
DEVICE SPIKE

# Robot Lab: stay inside the Sumo ring.
# Model: Colour explorer (wheels on A and B, colour sensor on C looking down).
# The robot drives forward until the sensor sees the black band, then backs up
# a little and turns away, then drives on again - for as long as it runs.
WHEN flag clicked:
  set movement motors A B
  set movement speed 60
  FOREVER:
    start moving steering 0
    wait until spike color C is black
    stop movement
    move backward 8 cm
    reset yaw
    start tank -20 20
    wait until (spike angle yaw) < -90
```

The Model list keys its entries by the model's file name (one example per model), so it cannot offer a second example for the Colour explorer — the program is loaded from the code above instead. `test/bw-sim-sumo-program.test.mjs` runs exactly this text through the Scratch VM, the spikeprime extension and the virtual hub on the shipped model and mat, for 40 s of simulated time: the drive-axle midpoint never leaves the 0.385 m ring edge, the robot reaches the band more than three times and travels more than 6 m; the same program waiting for a colour the mat does not have (blue) rolls straight out of the ring in seconds. *Challenge:* make the turn angle random so the robot explores the whole ring.

**The maze runner, ready to run.** Choose **Maze runner** in the Model list, press **Load example program** (it puts the program into the Code tab, builds the blocks and moves the robot onto the **Maze** mat), then press **Run**. The robot keeps its left hand on the wall: in every square it turns a quarter to look left with the distance sensor, then ahead, then right, and drives one cell into the first open way (left, then ahead, then right, then back); the colour sensor looking down stops the robot the moment the floor under it is the goal cell's green. From the start it reaches the goal in about 70 s of simulated time. The program (`static/sim-lab/programs/maze.bw`):

```
DEVICE SPIKE

# Robot Lab: find your way through the maze to the green square.
# Model: Maze runner (wheels on A and B, a distance sensor on D looking ahead,
# a colour sensor on C looking down).
# Keep your left hand on the wall: at every square look left first, then
# ahead, then right, and drive that way when it is open. The colour sensor
# stops the robot the moment the floor under it is green.
WHEN flag clicked:
  set movement motors A B
  set movement speed 30
  reset yaw
  REPEAT UNTIL spike color C is green:
    # Look left: turn a quarter to the left and take a reading.
    reset yaw
    start tank -20 20
    wait until (spike angle yaw) < -83
    stop movement
    wait 0.5 seconds
    IF (spike distance D) > 25 THEN:
      move forward 30 cm
    ELSE:
      # Left is a wall. Face ahead again and take a reading.
      reset yaw
      start tank 20 -20
      wait until (spike angle yaw) > 83
      stop movement
      wait 0.5 seconds
      IF (spike distance D) > 25 THEN:
        move forward 30 cm
      ELSE:
        # Ahead is a wall too. Face right and take a reading.
        reset yaw
        start tank 20 -20
        wait until (spike angle yaw) > 83
        stop movement
        wait 0.5 seconds
        IF (spike distance D) > 25 THEN:
          move forward 30 cm
        ELSE:
          # Only the way back is open: face it and drive.
          reset yaw
          start tank 20 -20
          wait until (spike angle yaw) > 83
          stop movement
          wait 0.5 seconds
          move forward 30 cm
  # Home: the floor is green. Stop, light the hub and beep.
  stop movement
  set center button light to green
  play beep 440 0.3
```

The two waits are what make the moves repeatable: `stop movement` shorts the motors and the robot rolls on for a moment, so each turn stops a little past the 83° the block waits for and settles on 90°, and each one-cell drive runs on a moment after its block returns. The 25 cm threshold sits between the two readings that matter: a wall on the edge ahead has its near face 0.15 - 0.01 = 0.14 m from the cell centre and the sensor's ray starts 44 mm ahead of the axle, so it reads about 96 mm, while the nearest open corridor (one cell, then the rim wall's near face at 0.15 + 0.3 - 0.01 = 0.44 m) reads 440 - 44 = 396 mm. The model is the driving base plus the wall stopper's distance-sensor mount and the colour explorer's colour-sensor mount on the same base: two 15-hole beams on the hub's top holes carry a cross beam, the distance sensor (ray 36 mm up) hangs under it on two pins seated in its blind side holes, and the colour sensor sits on a 3-hole beam on the right, held on two pins, looking down 16 mm above the floor. No two solid parts overlap, and the compiler welds both sensors into the hub's body. `test/bw-sim-maze-program.test.mjs` runs exactly this text through the Scratch VM, the spikeprime extension and the virtual hub on the shipped model and mat, for 120 s of simulated time: the colour sensor first sees the goal's green at 70 s, and at rest the drive-axle midpoint (0.49, -0.44) and the sensor's spot (0.52, -0.41) are both on the goal cell's green floor (read from `createMat('maze')`, x 0.3–0.6, z -0.6 to -0.3), and the axle midpoint never crosses a wall's centre plane. The same program waiting for blue (which the mat does not have) never stops. *Challenge:* put the goal behind a wall the left hand alone will not pass, and see the program miss it.


`scripts/verify-sim-lab-browser.mjs` runs both examples through the pane's buttons in the built app and judges them the same way.

If no SPIKE program is loaded when you press Run, the pane shows: *“No SPIKE program is loaded yet, so nothing tells the motors to turn. Write one in the Code tab and press ⇦ To blocks (or build it with blocks), then press Run — or drive the robot with the arrows below.”* The clock still runs, and the Drive pad works.

**Drive pad.** Below the 3D view, four arrow buttons ▲ ▼ ◀ ▶ and a **Speed** slider (10–100 %, step 10) drive the movement pair (A left, B right, as set in the hub) even with no program. Hold an arrow (or the keyboard arrow keys) to drive; an arrow follows the finger or button that pressed it, so sliding off it keeps driving and lifting that finger (or the browser cancelling it) stops — a second finger on another arrow takes over. The hub readouts show motor positions and sensor values. The slider sets the percent the pad uses for `percentToDps`.

**Mat selector.** A dropdown next to the model name chooses the floor pattern. The mats are in `bw-sim/world/mats.js`:
- **Plain** (`plain`, 1.2 × 0.8 m) — uniform white, the default when no mat is chosen.
- **Line Oval** (`line-oval`, 1.2 × 0.8 m) — a white field with a 20 mm black stadium line (two 0.6 m straights at z = ±0.25 m plus two 0.25 m semicircles). The robot starts **on the line** at (0, 0.25) heading +x, ready for a line follower.
- **Colour Zones** (`colour-zones`, 1.0 × 1.0 m) — four 0.3 m squares in the corners (red at (-0.35,-0.35), yellow at (0.35,-0.35), green at (-0.35,0.35), blue at (0.35,0.35)) plus a 20 mm black border, for colour-sorting tasks.

- **Wall** (`wall`, 1.2 × 0.8 m) — the plain white floor with a blue wall 4 cm thick, 15 cm high and 60 cm wide standing across it at x = 0.4 m (its face toward the robot at x = 0.38 m). The robot starts at (-0.3, 0) heading at the wall (+x). The wall is an obstacle the mat carries (`obstacles` in `mats.js`): choosing the mat puts it into the scene.

- **Sumo ring** (`sumo`, 1.0 × 1.0 m) — a white disc with a 5 cm black ring band centred on the mat (inner radius 0.335 m, outer radius 0.385 m — outer diameter 0.77 m). The robot starts at the ring centre, heading +x, ready for a stay-in-the-ring robot.

- **Maze** (`maze`, 1.2 × 1.2 m) — a 4 × 4 grid of 0.3 m cells with 2 cm grey walls standing on the grid lines at -0.6 + 0.3 k; the goal cell (3,0) has a green floor (colour id 6), the other cells are white. The robot starts at the start cell's centre (-0.45, -0.45) heading +z, ready for a wall-follower. The walls are the mat's obstacles, so the distance sensor sees them.


Choosing the line-oval mat puts the robot on the line, the wall mat puts its drive axle 0.68 m before the wall face, the maze mat puts it at the start cell's centre heading into the maze; the other mats start at (0,0) heading 0.

**Open…** loads your own model: LDraw `.ldr`/`.mpd` from any LDraw editor, a BrickLink Studio `.io` or a LEGO Digital Designer `.lxf` (see *Model files* below). LDraw files from any editor (LeoCAD, BrickLink Studio's LDraw export, including MPD files with `0 FILE` submodels; Studio meta like `!LDCAD`, `!STUDIO`/`PE_TEX` is ignored, `0 STEP` becomes building steps and `0x2RRGGBB` direct colours are kept). Parts the Robot Lab does not know, loose geometry and mirrored parts are listed under **Notes about this model** and skipped; the rest still runs. A motor or sensor is bound to a hub port by a meta line before its part line:
```
0 !BW PORT A
1 71 -100 10 80 0 1 0 1 0 0 0 0 -1 54696p01.dat
```

Without WebGL the pane says so and the simulation still runs (encoders and yaw keep working; only the picture is missing).

**Model files** (`bw-sim/model/model-file.js`). **Save as…** (Build and Simulate) writes the model on show as `.ldr`, `.mpd` (one `0 FILE` section) or `.io`; all three read back to the same model, byte for byte for the LDraw text.
- **BrickLink Studio `.io`** is a ZIP whose `model.ldr` is the model in plain LDraw with LDraw colour codes (LDraw wiki "IO"; read the same way by the open-source readers in vengi and brick-mcp). Opening reads only `model.ldr`; parts Studio carries in `CustomParts/` are listed as Studio-only, other parts the Robot Lab does not know as unknown. Studio's own library has 127 part names in another frame than upstream LDraw (the MIT-licensed census in tribixbite/craftmatic); none is a Robot Lab part, so nothing is re-framed. **Older Studio versions encrypt the archive: such a file is refused** with a message to re-save it in a current Studio or export LDraw there — the Robot Lab does not open protected archives. Saving writes a plain ZIP holding `model.ldr` (the `.ldr` save byte for byte, `!BW` ports, ids and groups inside as LDraw comments); not written: the thumbnail, `.info`, `model2.ldr`/`modelv2.ldr`, instruction settings and `CustomParts/`.
- **LEGO Digital Designer `.lxf`** (LDD 4, LXFML version 5; open only) is a ZIP with `IMAGE100.LXFML`. Each `<Part>` becomes an LDraw part through a curated table of 27 core Technic parts (`bw-sim/model/ldd-parts.js`: beams, pins, axles, bushes, round and bevel gears, plus four newer LDD design numbers of them). LDD design numbers are LEGO's moulded design numbers, which LDraw also uses as file names; the per-part frame offsets are recorded from the community `ldraw.xml` mapping file (no licence statement, so not vendored). LDD units are 25 LDU, LDD is +y up. Materials are LEGO colour numbers, mapped through LDraw's own `LDConfig.ldr` `LEGOID` comments. A design outside the table that is a plain studded catalogue part (brick, plate, tile) is placed from its geometry and flagged `lxf-derived-frame`; any other design — every SPIKE element included — is listed and left out; so are mirrored parts; an unknown material keeps the part in light bluish grey. Why LDD needs per-part offsets at all, how far geometry predicts them, and the two planned better routes (snapping to connections; the user's own `ldraw.xml`): `docs/ROBOT-LAB-LDD-FRAMES.md`.

**What opens and what saves (2026-10-18).**

| Format | Program | Open | Save | Notes |
|---|---|---|---|---|
| `.ldr` | LDraw (LeoCAD, LDCad, MLCad, Studio export) | yes | yes | the format of record |
| `.mpd` | LDraw multi-part | yes (sub-models flattened) | yes (one `0 FILE`) | sub-model structure is not kept |
| `.io` | BrickLink Studio | yes (unencrypted) | yes | only `model.ldr` is read/written |
| `.lxf` | LEGO Digital Designer | yes (27 Technic parts + studded parts) | no | LDD can export `.ldr` itself |
| `.sb3` | Brickwright project | yes | yes | the model rides inside, byte for byte |

Not supported: Mecabricks `.zmbx`, LDD `.lxfml` without the ZIP, BrickLink/Rebrickable parts lists (XML/CSV), 3D export (STL/OBJ/glTF), Studio's encrypted `.io`.

**Limits and what a damaged file does.** The LDraw reader refuses by name, never throws and never opens half a model: sub-models nest at most 32 deep (`too-deep`, that copy left out), a model flattens to at most 20,000 parts (`too-many-parts`: nothing opens), a coordinate beyond 10⁶ LDU is `out-of-range`, a garbled number or colour refuses its line (`unparsable`; `parseFloat`'s "12abc" → 12 is not accepted), a matrix must be a rotation to 0.02 (rows orthonormal, determinant positive: a mirror, scale or shear is `bad-matrix`; a rotation written with three decimals, as MLCad does, is accepted and made exactly orthonormal, while our own six-decimal rotations are kept as written). A part in colour 16 inside a sub-model takes the colour the sub-model is placed in; direct colours are written as `0x2RRGGBB`. An MPD section that is a part (`.dat`, or `!LDRAW_ORG …Part/Subpart/Primitive/Shortcut`: an embedded unofficial part) is placed as the catalogue part of that name or refused once as unknown, never opened up into its primitives; of two sections with one name the first counts. A ZIP that JSZip cannot read (bad CRC, cut off, sizes that do not match) is `not-a-zip`; an entry declaring more than 32 MB is `model-too-big`; an LDD bone with absurd numbers is `lxf-bad-transform`.

**Testing the readers and writers (2026-10-18).**
1. **Every shipped and generated model** (`test/bw-sim-model-roundtrip.test.mjs`): the six shipped models and the 2,054-part stress model go `.ldr`, `.mpd`, `.io` and the project's `simLab` record (and the stress model through a real `.sb3` via the bundle writer/reader) and back, compared as models (part, colour, pose to 1e-6 LDU, port, id, group, steps) and byte for byte.
2. **Randomised round trips** (same file; seeded, a fixed 150 + 150 cases, the seed in every failure, `modelCase(seed)`/`mpdCase(seed)` rebuild one): random catalogue parts, the 24 axis-aligned rotations and uniformly random ones, every LDConfig colour and direct colours, ports, ids, groups, `0 STEP`, through every format; and random MPDs with nested sub-models placed several times (colour 16 inherited, ports inside) flatten to exactly what placing every part by hand gives (`test/fixtures/bw-sim/model-gen.mjs`, its own matrix arithmetic). Minimal reproductions of each bug found are tests in the same file ("found: …").
3. **Real files from other programs** (`test/bw-sim-model-foreign.test.mjs`, fixtures and licences in `test/fixtures/model-files/SOURCES.md`): three LDraw OMR Technic sets (CC BY 2.0) — 42022 Hot Rod (MLCad-style, three-decimal rotations, 3 deep), 42032 Compact Tracked Loader (LDCad 1.4, 4 deep, an embedded unofficial part), 42034 Quad Bike — each against what it must open to, written down by hand from the file text (leaf count 414/251/147, named parts placed by hand with colour and rotation); unknown parts are refused line by line by name, the rest opens and round-trips byte-stably. **Missing:** a Studio 2.x `.io` and an LDD `.lxf` with an open licence (none found; one real `.lxf` with only a bare "BSD" tag was opened locally, not vendored) — the owner can supply files saved in Studio/LDD (`SOURCES.md` says what would help).
4. **Our files read by LeoCAD** (`scripts/check-model-files-leocad.mjs`, not in CI yet): every shipped model and OMR fixture is saved as `.ldr` and `.mpd` and given to `QT_QPA_PLATFORM=offscreen leocad -l <library> --export-csv out.csv <file>`; LeoCAD's parts list (part, colour code, quantity; sub-models flattened) must equal ours. The CSV export needs LeoCAD 23.03 or later and creates no render context (offscreen is enough). **Proposed CI job** (the lead decides; not in `build.yml`): on `ubuntu-latest`, download the LeoCAD release AppImage and its `Library-*.zip` from github.com/leozide/leocad/releases (pinned version and sha256), `--appimage-extract` it (no FUSE on the runners), unzip the library, `npm ci`, run the script; about 2–3 minutes, no GUI build needed. Ubuntu's apt `leocad` (21.06 on 22.04/24.04) has no `--export-csv` and no parts library (`ldraw-parts` is a separate multiverse package), so apt alone is not enough. Not run here yet (nothing big installed on the Mac); the first CI run confirms it.
5. **Fuzzing** (`test/bw-sim-model-fuzz.test.mjs`; seeded, 120 cases per family): mutated `.ldr`/`.mpd` (truncated, garbled characters, absurd numbers — 1e308, NaN, Infinity, hex, empty — stray metas, a line repeated thousands of times, other line ends), mutated `.io`/`.lxf` bytes (truncated, garbled data, a garbled central directory, absurd entry counts), broken LXFML (lost closing tags, broken attributes, absurd transforms, thousands of parts), ZIPs with the wrong entries, deep nesting (20,000), cycles, sub-models doubling at every level (2⁴⁰), 30,000 parts, and mutated `simLab` records. Each case either refuses the whole file with a code the pane words, or opens a valid model in which every non-comment line of a single-file model is a part or a named refusal; each case is timed (3 s budget).
6. **Studio and LDD, by hand, once per release** (they do not run headless):
   - [ ] Save the driving base and the forklift as `.io`; open both in a current BrickLink Studio 2.x: every part present, colours right, the hub's ports and ids survive a save in Studio and reopening in the Robot Lab (Studio keeps `0 !BW` comments in `model.ldr`).
   - [ ] Open a Studio-made `.io` with a sub-model and a Studio-only part in the Robot Lab: the sub-model is flattened, the Studio part is listed as Studio-only.
   - [ ] Save as `.mpd` and `.ldr`; open in LeoCAD and LDCad: the same parts, poses and colours; `0 STEP`s become steps.
   - [ ] In LDD 4.3, build a small model from the 27 table parts (beams, pins, axles, gears) and one brick; save `.lxf`; open it in the Robot Lab: parts where LDD shows them, the brick placed with `lxf-derived-frame`, other designs listed by number.
   - [ ] Note the program versions and any difference here.

**Big models.** A model of 200 parts or more is drawn instanced (`bw-sim/view/instanced-parts.js`): one `InstancedMesh` per part geometry for its own-colour faces and one for its fixed-colour faces, and instanced edge and conditional-edge lines; the placed colour is a per-instance colour, a motor's drive hub keeps its own batch and turns. Every part keeps an invisible mesh where it always was, so picking in Build, port badges, tints and highlights work unchanged. In Simulate a big model is redrawn only when something changed. `scripts/measure-sim-lab-scale.mjs` measures the 2,054-part stress model (`scripts/lib/sim-lab-stress-model.mjs`) with instancing on and off. Measured 2026-10-18 on an Apple-silicon Mac (headless Chromium; instanced vs one mesh per part): through ANGLE/Metal a forced frame 19.5 vs 30.7 ms (pixel read-back included), 43 vs 6,130 draw calls, JS heap after opening 37.8 vs 64.3 MB, opening 1.3 vs 1.7 s; through SwiftShader (the browser gate's software GPU) 3.2 vs 4.7 s a frame — rasterising 4.3 M triangles and 3.4 M line segments dominates there — and opening 4.9 vs 6.8 s. Build on the full model (after the 2026-10-18 performance work: a frozen, structurally shared editor model instead of a deep copy per read, a spatial hash for overlap/snap/picking/insight, redraw only on change): idle frame 4,650 → 16.7 ms, pointer move 8,200 → 12–54 ms, click-select from never-within-180 s to 44–71 ms, opening Build 98 s → 13–28 s (SwiftShader, Mac under load; the 10 s target is not met yet). The scale gate runs Build on the full model with budgets written next to these measurements.

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
7. **mirrored pairs go on together**, as LEGO prints them, with "2×" in the callout (`mirrorPairs`): the symmetry plane is the axis-aligned plane across which the most parts have a mirror image; two structural parts pair when they have the same part number and colour, their connectors mirror onto each other within 0.5 LDU, and everything touching one has its image touching the other (iterated, so the second is held by the image of what holds the first). The two drive motors and the two wheels of every shipped model go on in one step each (the Colour explorer used to put its wheels in steps 3 and 4). Should pairing ever make a step unbuildable, the steps are derived without it.

Every derived step is buildable: each new part touches a part built before, directly or through other new parts of the same step. `test/bw-sim-instructions.test.mjs` checks this on the S1 driving base and every shipped model (every part once; pins and axles with what they join; mirrored motors and wheels in one step; the bill of materials counts the model), the `0 STEP` fixture `test/fixtures/bw-sim/driving-base-steps.ldr`, groups and loose parts. The pictures are `view/instructions-view.js`; the dialog is `components/tw-pseudocode/sim-lab-instructions.jsx` (words in `sim-lab-instructions-text.js`); the print page is `instructions/print-page.js`. All of it is in the lazy Sim Lab chunk (`scripts/verify-boot-payload.mjs`); `scripts/lib/sim-lab-instructions-gate.mjs` drives it in the built app.

## Build mode

Build is a small CAD editor (`bw-sim/editor/editor-view3d.js`; arithmetic in `editor/transform-math.js`). Every change goes through the editor command stack; a change to several parts is one `moveMany`/`batch` command, so one Ctrl+Z undoes it.

**Mouse**
- **Click a part** selects it. If it is in a group, the whole group is selected.
- **Shift+click** adds or removes a part (or its whole group). **Click empty space** clears the selection; **Esc** also clears.
- **Shift+drag on empty space** draws a box; parts whose centres lie inside are added to the selection.
- **Drag a part** slides the selection on the work plane (the floor or the top face of another part), grid-snapped.
- **Gizmo:** when a part is selected, three coloured arrows (X red, Y green, Z blue) and planes move it along axes or in planes (W for move, E for rotate). Coloured rings turn it (see R/T below). Dragging the gizmo shows the “Moving x…/Turning …” status.
- **Magnet:** a single part dragged or placed near a matching hole or axle shows a green ghost and snaps there on release (all connector pairs that would connect are counted). **Hold Alt** to turn the magnet off. A pin must be within 0.5 LDU sideways and reach at least 8 LDU into the hole (the compiler's seating rule, below); a placed part that would overlap another is refused (see below).
- **Camera:** left-drag on empty space or middle-drag orbits; right-drag pans; wheel zooms toward the pointer; with nothing selected the arrows orbit, Shift+arrows pan and + / − zoom (see *Moving the view*).

**Fingers (tablets: iPad, touch Chromebooks; `editor/touch-gestures.js`)** — Pointer Events with `pointerType === 'touch'`, `touch-action: none` on the canvas; the mouse is unchanged.
- **One finger on a part** selects it and drags it on the work plane: the mouse's drag (magnet, resting on top, overlap refusal). A **tap** selects just that part.
- **One finger on empty space** orbits; a **tap** there clears the selection. **Two fingers** pinch to zoom and move together to pan (a second finger calls off a part drag).
- **Long press (0.5 s) on a part** adds it to the selection or removes it (the finger's Shift+click). **Long press on empty space, then drag**, draws the selection box.
- **Gizmo:** a finger grabs a handle within 22 px of its shape (a mouse: 8 px) and the arrows are at least 72 px long (a mouse: 44 px), when the device's main pointer is coarse or the last press was a finger; a press within 30 px of the gizmo's centre on a part goes to the part.
- **Palette:** a tap arms a tile and a tap in the view places it; a finger carries a tile sideways into the view (up and down scrolls the list).
- Fingers never reach three's OrbitControls/TransformControls (except on a gizmo handle): the view moves the camera itself with the same arithmetic. Simulate keeps OrbitControls' own one-finger orbit and two-finger pinch/pan.
- Hit targets: with `(pointer: coarse)` every pane button is at least 40 × 40 px, and the status line speaks of taps and long presses.

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
- Every key has a button on the build bar (below) for a tablet without a keyboard; only Alt (magnet off) and Shift's 15° ring steps have none.

**Build toolbar (sim-lab-pane.jsx, sim-lab-toolbar.jsx; see *The toolbar* above)**
- **Move with arrows (W) / Turn with rings (E)** toggle the gizmo mode.
- **Grid** — 1 / 5 / 10 / 20 LDU (default 10 = half a hole pitch).
- **Turn 90° (R)**, **Turn back 90° (Shift+R)** and **Tip 90° (T)** — same as the keys (they also turn a part being placed).
- **Group / Ungroup** — buttons for Ctrl+G / Shift+Ctrl+G (disabled unless the selection qualifies).
- **Duplicate / Delete** — same as Ctrl+D / Delete.
- **Copy / Paste / Select all** — same as Ctrl+C / Ctrl+V / Ctrl+A.
- **Cancel (Esc)** — same as Esc: calls off a drag, stops the placing tool, or clears the selection.
- **Undo / Redo** — same as Ctrl+Z / Ctrl+Y.
- **Home / Fit (F) / Top / Front / Side** — camera views (Simulate has them too).
- **File › Save as** — downloads the model as `.ldr`, `.mpd` or `.io` (the editor's current model, title `Robot Lab model`).
- When one part is selected, a **Port** list (none / A–F) beside the selection chip binds a motor or sensor; it is only shown for motors and sensors.
- **Simulate / Build** in the mode switch change modes; Simulate compiles the built model and starts the session.

**Overlap and what may sit inside**
A move, turn or place that would make two solid parts intersect is refused: the status says *“Would go into <target>: let go and it stays where it was”* and on release nothing changes. The test is exact primitive SAT on the PartMeta colliders (box / cylinder / sphere, tolerance 1 LDU), ignoring the parts the move is meant to connect to.

What *is* allowed to occupy the same space: a part whose collider is meant to sit inside another part, as in the real Technic system — pins in pinholes, axles in axleholes or through pin holes, and the **castor ball** (52629.dat, sphere radius 24 LDU) in its socket (ball-and-socket on 39370.dat). Those are not overlaps; they are connector pairs that the snap system recognises.

A part can be partly shaft and partly solid: **87082** (pin 3L with centre pin hole: two pin ends and a solid centre) and **32054** (pin with stop bush). Their colliders are split by region, measured from the LDraw mesh: the shaft colliders carry `region: 'pin'` (or `'axle'`/`'ball'`) and may sit inside other parts; the rest is solid and is checked like any solid part (`editor/overlap.js` `solidColliders`). So 87082 pins into two beams, while a beam pushed into its centre, or 32054 with a beam over its bush, is refused. A part that tags no region is wholly shaft when every connector is a pin, axle or ball, else wholly solid. `test/bw-sim-part-meta.test.mjs` checks that every region collider is around a shaft connector of its kind, that no pin or axle runs through a solid collider, and that every pin/axle connector really is a shaft in the mesh (within 8.5 LDU of its axis). That last check found **32039**'s "axle" inside its own body: the part has two axle holes (along x at z = −20 and along z at the origin), and its connectors now say so.

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
- **Gearboxes** (since 2026-10-18): a gear with a round hole (a clutch gear,
  18946/81346/2471/35185; a peghole bevel 87407/65413) spins freely on its
  axle; its mesh with a gear in the frame still counts (the frame is found
  through the axle turning in it). The **driving ring** 6539 slides on a
  ridged axle joiner (6538a/b); pushed 4 LDU or more into a clutch gear's
  socket it locks that gear to the axle. The **changeover catch** 6641 on a
  turning axle pushes the ring along as it swings: a motor shifts gears. The
  **white 24T clutch gear** (76019) passes torque up to its stamped
  2.5–5 N·cm (the simulation uses 3.75) and slips above. Two gear paths
  between the same axles run when their ratios agree and lock (warning
  `gear-loop-locked`) when they do not.
- **Differentials and planet carriers**: gears whose axles are held by a part
  that itself turns (the differential casing 65414 with its 28T cover 65413
  and three 12T satellites, placed as LDraw's own assembly 65414c01 places
  them) are coupled relative to that part (Willis: ω₁ − ω_c = −(z₂/z₁)(ω₂ −
  ω_c)), exact however the carrier moves: hold one side and the other turns
  twice as fast as the casing. Examples: **Two-speed gearbox** (motor A
  drives, motor B shifts; `gearbox.bw`) and **Differential** (motor A drives,
  motor C holds or turns the right side; `differential.bw`). Tests:
  `test/bw-sim-gearbox.test.mjs` (benches in `test/fixtures/bw-sim/gearbox/`)
  and `test/bw-sim-gearbox-program.test.mjs` (the shipped examples).
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

## The parts it knows (56)

From `overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json` (grouped by `category`; English name and LDraw file):

- **axle (8):** Technic axle 2 notched (32062.dat), Technic axle 3 (4519.dat), Technic axle 4 (3705.dat), Technic axle 5 (32073.dat), Technic axle 6 (3706.dat), Technic axle 8 (3707.dat), Technic bush (3713.dat), Technic half bush (4265c.dat)
- **beam (18):** Technic beam 11 (32525.dat), Technic beam 13 (41239.dat), Technic beam 15 (32278.dat), Technic beam 2 with axle hole (60483.dat), Technic beam 2×4 L-shaped (32140.dat), Technic beam 3 (32523.dat), Technic beam 3×5 L-shaped (32526.dat), Technic beam 5 (32316.dat), Technic beam 5×3 H-shaped with ball socket (39370.dat), Technic beam 7 (32524.dat), Technic beam 9 (40490.dat), Technic frame 5×11 open centre (39794.dat), Technic frame 5×7 open centre (64179.dat), Technic liftarm 1×11.5 double bent (32009.dat), Technic liftarm 1×7 bent 4×4 (32348.dat), Technic liftarm 1×9 bent 6×4 (6629.dat), Technic thin liftarm 1×3 (6632.dat), Technic thin liftarm 1×4 (32449.dat)
- **connector (6):** Technic axle and pin connector perpendicular (6536.dat), Technic axle and pin connector perpendicular 2×2 split (41678.dat), Technic axle and pin connector perpendicular 3L with 2 pin holes (42003.dat), Technic axle and pin connector perpendicular 3L with centre pin hole (32184.dat), Technic axle connector with axle hole (32039.dat), Technic axle towball (2736.dat)
- **gear (7):** Technic gear 12 tooth bevel (6589.dat), Technic gear 16 tooth (94925.dat), Technic gear 20 tooth bevel (32198.dat), Technic gear 24 tooth (3648.dat), Technic gear 40 tooth (3649.dat), Technic gear 8 tooth (3647.dat), Technic worm gear (4716.dat)
- **hub (1):** SPIKE Prime hub (45601.dat)
- **motor (2):** SPIKE large angular motor (54675.dat), SPIKE medium angular motor (54696p01.dat)
- **other (1):** Technic ball 19 mm for ball castor (52629.dat)
- **pin (8):** Technic axle pin with friction (43093.dat), Technic axle pin without friction (3749.dat), Technic pin 2L with stop bush (32054.dat), Technic pin 3/4 (32002.dat), Technic pin 3L with centre pin hole (87082.dat), Technic pin 3L with friction (6558.dat), Technic pin with friction (2780.dat), Technic pin without friction (3673.dat)
- **sensor (3):** SPIKE colour sensor (37308.dat), SPIKE distance sensor (37316.dat), SPIKE force sensor (37312.dat)
- **wheel (2):** Wheel 56×14 with medium azure tyre (SPIKE Prime) (39367p01.dat), Wheel 88×14 with medium azure tyre (SPIKE Prime large) (49295p01.dat)

Every connector in that file is checked against the part's LDraw mesh by `test/bw-sim-part-meta.test.mjs`, including where a pin seats: a pin-hole connector's two ends must be where its bore opens and ends (±2 LDU).

**Sensor pin holes, measured (2026-10-17).** The SPIKE colour, force and distance sensors have *blind* side holes (LDraw `p/connhol3.dat`, "Technic Connector Hole One-Sided"): the bore opens on the side face at |x| = 30 LDU (distance sensor: 70) and ends 18 LDU in, at |x| = 12 (52). Their connectors used to sit at the bottom of the bore (|x| = 12 / 52) instead of the middle of the pin seat (|x| = 20 / 60), so a pin through a beam pulled the sensor 8 LDU (3.2 mm) into the beam: the shipped Line follower's sensor was inside its mounting beam, and the Wall stopper and Colour explorer used 3L pins to reach, which would end 12 LDU (Wall stopper) and 20 LDU (Colour explorer) past the bottom of the sensor's blind hole, inside its body. The large motor (54675.dat) had the same error on its side holes (bore |x| 32..50, connector at 32) and two end holes on the wrong end of the housing (z = +12, where there is no bore; the bore is z 132..150). All are now at the measured seat; the Line follower's sensor moved 8 LDU forward (z 152 → 160, still 8.4 mm above the floor) to rest on its beam, and the two examples use ordinary 2L pins. `test/bw-sim-models-solid.test.mjs` checks every shipped model and fixture against the real meshes (no point of a solid part inside another, no pin reaching past its hole).

**Holes from the hole primitives (2026-10-17).** A part's holes are read from the LDraw Technic primitives it places, not from fitted circles: `connhole`/`beamhole` (a through bore, local y −10..10), a `peghole` pair around a 6 LDU `4-4cyli`, `connhol3` (blind, 18 deep), `axlehol*` scaled to the axle hole's length; pins from `connect*`/`confric*` (`confric` = friction ridges). Fitting circles had read the `npeghol*` outer-shell fragments of a bend as holes: the bent liftarms 32348 and 6629 had 8 and 12 "holes", some 10 LDU apart, instead of 7 and 9 (with an axle hole at each end). `test/bw-sim-part-meta.test.mjs` now also refuses two parallel hole connectors of one part whose axes are under 15.5 LDU apart unless they are coaxial (the tightest real pair, 16.57 LDU, is the two ends of the slot in the double-bent liftarm 32009). The driving base and the models built on it hold the front beam and the castor with one 3L pin per side through hub, beam and castor; they used to have a 2L pin from each side in the same beam hole, which `test/bw-sim-models-solid.test.mjs` now reports.

**When a shaft is held (2026-10-17).** A pin, axle, axle pin or stub seats in a hole when, along their common axis (parallel within 1°, coaxial within 0.5 LDU), it engages at least **8 LDU** of the hole (`mech/graph.js` `shaftEngagement`, `MIN_ENGAGE_LDU`; the compiler and the editor's magnet share it). Technic lengths come on a 10 LDU lattice, so a real seat engages 10, 20, ... LDU and a shaft ending at a hole's face engages 0; 8 is 2 LDU of slack under the shortest real hole (10: thin liftarm, half bush, bevel hub). The rule used to demand that the shaft cover the whole hole, so the towball 2736's 17.5 LDU stub held only in 10 LDU holes and a half-inserted 3L pin held nothing; both hold now, as they do in the real thing. A **blind** pinhole carries `closedEnd` (±1, which end of its segment is the bottom; 92 such holes on the motors, hub and sensors, read from LDraw's one-sided `connhol3` bore and checked by `test/bw-sim-part-meta.test.mjs`): a shaft that would reach past the bottom by more than 0.5 LDU does not seat. On every shipped model and fixture the compiled bodies, joints and gears are byte-identical to before (the new rule accepts every pair the old one did, except through a blind bottom, where none of them reach). `test/bw-sim-shaft-seat.test.mjs` covers the towball, a half-inserted 3L pin, a pin 3/4 in a thin liftarm, a sensor's blind hole and the magnet.

Adding a part: add it to `parts.json` (measure it with `bw-sim/ldraw/ldraw-geometry.js`; never copy connectivity data from BrickLink Studio, LDCad or another database), then run `npm run sync:ldraw -- --from <extracted complete.zip> --source-sha256 <hash> --source-date <date>` and `npm run sync:ldraw:check`.

## Geometry and licence

Part geometry is a curated subset of the official **LDraw Parts Library** (CC BY 4.0, some files dual CC BY 2.0 / 4.0), vendored unmodified in `overlay/scratch-gui/static/ldraw/` with its licence texts; see `THIRD-PARTY-NOTICES.md`. Physics is **Jolt** (MIT). LEGO® is a trademark of the LEGO Group, which does not sponsor, authorize or endorse this project.

## Checks

**Unit (bw-sim):** 72 files in `test/bw-sim-*.test.mjs`, each a pure check of one area:
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
- `bw-sim-model-roundtrip.test.mjs` — every shipped model, the stress model and 150 seeded random models through `.ldr`, `.mpd`, `.io` and the project record, compared as models and byte for byte; 150 random nested MPDs equal placing by hand; minimal reproductions of the bugs these found.
- `bw-sim-model-foreign.test.mjs` — three LDraw OMR files (MLCad, LDCad) open to the model written down by hand; unknown parts refused by name; embedded parts; round trips.
- `bw-sim-model-fuzz.test.mjs` — seeded mutations of every format (and deep, cyclic, doubling MPDs) are refused by name or open as valid models, in bounded time.
- `bw-sim-model-file.test.mjs` — `.ldr` → `.io` → `.ldr` and `.ldr` → `.mpd` → `.ldr` byte-stable; a password-protected `.io` (a self-made fixture) and broken or foreign files refused by name; Studio-only parts; a hand-made `.lxf` opens with its parts at poses worked out by hand; colours from LDConfig's LEGOIDs.
- `bw-sim-instancing.test.mjs` — a big model drawn instanced: one instance per part at its LDraw placement (motors split), instances follow a physics snapshot, tints and highlights; proxies still answer a raycast; the 2,054-part stress model in a few dozen drawn objects.
- `bw-sim-model-insight.test.mjs` — every issue code in the sources has an EN and DE sentence; issues name their parts (motor without a port, gear-on-frame, a loose part); body tints, hinge-axis segments and gear ratios against the compiled mechanism; compile time for 72 parts.
- `bw-sim-overlap.test.mjs` — primitive SAT for box/cylinder/sphere colliders.
- `bw-sim-part-meta.test.mjs` — every connector and collider against its LDraw mesh.
- `bw-sim-models-solid.test.mjs` — every shipped model and model fixture is buildable: no collider overlap, no point of a solid part's LDraw mesh inside another's (generalised winding number), no pin or axle reaching past its hole.
- `bw-sim-persist.test.mjs` — sim-lab LDraw text saved with the project and reopened byte-identically.
- `bw-sim-physics-cast-ray.test.mjs` — raycast for sensors and distance.
- `bw-sim-physics-core.test.mjs` — Jolt body and hinge creation, stepping.
- `bw-sim-physics-worker.test.mjs` — worker message protocol.
- `bw-sim-physics-worker-session.test.mjs` — the physics in the worker gives the main-thread numbers bit for bit (driving, sensors, a command in flight, the line follower's program through the VM).
- `bw-sim-program-clock.test.mjs` — one clock (docs/SIM-LAB-PLAN.md §4.9): the browser's path in real time with a worker 200 ms away; program time equals simulated time at every VM step, a 1 s drive lasts 1 s simulated and covers the same distance as with a fast worker; the previous wall-clock loop fails it.
- `bw-sim-render-quality.test.mjs` — part-geometry and material fidelity.
- `bw-sim-s1-driving-base.test.mjs` — the S1 driving base drives, turns and hits a wall.
- `bw-sim-scene3d.test.mjs` — Sim Lab 3D view, mat texture and obstacle meshes.
- `bw-sim-sensors.test.mjs` — distance/colour/force readings from a running core.
- `bw-sim-session.test.mjs` — session tick, snapshot, time and yaw.
- `bw-sim-snap-rotate.test.mjs` — magnet snapping and `rotateAboutSnap`.
- `bw-sim-snap.test.mjs` — snap candidates (pins, axles, studs, ball).
- `bw-sim-camera-nav.test.mjs` — the camera keys (arrows orbit, Shift+arrows pan, + / − zoom; modified keys are not camera keys), orbiting keeps target and distance and never goes under the floor, panning carries camera and target sideways, OrbitControls' button set-up, named views frame a sphere from their side.
- `spike-simulator-pane.test.mjs` — the arena offers **Open in Robot Lab**, stands aside while the Robot Lab drives the shared hub and hands it over either way.
- `bw-sim-touch.test.mjs` — fingers: tap, drag, long press, long-press drag and pinch from touch event sequences (slop, long-press time, a late lift), one-finger orbit against an independent rotation, pinch zoom and two-finger pan.
- `bw-sim-world.test.mjs` — mats and obstacles in the compiled mechanism and scene.

Plus `test/bw-sim-persist.test.mjs` ↔ `test/project-bundle-archive.test.mjs` (real bundle writer/reader) and `scripts/verify-boot-payload.mjs` (the Sim Lab view stays out of the first load, chunk `bw-sim-lab`; Jolt and the physics worker stay out of that chunk too, chunks `bw-sim-jolt` and `bw-sim-physics-worker`).

**Browser (after a GUI build):**
- `npm run verify:sim-lab` — `scripts/verify-sim-lab-browser.mjs` loads the reference driving base with a WebGL view, runs with no program (hint shown, robot stays put, Drive pad moves it), chooses the line-oval mat (robot on the line), checks palette place/snap/undo, palette pictures (drawn, lazily), search, drag from the palette onto the floor and onto a beam hole, Esc cancelling a drag, Build→Simulate compile, a green-flag Scratch program drives with physical encoders, saved model reopens byte-identical, project load replaces the model, no-WebGL fallback still runs.
- `scripts/lib/sim-lab-insight-gate.mjs` — port badges in both views, "Show how it moves" (overlay objects and red axis pixels) in both, unplugging a motor from its badge lists the issue, the issue selects the motor, the badge's picker plugs it back in, "Before you press Run" with no motor, the issue pulses the motors in Simulate.
- `scripts/lib/sim-lab-cad-gate.mjs` — `npm run test:sim-lab-cad` places a part on the floor, drags the gizmo, turns with R/ring, slides on the work plane, Shift+multi-select and box-select, groups/ungroups, pins snap from above and beams stack, pushing into the hub is refused.
- `scripts/lib/sim-lab-toolbar-gate.mjs` (`--part=ui`) — the Robot Lab tab is selected and filled by the Lab; Help holds the description; every toolbar control (bar and More) has a name and a tooltip starting with it and giving its shortcut, in English and on a de-DE page in German (*Roboter-Labor*, *Rückgängig (Strg+Z)*); the File menu; every Build action by click and by its key (W/E, R/Shift+R/T, Ctrl+A/Esc, Ctrl+Z/Y, Ctrl+D, Delete, copy/paste, Ctrl+G/Ctrl+Shift+G, H/Shift+H/I, M, K, F, ?) with its effect; in both modes Top/Front/Side/Home frame the model, a left drag on empty space orbits about a fixed target, a right drag pans, Shift+drag pans (Simulate), the wheel zooms, arrows/Shift+arrows/− move the focused view; a drag on a part moves the part and leaves the camera, and with a part selected the arrows leave the camera. The core part reaches the Lab through the arena's **Open in Robot Lab** and checks the arena stands aside.
- `scripts/lib/sim-lab-layout-gate.mjs` (`--part=layout`) — the tab alone at 1024×768 … 1920×1080, with the stage column beside it at 1024×768 and 1366×768, and with the stage dragged wide so the Lab is ~470 px: the view big enough and wholly visible, primary controls pressable, the toolbar never wider than the pane (More when narrower than 1000 px, its Top view works), the palette (drawer when compact) places a part and Undo removes it.
- `scripts/lib/sim-lab-touch-gate.mjs` — a school tablet (1024×768, `hasTouch`, real touch through CDP `Input.dispatchTouchEvent`): tap a tile then the floor places a part, one finger drags a part by grid steps and a tile out of the palette, a long press adds to the selection, a long press then drag on open floor box-selects, a finger drags the gizmo's X arrow (x only), the build bar's Select all / Copy / Paste / Turn ↺ / Undo, one finger orbits and two pinch-zoom in Build and Simulate, holding ▲ drives (sliding off keeps driving) and lifting the finger stops both motors; two fingers moving together pan the Simulate view. It starts with the stage column beside the tab (compact), then hides it so the tab takes the whole width.
