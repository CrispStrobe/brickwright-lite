# SPIKE arena — a 2D world for the virtual SPIKE Prime hub

A top-down robot arena for LEGO SPIKE Prime: a driving base on a mat, with
walls, rocks and zones, a colour sensor looking down, a distance sensor looking
ahead and a force sensor on the front. It ships with an original starter unit,
**Rover basics** (a Mars-rover theme), four more units (**Sensors in depth**,
**Gyro turns**, **Mapping** and a staged **Capstone**; see "The units"), and a
checker that says pass or fail and why.

The arena never talks to a program. It talks to the **virtual SPIKE hub**
(`overlay/scratch-gui/src/lib/virtual-hub/`), and every programming route talks
to that same hub: Scratch blocks (and the dialect and two-way languages that
become them) through the spikeprime extension's protocol emulators, SPIKE 3
Python. So the arena works for all of them, and a new route plugs
in by honouring the contract below, without touching the arena.

| Module | Role |
|---|---|
| `lib/spike-sim/independent-backend.js` | independent motor controller, shared inputs/outputs and scheduler |
| `lib/virtual-hub/spike-hub-commands.js` | the motion statements and verbs the hub understands, on either transport (new) |
| `lib/virtual-hub/spike-hub-state.js` | the hub state: ports, motors, IMU (extended) |
| `lib/spike-arena/geometry.js` | 2D shapes, overlap, rays |
| `lib/spike-arena/arena-sim.js` | the world: kinematics, sensors, collisions |
| `lib/spike-arena/arena-world.js` | the world/challenge format and its validator |
| `lib/spike-arena/arena-checker.js` | pass/fail with a reason |
| `lib/spike-arena/arena-hub-bridge.js` | couples the world to the hub; owns simulated time |
| `lib/spike-arena/arena-render.js`, `l10n.js`, `arena-units.js` | canvas drawing, EN/DE strings, loading a unit |
| `static/spike-arena/units.json` | the units, in the order the pane's unit picker offers them |
| `static/spike-arena/<unit>/` | one unit: `unit.json`, challenges, reference and wrong solutions (`rover-basics` is the starter unit; see "The units") |
| `components/tw-pseudocode/spike-arena-pane.jsx` | the dockable pane |

## Opening the simulator

Open **SPIKE arena** from a SPIKE program in the Code tab. Press **Start** to
run Scratch/native or imported LEGO SPIKE 3 programs through the independent
controller. No firmware runtime, backend selection or firmware download is needed.

## The hub contract

This is the interface between the world and every programming route. It is
the ONLY interface: the arena reads and writes `VirtualSpikeHubState`, nothing
else.

### Who owns what

| State | Written by | Read by |
|---|---|---|
| motor commands | the programming route (a protocol emulator, a SPIKE 3 Python runtime) via `hubState.motors.*` or `hubState.setMotorSpeed` | the motor model |
| `data.motors[i].position`, `.speed` | the motor model (in `stepMotors`), or a route that runs its own motor physics (an external state owner) | the arena, the extension (via device notifications), panels |
| `data.sensors[i]` for colour, distance, force | the arena, via `hubState.updateSensor` | every route |
| `data.imu.yaw`, `angularVelocity.z` | the arena, via `hubState.setHeading` | every route |
| yaw zero | the program, via `hubState.resetYaw(value)` (`hub.motion.reset_yaw()`, `motion_sensor.reset_yaw(0)`) | `setHeading` |
| `data.display` (25 levels 0-9, pixel (x, y) at `y*5+x`), `centerLight` (hub LED palette 0-11), `volume` (%), `distanceLights[i]` (four levels 0-9: top-left, top-right, bottom-left, bottom-right) | the program's statements (`spike-hub-commands.js`); no sensor reports them back | panels, tests |
| simulated time | **the arena**, while it is running: `bridge.tick(ms)` calls `hubState.stepMotors(dt)` in fixed 5 ms steps | — |

**One clock.** Motor positions advance only inside `hubState.stepMotors(dtMs)`.
While the arena runs, the arena calls it and nothing else may. A route that
needs "wait until the motor finished" awaits the promise the motor model
returns; it never steps motors itself. With no arena running, a standalone native caller can own the clock with
`hubState.backend.pace(ms, {realtime})`. Without an explicit clock owner,
positions do not advance. Never call pace while the arena owns stepping.

### Units and signs

