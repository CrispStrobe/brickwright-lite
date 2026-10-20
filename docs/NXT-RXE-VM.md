# The Virtual NXT's program VM (`.rxe`)

NXC (or NBC, or NXT-G) programs compiled to an NXT executable, `.rxe`, run on the Robot Lab's Virtual NXT:
a host downloads the file with the brick's system commands, starts it with STARTPROGRAM, and the program
drives the scene's motors and reads its sensors through the same brick state the direct commands use.
This is the NXT half of *L2, programs on the brick* (docs/ROBOT-LAB-EV3-NXT.md).

| Piece | File |
|---|---|
| File reader and checks | `overlay/scratch-gui/src/lib/bw-sim/routes/nxt-vm/rxe-file.js` |
| Instruction set, IO-map fields (data) | `routes/nxt-vm/nxt-bytecodes.js` |
| Interpreter, scheduler, dataspace, IO maps | `routes/nxt-vm/nxt-vm.js` |
| System calls | `routes/nxt-vm/nxt-syscalls.js` |
| Flash files (download) | `hubs/nxt/nxt-files.js`, system commands in `hubs/nxt/nxt-direct-commands.js` |
| The brick: program start/stop, output module, device reset | `hubs/nxt/nxt-virtual-hub.js` |
| Fixtures (NXC sources and NBC's `.rxe`) | `test/fixtures/nxt-rxe/` (README: how they were compiled) |
| Tests | `test/bw-sim-nxt-rxe-vm.test.mjs`, `test/bw-sim-nxt-rxe-brick.test.mjs`, `test/bw-sim-nxt-rxe-legonxt.test.mjs` |

The VM follows the RCX VM's architecture (`routes/rcx-vm/`): a pure route module (no DOM, physics or hub),
step-driven by the hub's `advanceTo()`, its whole state plain JSON (`snapshot()` / `restore()`), so the physics
worker's mirror redoes a batch exactly. It lives under `bw-sim`, in the lazy Robot Lab chunk; nothing eager
imports it.

## Sources and licences

| Key | Source | Revision read | Licence | Used for |
|---|---|---|---|---|
| **FW** | LEGO MINDSTORMS NXT firmware 1.29 as LEGO released it: the `lego-1.29` tag of `schodet/nxt-firmware` ("import firmware from LEGO v1.29"), `AT91SAM7S256/Source/` | `495cc1d` | LEGO Open Source License (`LEGO Open Source License.doc` in that tree) | everything below marked FW |
| **FWI** | `schodet/nxt-firmware` master ("NXT Improved Firmware" 1.29.8) | `f309220` | as FW | only to check that SQRT/ABS are in LEGO's own 1.29 (they are) and that the integer SQRT/REPLACE behaviour below is unchanged there |
| **PF** | docs/NXT-PROTOCOL-FACTS.md (BDK appendices, the same firmware) | — | — | telegrams, statuses, direct commands |
| **NBC** | NBC/NXC as run by the owner's hosted compiler (`lego-compiler.vercel.app`, CrispStrobe/legacy-lego-compiler; NBC MPL-1.1, wrapper MIT) | 2026-10-20 | MPL-1.1 (the compiler); its output is our programs' | the fixtures: what NBC emits ("firmware version 128, enhanced = FALSE") |

**Facts only, in our own words and structure.** Firmware and NBC were read as fact sources: opcode numbers,
field orders, statuses, sizes and behaviours. No code, table, comment or text of them is in this repository;
the VM is written in its own structure (plain-data state, JS arrays for queues and for each array's storage,
one place type for "where a value lives"). The sources were cloned to a scratch directory and deleted after.
No LEGO PDF and no third-party file is committed. NBC was not read; it was run (hosted), and its output files
are the fixtures. nxt-python, NXOS and other GPL sources were not consulted for the VM.

All FW references are `AT91SAM7S256/Source/<file>:<line>` at `495cc1d`.

## §File (rxe-file.js)

- Header: 16 bytes — `MindstormsNXT`, a zero, then the format version major, minor (`c_cmd.iom:154–159`;
  `c_cmd.c:1413–1440`: the format string is compared over its 14 bytes; major and minor come from bytes 14, 15).
  Refused as **ERR_VER** (-4) when the string differs, `major < 0`, `minor < 4` (the oldest compatible 0x0004,
  compared byte by byte, so 1.0 would be refused too) or `major >` the firmware's 1 (`c_cmd.c:1427–1440`;
  firmware version 0x011D, `c_loader.iom:24`). NBC writes 0.6.
