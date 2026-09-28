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
| New dialect words | sb3-creator `sb3Creator.js`: 13 learner-gap opcodes gained words (43 mapped) |
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
| mapped (same meaning) | 19 | `motor.stop`, `reset_relative_position`, `relative_position`, `absolute_position`; `motor_pair.pair`, `stop`; `force_sensor.force`, `pressed`; `light_matrix.write`, `clear`, `set_pixel`; `sound.beep`, `stop`; `motion_sensor.tilt_angles`, `reset_yaw`, `acceleration`; `runloop.run`, `sleep_ms`, `until` |
| approximate (a note says what changes) | 20 | `motor.run`, `run_for_degrees`, `run_for_time`, `run_to_absolute_position`, `run_to_relative_position`, `velocity`, `set_duty_cycle`; `motor_pair.move`, `move_tank`, `move_for_degrees`, `move_for_time`, `move_tank_for_degrees`, `move_tank_for_time`, `unpair`; `color_sensor.color`, `reflection`; `distance_sensor.distance`; `button.pressed`; `light_matrix.show_image`; `motion_sensor.up_face` |
| unsupported (named, `# unsupported:` in the program) | 34 | `motor.get_duty_cycle`, `status`, `info`; `color_sensor.rgbi`; `distance_sensor.clear`, `get_pixel`, `set_pixel`, `show`; `force_sensor.raw`; `light.color`; `light_matrix.get_pixel`, `show`, `set_orientation`, `get_orientation`; `sound.volume`; `motion_sensor.angular_velocity`, `gesture`, `stable`, `quaternion`, `get_yaw_face`, `set_yaw_face`, `tap_count`, `reset_tap_count`; the `hub` module's own functions (`temperature`, battery readings, `device_uuid`, `hardware_id`, `power_off`, `reset`, `soft_reset`, `bootloader`) |

Python itself, as read by sb3-creator's Python parser (extended for this):

- `async def`, `await`, keyword arguments, `lambda` (in `runloop.until`), `is` / `is not`, tuple
  unpacking of `tilt_angles()` / `acceleration()`, and f-strings.
- `if` / `elif` / `else`, `while`, `for … in range(…)` including a loop variable used in the body,
  and `break`. A break is lowered to a flag the loop tests, with the rest of the body guarded.
- `print(a, b)`, which joins with a space.
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

SPIKE 3's `motor_pair.move` is the drive base's own steered start, and that is the `steer` block
(`motors.start(steering)`): the hub applies the steering and the mirrored pair. This was measured
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
- **Arena, headless** (lands with the arena, PR #452): imported SPIKE 3 Python solutions of
  Rover basics 1, 2, 7 and 9 PASS in the real VM through the real extension and the virtual hub.
  A program reading the yaw with the app's sign FAILS. At world level, four reader mutants (yaw
  sign, steer vs `motorPairMove`, distance unit, second-wheel wait) each fail a challenge.