| Quantity | Unit | Sign / range |
|---|---|---|
| motor position | degrees counted since reset (float) | clockwise positive, seen from the motor's face |
| motor speed (`data.motors[i].speed`) | percent of the device's full speed | -100..100 |
| motor speed (`data.motors[i].degPerSec`) | deg/s | as commanded |
| full speed | deg/s per LEGO device id | small (65) 660, medium (48, 75) 1110, large (49, 76) 1050 — LEGO's SPIKE 3 Python velocity limits |
| distance | millimetres | 50..2000, **-1 = no reading** (LEGO Technic Distance Sensor spec) |
| colour | SPIKE colour id | 0 black, 1 magenta, 2 violet, 3 blue, 4 azure, 5 turquoise, 6 green, 7 yellow, 8 orange, 9 red, 10 white, -1 none |
| reflection | percent | 0..100 |
| red/green/blue | raw | 0..1024 (the SPIKE 3 device-notification range) |
| force | percent of 10 N | 0..100, plus `pressed` boolean |
| yaw | degrees | **clockwise positive** seen from above, wrapped to -180..180; 0 at reset |

### The motor model's API (`hubState.motors`)

All positions and speeds in the units above; a port is `'A'..'F'` or `0..5`.

```js
motors.runAtSpeed(port, degPerSec)                 // until told otherwise
motors.runForDegrees(port, degrees, degPerSec)     // -> Promise<'completed'|'interrupted'>
motors.runForTime(port, ms, degPerSec)             // -> Promise<'completed'|'interrupted'>
motors.runToPosition(port, position, degPerSec)    // -> Promise<'completed'|'interrupted'|'stalled'>
motors.stop(port, 'brake'|'hold'|'coast')          // finite deceleration; hold retains position
motors.resetPosition(port, value = 0)
motors.percentToDps(port, percent)                 // the device's full speed * percent / 100
motors.busy(port)
motors.setStopAction(port, 'brake'|'hold'|'coast')
motors.configure(port, {acceleration: 1500, deceleration: 1500})
motors.setLoad(port, fraction)                    // synthetic load, 0..1
hubState.backend.wait(ms, {signal})              // same simulated clock
hubState.backend.cancel()                        // hard stop and interrupt
hubState.stepMotors(dtMs)                          // ONLY the clock owner calls this
```

Direction follows SPIKE: `runForDegrees` turns `sign(degrees) * sign(speed)`.
A new command on a port interrupts the old one, whose promise resolves
`'interrupted'` (SPIKE 3 Python's `motor.run_for_degrees` returns the same
distinction). The movement pair is `hubState.movementPair = [left, right]`
(default `['A', 'B']`); `movePair()` in `spike-hub-commands.js` drives it with
SPIKE's steering (the inner wheel slows linearly, stops at ±50, reverses at
±100) and the mirrored left motor (wheel-forward is left counterclockwise,
right clockwise).

**For a SPIKE 3 Python runtime** (runloop, `motor`, `motor_pair`,
`color_sensor`, `distance_sensor`, `force_sensor`, `motion_sensor`): map each
awaitable onto the promise above, and read sensors from `data.sensors[i]` and
`data.imu`. SPIKE 3 Python's velocity arguments are already deg/s. Its
`motion_sensor.tilt_angles()` reports decidegrees; convert from `imu.yaw` and
mind the sign convention of the API you emulate. Nothing in the arena needs
to change.

### Statements and verbs the hub understands

`spike-hub-commands.js` is a pattern matcher (never `eval`) over what the
spikeprime extension actually sends, so both of its routes reach the model:

- SPIKE 3 route (BLE tunnel): JSON `{"m":"motor","p":{port,speed}}`, and one-line
  MicroPython: `hub.port.X.motor.{pwm, run_at_speed, run_for_degrees,
  run_for_time, run_to_position, brake, float, hold, stop, preset}`,
  `motor.run(port.X, v)`, `motor.stop(port.X)`, `motors.{move, start,
  start_tank, move_tank, stop, set_default_speed}`, `MotorPair('A','B')`,
  and the extension's `exec("…motors = MotorPair('A', 'B')")` definition and
  its guarded form (`try: motors / except NameError: …`), which sets the pair
  only while the hub has none (`hubState.motorPairDefined`),
  `hub.motion.{reset_yaw, preset_yaw}`, `motion_sensor.reset_yaw`,
  and the hub's outputs (task D1): `hub.display.pixel(x, y, level)`,
  `hub.display.show(" ")` (clear), `hub.display.show(hub.Image("…"))`,
  `hub.led(n)`, `hub.sound.volume(v)`, and a distance sensor's lights
  as the extension sends them (`dist_sensor = hub.port.X.device;
  dist_sensor.mode(5, bytes([tl, tr, bl, br]))`).
- SPIKE 2 route (Classic): the same REPL lines, plus JSON-RPC
  `scratch.motor_{start, stop, run_for_degrees, run_timed,
  go_to_relative_position}`, `scratch.move_{start_speeds, tank_degrees,
  tank_time, stop}`. As a SPIKE 2 hub does, the reply to a motion request is
  sent when the motion **ends**.