- Then 11 UWORDs: dataspace entries, dataspace bytes, static bytes, defaults bytes, dynamic-defaults offset and
  size, memory-manager head and tail, dope-vector array offset, clump count, code words (`c_cmd.c:1445–1499`).
  **ERR_FILE** (-3) for 0 clumps or ≥ 255 (the "no clump" 0xFF), and for 0 code words (`:1488`, `:1497`).
- Sections, each starting on an even byte: TOC (4 bytes: type, flags, UWORD offset), defaults, clump records
  (4 bytes: fire count, dependent count, UWORD first code word), the dependents (a byte each), code. The sections
  must end exactly where the code (2 × code words before the end of the file) starts, else ERR_FILE (`:1505–1540`).
- Clump records and dataspace must fit the 32 KB pool (`POOL_MAX_SIZE`, `c_cmd.iom:149`; `c_cmd.c:1573`):
  ERR_FILE. A clump record's size there (28 bytes) is our arithmetic of the firmware's struct on ARM7
  (`c_cmd.h:370–381`).
- Activation (`c_cmd.c:1655–1886`): clumps with fire count 0 start queued; none → ERR_FILE (`:1806`). The static
  defaults are inflated walking the top-level TOC entries: each scalar (an array: its UWORD dope-vector index; a
  cluster: its members) takes its bytes from the defaults unless flagged `DS_DEFAULT_DEFAULT` (0x01, zero)
  (`c_cmd.h:217`; `c_cmd.c:1584–1638`); a type code above FLOAT is ERR_INSTR. The bytes taken must equal the
  dynamic-defaults offset, and offset + size the defaults size (`:1827`), else ERR_FILE. The dynamic defaults land at
  the static size; dope vector 0 is the array of dope vectors itself and must sit where the header says (`:1845`).
- Types (`c_cmd.h:123–140`): void, UBYTE, SBYTE, UWORD, SWORD, ULONG, SLONG, array, cluster, mutex, float; a
  cluster's TOC "offset" is its member count; an array entry is followed by its element's entries
  (`c_cmd.c:3556–3590`). A dope vector is Offset, ElemSize, Count, BackLink, Link (`c_cmd.h:252–259`).

## §Interpreter (nxt-vm.js)

- Instruction word (`c_cmd.h:622–629`): bits 12–15 the size in bytes (0xE: the size is the next word), bit 11
  the short-op flag, bits 8–10 a comparison code (or the short op), the low byte the opcode (`c_cmd_bytecodes.h:7–94`,
  0x00 ADD … 0x37 ABS; LT GT LTEQ GTEQ EQ NEQ = 0–5). Short ops (`c_cmd_bytecodes.h:103–110`; `c_cmd.c:5540–5672`):
  MOV (destination = source + the signed low byte; 2 words), ACQUIRE / RELEASE (the signed byte is the mutex; 1 word),
  SUBCALL (callee clump = return variable + the signed byte; 2 words).
- Dispatch by size (`c_cmd.c:108–126`): 4 bytes one operand, 6 two, 8 three, 10/12/variable "other"; any other size
  ERR_INSTR. Jumps are relative to the instruction, in words (`:4246`, `:4447`, `:5145`).
