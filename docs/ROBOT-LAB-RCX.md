# Robot Lab: the RCX (slice R5)

Status (2026-10-19): **the RCX runs in the Robot Lab.** NQC (the NQC tab, or the RCX blocks'
generated NQC) → the in-browser `nqc-wasm` → `.rcx` → `runtime.rcxDownload` with "Robot Lab RCX"
chosen as its target → the clean-room bytecode VM below, resident in the scene's RCX on the Lab's
one clock → the mini-motors' DC model and the touch, light and rotation sensors' probes. Owner
item: ROADMAP §4.10; plan: docs/ROBOT-LAB-HUBS-PLAN.md phase "RCX". Design context:
docs/ROBOT-LAB-ARCHITECTURE.md §3.3, §3.5, §5.1, §6.4, §7 R5 and owner decision D4.

## The hub (2026-10-19)

| File | What it is |
|---|---|
| `hubs/rcx/profile.js` | the RCX as a HubProfile: outputs A–C (`rcx-output`, motor/lamp, 9 V, 8 PWM levels), inputs 1–3 (`rcx-input`, passive/active sensors), drive `pwm`, part `76454c02.dat` |
| `hubs/rcx/rcx-virtual-hub.js` | the VirtualHub: `advanceTo(t)` runs the VM exactly to t; outputs → PortDrives; probes → raw ADC values; `exportState` carries the image, the VM snapshot and the held inputs, so the physics worker's mirror redoes a batch bit-identically (tested) |
| `hubs/rcx/rcx-lab-target.js` | "Robot Lab RCX": the virtual `rcxDownload` target (loads the image, starts it unless `run: false`) |
| `lib/rcx/rcx-targets.js` | the target registry the download hook consults: the user's **explicit** choice (`runtime.rcxDownloadTarget`, or `options.target`), default the IR tower; a chosen target that is gone refuses, never falls back |
| `devices/rcx-sensors.js` | probe → raw 10-bit value per RCX sensor |
| `kinds/rotation-sensor.js` | connector kind `sensor-axlehole`: the rotation sensor's turning insert; an axle in it is a hinge, which `sensors.js` reads as the sensor's angle |

**Outputs.** `on` at power p → a `pwm` drive of duty ±(p+1)/8 with `coast` decay; `off` → brake
(winding shorted); `float` → coast. The standard firmware rotates an 8-bit pattern per output every
millisecond (00000001 … 11111111 for power 0 … 7) and floats the motor in its clear bits ("on-float-
on-float; brake is not used": Dick Swan, LUGNET robotics #17185, 2002 — community, from the ROM; his
prose says power 4 is "on for 4 msec", his table gives 5; the table is used). The 8 ms pattern is
applied as its average; `physics/actuators.js` now gives a `coast`-decay PWM the back-EMF damping
only for the driven fraction, τ = d·τs − |d|·(τs/ω0)·ω. Consequence, as on a real RCX: an unloaded
motor turns at its no-load speed at every power level and the level sets the torque (tested on a
bench: the wheel reaches Philo's 360 rpm at powers 0, 1, 3, 7, and the first-step response scales
with (p+1)/8 to 2 %).

**Inputs.** Touch (879, `75973.dat`): the SPIKE force probe along the button; pressed → raw 40
(a switch to ground; estimated), released → 1023. Light (9758, `72634.dat`): the colour probe's
reflectance R (mat colour, falling off with the 32 mm reach) → percent 30 + 26·R/100 (black … white
paper; **estimated** from builders' reports, not measured) → raw = 7·(146 − percent), the inverse of
the firmware's percent scale (Gasperi, quoted on LUGNET robotics.rcx.legos #2539 — community). On
the line-oval mat at 8 mm: white ≈ 51 %, black ≈ 31 %. Rotation (2977, `72632.dat`): the angle of
the hinge through the sensor's hole (`sensors.js rotationJoint`), 16 counts a turn truncated toward
zero, passed to the VM as `{raw, rotation}`.

**Parts** (LDraw 2026-09-30, vendored by `sync:ldraw`, connectors derived by
`scripts/derive-part-meta.mjs` and completed by hand): 76454c02 RCX 2.0 (BrickLink 884c; 46 studs,
the 8 × 12 anti-stud grid, four side pin holes; 258 g = the derived shell plus six AA cells, an
estimate), 71427 Technic mini-motor 9 V (BrickLink 71427c01; its output axle u9345 is the internal
hinge, device `technic-minimotor-71427` with Philo's numbers), 75973 touch sensor (BrickLink 879;
its two 4 LDU back holes are left out: shallower than any seat), 72634 light sensor, 72632
rotation sensor. 884 is LDraw's obsolete shortcut and 2838c01 moved to 74569p01 (the 9 V motor, in
the catalogue as a device, not yet a part).