An unrecognised statement is recorded (`lastUnsupportedPythonTunnel`), not guessed at.

## The model

**Driving base.** The virtual driving base: wheel diameter 5.6 cm,
axle track 11.2 cm, left motor A mounted counterclockwise, right motor B
(dimensions are expressed in cm).
All configurable per challenge (`robot`). Body: a 17 x 14 cm rectangle, 9 cm
ahead of the axle. Colour sensor 7 cm ahead of the axle, centred, port C;
distance sensor on the front face, port D; force sensor button 0.8 cm proud of
the front, 3 cm right of centre, port E. A challenge may mount the sensors
elsewhere (`robot.sensors`, e.g. a distance sensor looking sideways with
`heading: -90`) and may give one side its own `wheelDiameter` (a worn tyre:
the base then drifts off a straight line, and only feedback such as the gyro
keeps it straight).

**Kinematics.** Ideal differential drive from the change in the two motors'
counted degrees: `travel = delta / 360 * pi * d` per wheel (negated for the
mirrored motor), heading change `(left - right) / track`, integrated exactly
along the arc, so the step size does not change the path. Tested against the
closed forms.

**Motors.** Native commands use the independent backend: default acceleration
and deceleration 1500 deg/s², finite speed/position control, timed trajectories,
and configured coast/brake/hold. Disconnect/reset/cancel hard-stop for safety.
An explicit synthetic load API reduces achievable speed; a locked shaft makes
finite position tasks resolve `stalled`. Arena collisions still model wheel
slip and do not automatically lock shafts. Percent uses the device speed limit.
See [the tested contract](independent-spike/CONTRACT.md) and
[coverage and limits](independent-spike/README.md). Archived external reference observations cover only the documented contract;
the virtual backend does not establish physical SPIKE accuracy.

**Collisions.** The body is a rectangle; walls, the mat border and fixed
objects are convex solids. A step that would overlap one is cut back to contact
by bisection: no penetration, no sliding along the wall, no bounce. The wheels
keep turning (they slip), so motor positions keep counting while the robot is
stopped against a wall. Pushable objects translate with the robot's centre
while in contact and stop at walls; they do not rotate.

**Sensors.**
- Colour: samples ONE point of the mat (the topmost vector shape containing it,
  else the background); returns the SPIKE id, a reflection figure per colour
  (this arena's round numbers: black 10, white 100) and raw RGB.
- Distance: a fan of 5 rays over ±10°, to walls and objects; range 50–2000 mm,
  otherwise -1. The real sensor's entrance angle is about ±35° and varies with
  distance; the narrower cone is deliberate.
- Force: pressed when the button's tip is within 0.3 cm of something solid;
  force then reads 60 %. The pressed button counts as the robot touching
  that thing (`touch`, `noTouch`, `noWallContact`).
- IMU: yaw follows the world heading, clockwise positive, zeroed at start and on
  `reset_yaw`; pitch and roll stay 0 (the mat is flat). `angularVelocity.z` is
  the world's turn rate in deg/s, clockwise positive (the drive base turning in
  place at 20 % reads 111 deg/s); x and y stay 0.

**SPIKE 3 Python functions the arena and hub carry since task D1** (the full
before -> after table of all 34 former refusals is in `docs/SPIKE3-PYTHON.md`):

| SPIKE 3 Python | Before | After | What produces it |
|---|---|---|---|
| `color_sensor.rgbi(p)[0..2]` | refused | mapped | the arena's raw RGB of the mat colour under the sensor |
| `motion_sensor.angular_velocity()[i]` | refused | approximate | the arena's turn rate (`angularVelocity.z`), in decidegrees/s, SPIKE 3 sign |
| `light_matrix.show([25])` | refused | approximate | `data.display` |
| `light.color(light.POWER, c)` | refused | approximate | `data.centerLight` |
| `sound.volume(v)` | refused | mapped | `data.volume` |
| `distance_sensor.show / clear` | refused | approximate / mapped | `data.distanceLights` |

`test/spike3-python-arena-d1.test.mjs` runs each from imported Python in the
arena, mutation-checked.

**Not modelled:** physical motor electrical dynamics, collision-induced shaft
stall, wheel slip in free driving, sensor noise, ambient light, a sloped or
bumpy mat, objects rotating. Synthetic motor load/stall is exposed separately.

## World and challenge format