- A clump runs 20 instructions (`INSTR_MAX_COUNT`, `c_cmd.h:367`; `c_cmd.c:1299`) before the run queue rotates;
  the firmware keeps running clumps until the millisecond is over (`:4119–4228`, `:1211–1265`). Waiting
  (`OP_WAIT`, `:4727`): 0 ms rotates the queue; otherwise the clump rests until tick + ms (`:2231–2259`), and the
  destination (if wired) gets the current tick. Mutexes (`:2177–2229`): a held mutex parks the clump in its queue;
  release hands it to the first waiter. FINCLUMP schedules dependents begin..end, each running when its fire count
  reaches zero; a finished clump is re-armed at its start with its initial fire count (`:2261–2311`, `:4159–4164`).
  SUBCALL stores the caller's number in a byte and queues the callee; SUBRET queues the caller (`:4485–4492`, `:4271–4280`).
  The program ends when no clump is queued or resting (`:1225–1232`). FINCLUMP: `:4476`.
- Arithmetic (`c_cmd.c:5369–5452`): 32-bit registers; DIV/MOD signed only where an operand's type is signed;
  **x / 0 = 0, x % 0 = x**. Values read sign-extended (`:3391–3436`), stored truncated to the type. Comparisons are
  unsigned if either type code is odd (UBYTE, UWORD, ULONG) (`:3857–3880`). NOT is logical. A float read as an
  integer rounds half away from zero (`:3427–3436`). **SQRT on integers yields 0** — the integer path has no root,
  only the float path does (`:4901–4924`, FWI the same).
- Polymorphic operations (`:4755–4898`, `:5216–5366`): scalars directly; arrays element by element (the destination
  resized to the shorter source); clusters member by member; same-integer-type arrays copied whole (`:4807`, `:5603`).
  CMP of two aggregates into a scalar compares them as wholes, element by element then by count (`:3894–4024`);
  BRCMP does so for anything not two integers (floats then as rounded integers).
- Arrays: INDEX out of range is **ERR_ARG** (the program stops, `:5162–5170`); REPLACE beyond the end is no
  operation, and **a new value that is an array replaces that many elements by its elements** (`:5780–5846`); ARRSUBSET `:5849` —
  so NXC's `grid[1][2] = 9` on a 2-D array writes numbers into array elements, which stores nothing (the fixture
  `arrays-strings` shows it; FWI unchanged). ARRSUBSET / STRSUBSET / ARRBUILD / STRCAT / ARRINIT, growing arrays of
  arrays with fresh sub-arrays (`:2344–2540`, element sizes `:2740–2772`), STRTOBYTEARR / BYTEARRTOSTR, NUMTOSTRING
  (`%d` / `%u`; floats `%.2f` with trailing zeros dropped, `:4591–4688`), STRINGTONUM (a number from the offset; the
  offset past it; the default when none, `:6206–6268`).
- IO maps (`c_cmd.c:216–289`, `:4967–5010`, `:5675–5744`; field orders `c_cmd.h:166–200`): inputs 6 fields a port
  (type, mode, raw, normalized, scaled, invalid), outputs 15 (flags, mode, speed, actual speed, tacho count, tacho
  limit, run state, turn ratio, regulation mode, overload, P, I, D, block tacho count, rotation count). SETOUT takes a
  port or an array of ports and (field, source) pairs; a port ≥ 3 is no operation.

## §Outputs (the output module; nxt-virtual-hub.js `applyProgramOutput`)