**Example** (`static/sim-lab/models/rcx-bumper-car.ldr`, two MODELS entries): see docs/SIM-LAB.md.
Test fixtures: `test/fixtures/bw-sim/rcx-rotation-bench.ldr` (a motor's output in a rotation
sensor), `rcx-wheel-bench.ldr` (a wheel turning in the air).

**Tests** (`test/bw-sim-rcx-hub.test.mjs`): profile/registry/refusals; the explicit download target
(tower by default, nothing reaches the Lab without the choice, a gone target refuses); the shipped
bumper car (reaches the wall, the bumper presses, reverses on the next VM turn, backs off > 10 cm,
stops braked); the shipped line follower (one lap, centre within the half track, light raw on
white and black = the device model at the probe's height, the example's threshold between them);
power levels vs the DC model; rotation counts vs the hinge angle; the mirror hub's replay.
`test/bw-sim-hub-boundary-imports.test.mjs`: the RCX adapter reaches the VM and no physics; the
download hook reaches no Robot Lab module.

**Not modelled / missing:** the 60 ms pause on a direction change (Firmware Command Overview
p. 101), the 500 mA output current limit and battery sag; the light sensor's percent line is an
estimate and ambient light is ignored; sensor sample timing (3 ms scan) is per physics step;
the rotation sensor's analog phase levels; temperature sensor, lamps, the IR link to other bricks,
sound as audio and the LCD (recorded as events, `hub.events`); the 9 V motor 2838 as a part; the
pane shows no RCX readouts yet. `contracts.js` (the physics lane's file) gained two words to make
this possible: input ports `1`–`4` in `HUB_PORTS` and `rotation` in `SENSOR_KINDS`.

## The VM

Code: `overlay/scratch-gui/src/lib/bw-sim/routes/rcx-vm/`

| File | What it is |
|---|---|
| `rcx-bytecode.js` | the opcode table (length, name, `nqc -L` mnemonic), operand source types, sensor type/mode codes, branch relations and the four branch-offset encodings — data only |
| `rcx-program.js` | loads an `.rcx` image through `lib/rcx/rcx-protocol.js` `parseRcxImage` (the same parse the IR download sends to a real brick), files tasks 0–9 and subroutines 0–7 by number, refuses non-RCX targets, fingerprints the program |
| `rcx-vm.js` | the interpreter: `load`, `run`, `advance(ms, ports)`, `snapshot`/`restore`, `inputConfig`, `drainEvents` |

Tests: `test/bw-sim-rcx-vm.test.mjs` (headless, no Jolt).

## The route

NQC source → `lib/nqc-wasm` (the shipped WASM NQC 3.2 r1; it runs in Node, so the tests compile
real source at test time and nothing is checked in) → `.rcx` image → `RcxVm` → ports.

## Sources (clean room, owner decision D4)

1. LEGO MINDSTORMS RCX 2.0 SDK, "RCX 2.0 Firmware Command Overview" — **from memory**; no copy
   was available and none was downloaded. Title and edition as remembered.
2. The in-repo NQC's own `-L` listings of programs compiled for this work (NQC was run, its
   source was not read). Every operand layout and branch encoding in `rcx-bytecode.js` was
   checked this way, by compiling programs with known control flow and reading where each branch
   lands. Where the listing and the bytes disagree (it prints some unsigned forward offsets of
   `chk`/`loopc` as negative), the bytes win.
3. The public NQC Programmer's Guide (Dave Baum, 3.x) for API meaning — **from memory**.

No firmware image, no GPL emulator, no brickEmu, legOS or brickOS code was consulted.

## What is implemented

- **Program model:** 10 tasks (task 0 starts on `run()`), 8 subroutines (one call level; a nested
  call is an error, as NQC forbids it), 32 globals + 16 locals per task (vars 32–47, RCX2), RCX 1
  loop-counter stack (`loops`/`loopc`) and RCX2 `decvjn`/`decvjnl` repeat counters. Starting a
  running task restarts it; falling off a chunk's end ends the task or returns from the
  subroutine (NQC emits no explicit end or return opcode).
- **Opcodes** (by `nqc -L` mnemonic): `pwr dir out` (outputs), `sent senm senz` (sensors), `wait
  tmrz`, `setv sumv subv divv mulv sgnv absv andv orv`, `set` (RCX2; var and timer destinations),
  `chk chkl jmp jmpl decvjn decvjnl loops loopc calls`, `start stop` (task and all), `setp`,
  and as **recorded events** (no audio, no LCD): `plays playt view disp msg msgz logz log setw
  tout txs`.
