# LEGO SPIKE App 3 Python

*Internal technical doc, English-only per the bilingual rule. Written 2026-09-28.*

## What it is

A program written for LEGO's SPIKE App 3 in Python can be pasted into the Code tab's Python tab,
where it:

- becomes SPIKE blocks with "⇦ To blocks";
- runs on the virtual SPIKE hub with **▶ Run on SPIKE 3 (Python)**, and in the arena when that is
  open.

The blocks can go back out as SPIKE 3 Python. blocks → Python → blocks is a fixed point.

There is **no Python runtime** here. A SPIKE 3 program is an *import*, the way a MakeCode project
is: it is translated into lite's SPIKE dialect (`DEVICE SPIKE`, `start motor A forward`,
`spike distance B in mm`), so into `spikeprime` blocks. Those run in the Scratch VM through the
shipping spikeprime extension, over Web Bluetooth, to the virtual hub.

That hub is the one the word blocks, the SPIKE panel and the arena use. So there is one world, and
a program reaches it the same way whichever language it was written in.

## Why an importer and not a second MicroPython

The first plan was to run SPIKE 3 Python in MicroPython-in-wasm, on top of the Pybricks build lite
already ships. The owner redirected it before anything was built.

A second runtime would have been a second route into the virtual hub, with its own motor model and
its own sensor reads. That makes two worlds to keep agreeing. The importer puts SPIKE 3 Python on
the same footing as the dialect's other two-way languages, and every guarantee the blocks already
have applies to it unchanged.

What it costs is Python semantics that blocks cannot say: generators, classes, tuples as values,
arbitrary awaitables. Those are refused by name rather than approximated.

## Where the pieces are

| Thing | Where |
|---|---|
| The reader and exporter | sb3-creator `src/utils/spike3Python.js`, vendored as `overlay/scratch-gui/src/lib/sb3-creator-spike3.js` |
| Routing | the Python entry point (`sb3-creator-python.js`) sends a program that imports `runloop` / `hub` / `motor`… to it |
| Dialect words | sb3-creator `sb3Creator.js`: reuses #34's drive-base words (`set movement motors`, `set movement speed`, `start moving steering`, `start tank`) and adds eight (42 mapped); five more for task D1 (47 mapped) |
| Why each refusal | sb3-creator `SPIKE3_REFUSALS` in `spike3Python.js`; every `# unsupported:` line carries its reason |
| The Run button, console, Stop | `overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx` |
| Connect + green flag | `overlay/scratch-gui/src/lib/spike3-python-run.js` |
| Tests | sb3-creator `test/spike3-python.test.mjs`, `test/spikeprime-spike3-words.test.mjs`; lite `test/spike3-python-import.test.mjs` |
| Browser gate | third half of `scripts/verify-lego-spike-roundtrip.mjs` (light shard) |

## Sources

These were used for API facts only: names, signatures, defaults, units, constants, and which
calls are awaitable. No LEGO firmware or app code was read or copied.

- LEGO Education, SPIKE App 3 Python help: <https://spike.legoeducation.com/prime/help/lls-help-python>.
  Read through the module reference generated from it: <https://jvolkening.github.io/lego-spike-python-v3-docs/>.
- LEGO, SPIKE Prime hub protocol, device notification records: <https://lego.github.io/spike-prime-docs/messages.html>.
  Distance in mm with -1 for no reading; force 0-100.
- PrimeLessons, "Turning with the gyro" (SPIKE 3 Python): <https://primelessons.org/en/PyProgrammingLessons/SP3GyroTurningPython.pdf>.
  `tilt_angles()` is in decidegrees, and yaw has the **opposite sign** to the app and word blocks.
- The arena lane's hub contract (lite PR #452): the virtual hub reads a block speed as a percent
  of the motor's full speed (small 660, medium 1110, large 1050 deg/s).

## Coverage

The reader classifies every function in LEGO's module reference, 73 in all (`SPIKE3_API`). The
sb3-creator test holds the reader to that list sample by sample.