Once a millisecond the output module applies a port's FLAGS (`c_output.c:62–137`; flags `c_output.iom:33–40`):
reset rotation count, reset tacho count (and the move's target), reset block count, then speed (if MOTORON), tacho
limit, mode. The IO map's run state is refreshed from the driver unless PENDING (0x80) is set (`:139–164`), so a
program reading the run state right after SETOUT sees what it wrote. The brick applies them with the same
`setOutputState` the direct command uses (a new tacho limit only with UPDATE_TACHO_LIMIT). Before a program runs
and after it ends, the brick resets its devices: outputs off and floating, all counters reset; inputs unconfigured
(`c_cmd.c:1940–1997`) — here at once (the firmware waits for its UI after a normal end).

## §Inputs

SETIN of type or mode configures the port; the input module marks data invalid for 20 passes (300 for the sound
sensor) after a type change, and clears a program-set invalid flag on its next pass (`c_input.c:25–27`, `:227–283`).
NXC's SetSensor… waits on that flag.

## §Syscalls (nxt-syscalls.js)

The table is 48 calls (`c_cmd.h:30`; order `c_cmd.c:159–211`). Implemented, with the firmware's argument orders
(`c_cmd.c:6707–7280`, `c_cmd_drawing.inc:197–790`):

| Id | Call | Here |
|---|---|---|
| 9 | SoundPlayFile | the brick's sound event |
| 10 | SoundPlayTone | the brick's tone (frequency, ms) |
| 11, 12 | SoundGetState / SetState | tone running or idle; STOP stops it |
| 13–17 | DrawText / Point / Line / Circle / Rect | recorded as `display` events (no LCD model) |
| 19 | SetScreenMode | recorded |
| 20 | ReadButton | never pressed (the Lab has no buttons); index ≥ 4 is ERR_INVALID_PORT |
| 21–23 | CommLSWrite / Read / CheckStatus | the brick's I²C channel (ultrasonic sensor); not LOWSPEED or invalid → ERR_COMM_CHAN_NOT_READY, port ≥ 4 → ERR_COMM_CHAN_INVALID, > 16 bytes → ERR_INVALID_SIZE (`c_cmd.c:6312–6440`) |
| 24 | RandomNumber | a deterministic 16-bit generator (ours; the brick uses its C library's `rand`) |
| 25 | GetStartTick | the program's start tick |
| 26, 27 | MessageWrite / MessageRead | the brick's 20 × 5 queues (the same the direct commands reach); > 59 bytes ERR_INVALID_SIZE (`:2965–3104`) |
| 31 | KeepAlive | the sleep limit, ms |

Not implemented (the program stops with **UNIMPLEMENTED_SYSCALL** naming the call): files (0–8, 47), DrawPicture
(18), Bluetooth (28–30, 35, 36), IOMapRead/Write (32, 33), ColorSensorRead (34), RS-485 (37–39), Read/WriteSemData
(40, 41), calibration (42, 43), datalog (44, 45), SetSleepTimeout (46). An id ≥ 48 is the firmware's ERR_INSTR.

## Opcodes

Implemented: ADD SUB NEG MUL DIV MOD AND OR XOR NOT, CMP TST, INDEX REPLACE ARRSIZE ARRBUILD ARRSUBSET ARRINIT,
MOV SET, NUMTOSTRING STRINGTONUM STRCAT STRSUBSET STRTOBYTEARR BYTEARRTOSTR, JMP BRCMP BRTST SYSCALL STOP, FINCLUMP
FINCLUMPIMMED ACQUIRE RELEASE SUBCALL SUBRET, SETIN SETOUT GETIN GETOUT, WAIT GETTICK SQRT ABS, the four short ops;
floats in the arithmetic, comparisons, moves and NUMTOSTRING.

Not implemented: FLATTEN, UNFLATTEN (**UNIMPLEMENTED_OPCODE**). CMNT, LSL, LSR, ASL, ASR, ROTL, ROTR, CMPSET,
TSTSET are listed by the firmware but executed by none of its interpreters — ERR_INSTR, as on the brick (NBC emits
shifts as MUL/DIV for standard firmware). Errors stop the program with `{code, status, message, clump, pc, opcode}`
in `vm.error` and an `error` event; the brick then resets its devices.

## §Files (system commands; nxt-files.js)

Layouts (FW `c_comm.c:489–783`; PF §System): OPEN WRITE 0x81 (name 20, size ULONG) → status, handle; WRITE 0x83
(handle, data) → status, handle, count UWORD; CLOSE 0x84 → status, handle; DELETE 0x85 (name) → status, name 20;
OPEN READ 0x80 → status, handle, size ULONG; READ 0x82 (handle, count UWORD) → status, handle, count, data
zero-padded; FIND FIRST 0x86 (pattern) / FIND NEXT 0x87 (handle) → status, handle, name 20, size ULONG, zeros after
the handle on an error. OPEN WRITE LINEAR 0x89 is accepted as OPEN WRITE. Loader statuses (`modules.h:40–61`, the
high byte): 0x8F FILE EXISTS, 0x87 FILE NOT FOUND, 0x8B FILE IS BUSY, 0x84 END OF FILE EXPECTED (written past the
size), 0x85 END OF FILE, 0x88 HANDLE ALREADY CLOSED, 0x93 ILLEGAL HANDLE, 0x81 NO MORE HANDLES (16), 0x82 NO
SPACE. A file is kept only if written completely before CLOSE (`d_loader.c:326–448`, `:450–520`, `:557–633`); the
running program and open files cannot be deleted (`:691–705`, `:1128–1143`).

Ours: user flash 64 KB (GET DEVICE INFO reports what is free); READ answers at most 58 bytes (what fits a 64-byte
telegram — the firmware's Bluetooth path goes into an extended mode instead); a telegram too short for its system
command is UNDEFINED ERROR (0x8A); FIND matches name and extension each exactly or `*`.

STARTPROGRAM (FW `c_cmd.c:398–417`; PF): a missing file is 0xC0; an existing one is accepted (status 0) and
activated — a file the VM refuses never runs (`hub.s.lastProgram`, a `program-refused` event). A running program is
stopped first. STOPPROGRAM without a program is 0xEC; GETCURRENTPROGRAMNAME names the running program; the
mailboxes exist only while one runs.

## Time model (ours)

The brick runs instructions until each millisecond is over; the VM gives each millisecond a fixed budget
(`instrPerMs`, default 20 — an order-of-magnitude estimate, not a measurement; a hub option `{vm: {instrPerMs}}`).
Only busy loops depend on it. Ticks, waits and the output/input modules run per exact millisecond on the Lab's
clock; a physics step's sensor readings hold for the VM's milliseconds inside it.

## legonxt

legonxt's upload (DELETE, OPEN WRITE, 32-byte WRITEs, CLOSE) and its *start program* block run the program on the
Virtual NXT (test: `bw-sim-nxt-rxe-legonxt.test.mjs`, the bumper bot). Its compile step calls `Scratch.fetch`,
which the CrispStrobe adapter's `Scratch` object (`overlay/scratch-vm/src/extensions/crispstrobe/adapter.js`)
provides since 2026-10-20 as TurboWarp and the extension worker do (a fetch wrapper); the same test runs its whole
workflow block — transpile, compile through `Scratch.fetch` (the network stubbed with the committed `.rxe`),
upload, start.

## Open / not modelled

- NBC's Float/Coast leave the BRAKE bit set with MOTORON off; the brick model (PR #1111's) brakes such a port.
  What the firmware's driver does there decides whether NXC's Float coasts on the Virtual NXT.
- A regulated command at power 0 (how NXC's RotateMotor ends a move) holds the shaft where the command finds it
  (our model of the speed loop at set speed 0; `nxt-virtual-hub.js`).
- Direct commands that change an output while a program runs bypass the program's IO map (the firmware writes
  both into one map).
- Floats converted to integers: truncated toward zero (the firmware's conversion of negative floats into unsigned
  registers is not defined by its source). FLATTEN / UNFLATTEN, file and Bluetooth system calls, the display as
  pixels, buttons, NXT-G's semaphore calls.
- The instruction rate (above); the firmware's RAMPUP / RAMPDOWN and synchronised regulation (the brick's model).