A challenge is JSON (`static/spike-arena/<unit>/<id>.json`, listed in that folder's `unit.json`), validated by
`arena-world.js` (every error names its path). Lengths are cm, x right, y down,
headings degrees clockwise from +x.

```jsonc
{
  "id": "rb07-stop-at-line",
  "title": {"en": "...", "de": "..."}, "intro": {"en": "...", "de": "..."},
  "hints": [{"en": "...", "de": "..."}],
  "mat": {"width": 150, "height": 100, "background": "white",
          "image": "optional URL, drawn under the shapes (display only)",
          "border": true,
          "shapes": [{"color": "black", "shape": {"type": "rect", "x": 90, "y": 50, "w": 3, "h": 100}}]},
  "walls":   [{"shape": {...}}],
  "objects": [{"id": "rock", "pushable": false, "shape": {...}, "color": "#8b6f4e"}],
  "zones":   [{"id": "target", "role": "goal|hazard|checkpoint|area", "shape": {...}, "label": {"en": "...", "de": "..."}}],
  "start": {"x": 20, "y": 50, "heading": 0},
  "robot": {"sensors": [...]},              // optional driving-base overrides
  "timeLimitMs": 20000,
  "success": [{"type": "stopIn", "zone": "target"}],
  "failure": [{"type": "avoid", "zone": "crater"}]
}
```

Shapes: `rect` (centre, w, h, optional angle), `circle`, `polygon` (convex when
solid), `line` (a stroked polyline, for mat lines and corridors).

| Condition | Kind | Met when |
|---|---|---|
| `reach {zone}` | success, latched | the robot's centre enters the zone |
| `stopIn {zone, holdMs=600}` | success, state | centre inside and stopped for `holdMs` |
| `heading {target, tolerance=6, maxDrift=4, holdMs}` | success, state | stopped, turned `target`° from the start heading, within `maxDrift` cm of the start |
| `sequence {zones}` | success, latched | the centre visits the zones in order |
| `touch {object}` | success, latched | the body touched the object |
| `push {object, zone}` | success, state | the object's centre is inside the zone |
| `avoid {zone}` | failure | the body overlaps the zone |
| `stayIn {zone}` | failure | the centre leaves the zone |
| `noWallContact` | failure | the body touches a wall or the border |
| `noTouch {object}` | failure | the body touches the object |
| `noStopIn {zone, holdMs=600}` | failure | centre inside and stopped for `holdMs` (a report given by where the rover parks, in the wrong bay) |
| `timeLimitMs` | failure | time runs out first |

The run passes on the first tick at which every success condition is met, and
fails on the first failure. Verdicts carry a reason key (`pass.stoppedIn`,
`fail.enteredZone`, …) translated in `lib/spike-arena/l10n.js`.

**Stages (partial credit).** A challenge may label its success conditions
`"stages": [{en, de}, …]`, one per condition, in order. It is judged exactly
as above; the verdict also carries `stages: [bool, …]`, which stages are met
when the run is decided, and the pane shows them as a checklist and "Stages
completed: n of m" on the banner. A stage counts as the run leaves it, like
the pass itself: a latched kind (`sequence`, `touch`, `reach`) stays met, a
state kind (`push`, `stopIn`) counts only if it still holds — a crate pushed
onto the depot and off again is not delivered.

## The units

The pane's unit picker offers every unit in `static/spike-arena/units.json`.
All missions are original, written for this arena (inspired by the idea of a
virtual SPIKE curriculum, with no text, mats or mission designs taken from
one); the text is in each challenge file, in English and German.

### Rover basics (the starter unit)

A Mars-rover theme. Files: `static/spike-arena/rover-basics/`.

| # | Challenge | Skill | Judged by |
|---|---|---|---|
| 1 | Leave the lander | drive a distance | `stopIn` survey square |
| 2 | Face the ridge | turn in place 90° (yaw) | `heading 90`, `stayIn` pad |
| 3 | Turn around | 180° as two quarter turns, a defined block | `heading 180`, `stayIn` pad |
| 4 | Survey square | a square with `REPEAT 4` | `sequence` of four flags, `noWallContact` |
| 5 | Canyon beacon | sequential moves in a walled canyon | `stopIn` beacon, `noWallContact` |
| 6 | Crater detour | drive around a crater | `stopIn` cache, `avoid` crater |
| 7 | Stop at the line | colour sensor: stop on black | `stopIn` band, `avoid` soft ground |
| 8 | Follow the track | colour-sensor line follower with tank steering | `sequence` midway, landing; `stayIn` corridor |
| 9 | Stop at the cliff | distance sensor | `stopIn` drilling distance, `noWallContact` |
| 10 | Bump and turn | force sensor, back off, turn | `touch` boulder, `stopIn` shelter |
| 11 | Round the crater rim | a steered curve (steering -20), yaw | `sequence` east side, far side; `stopIn` far side; `avoid` crater |

Each has a reference solution (`<id>.bw`) and a deliberately wrong one
(`<id>.wrong.bw`). `test/spike-arena-challenges.test.mjs` runs every one of them in
the real Scratch VM through the real spikeprime extension and the virtual
hub's BLE peripheral, with simulated time (`test/helpers/spike-arena-vm.mjs`):
every reference passes, every wrong one fails, and the checker is
mutation-checked by replaying the recorded runs with each evaluator replaced
by always-false and always-true. The browser gate is the third half of
`scripts/verify-lego-spike-roundtrip.mjs`.

### Sensors in depth (`sensors-in-depth/`)

A polar station on an ice moon.

| # | Challenge | Skill | Judged by | Wrong solution, and why it fails |
|---|---|---|---|---|
| 1 | The blue marker | colour sensor: stop on ONE colour among several | `stopIn` blue stripe, `avoid` thin ice | stops on the first non-white colour (yellow): time is up |
| 2 | Trail to the red flag | line follower that ends: `REPEAT UNTIL` red | `stopIn` mast, `stayIn` trail corridor | a follower with no exit steers off the trail: left the corridor |
| 3 | Docking distance | distance sensor: stop below 20 cm | `stopIn` charging range, `noWallContact` | `distance = 20` is skipped between readings: hits the wall |
| 4 | The door in the wall | a side-mounted distance sensor finds a gap | `stopIn` storeroom, `noWallContact` | turns at the door's first edge: scrapes the frame |
| 5 | Feel the way | force sensor: bump, back off, turn, three times; a defined block | `touch` two crates and the beacon, `noWallContact` | turns without backing off: the corner jams, time is up |

### Gyro turns (`gyro-turns/`)

A greenhouse dome.

| # | Challenge | Skill | Judged by | Wrong solution, and why it fails |
|---|---|---|---|---|
| 1 | Half a right angle | a slow, precise 45° turn with yaw | `heading 45` (±3) | the same turn at full speed overshoots to ~55°: time is up |
| 2 | The worn wheel | driving straight by gyro feedback: steering = yaw × -3 | `stopIn` green mat, `stayIn` path (left tyre 5.4 cm) | "straight ahead" with no correction curves off the path |
| 3 | Hexagon patrol | a polygon, turn = 360 / 6 in a variable | `sequence` of six posts, `avoid` pond, `noWallContact` | turns by the inside angle (120°): the triangle's corner is the pond |
| 4 | About turn | yaw wraps at 180: compare `abs of yaw` | `sequence` bench, door; `stopIn` door | waits for `yaw > 180`, which never happens: time is up |

### Mapping (`mapping/`)

An excavation site. The rover explores, remembers in variables and a list,
and reports by where it drives.

| # | Challenge | Skill | Judged by | Wrong solution, and why it fails |
|---|---|---|---|---|
| 1 | Count the finds | count markers on the rising edge; report = park in bay N | `stopIn` bay 3, `noStopIn` bays 1, 2, 4, `noWallContact` | counts every reading of yellow: drives into the wall |
| 2 | Back to the find | explore in steps, remember the step; return (steps - found) × 5 cm | `stopIn` over the find, `noStopIn` rest of the trench | goes back found × 5 cm (from the start, not from here): stopped in the wrong place |
| 3 | Replay the route | record colours into a list, replay them as turns | `sequence` two corners and camp, `stopIn` camp, `noWallContact` | one variable keeps only the last tile: three left turns into the fence |

### Capstone (`capstone/`)

| # | Challenge | Skill | Judged by (stages) | Wrong solution, and why it fails |
|---|---|---|---|---|
| 1 | Supply run | line following, absolute gyro headings, force sensor, pushing, distance sensor | 1 `sequence` along the track, 2 `touch` call button, 3 `push` crate onto depot, 4 `stopIn` garage; `noWallContact` | turns at the button without backing off: jammed, time is up, **2 of 4 stages** |

Every unit's missions are run by `test/spike-arena-units.test.mjs` in the same
real-VM path as the starter unit: every reference passes; every wrong one fails
for its stated reason (the test pins the reason key); every program parses
without a dialect warning; each reference also passes, with the same finishing
time, through the pane's frame loop with the VM stalled past the time limit
(one clock); the checker is mutation-checked over the recorded runs, including
a capstone run that pushes the crate past the depot and still parks (the run
that tells a broken `push` evaluator from the real one, and holds partial
credit to "met at the end"). `test/spike-arena-pane-units.test.mjs` renders
the pane: the unit picker lists every unit, a unit opens, a mission starts and
runs to a verdict, a staged mission shows its stages. The browser gate opens
Gyro turns from the picker and runs its first mission to a pass.

## The 3D view

A **3D view** button beside Start/Step/Reset shows the same arena in three.js
(task D3). It is a second reader of the one snapshot, not a second world:

- **One snapshot.** `ArenaSim.snapshot()` is the whole render state: pose,
  footprint, object shapes and centres, sensor poses and readings, trail,
  `wheelTravel` (cm each wheel has turned, slip included; added for the view,
  read by nothing in the simulation), verdict. Each frame the pane hands it to
  exactly one view: the 3D view when it is open, else the canvas. The printed
  mat is drawn once by the 2D view's own `drawMat` and becomes the 3D mat's
  texture, so both views show the same lines, bays and zones.
- **Frames.** The scene is metres, y up: arena `(x, y)` cm → scene
  `(x, 0, y) × 0.01`, heading → rotation about −y (`rotation.y = −heading`).
  The rover's frame keeps the arena's: x forward, z to its right. Walls and
  objects are the world's own convex pieces (the ones collisions use) extruded
  up: walls 6 cm, objects 5 cm (heights the 2D world does not have). A pushed
  crate is placed by its snapshot centre; wheels spin by `wheelTravel` over
  their radius; the colour spot takes the colour read, the distance beam the
  distance read, the force tip turns red when pressed.
- **Cameras.** Orbit (drag, pinch), follow-behind, and top-down: an
  orthographic camera straight down that puts every mat point where the 2D
  canvas draws it.
- **One clock.** The view never calls the simulation and never writes the
  snapshot; which view is open cannot change a run.
- **Lazy.** `lib/spike-arena/arena-view3d.js` (renderer, cameras,
  `OrbitControls`) and `arena-scene3d.js` (the scene graph) reach the app only
  through the pane's dynamic import, chunk `bw-arena-3d`, so three.js (MIT,
  exact pin `three` 0.186.1; `THIRD-PARTY-NOTICES.md`, the About dialog) is
  downloaded the first time someone opens the 3D view. `verify-boot-payload`
  holds it out of the first load and out of the arena's own chunk.
