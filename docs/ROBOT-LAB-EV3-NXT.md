# Robot Lab: the EV3 and the NXT

*2026-10-19 — plan phases P4 (EV3) and P5 (NXT) of [ROBOT-LAB-HUBS-PLAN.md](ROBOT-LAB-HUBS-PLAN.md), level 1
(direct commands). Code: `overlay/scratch-gui/src/lib/bw-sim/hubs/ev3/`, `hubs/nxt/`, `hubs/mindstorms-output.js`,
`devices/ev3-sensors.js`, `devices/nxt-sensors.js`, `lib/virtual-hub/bt-classic-registry.js`,
`lib/virtual-hub/connect-virtual-hub.js` (its BT-classic branch).*

The EV3 and NXT blocks reach a real brick over Bluetooth Classic through Scratch Link. The Robot Lab
swaps **the transport, never the extension**: the app's WebSocket wrapper hands an extension's Scratch Link
socket to the Lab's *Virtual EV3* or *Virtual NXT*, and the bytes the extension sends are executed by a
clean-room brick behind the VirtualHub boundary. The extension under test is the one that ships.

## The transport: a BT-classic virtual peripheral registry

`bt-classic-registry.js` speaks Scratch Link's BT JSON-RPC (`discover` → `didDiscoverPeripheral`,
`connect`, `send {message: base64}` → `didReceiveMessage`). A peripheral is registered by id, name and
Bluetooth device class (EV3 and NXT: major 8 *Toy*, minor 1 *Robot* — what the stock `ev3`,
`ev3comprehensive` and `legonxt` ask for) and is announced while it is *available* (the scene has that
brick). With nothing available, the real Scratch Link answers. The one WebSocket wrapper serves claims in
order: SPIKE's 2.x REPL simulation first (unchanged), then the registry, then the network.

Replies go out on a later macrotask, after the JSON-RPC result of the `send` that caused them: the stock
and NXT extensions start listening for a reply only once their send has resolved.

**Merge notes.** The BT-classic connect began as a local adapter in this lane; in the next7 merge it was folded
into the BLE lane's `connectVirtualHub` (`lib/virtual-hub/connect-virtual-hub.js`) as its BT-classic branch: given
`vm` and a `peripheralId`, it scans → waits for the virtual brick in the peripheral list → connects
(ev3comprehensive through its own set-mode/connect blocks).

## EV3 direct commands

