# Robot Lab: the RCX bytecode VM (slice R5, first part)

Status: **the VM is built and tested; nothing in the app uses it yet.** It is a pure route module
waiting for its hub adapter (`hubs/rcx/rcx-virtual-hub.js`, after slice R1's `VirtualHub` lands).
Owner item: ROADMAP §4.10. Design context: docs/ROBOT-LAB-ARCHITECTURE.md §3.3, §3.5, §5.1, §6.4,
§7 R5 and owner decision D4.

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

- boolean thresholds: true below raw 460, false above 562, unchanged between;
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
- The hub side of R5: `hubs/rcx/` profile and `RcxVirtualHub`, the RCX device models, the
  virtual `rcxDownload` target, the worker residency, and the cross-route acceptance tests.