- **Sources:** variable, timer (100 ms), fast timer (10 ms, RCX2), constant, output status,
  random (0..n, deterministic seeded LCG), program slot, sensor value/type/mode/raw/boolean, watch,
  message, battery level.
- **Outputs:** `{mode: 'on'|'off'|'float', direction: ±1, power: 0..7}` per A–C; `off` is brake.
  Initial state float, forward, power 7 (NQC's start-up code sets power 7 forward explicitly).
- **Sensors:** raw 0–1023 in; types none/touch/temperature/light/rotation (light and rotation are
  reported `active` for the device model); modes raw, boolean, edge count, pulse count, percent,
  Celsius (tenths), Fahrenheit (tenths), rotation; slope (boolean by rate of change).
- **Errors:** an unknown opcode, a known-but-unimplemented RCX2 opcode (named: `SetEvent (sete,
  0x93)`…), a bad operand, a truncated instruction or a jump out of the chunk puts the VM in
  `status: 'error'` with `{code, message, task, subroutine, pc, opcode}`, stops every task,
  floats the outputs and records an `error` event. Never silent.

## Time and I/O contract (the port boundary)

`vm.advance(ms, ports)` runs until simulated time `t + ms`:

- `ports.inputs[0..2]`: the raw ADC value of inputs 1–3, or `{raw, rotation}` for a rotation
  sensor (`rotation` = its cumulative count, 16 per turn). Sampled once on entry and held for the
  call (zero-order hold).
- `ports.outputs[0..2]` is written at the end, and the same array is returned.
- Integer microseconds throughout: fully deterministic. Each instruction costs `instrUs`
  (default **250 µs, i.e. 4 instructions per ms, ~4000/s shared round-robin by the running
  tasks**). That is an order-of-magnitude figure for the standard firmware (community timings, from
  memory), not a measurement; it is an option because only busy loops depend on it. A waiting
  task costs nothing and an idle VM jumps to the next wake-up. An instruction runs only if it fits
  before the target, so the VM never runs ahead of physics, and `advance(a) + advance(b)` executes
  exactly what `advance(a + b)` does (tested).
- `snapshot()` is plain JSON-safe data (it survives `structuredClone`); `restore()` refuses a
  snapshot of another program. Restore + advance is bit-identical to continuing (tested).

## Uncertain (memory-based or unpinned by the listings)

Each is a single constant or branch in `rcx-vm.js` marked "(memory)" or "uncertain":

- ~~boolean thresholds~~ — verified 2026-10-19 against LEGO's "RCX 2.0 Firmware Command Overview"
  (2000-07-04, BrickBot Archive): "Sensor bool: the raw value, with thresholds and hysteresis at
  45/55 %" = raw 460 / 562. The same document confirms the angle sensor's 1/16 ticks, the slope
  sampling interval ("dt is fixed 3 ms") and the default modes per sensor type;
- slope mode: a fall faster than `slope` per sample → true, a rise → false; sampled once per
  `advance`, not at the firmware's own input scan rate (~3 ms, also memory);
- pulse mode counts true → false transitions; edge mode counts both;
- percent = 146 − raw/7 clamped to 0..100; Celsius tenths = (785 − raw)·10/8;
- output-status bits (0–2 power, 3 forward, 6 brake, 7 on);
- timers wrap as int16 independently (Timer and FastTimer derive from one clear time);
- division truncates toward zero; division by zero leaves the variable unchanged;
- `decvjn`/`loopc` exit when the decremented counter goes negative (gives the right iteration
  count for every `repeat(n)` with n ≥ 0; the firmware's behaviour for n < 0 is not pinned);
- `StopAllTasks` leaves the outputs as they are; a VM error floats them (a choice, not the
  firmware's behaviour — a real brick does not hit unknown opcodes in NQC output);
- `SetPriority` is recorded but does not affect scheduling (it orders `acquire`, which is not
  implemented); scheduling is plain round-robin, one instruction per turn;
- the instruction rate (above).

## Missing

- RCX2 **events and access control**: `SetEvent`, `monitor`/`catch`, `acquire`, event sources,
  counters — refused with `UNSUPPORTED_OPCODE` naming the opcode. Global output control
  (`SetGlobalOutput`, `SetGlobalDirection`, `SetMaxPower`) likewise.
- Opcodes NQC was not seen to emit in the probe programs (e.g. far `loopc`, datalog upload,
  `Set` to destinations other than variable/timer) → `UNKNOWN_OPCODE` / `UNSUPPORTED_OPERAND`.
- Decoding the rotation sensor's analog phase levels into counts (the device model must supply
  counts), the light sensor's LED, sensor sample-and-hold timing.
- Scout/CyberMaster images (refused at load: different firmware).
- (Done 2026-10-19: the hub side — see "The hub" above.)