Sources (LEGO's public developer kits, 2013):

- **[CDK]** *LEGO MINDSTORMS EV3 Communication Developer Kit* — §4 *Direct Commands* (frame: two length
  bytes LE, message counter LE, type `0x00` reply / `0x80` no reply, then the allocation: globals in byte 5
  and the two low bits of byte 6, locals in its six high bits), §4.1 *Direct Replies* (length, the
  command's counter, `0x02` DIRECT_REPLY / `0x04` DIRECT_REPLY_ERROR, then the globals as the body), §4.2
  worked examples (their hex is in the tests), §3 system commands (answered SYSTEM_REPLY_ERROR /
  UNKNOWN_SYSTEM_COMMAND: no file system yet).
- **[FDK]** *LEGO MINDSTORMS EV3 Firmware Developer Kit* — §3.4 *Parameter encoding* (short constant
  `00svvvvv`, short variable `01giiiii`, long constants of 1/2/4 bytes and zero-terminated strings, long
  variables), §4.8 input port operations, §4.9 output port operations, §4.10 sound, §4.11 timers, §4.15 user
  interface, opInfo (§4.1), §5 *Device type list*.

Implemented (`ev3-direct-commands.js`): opOUTPUT_POWER, _SPEED, _START, _STOP, _POLARITY, _RESET, _CLR_COUNT,
_GET_COUNT, _READ, _TEST, _READY, _STEP_POWER, _TIME_POWER, _STEP_SPEED, _TIME_SPEED, _STEP_SYNC,
_TIME_SYNC, _GET_TYPE, _PRG_STOP; opINPUT_DEVICE_LIST; opINPUT_DEVICE GET_FORMAT, GET_TYPEMODE, CLR_ALL,
GET_RAW, STOP_ALL, GET_NAME, GET_MODENAME, GET_FIGURES, GET_CHANGES, CLR_CHANGES, READY_PCT, READY_RAW,
READY_SI, GET_MINMAX, GET_BUMPS; opINPUT_READ, _READSI, _READEXT, _TEST, _READY, _WRITE; opSOUND BREAK, TONE,
PLAY, REPEAT, SERVICE, opSOUND_TEST, _READY; opUI_DRAW (drawing recorded as events), opUI_WRITE (LED and
console writes recorded), opUI_READ (battery, versions), opUI_BUTTON; opTIMER_WAIT, _READY, _READ, _READ_US;
opINFO volume and sleep; opNOP. Outputs of an instruction must name a variable (a constant there is an
error, as is a global outside the allocation); an unknown opcode or subcommand ends the command with
DIRECT_REPLY_ERROR and its globals so far. Blocking instructions (OUTPUT_READY, SOUND_READY, TIMER_READY,
WAIT_FOR_PRESS: "can change to BUSYBREAK") hold the reply; the session runs one direct command at a time,
in order, and resumes a blocked one at each published physics batch.

Two notes on the documents: the FDK's opUI_DRAW list omits the COLOR argument its own drawing
subcommands take, and the CDK's worked example §4.2.6 sends it — the table follows the example; and
OUTPUT_GET_COUNT's second argument is a port *number* (the stock Scratch EV3 extension says so beside its
poll), where the FDK writes "output bit field" — a bit field naming one port is accepted as that port.

**The brick** (`ev3-virtual-hub.js`, plain-data state for the worker mirror): outputs A–D take EV3 large
(95658) and medium (99455) motors, inputs 1–4 the EV3 touch, colour, ultrasonic and gyro sensors (the
profile refuses others). Type and mode numbers per [FDK §5]: touch 16 (0 touch, 1 bumps), colour 29 (0
reflected %, 1 ambient %, 2 colour id 0–7, 3 raw, 4 RGB raw), ultrasonic 30 (0 cm to 0.1 cm, 1 inch, 2
listen; 255 cm when nothing echoes), gyro 32 (0 angle, 1 rate, 3 both; the brick body's yaw, clockwise
seen from above positive). Changing a gyro's mode or CLR_CHANGES on it zeroes its angle (CLR_CHANGES is how
ev3comprehensive's *reset gyro* sends it). Two counters per motor: the tacho count OUTPUT_READ reports and
OUTPUT_RESET clears, and the sensor count OUTPUT_GET_COUNT reports and OUTPUT_CLR_COUNT clears.

## NXT direct commands

Sources: LEGO's *LEGO MINDSTORMS NXT Bluetooth Developer Kit* (2006), **Appendix 1** *Communication protocol*
(v1.00: telegram types 0x00/0x01/0x02/0x80/0x81; over Bluetooth two length bytes LSB first precede every
telegram, at most 64 bytes; GET FIRMWARE VERSION 0x88, GET DEVICE INFO 0x9B) and **Appendix 2** *Direct
commands* (v1.00: each command's bytes, the reply layout `0x02, command, status, data`, the status codes);
the *LEGO MINDSTORMS NXT Hardware Developer Kit*, **Appendix 7** *Ultrasonic sensor I2C communication
protocol* (address 0x02; version at 0x00, product id at 0x08, sensor type at 0x10, measurement byte 0 at
0x42, in cm, 255 = nothing). **Verification status:** the EV3 kits were read in full while writing this
(local copies of LEGO's PDFs); the NXT kits were NOT at hand — LEGO's `bdk_download1.zip` no longer
downloads and no archive copy was found that day — so the NXT layouts are written from the appendices'
published command tables as recalled, cross-checked field by field against the Haskell `NXT` library's
documentation (hackage.haskell.org/package/NXT, built on the same appendices) and against what legonxt
itself sends and parses. Re-verify against the PDFs when a copy is found (the reply sizes and the
RESETMOTORPOSITION / I2C register details first).

Implemented (`nxt-direct-commands.js`): STARTPROGRAM (status 0xBD: no `.rxe` here yet), STOPPROGRAM (0xEC),
PLAYSOUNDFILE, PLAYTONE, SETOUTPUTSTATE (port 0–2 or 0xFF), SETINPUTMODE, GETOUTPUTSTATE (25 bytes),
GETINPUTVALUES (16 bytes), RESETINPUTSCALEDVALUE, MESSAGEWRITE, RESETMOTORPOSITION (relative TRUE: the block
tacho count; FALSE: the rotation count), GETBATTERYLEVEL, STOPSOUNDPLAYBACK, KEEPALIVE (the sleep limit),
LSGETSTATUS, LSWRITE, LSREAD (20 bytes), GETCURRENTPROGRAMNAME, MESSAGEREAD; system commands GET FIRMWARE
VERSION and GET DEVICE INFO. Errors keep their reply's full size: unknown opcode 0xBE, illegal size 0xED, bad
port 0xF0, out-of-range power 0xC0, a switch port asked for I2C 0xDD (bus error).

**The brick** (`nxt-virtual-hub.js`): outputs A–C take the NXT motor (53787), inputs 1–4 the NXT touch
(53793), light (55969) and ultrasonic (53792) sensors; the program says what is plugged (SETINPUTMODE), as
on the NXT. GETINPUTVALUES gives raw and normalized A/D values (10 bit) and the scaled value in the port's
mode (boolean with 45/55 % hysteresis, transition and period counts, percent); a pressed touch switch reads
low (estimated raw 183: legonxt's *touch pressed?* compares the normalized value with 500).

## Motor control (both bricks): our model

`hubs/mindstorms-output.js`. LEGO documents what the commands mean, not the firmware's loops, so:

- **unregulated power**: duty = power/100 into the motor's DC model (Philo's numbers, `devices/catalog.js`),
  the off phase braked (NXT: the BRAKE mode bit, "voltage held between PWM pulses");
- **regulated speed** (EV3 OUTPUT_SPEED / *_SPEED cycles, NXT MOTOR_SPEED): the Robot Lab's position-tracking
  speed loop (`spike/spike-motor-controller.js`: a reference angle advancing at the asked speed, PI +
  damping to a duty) — the structure the Lab already validates against the physics. 100 % is the motor's
  no-load speed at 9 V: EV3 large 1050 °/s, medium 1560 °/s (Philo 175/260 rpm; ev3dev documents the same
  `max_speed`), NXT 1020 °/s (Philo 170 rpm). A loaded motor cannot reach it.
- **EV3 cycles** (STEP_*/TIME_*): ramp up over STEP1, constant over STEP2, ramp down over STEP3 (from/to 10 %
  of the level), in tacho counts or ms; the cycle ends when the **encoder** has travelled the total (or the
  time has passed), then brakes or floats. Busy until then.
- **NXT tacho limit**: a regulated move decelerates onto the limit (1500 °/s²) and ends on the encoder within
  1° (4° once the reference is on the limit), then — with BRAKE — **holds** the count until the next
  command; an unregulated one stops at the count. TachoCount restarts at each command with a limit. The 360°
  acceptance is measured as that TachoCount.

## Sensors in the scene

The probes are sensors.js's (a ray for distance, colour and touch). A MINDSTORMS ultrasonic sensor also gets
the echo's own distance (`rangeMm`) outside SPIKE's 50–2000 mm window, so a wall at 3 cm reads 3 cm, not
"nothing". The colour sensor's reflected light is the mat's reflectance (0–100); ambient light is a constant
8 % (estimated). The NXT light sensor uses the RCX's estimated line (30 % over black, 56 % over white).

## Parts (verified in the LDraw library, 2026-09-30)

| Number | LDraw description | Robot Lab |
|---|---|---|
| 95646 | Electric Mindstorms EV3 | the EV3 brick (`hubProfile: ev3`); 95646c01 is the variant with the rechargeable battery |
| 95658 | Electric Mindstorms EV3 Large Motor | `ev3-large-motor` (drive hub 99617c01 turns) |
| 99455 | Electric Mindstorms EV3 Medium Motor | `ev3-medium-motor` (axle hub 99543 turns) |
| 95648 | Electric Mindstorms EV3 Touch Sensor | `ev3-touch` |
| 95650 | Electric Mindstorms EV3 Colour Sensor | `ev3-color` |
| 95652 | Electric Mindstorms EV3 Ultrasonic Sensor | `ev3-ultrasonic` |
| 99380 | Electric Mindstorms EV3 Gyroscopic Sensor | `ev3-gyro` |
| 53788 | Electric Mindstorms NXT (Complete) | the NXT brick (`hubProfile: nxt`) |
| 53787 | Electric Mindstorms NXT Motor | `nxt-motor` (wheel double 54725c01 turns) |
| 53793 | Electric Mindstorms NXT Touch Sensor (Button Not Pressed) | `nxt-touch` |
| 55969 | Electric Mindstorms NXT Light Sensor | `nxt-light` |
| 53792 | Electric Mindstorms NXT Ultrasonic Sensor | `nxt-ultrasonic` |

Connectors and masses derived by `scripts/derive-part-meta.mjs`, completed by hand; colliders fitted to the
parts' 10-LDU slices; motor masses from Philo's weight row (NXT 80 g, EV3 L 82 g, M 39 g); bricks: ABS volume +
six AA cells.

## The examples

- **EV3 wall stopper** (`ev3-wall-stopper.ldr`, Wall mat): the brick between two Technic beams 15, two large
  motors behind it (B left, C right) on 88 mm wheels, free 88 mm front wheels, the ultrasonic sensor on input 4
  looking ahead. Example: `ev3-wall-stopper.bw` (DEVICE EV3: run BC at 40 % until `ev3 distance 4 cm` < 15,
  brake) — see *Known open*. The stock Scratch EV3 blocks drive it (test and gate).
- **NXT bumper bot** (`nxt-bumper-bot.ldr`, Wall mat): the same layout on the NXT and its motors, the touch
  sensor's button as the bumper on input 1. Example: `nxt-bumper-bot.blocks.json` — legonxt blocks (the NXT
  has no DEVICE words yet): set up the touch sensor, B and C 360° at power 75, wait 2 s, B and C on at 60,
  wait until touched, stop both. *Load example program* adds the script to the editing sprite.

## Known open

- **ev3comprehensive sends nothing over Scratch Link** (and nothing reaches its replies on any transport).
  Its `EV3Peripheral.isConnected()` reads `backend.connected`, which its `ScratchLinkBackend` never sets (it
  keeps `_connected`); `sendDirect` uses `this.msgCounter` and `_onMessage` `this.readBuffer`, both never
  initialised (the constructor sets `messageCounter`). The fix is upstream (CrispStrobe/extensions,
  `ev3_universal.js`): initialise `msgCounter = 0` and `readBuffer = new Uint8Array(0)`, and read
  `backend.connected || backend.isConnected?.()`. This lane does not edit extension sources (the rule), so the
  DEVICE EV3 wall-stop scenario is `{todo}` in `test/bw-sim-bt-hubs-program.test.mjs`; the bytes the
  extension would send are executed and checked in `test/bw-sim-ev3-extension-bytes.test.mjs`, and the stock
  `ev3` extension drives the same robot.
- **L2, programs on the brick**: the EV3's RBF bytecode VM (the same instruction set, the FDK's §4 in full,
  plus the program header and subcalls) and the NXT's `.rxe` VM (LEGO's *Executable File Specification*,
  v2.0, in the NXT SDK) are the next step. legonxt's compiled route uses a hosted NXC compiler (network) and
  is kept out of tests.
- **NXT words** (DEVICE NXT pseudocode) are not written; the NXT example is blocks.
- The ultrasonic *listen* modes read 0; buttons are never pressed in the Lab (WAIT_FOR_PRESS waits); EV3
  sync turn ratios and NXT MOTOR_SYNC are simple scalings (our model); the stock EV3 extension reads distance
  in inches (its mode 1) and caps it at 100.

## Tests and gate

`test/virtual-bt-classic-registry.test.mjs` (the registry), `test/bw-sim-ev3-direct-commands.test.mjs` and
`test/bw-sim-nxt-direct-commands.test.mjs` (frames written out from the kits, replies, errors, blocking,
mirror round trips), `test/bw-sim-ev3-extension-bytes.test.mjs` (ev3comprehensive's own bytes on the brick),
`test/bw-sim-bt-hubs-program.test.mjs` (the real VM and extensions in the Lab: NXT 360 ± 2° and stop on touch;
EV3 stop before the wall), the browser gate `npm run verify:sim-lab -- --part=hubs-bt`.
