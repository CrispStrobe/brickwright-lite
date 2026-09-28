# SPIKE arena — a 2D world for the virtual SPIKE Prime hub

A top-down robot arena for LEGO SPIKE Prime: a driving base on a mat, with
walls, rocks and zones, a colour sensor looking down, a distance sensor looking
ahead and a force sensor on the front. It ships with an original starter unit,
**Rover basics** (a Mars-rover theme), and a checker that says pass or fail and
why.

The arena never talks to a program. It talks to the **virtual SPIKE hub**
(`overlay/scratch-gui/src/lib/virtual-hub/`), and every programming route talks
to that same hub: Scratch blocks (and the dialect and two-way languages that
become them) through the spikeprime extension's protocol emulators, SPIKE 3
Python, and Pybricks. So the arena works for all of them, and a new route plugs
in by honouring the contract below, without touching the arena.

| Module | Role |
|---|---|
| `lib/virtual-hub/spike-motor-model.js` | what a motor does with a command (new) |
| `lib/virtual-hub/spike-hub-commands.js` | the motion statements and verbs the hub understands, on either transport (new) |
| `lib/virtual-hub/spike-hub-state.js` | the hub state: ports, motors, IMU (extended) |
| `lib/spike-arena/geometry.js` | 2D shapes, overlap, rays |
| `lib/spike-arena/arena-sim.js` | the world: kinematics, sensors, collisions |
| `lib/spike-arena/arena-world.js` | the world/challenge format and its validator |
| `lib/spike-arena/arena-checker.js` | pass/fail with a reason |
| `lib/spike-arena/arena-hub-bridge.js` | couples the world to the hub; owns simulated time |
| `lib/spike-arena/arena-render.js`, `l10n.js`, `arena-units.js` | canvas drawing, EN/DE strings, loading a unit |
| `static/spike-arena/rover-basics/` | the starter unit: challenges, reference and wrong solutions |
| `components/tw-pseudocode/spike-arena-pane.jsx` | the dockable pane |

## The hub contract

This is the interface between the world and every programming route. It is
the ONLY interface: the arena reads and writes `VirtualSpikeHubState`, nothing
else.

### Who owns what

| State | Written by | Read by |
|---|---|---|
| motor commands | the programming route (a protocol emulator, a SPIKE 3 Python runtime) via `hubState.motors.*` or `hubState.setMotorSpeed` | the motor model |
| `data.motors[i].position`, `.speed` | the motor model (in `stepMotors`), or a route that runs its own motor physics (the Pybricks mirror) | the arena, the extension (via device notifications), panels |
| `data.sensors[i]` for colour, distance, force | the arena, via `hubState.updateSensor` | every route |
| `data.imu.yaw`, `angularVelocity.z` | the arena, via `hubState.setHeading` | every route |
| yaw zero | the program, via `hubState.resetYaw(value)` (`hub.motion.reset_yaw()`, `motion_sensor.reset_yaw(0)`) | `setHeading` |
| simulated time | **the arena**, while it is running: `bridge.tick(ms)` calls `hubState.stepMotors(dt)` in fixed 5 ms steps | — |

**One clock.** Motor positions advance only inside `hubState.stepMotors(dtMs)`.
While the arena runs, the arena calls it and nothing else may. A route that
needs "wait until the motor finished" awaits the promise the motor model
returns; it never steps motors itself. With no arena running, nothing steps and
motors hold their position (as before this module existed).

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
motors.runToPosition(port, position, degPerSec)    // -> Promise<'completed'|'interrupted'>
motors.stop(port, 'brake'|'hold'|'coast')          // all stop dead: no inertia is modelled
motors.resetPosition(port, value = 0)
motors.percentToDps(port, percent)                 // the device's full speed * percent / 100
motors.busy(port)
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

**Pybricks.** The Pybricks pane mirrors its own motor angles into
`data.motors[i].position`; the arena reads position DELTAS, so it follows a
Pybricks run too. Start the Pybricks program after the arena's Reset: Reset
zeroes the drive motors' positions, and a mirror that then writes its old
angle back reads as one large wheel turn.

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
  `hub.motion.{reset_yaw, preset_yaw}`, `motion_sensor.reset_yaw`.
- SPIKE 2 route (Classic): the same REPL lines, plus JSON-RPC
  `scratch.motor_{start, stop, run_for_degrees, run_timed,
  go_to_relative_position}`, `scratch.move_{start_speeds, tank_degrees,
  tank_time, stop}`. As a SPIKE 2 hub does, the reply to a motion request is
  sent when the motion **ends**.

An unrecognised statement is recorded (`lastUnsupportedPythonTunnel`), not guessed at.

## The model

**Driving base.** Pybricks' SPIKE Prime drive base: wheel diameter 5.6 cm,
axle track 11.2 cm, left motor A mounted counterclockwise, right motor B
(`DriveBase(left_motor, right_motor, wheel_diameter=56, axle_track=112)`,
[Pybricks robotics docs](https://docs.pybricks.com/en/latest/robotics.html)).
All configurable per challenge (`robot`). Body: a 17 x 14 cm rectangle, 9 cm
ahead of the axle. Colour sensor 7 cm ahead of the axle, centred, port C;
distance sensor on the front face, port D; force sensor button 0.8 cm proud of
the front, 3 cm right of centre, port E.

**Kinematics.** Ideal differential drive from the change in the two motors'
counted degrees: `travel = delta / 360 * pi * d` per wheel (negated for the
mirrored motor), heading change `(left - right) / track`, integrated exactly
along the arc, so the step size does not change the path. Tested against the
closed forms.

**Motors.** Reach commanded speed instantly; no acceleration, no load, no stall;
a degrees target lands exactly. Percent is of the device's documented full
speed.

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
  `reset_yaw`; pitch and roll stay 0 (the mat is flat).

**Not modelled:** acceleration and inertia, wheel slip in free driving, motor
stall, sensor noise, ambient light, a sloped or bumpy mat, objects rotating.

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
| `timeLimitMs` | failure | time runs out first |

The run passes on the first tick at which every success condition is met, and
fails on the first failure. Verdicts carry a reason key (`pass.stoppedIn`,
`fail.enteredZone`, …) translated in `lib/spike-arena/l10n.js`.

## Rover basics (the starter unit)

Original missions, written for this arena; the text is in each challenge file
in English and German. Files: `static/spike-arena/rover-basics/`.

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

## For a later 3D view

`ArenaSim.snapshot()` is the whole render state: pose, footprint, object
shapes and centres, sensor poses and readings, trail, verdict. A three.js view
maps the mat plane to x/z (`x -> x`, `y -> z`, heading -> rotation about -y),
extrudes walls and objects, and consumes the same snapshot; nothing in the
simulation is 2D-renderer specific. `docs/SIM-LAB-PLAN.md`'s physics world can
replace `ArenaSim` behind the same bridge: the hub contract does not change.

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