| Status | Count | Functions |
|---|---|---|
| mapped (same meaning) | 22 | `motor.stop`, `reset_relative_position`, `relative_position`, `absolute_position`; `motor_pair.pair`, `stop`; `color_sensor.rgbi` (items 0-2); `distance_sensor.clear`; `force_sensor.force`, `pressed`; `light_matrix.write`, `clear`, `set_pixel`; `sound.beep`, `stop`, `volume`; `motion_sensor.tilt_angles`, `reset_yaw`, `acceleration`; `runloop.run`, `sleep_ms`, `until` |
| approximate (a note says what changes) | 24 | `motor.run`, `run_for_degrees`, `run_for_time`, `run_to_absolute_position`, `run_to_relative_position`, `velocity`, `set_duty_cycle`; `motor_pair.move`, `move_tank`, `move_for_degrees`, `move_for_time`, `move_tank_for_degrees`, `move_tank_for_time`, `unpair`; `color_sensor.color`, `reflection`; `distance_sensor.distance`, `show`; `button.pressed`; `light.color`; `light_matrix.show_image`, `show`; `motion_sensor.up_face`, `angular_velocity` |
| unsupported (named, with its reason, `# unsupported:` in the program) | 27 | see the table below |

### Refusals closed, 2026-09-29 (task D1): all 34, before -> after

Before, 34 of the 73 functions were refused by name alone. Each one was classified. Classes: **(a)** maps to
an existing dialect word; **(b)** a new dialect word over a spikeprime block that the virtual hub and
the arena actually carry; **(c)** unsupportable in this architecture, with a named reason. The
reasons are in `SPIKE3_REFUSALS`.