- **No WebGL 2** (three.js has required it since r163): the pane stays in 2D
  and says why, in English or German; the button can be pressed again. A page
  can take that path on purpose with `window.__bwArenaForceNoWebGL = true`.

Held by `test/spike-arena-3d.test.mjs` (the scene built headless for every
mission; the rover, sensors, wheels and a pushed crate against the snapshot
over a driven path and over the capstone reference in the real VM; the
top-down camera against the canvas mapping; the same verdict, finishing time
and pose with the view rendering every few frames) and
`test/spike-arena-3d-pane.test.mjs` (the pane's toggle, fallback, camera
modes, a render per frame, the same verdict and time as in 2D). The browser
gate (`scripts/verify-lego-spike-roundtrip.mjs`) toggles the 3D view in a
real page and asserts WebGL or the fallback by what the page itself reports.
`docs/SIM-LAB-PLAN.md`'s physics world can replace `ArenaSim` behind the same
bridge and snapshot: neither the hub contract nor the views change.

## Programming the rover

The reference solutions are lite SPIKE dialect (`DEVICE SPIKE` `.bw`), run in
the real Scratch VM through the real spikeprime extension. They use the SPIKE
driving-base words: `set movement motors A B`, `set movement speed`,
`move forward/backward N cm` (which waits until the rover has arrived),
`start moving steering S` (turns in place at ±100, curves in between),
`start tank L R`, `stop movement`, `reset yaw`, `wait until`, and the
`spike angle`, `spike color`, `spike distance` and `spike force sensor`
reporters. No solution sleeps a fixed time; the challenge test holds that.

