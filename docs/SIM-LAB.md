# Robot Lab (beta) — LEGO® Technic models with physics

(Internally the code and files say "Sim Lab" — `lib/bw-sim/`, `sim-lab-pane.jsx` — the name users see is **Robot Lab** / **Roboter-Labor**, chosen to stay clearly distinct from Tinkercad's "Sim Lab".)

The Robot Lab simulates a model built from real LEGO Technic parts and lets a
program drive it through the **virtual SPIKE Prime hub**, the same hub the
SPIKE arena uses. Scratch blocks, DEVICE SPIKE pseudocode and imported SPIKE 3
programs reach it unchanged: they cannot tell the hub is simulated.

How it is built, and what comes next, is in `docs/SIM-LAB-PLAN.md`.

## Using it

1. Write a SPIKE Prime program (Code or Blocks tab). The reference model
   drives its wheels with ports **A (left, mounted mirrored) and B (right)**,
   like the arena's driving base, so `set movement motors A B` and
   `move forward 20 cm` work as they do in the arena.
2. Open the SPIKE simulator (**SPIKE arena** button in the Code tab) and pick
   the **Robot Lab (beta)** tab.
3. Press **Run**. As the arena's Start does, Run connects the program to the
   virtual hub and starts it on the green flag. **Pause** stops the program
   and the clock; **Reset** reloads the model.

**Open .ldr…** loads your own model, made in any LDraw editor (LeoCAD,
BrickLink Studio's LDraw export). Parts the Robot Lab does not know yet, loose
geometry and mirrored parts are listed under "Notes about this model" and
skipped; the rest still runs. A motor is bound to a hub port by a meta line
before its part line:

```
0 !BW PORT A
1 71 -100 10 80 0 1 0 1 0 0 0 0 -1 54696p01.dat
```

**Saved with the project.** "Save to your computer" stores the model the Sim
Lab shows (the Build scene, or the model being simulated) inside the `.sb3`,
as its LDraw text, in the `simLab` section of the Brickwright bundle
(`lib/bw-project-bundle.js`, the same mechanism as the circuit; the record is
`bw-sim/model/sim-lab-persist.js`). Opening the project restores it, byte for
byte; a project without one opens the reference model. Vanilla Scratch ignores
the entry.

Without WebGL the pane says so and the simulation still runs (the encoders
and the hub's yaw keep working; only the picture is missing).

## What is simulated

- Rigid parts merge into bodies; axles in round holes, frictionless pins and
  motor shafts become hinges; a castor ball rolls freely in its socket; spur
  and bevel gears that mesh are coupled with their tooth ratio.
- Motors: the hub's own motor controller decides each motor's speed (ramps,
  holds, run-to-position, stop actions); the hinge turns under the motor's
  torque limit, and the **encoder reads what the wheel actually did**.
- The hub's yaw (`motion_sensor`, `hub.motion`) follows the hub body.
- Not yet: the colour, distance and force sensors in physics, mats and
  obstacles, flexible parts, worm and rack gears.

## The parts it knows

`overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json` — the SPIKE Prime
hub, medium and large angular motors, colour/distance/force sensors, the
56 mm wheel, the ball castor, Technic beams 3–15, axles 2–8, pins, bushes,
8/16/24/40-tooth spur and 12/20-tooth bevel gears. Every connector in that
file is checked against the part's LDraw mesh by `test/bw-sim-part-meta.test.mjs`.

Adding a part: add it to `parts.json` (measure it with
`bw-sim/ldraw/ldraw-geometry.js`; never copy connectivity data from BrickLink
Studio, LDCad or another database), then run `npm run sync:ldraw -- --from
<extracted complete.zip> --source-sha256 <hash> --source-date <date>` and
`npm run sync:ldraw:check`.

## Geometry and licence

Part geometry is a curated subset of the official **LDraw Parts Library**
(CC BY 4.0, some files dual CC BY 2.0 / 4.0), vendored unmodified in
`overlay/scratch-gui/static/ldraw/` with its licence texts; see
`THIRD-PARTY-NOTICES.md`. Physics is **Jolt** (MIT). LEGO® is a trademark of
the LEGO Group, which does not sponsor, authorize or endorse this project.

## Checks

- Unit: `test/bw-sim-*.test.mjs` (contracts, part metadata against meshes,
  compiler, physics core and worker, model I/O, session, 3D scene).
- Browser: `npm run verify:sim-lab` (after a GUI build) — the Robot Lab tab loads
  the reference model with a WebGL view, a green-flag program drives it
  forward with physical encoders, a built model saved with the project
  reopens byte-identical, and the no-WebGL fallback still runs.
- Project file: `test/bw-sim-persist.test.mjs` (round trip through the real
  bundle writer/reader, no model, malformed sections) and
  `test/project-bundle-archive.test.mjs`.
- `scripts/verify-boot-payload.mjs` keeps Jolt and the Sim Lab view out of the
  first load (chunk `bw-sim-lab`).