| Function | Before | After | Class | Dialect / reason |
|---|---|---|---|---|
| `color_sensor.rgbi(p)[0..2]` | refused | **mapped** | b | `spike color P raw red\|green\|blue`, new block `getColorRGB` (extensions#27). The arena's raw RGB of the mat colour. Item 3 (intensity) is still refused: the colour record has no intensity channel |
| `motion_sensor.angular_velocity()[i]` | refused | **approximate** | b | `spike gyro rate yaw\|pitch\|roll` (`getGyroRate`). Decidegrees/s: z = -10 × the block's clockwise deg/s, as for yaw. The block always read 0 before extensions#27 fixed its axis lookup. The arena writes the drive base's turn rate |
| `light.color(light.POWER, color.X)` | refused | **approximate** | b | `set center button light to …` (`setCenterButtonColor`), by the colour's number. The blocks name the hub LED palette differently (`color.GREEN` is "lime"). `light.CONNECT` and the RGB form are refused by name |
| `sound.volume(v)` | refused | **mapped** | b | `set spike volume to v` (`setVolume`) |
| `distance_sensor.show(p, [4])` | refused | **approximate** | b | `set distance lights P tl tr bl br` (`setDistanceLights`); percent → 0-9, rounded |
| `distance_sensor.clear(p)` | refused | **mapped** | b | `set distance lights P 0 0 0 0` |
| `light_matrix.show([25])` | refused | **approximate** | a | 25 × `set pixel x y v`, row by row. Not atomic, as SPIKE 3's is. A computed list is refused by name |
| `motor.get_duty_cycle` | refused | refused | c | PWM duty is the driver's electrical output. The hub reports speed and position, and the arena models no load or electrics |
| `motor.status` | refused | refused | c | not in the device notification; stall not modelled |
| `motor.info` | refused | refused | c | a dict describing the device; the blocks have no dict |
| `distance_sensor.get_pixel`, `set_pixel` | refused | refused | c | the lights are not reported back; the block sets all four at once |
| `force_sensor.raw` | refused | refused | c | the notification carries only the calibrated 0-100 force |
| `light_matrix.get_pixel`, `get_orientation` | refused | refused | c | the matrix is not reported back by the hub |
| `light_matrix.set_orientation` | refused | refused | c | the constants' rotation sense is undocumented for SPIKE 3. The blocks' rotate display is a relative SPIKE 2 rotation that also clears the matrix |
| `motion_sensor.gesture`, `tap_count`, `reset_tap_count` | refused | refused | c | not in the SPIKE 3 notification; the flat-mat arena has no taps, shakes or falls |
| `motion_sensor.stable` | refused | refused | c | the firmware's own detector, not carried; a gyro threshold would be a different detector |
| `motion_sensor.quaternion` | refused | refused | c | a 4-tuple, and not in the notification |
| `motion_sensor.get_yaw_face`, `set_yaw_face` | refused | refused | c | not reported and no block; the arena's hub is mounted flat |
| `hub.temperature`, `battery_voltage`, `battery_current`, `battery_temperature`, `usb_charge_current` | refused | refused | c | telemetry of a physical hub. The 3.x notification carries none, and the virtual hub has no electrical or thermal model |
| `hub.device_uuid`, `hardware_id` | refused | refused | c | the identity of a physical hub |
| `hub.power_off`, `reset`, `soft_reset`, `bootloader` | refused | refused | c | act on the hub itself and end the connection or program |

34 → 27 refused; mapped 19 → 22; approximate 20 → 24.

Python itself, as read by sb3-creator's Python parser (extended for this):

- `async def`, `await`, keyword arguments, `lambda` (in `runloop.until`), `is` / `is not`, tuple
  unpacking of `tilt_angles()` / `acceleration()`, and f-strings.
- `if` / `elif` / `else`, `while`, `for … in range(…)` including a loop variable used in the body,
  and `break`. A break is lowered to a flag the loop tests, with the rest of the body guarded.
- `print(a, b)`, which joins with a space. A program that prints runs on a sprite, Hub, because
  the Stage has no speech bubble.
- Module-level constants for ports and pairs, and helper functions: one-line predicates are
  inlined, anything else becomes a custom block.
- `runloop.run(a(), b())` becomes two flag scripts that start together.

## Units: what a line-by-line reading gets wrong

| Quantity | SPIKE 3 Python | Blocks | Conversion |
|---|---|---|---|
| velocity | deg/s | percent of the motor's full speed | ÷ 11.1: the medium motor's 1110 deg/s is 100 % |
| yaw | decidegrees, clockwise **negative** | degrees, clockwise positive | `tilt_angles()[0]` = -10 × `spike angle yaw` |
| pitch, roll | decidegrees | degrees | × 10, sign kept (the sources state the inversion for yaw only) |
| distance | mm, -1 = no reading | `spike distance P in mm` | none |
| force | decinewtons 0–100 | the hub record's 0–100 | none |
| durations | ms | seconds | ÷ 1000 |
| colour | `color.RED` = 9 | the name `"red"` | constants become names; `color(p) == color.RED` becomes the `is red` boolean |
| angular velocity | decidegrees/s, z counterclockwise positive | `spike gyro rate` deg/s, yaw clockwise positive | `angular_velocity()[2]` = -10 × `spike gyro rate yaw`; x, y × 10 (roll, pitch), sign kept |
| raw colour | `rgbi()` items 0-2, 0-1024 | `spike color P raw red/green/blue`, 0-1024 | none |
| distance lights | percent 0-100 | 0-9 | × 9/100, rounded |
| centre light | `color.X` | the hub LED palette name, same number | by number |

## What is approximated

- **Speed on non-medium motors.** A small motor (660 deg/s) or a large one (1050) at the same
  percent turns at a different deg/s from the one the program asked for.
- **Awaiting.**
  - An awaited `motor_pair.move_for_*` becomes three steps: start the drive base's steered move,
    wait (the time, or until either wheel has turned that far), stop. The move block itself
    returns before the drive base arrives, so this is the awaited move exactly.
  - An awaited single-motor `run_for_degrees` / `run_for_time` is the `run motor … for` block. The
    extension waits an estimated time, and in the virtual hub the motor lands exactly.
  - A call left **without** `await` still waits in the blocks; the note says so.
- **`stop=` keywords** become the port's stop action, which the blocks keep for later moves.
  `acceleration=` / `deceleration=` are not modelled.
- **No distance reading.** The extension reports no reading as 0, where SPIKE 3 returns -1.
- **Reflection** reads only on firmware 2.x in the extension; on the virtual 3.x hub the block is
  blank. The block cannot fix this, so the note says it.
- **`button.pressed()`** is true/false, not the milliseconds held.
- **`light_matrix.show_image(n)`** shows built-in image n by number; which picture that is depends
  on the hub.

## The drive base: why `motor_pair.move` is `start steering`

The extension's `motorPairMove` block sends `run_at_speed` to each motor raw, with no mirroring.
On a standard SPIKE driving base (left motor mounted counterclockwise), both a real hub and the
virtual one spin on the spot.

SPIKE 3's `motor_pair.move` is the drive base's own steered start, and that is the `steer` block,
spelled `start moving steering N` (`motors.start(steering)`): the hub applies the steering and the mirrored pair. This was measured
in the arena: routed through `motorPairMove`, three of four imported Rover-basics solutions fail.

## Found on the way

**`run motor A forward 90 degrees` turned the motor by 0 degrees.** The dialect stored the UNIT
field with its plural `s` stripped (`degree`, `rotation`, `second`, `inche`). The extension compares
the field with its own menu values (`degrees`, `rotations`, `seconds`, `in`), matched nothing, and
ran 0 degrees.

The fix, in sb3-creator: store the menu value, and read old singular fields back as the same word.
`test/spike3-python-import.test.mjs` judges every menu field an import writes against the
shipping extension's own `getInfo()` menus.

## Evidence

**Task D1 (2026-09-29)**, CrispStrobe/extensions#27, CrispStrobe/sb3-creator#40, and this repository:

- sb3-creator `test/spike3-python.test.mjs`:
  - each of the seven functions goes import → dialect → blocks → export → import, with the exact
    spelling at every stage and Python and block fixed points;
  - the reasons table equals the refused set (27), and every refusal carries its reason;
  - corpus fixture 13.
  - Mutants killed: rgbi channel order, matrix row order, reasons dropped, gyro z sign, distance
    rounding.
- extensions `development/test-spikeprime-movement.js`: gyro axis and raw RGB through the real
  SPIKE 3 notification parser. Mutants killed: the axis map reverted, every channel read as red.
- lite `test/spike3-python-arena-d1.test.mjs`: imported SPIKE 3 Python, in the arena. Checked there:
  - rgbi over a red mat and a blue mat (the arena's raw RGB);
  - `angular_velocity()[2]` during a right turn in place, against the 111 deg/s the drive base's
    geometry gives, and agreeing in sign with `tilt_angles()[0]`;
  - `light_matrix.show` pixel levels in the hub;
  - the centre light, volume and distance lights in the hub.
  - 8 mutants, all killed: gyro axis, rgb channel, rgb constant, importer z sign, hub pixel index,
    hub LED constant, hub volume ignored, distance lights reversed.

**Before D1:**


- **sb3-creator** `test/spike3-python.test.mjs`, 106 tests:
  - the ledger, sample by sample;
  - units: wheel degrees, direction signs, yaw sign and decidegrees, mm, ms;
  - ordering: await order, concurrent entries, helper procedures, break lowering;
  - a 12-program corpus: compiles with no warnings, names what it refuses, Python and block fixed
    points;
  - export truth values;
  - routing.
- **sb3-creator** `test/spikeprime-spike3-words.test.mjs`: each new word goes to its opcode and back.
- **Mutation-checked, 15 mutants, all killed:** velocity scale, yaw sign, yaw decidegrees, singular
  unit, break guard, second wheel in the steered wait, truth unwrap, pair prescan, visible value
  refusals, distance unit, both direction signs, sleep_ms scale, isColor, and steer vs
  `motorPairMove`.
- **lite** `test/spike3-python-import.test.mjs`:
  - routing, and the button's detection equal to the reader's;
  - every emitted opcode defined and implemented by the bundled extension;
  - every menu field inside its menu;
  - sensor reads through a live virtual-hub connection (mm, colour, force, pressed, relative
    position, yaw);
  - the run helper;
  - EN/DE strings.
  - Mutation-checked: 6 of 7 killed. The survivor, steer vs `motorPairMove`, is a world-level
    property: upstream's unit tests and the arena test hold it.
- **Arena, headless** (`test/spike3-python-arena.test.mjs`): imported SPIKE 3 Python solutions of
  Rover basics 1, 2, 7 and 9 PASS in the real VM through the real extension and the virtual hub.
  A program reading the yaw with the app's sign FAILS. At world level, four reader mutants (yaw
  sign, steer vs `motorPairMove`, distance unit, second-wheel wait) each fail a challenge.