History: the first version of the unit had to follow every `move` with a
`wait` and turn with two `start motor` blocks, because the extension's `move`
did not wait and the dialect had no steering words. Those were fixed upstream
(CrispStrobe/extensions#22, CrispStrobe/sb3-creator#34) and the solutions
moved to the words above.

Two limits remain, both outside the arena:
- `spike motor position` reports the position modulo 360, so it cannot
  measure a distance beyond one rotation;
- on the SPIKE 3 route the colour sensor's reflection is not transmitted (the
  protocol record has no field for it), so the solutions use colour ids.

A third is closed (task D5, sb3-creator#41): a statement's argument may be an
expression in parentheses — `move forward (finds * 15) cm` reads — and a line
the dialect cannot read (`move forward finds * 15 cm`, whose expression is not
parenthesised) is refused by name (`UnparsedLinesError`), never dropped with a
warning. The solutions written before that still set a variable first
(`set distance to (finds * 15)`, `move forward distance cm`), which reads either
way; `test/dialect-no-dropped-lines.test.mjs` holds every shipped program,
these units included, to zero unread lines.



## Free sandbox

Open **Code → 🪐 SPIKE arena → Free sandbox**. The arena button is available
regardless of the selected chip or the current program. No lesson, challenge,
reference solution or program is needed. The sandbox can open while challenge
files are still loading. Challenges remains a separate mode with its original
scoring and deadlines.

Use the arrow controls to drive the rover, the square to stop,
and the speed slider for the next manual command. Manual driving stops the
current program without resetting the rover. Start runs the current Scratch
project; Reset stops outstanding motion, waits and sounds and returns the rover
to its saved start. Pause freezes simulated time. A sandbox has no automatic
success, failure or time limit. Walls remain solid and crates remain pushable.

In 2D, choose a mat tool and tap the canvas: place the rover start, paint an
8 cm colour patch, add a 4 × 24 cm wall or a 12 × 12 cm pushable crate, or erase
the top item under the pointer. Editing stops the program and resets the rover
to the start, so sensor inputs and motor encoders agree with the edited world.
Save mat and Open mat exchange the arena world as a local JSON file; they do
not contain programs or audit evidence. Invalid files leave the current mat
intact. The last edited mat is also retained in local browser storage; Empty
mat creates a blank 180 × 120 cm mat. The editor and imported mats cap items at 300, shape points at 256, and mat
dimensions at 1000 cm; file imports are capped at 1 MB. Invalid robot ports or
geometry are rejected before the current world is replaced. Editing happens in 2D; 3D orbit, follow and top cameras display
the same world and sensor state.

The world format adds `mode: "sandbox"`, with empty `success` and `failure`
lists and no `timeLimitMs`. Ordinary challenge worlds still require at least
one success condition and a positive deadline. `ArenaChecker` keeps a sandbox
running regardless of elapsed time or contacts; `ArenaHubBridge` still owns
fixed physics steps and publishes to the existing `VirtualSpikeHubState`.
There is no second hub, motor model or physics engine for free play.

## Additional validation and current limits

`test/spike-long-sequences.test.mjs` runs 30 rounds of concurrent finite motor
moves, waits, sounds, cancellation and load-induced stalls. The complete trace
must match exactly for 5 ms calls and irregular 1/17/33/2/101 ms calls. A lost
cancellation mutation must fail. These are synthetic contracts for our
simulator, not a physical SPIKE calibration or an equivalence claim.

`test/spike-sandbox.test.mjs` checks a two-minute unlimited run, solid walls,
shared colour/distance readings after mat edits, reset and validation failures.
`test/spike-simulator-pane.test.mjs` additionally checks manual driving without
a program, reset cancellation, persistence across mode changes, failed imports
and a sandbox opening before delayed challenge downloads finish.

The production browser gates exercise Scratch execution, real mat placement,
save/open and 3D cameras. Editor checks additionally cover keyboard resizing,
portrait/landscape touch interaction and preserving unsaved pixel edits when
switching between costumes and backdrops. Browser receipts belong outside the
public checkout.

The free sandbox defaults to `robot.contactModel: "stall"`: before each fixed
step the bridge probes the unloaded wheel demand against solid geometry and
applies full environmental resistance to both drive motors when blocked.
Finite position moves then report `stalled` using the configured stall timer;
reversing or turning toward free space releases the resistance. Explicit motor
load combines with contact load and is never overwritten. Cancelling arena
ownership clears environmental resistance. This is a deterministic traction
model, not calibrated shaft torque or physical SPIKE accuracy. Select Slip at
walls to retain wheel slip; existing challenges retain their original slip
model unless they explicitly select stall.

Choose Move / select and drag a painted shape, wall or crate on the 2D mat.
Smaller and Larger resize the selected shape uniformly, including imported
polygons and lines. Invalid moves leave the current world intact. Mat shape
sizes are bounded at 1000 cm. The saved mat is now a validated `spikeArena`
section in the existing bounded transactional `.sb3` project bundle. Loading
a project replaces the mounted sandbox too; legacy projects clear the previous
mat. Separate Save mat / Open mat remains available. Older readers preserve
this optional section as unknown project content.

`test/spike-arena-contact.test.mjs` checks stalled completion, escape, explicit
load, cancellation and exact frame-chunk determinism; suppressing collision
feedback makes the completion comparison fail. `test/spike-arena-project-editing.test.mjs`
and the real ZIP attach/extract test cover transforms and bounded project
round trips. The pane and production browser checks exercise pointer dragging,
resizing and manual wall contact.

The optional desktop Renode debugger runs our own ARM firmware separately.
Its bounded brick-state stream provides identity, emulated time, sequence
numbers and peripheral observations; it is not an arena motor-command backend.
Before connecting it to this world, it needs reviewed motor-output and
sensor-input capabilities, explicit clock ownership and cancellation, and
integration tests under the same external scenarios. The existing JS sandbox
requires neither a Renode installation nor a firmware image.

Simulator execution disconnects any previous SPIKE session and selects the
registered peripheral belonging to the shared virtual hub. The virtual-only
chooser flag prevents a missing device, unsupported filter or cancelled
selection from falling back to physical Bluetooth. Physical hardware execution
remains an explicit separate action.

## Optional desktop firmware demonstration

The arena's Execution selector defaults to Simulator. That route executes
Scratch/Brickwright programs through the independent virtual hub. Firmware
demo (desktop) instead runs the built-in driving guest from
`brickwright-spike-prime-fw/simulation/arena-demo`; it does not execute Code
tab programs. The browser keeps this choice disabled because it has no managed
Renode runtime. Manual driving switches back to Simulator.

Both routes use the same `ArenaHubBridge`, arena geometry, sensors, hub and
2D/3D renderer. The Renode adapter reads guest encoder degrees and the guest
millisecond clock; it does not step the native controller. Its first frame
establishes an encoder baseline without teleporting the rover. Later frames
require the three arena capabilities plus `state-sample/v1`, preserve the image hash and connection generation and have increasing
sequence numbers, nondecreasing time, finite motor outputs and gaps at most
2 seconds. Wheel deltas are interpolated into world steps of at most 5 ms.
This is a sampled trajectory, not a guarantee of the unsampled path. Guest
encoders are quantized to 0.001 degree; accepted deltas allow 0.002 degree
rounding tolerance above the guest's 300 degrees/s bound. Hub/legacy speed
percentages are derived from the configured hub motor's nominal speed, while
the guest stream's own percentage uses its synthetic 300 degrees/s target.
Both encoder and legacy motor packets are updated before one hub notification.

Color/reflection, distance in millimetres, force/touch and motor load percent
return through the closed `renode.spike.arena.inputs.write` broker operation.
It accepts bounded semantic readings only. The native supervisor verifies the
build-pinned guest, state service, configuration and the package manifest of
all imported helpers/platform files before starting the demo. Caller data
cannot supply paths, monitor commands, memory addresses or firmware images.

Run starts a fresh demonstration. Stop, reset, changing the mat/execution
route and closing the pane close the session owned by the arena; a failed
start never closes someone else's pre-existing debugger. The desktop process
supervisor still imposes its existing 120-second session limit. The guest's
synthetic motion is bounded to one simulated hour. The model/guest units are
not physically calibrated, the demo is not full NuttX/SPIKE API compatibility,
and Full NuttX uses the separate optional own firmware backend.

Build the source-only guest, then use `renode-spike-prime`'s
`tools/stage_spike_arena_demo.py` to produce a new immutable local package.
Supply its `pins.json` values as compile-time environment variables for the
desktop build. The manifest and every `BW_RENODE_*_SHA256` pin must match.
Generated packages and execution evidence belong outside this public checkout.

For reproducible GUI/guest qualification, build
`tools/renode-arena-proof/Cargo.toml` with those same pins. Set
`BW_RENODE_ARENA_PROOF_DRIVER` to its executable, `BW_SPIKE_BUILD_ROOT` to the
production GUI build and `BW_SPIKE_EVIDENCE_DIR` to the private evidence
repository, then run `node scripts/verify-spike-renode-arena-browser.mjs`.
This proof uses a test broker transport to drive the actual managed guest;
it does not substitute for the Tauri webview ACL/broker boundary tests.
New adapters, validators and proof tools use BSD-3-Clause. Retained native
supervisor, GDB transport and Renode components retain their original licences.

## Own NuttX six-motor profile

In the desktop sandbox, Full NuttX offers Default devices or Six motors A–F
before starting a session. Six motors requires a package whose trusted firmware
source policy `policy/simulation-firmware-inputs.json` declares
`capabilities.motorPorts: 6`. The native launcher verifies
the pinned package and attaches the six motors before loading either ELF or
booting. Packages without that declaration keep the default topology; they
cannot launch the six-motor profile. The first live snapshot must confirm all
six attachments before a program upload.

Six-motor execution initially uses Python from the Code tab. The own module
`brickwright` exposes `motor(port, speed)` with numeric ports 0–5 for A–F, for
example `import brickwright as b; b.motor(5, 200)`. A program must keep running to
maintain that command; completion and Stop idle the motors. Scratch firmware
compilation still supports A/B only. The existing sandbox uses A/B as the
rover's wheels; C–F are additional motors observed through the same shared hub.
This profile has no arena sensors and does not run sensor-based lessons. It
observes simulated device models; it makes no physical hardware or radio
qualification claim.

Device and value controls in the existing virtual-hub panel become read-only
while firmware owns the hub. The topology selector stays locked for the live
session; close it before selecting different devices. Native Reset retains the
selected topology and boots with an empty program without automatic execution.
The startup, packet, Python source/stack, and process lifetime limits remain
unchanged. Save/Load still retain a slot only within the live emulator session.
