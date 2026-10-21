# The Virtual EV3's program VM (`.rbf`)

EV3 programs assembled to LEGO's byte-code image, `.rbf` (lmsasm, or anything that writes the same
format), run on the Robot Lab's Virtual EV3: a host downloads the file with the brick's **system
commands**, loads it with **opFILE LOAD_IMAGE** and starts it with **opPROGRAM_START** in the user slot
(the direct command LEGO's Communication Developer Kit shows for this, §4.2.1), and the program drives the
scene's motors and reads its sensors through the same brick the direct commands use. This is the EV3 half
of *L2, programs on the brick* (docs/ROBOT-LAB-EV3-NXT.md); the NXT half is docs/NXT-RXE-VM.md, whose
architecture this follows.

| Piece | File |
|---|---|
| Image reader and checks | `overlay/scratch-gui/src/lib/bw-sim/routes/ev3-vm/rbf-file.js` |
| Instruction set as data (opcodes, subcommands, slots, states) | `routes/ev3-vm/ev3-bytecodes.js` |
| Interpreter, scheduler, variables, arrays, strings | `routes/ev3-vm/ev3-vm.js` |
| The input/output/sound/UI/timer instructions (shared with the direct commands) | `hubs/ev3/ev3-direct-commands.js` (`INSTRUCTIONS`) |
| File system | `hubs/ev3/ev3-files.js` |
| System commands (file transfer) | `hubs/ev3/ev3-system-commands.js`, routed by `hubs/ev3/ev3-peripheral.js` |
| The brick: LOAD_IMAGE, PROGRAM_START/STOP/INFO, the program's end | `hubs/ev3/ev3-virtual-hub.js` |
| Fixtures (lmsasm sources and the hosted assembler's `.rbf`) | `test/fixtures/ev3-rbf/` (README: how they were assembled) |
| Tests | `test/bw-sim-ev3-rbf-vm.test.mjs`, `test/bw-sim-ev3-rbf-brick.test.mjs`, `test/bw-sim-ev3-rbf-ev3comprehensive.test.mjs` |

Like the NXT VM, it is a pure route module (no DOM, physics or hub), stepped by the hub's `advanceTo()` in
1 ms steps, its whole state plain JSON (`snapshot()` / `restore()`) so the physics worker's mirror redoes a
batch exactly. It lives under `bw-sim`, in the lazy Robot Lab chunk; nothing eager imports it.

**One instruction, one implementation.** A program's input, output, sound, user-interface, info and
program instructions are executed by the direct commands' own table (`INSTRUCTIONS` in
ev3-direct-commands.js) against the same brick methods; the VM adds the instructions only a program has —
objects and calls, arithmetic, moves, branches, comparisons, arrays, strings, math, its own timers.

## Sources and licences

| Key | Source | Revision read | Licence | Used for |
|---|---|---|---|---|
| **FDK** | LEGO, *LEGO MINDSTORMS EV3 Firmware Developer Kit* (2013), PDF from lego.com | as published | © LEGO; read, not copied or committed | §3.1 image header (p. 7), §3.2 object headers (p. 8), §3.4 parameter encoding and sub-call parameter types (p. 9), §4 byte codes |
| **CDK** | LEGO, *LEGO MINDSTORMS EV3 Communication Developer Kit* (2013), PDF from lego.com | as published | © LEGO; read, not copied or committed | §3 system commands and replies (pp. 5–23), §4.2.1 starting a program (p. 26) |
| **LMS** | LEGO's lms2012 firmware source as released (`mindboards/ev3sources`) | `78ebaf5b6f8fe31cc17aa5dce0f8e4916a4fc072` | GPL-2.0-or-later (© LEGO Group 2010–2013) | facts only: everything below marked LMS |
| **ASM** | `ev3dev/lmsasm` (the Go assembler the hosted compiler runs) | `e24a1139bb58b1686673f38bbd3a7a52bb09074e` | BSD-3-Clause (© David Lechner, LEGO System A/S) | how the fixtures are encoded: header, objects, labels, handles |
| **HOST** | `CrispStrobe/legacy-lego-compiler` (the owner's hosted compiler, `lego-compiler.vercel.app`) | `f2a77239a2883c7a90dc72a37a5e06fdf9887e37` | MIT (wrapper); runs ASM | the fixtures: it assembled them (README in the fixture folder) |

**Facts only, in our own words and structure.** The LMS source is GPL: it was read as a source of facts —
opcode numbers, layouts, statuses, what each byte code computes, how the scheduler decides — and nothing of
it (no code, no table, no comment, no text) is in this repository; the VM is written in its own structure
(plain-data state, one reference type for "where a parameter's bytes are", a table of handler functions).
The PDFs and the sources were downloaded/cloned to a scratch directory and deleted after. ASM was read for
the encoding its output has, not copied. No third-party file is committed; the fixtures are ours (the
`.lms` sources) and ASM's output from them (the `.rbf`).

LMS references below are `<file>:<line>` at `78ebaf5`, paths under the repository's `lms2012/` folder (a bare
`lms2012.c`, `validate.c`, `bytecodes.h`, `c_math.c`, `c_move.c`, `c_branch.c`, `c_compare.c`, `c_timer.c` is in
`lms2012/source/`; a `:line` alone continues the file named before it); ASM references are
`assembler/assembler.go:<line>` at `e24a113`.

## §File (rbf-file.js)

- Image header, 16 bytes [FDK §3.1]: sign `LEGO`, image size (u32), version (u16), number of objects (u16),
  global bytes (u32); then 12 bytes per object [FDK §3.2]: offset to its instructions (u32, from the image's
  start), owner object (u16), trigger count (u16), local bytes (u32). Little endian throughout. ASM writes
  exactly this (`:1134–1198`).
- Kinds [FDK §3.2]: VMTHREAD (owner 0, trigger 0), SUBCALL (owner 0, trigger 1), BLOCK (owner ≠ 0; runs on
  its owner's locals, LMS `lms2012/source/lms2012.c:1502–1505`). Object ids count from 1.
- A SUBCALL's code starts with its parameter count and a type byte per parameter — bit 7 in, bit 6 out, the
  low three bits 8/16/32-bit, float, or string (whose next byte is its allocated size) [FDK §3.4; LMS
  `lms2012.c:995`, `validate.c:1649`].
- Refusals: the firmware's validator refuses an image whose size does not cover its headers or that has no
  objects (LMS `validate.c:1676`, VM_PROGRAM_VALIDATION; the program does not start). Ours: the sign
  must be `LEGO` (the validator does not compare it), the file must hold the size it states, and every
  object's code must lie inside the image. An offset of 0 means "right after the headers" (LMS validator).
- Not done: the validator's walk over every byte code at load (it refuses unknown opcodes and records
  opLABEL labels). Here an unknown byte stops the program when it is reached (ERR_INSTR), and label
  parameters are refused (UNIMPLEMENTED_ENCODING) — ASM never emits them: its jumps are 2-byte relative
  constants (`:1064`).

## §Interpreter (ev3-vm.js)

**Parameters** [FDK §3.4; LMS `lms2012.c:694` PrimParPointer]: `00svvvvv` short constant, `01giiiii` short
local/global variable, `10l--bbb` long constant (1/2/4 bytes sign-extended, or a zero-terminated string),
`11gha-bbb` long variable (h: the variable holds an array handle and the parameter is that array's data;
a: an address — refused, UNIMPLEMENTED_ENCODING). A constant read as a narrower type is its low bytes;
read as a float, its 32 bits are the float (ASM writes float constants as 4-byte IEEE values, `:288`). An
output parameter that is a constant writes the VM's scratch value — nowhere (LMS PrimParPointer).

**Objects and the scheduler** (LMS `lms2012.c`):
- Program start (`:1381` ProgramReset): every object's ip at its code and its trigger count from its header;
  **object 1 is RUNNING if its trigger count is 0, every other object STOPPED** (`:1483–1497`). A program
  whose object 1 is a subcall therefore runs nothing (ASM emits objects in source order, so the vmthread
  must come first).
- The dispatcher (`:2296` mSchedCtrl) runs the current object until a byte code breaks the dispatch or
  `PRG_PRIORITY` byte codes have run — **200** in the firmware as built (`lms2012.h:160`, `:281–283`) — then
  the next RUNNING object in id order (`:1774` ObjectExec). The program ends when no object is RUNNING.
- Breaks: a blocking instruction (TIMER_READY, OUTPUT_READY, SOUND_READY, OBJECT_WAIT, a CALL of a busy sub)
  rewinds its ip and yields (BUSYBREAK, `c_timer.c:101`); OBJECT_END stops the object and rewinds its ip
  to its start (`:3245`); SLEEP yields (`:3270`); OBJECT_STOP stops an object (`:2993`).
- OBJECT_START enqueues an object from its start with its trigger count (`:3016`, `:1827`); OBJECT_TRIG
  makes it WAITING, counts its trigger down and enqueues it at zero (`:3039`); OBJECT_WAIT waits until an
  object is STOPPED (`:3086`).
- **CALL** (`:3173`): a sub that is not STOPPED makes the caller wait (rewind, BUSYBREAK) and marks the sub
  *blocked*; otherwise the sub is reset, its caller recorded, the caller's **input** parameters copied into
  the sub's locals in the order of its list — 16-bit ones aligned to 2, 32-bit and float ones to 4, strings
  copied up to their size, stopping at their terminator and zero-filled (`:995` CopyParsToLocals) — the
  caller HALTED and the sub run at once, in the same slice. **RETURN** (`:3118`) walks the caller's
  parameters again and copies the sub's **output** locals back (`:1153` CopyLocalsToPars), stops the sub
  and resumes the caller; if another caller was blocked on the sub, the slice ends so it gets its turn.
- PROGRAM_INFO (`:3320`): OBJ_STOP, OBJ_START, GET_STATUS (RUNNING 0x10, STOPPED 0x40, `bytecodes.h:1515`),
  GET_SPEED, GET_PRGRESULT, SET_INSTR. PROGRAM_STOP of the current, user or GUI slot ends the program
  (`:2879`). Inside a program, PROGRAM_START and LOAD_IMAGE of the user slot do nothing: the slot is not
  STOPPED (`:2926`; `c_memory/source/c_memory.c:2983`).

**Arithmetic** (`c_math.c`): results stored in the instruction's type, wrapping. DIV by zero gives the
type's MAX for a positive dividend, its MIN (−MAX: −127, −32767, −2147483647, `bytecodes.h:1497–1502`) for a
negative one and 0 for 0 (`:346`); integer division truncates. MATH (`:925`): EXP, MOD (fmod), FLOOR, CEIL,
ROUND (half away from zero), ABS, NEGATE, SQRT, LOG (base 10), LN, SIN/COS/TAN in degrees, ASIN/ACOS/ATAN to
degrees, MOD8/16/32 (C `%`; ours: by zero gives 0, C leaves it undefined), POW, TRUNC (to 0–9 decimals). OR,
AND, XOR, RL (shift left).

**Moves** (`c_move.c`): to a wider type keeps "not a number" (DATA8 −128, DATA16 −32768, DATA32 0x80000000,
float NaN → the target's NaN); to a narrower one saturates to the target's range (`:183`); a float to an
integer saturates and then truncates toward zero (`:499`). INIT_BYTES (`:43`), READ8…F / WRITE8…F index a
variable as an array of the type with a DATA8 index (`:559`, `:659`).

**Branches and comparisons** (`c_branch.c`, `c_compare.c`): a jump's offset is a constant relative to the
byte after it (`c_branch.c:42`; ASM `:1064`); JR, JR_FALSE, JR_TRUE, JR_NAN, JR_LT…GTEQ and CP_LT…GTEQ in
8/16/32-bit and float; SELECT (flag ? first : second, `c_compare.c:789`).

**Arrays** (`c_memory/source/c_memory.c`): ARRAY CREATE8/16/32/F (a handle, at most 250 per program,
`lms2012.h:257`), DELETE, SIZE, RESIZE, FILL, COPY (same type; the destination resized), INIT8…F (inside the
array, else FAILBREAK), READ_CONTENT / WRITE_CONTENT / READ_SIZE (`:3392`). ARRAY_WRITE past the end grows the
array (`:3935`); ARRAY_READ outside it is **FAILBREAK** — the program stops (`:4047`); ARRAY_APPEND (`:4134`).
New elements read 0 (ours: the firmware's realloc leaves them undefined).

**Strings** (`lms2012.c:3919`): GET_SIZE, ADD, COMPARE, DUPLICATE, VALUE_TO_STRING (figures, decimals,
trailing zeros stripped; NaN as dashes), STRING_TO_VALUE (a comma read as a point), STRIP (spaces),
NUMBER_TO_STRING (zero-padded to the figures), SUB (the text after the first occurrence; ours: "" when it
does not occur), VALUE_FORMATTED / NUMBER_FORMATTED (one printf conversion: `%d %i %u %x %X %f %e %g` with
flags, width and precision). A destination passed by handle is resized to fit (`VmMemoryResize`).

**Timers** (`c_timer.c`): TIMER_WAIT stores now + ms, TIMER_READY waits for it (`:79`, `:101`); TIMER_READ is
milliseconds since the program started (`:134`); TIMER_READ_US microseconds. All on the VM's milliseconds.
RANDOM (`lms2012.c:3665`): a 0–32767 number scaled into min..max as the firmware scales it (ours: the
generator, an xorshift with a seed option, where the brick uses its C library's `rand`). KEEP_ALIVE: the
sleep minutes.

## Opcodes

Implemented (the VM's): ERROR, NOP, PROGRAM_STOP, PROGRAM_START, OBJECT_STOP, OBJECT_START, OBJECT_TRIG,
OBJECT_WAIT, RETURN, CALL, OBJECT_END, SLEEP, PROGRAM_INFO, LABEL, ADD/SUB/MUL/DIV 8/16/32/F, OR/AND/XOR/RL
8/16/32, INIT_BYTES, all sixteen MOVEs, JR, JR_FALSE, JR_TRUE, JR_NAN, the 24 CP_ and 24 JR_ comparisons,
SELECT 8/16/32/F, STRINGS (all eleven subcommands), TIMER_WAIT, TIMER_READY, TIMER_READ, TIMER_READ_US, MATH
(all 21), RANDOM, KEEP_ALIVE, ARRAY (all fifteen), ARRAY_WRITE, ARRAY_READ, ARRAY_APPEND, MEMORY_USAGE,
READ8…F, WRITE8…F, FILE LOAD_IMAGE.

Implemented (shared with the direct commands, docs/ROBOT-LAB-EV3-NXT.md "EV3 direct commands"): the OUTPUT_
family, INPUT_DEVICE_LIST, INPUT_DEVICE (its subcommands), INPUT_READ/READSI/READEXT/TEST/READY/WRITE, SOUND
(BREAK, TONE, PLAY, REPEAT, SERVICE), SOUND_TEST, SOUND_READY, UI_FLUSH, UI_READ, UI_WRITE, UI_BUTTON,
UI_DRAW, INFO.

Not implemented — the program stops with **UNIMPLEMENTED_OPCODE** (or **UNIMPLEMENTED_SUBCOMMAND**) naming
it: PROBE, DO, BP0–BP3, BP_SET, SYSTEM, PORT_CNV_OUTPUT, PORT_CNV_INPUT, NOTE_TO_FREQ, MEMORY_WRITE,
MEMORY_READ, COM_* (READ, WRITE, READY, READDATA, WRITEDATA, GET, SET, TEST, REMOVE, WRITEFILE), MAILBOX_*
(OPEN, WRITE, READ, TEST, READY, CLOSE), INPUT_SAMPLE, FILENAME, TST, and opFILE's subcommands other than
LOAD_IMAGE (files opened by programs, logs, folders, the cache). A byte that is no opcode is **ERR_INSTR**;
what the firmware fails on is **FAILBREAK** with the reason. Errors stop the program with
`{code, message, object, pc, opcode}` in `vm.error` and an `error` event (`program-error` in the brick's log).

## §System commands (ev3-system-commands.js, ev3-files.js)

Frames [CDK §3]: length (LE16, not counting itself), message counter (LE16), type 0x01 (reply) / 0x81 (no
reply), the command, its arguments; replies 0x03 SYSTEM_REPLY / 0x05 SYSTEM_REPLY_ERROR, the command, a
status (0x00 SUCCESS … 0x08 END_OF_FILE, 0x09 SIZE_ERROR, 0x0A UNKNOWN_ERROR, [CDK §3.1]), then its fields.
A frame may be up to 65534 bytes after its length [CDK §3.2]; a reply is at most the firmware's 1024-byte
buffer (LMS `c_com/source/c_com.c:132–134`).

| Command | Request → reply | Here |
|---|---|---|
| 0x92 BEGIN_DOWNLOAD | size LE32, path → status, handle | folders created; the file written as it arrives (also bytes after the path, LMS `c_com.c:1053`); END_OF_FILE and the handle closed once the size is reached; more than the free space: SIZE_ERROR |
| 0x93 CONTINUE_DOWNLOAD | handle, data → status, handle | bytes past the size dropped (`:1201`); a handle not in use: UNKNOWN_HANDLE |
| 0x94 BEGIN_UPLOAD / 0x96 BEGIN_GETFILE | bytes LE16, path → status, size LE32, handle, data | an upload's handle closes at the end, a getfile's stays open [CDK §3.2.2]; no file: UNKNOWN_HANDLE (`:1306`) |
| 0x95 CONTINUE_UPLOAD / 0x97 CONTINUE_GETFILE | handle, bytes LE16 → status, handle, data (getfile: status, size, handle, data) | |
| 0x98 CLOSE_FILEHANDLE | handle → status, handle | the CDK's example omits the handle; the firmware's reply has it (`c_com.h:1276`, 8 bytes) |
| 0x99 LIST_FILES / 0x9A CONTINUE_LIST_FILES | bytes LE16, path → status, size LE32, handle, list | lines `MD5 SIZE name` (upper-case hex, LMS `c_com.c:863`) and `folder/` [CDK §3.3.4], `./` and `../` included as the firmware's scandir lists them; sorted (ours: the firmware's order is the directory's); no such folder: UNKNOWN_ERROR, handle 0xFF |
| 0x9B CREATE_DIR, 0x9C DELETE_FILE | path → status | NO_PERMISSION where mkdir / remove refuse (exists, no parent, not empty) |
| 0x9D LIST_OPEN_HANDLES | → status, a bit per handle | 64 handles (`lms2012.h:301`) |
| 0x9E WRITEMAILBOX, 0x9F BLUETOOTHPIN, others | → SYSTEM_REPLY_ERROR, UNKNOWN_ERROR | no mailboxes; BLUETOOTHPIN is "USB only" |
| 0xA0 ENTERFWUPDATE | no reply [CDK §3.3.11] | ignored |

Paths: "relative to lms2012/sys" [CDK §3.2.1] — `../prjs/x/x.rbf` is `/home/root/lms2012/prjs/x/x.rbf`; `~/`
is `/home/root`. A name is at most 119 characters, its folder part below 84, its name below 32, its
extension below 5 (`bytecodes.h:63–66`, `c_memory.c:552`). Ours: 6 MB of user space, one flat map.

**Starting a program** [CDK §4.2.1]: `opFILE LOAD_IMAGE USER_SLOT name GV0(0) GV0(4)` then
`opPROGRAM_START USER_SLOT GV0(0) GV0(4) 0`. LOAD_IMAGE (LMS `c_memory.c:2983`): a name without a folder is
looked for in `ui/`, without an extension `.rbf` is added; no such file gives size 0 and address 0; a busy
slot or a refused name leaves the outputs. PROGRAM_START (`lms2012.c:2926`) starts the image if the user slot
is STOPPED — else nothing. The "address" here is a token for the one loaded image (ours). Before the program
runs, every output stops and floats and polarities reset (LMS `c_output/source/c_output.c:176` OutputReset,
`d_pwm` program start). When it ends, the brick's UI stops the outputs (`lmssrc/ui/ui.lms:187` INPUT_DEVICE
STOP_ALL → `c_input.c:400` OUTPUT_PRG_STOP → `d_pwm.c:2237`): a braked motor stays braked, the others
float (ours: the firmware releases the brake after 100 ms). PROGRAM_STOP of the user (or GUI) slot ends it;
GET_STATUS reports RUNNING / STOPPED; GET_PRGRESULT BUSY / OK / FAIL.

## Time model (ours)

The brick runs byte codes as fast as it can; the VM gives each millisecond a fixed budget (`instrPerMs`,
default 200 — an order-of-magnitude estimate, not a measurement; a hub option `{vm: {instrPerMs}}`). Only busy
loops depend on it. While a program runs, the brick's clock follows the VM's milliseconds (`atMs`), so tone
ends and timed motor cycles start on the millisecond; a physics step's sensor readings hold for the VM's
milliseconds inside it.

## Hosts

- **lmsasm through the hosted compiler** (the fixtures): `POST https://lego-compiler.vercel.app/compile`
  `{"compiler": "lmsasm", "code": …}` → base64 `.rbf`.
- **ev3comprehensive** (vendored) transpiles a project to lmsasm and compiles it through `Scratch.fetch` at its
  LMS API (`http://127.0.0.1:7860/compile` by default) — now possible, the CrispStrobe adapter provides
  `Scratch.fetch` (test/bw-sim-ev3-rbf-ev3comprehensive.test.mjs). Its *upload and run* block posts the image
  to an HTTP bridge on the brick (an ev3dev-style service), not over Bluetooth, so in the Lab the test is
  the host that downloads and starts it.
- **ev3_lms_transpile** (CrispStrobe/extensions) is a gallery extension, not vendored here
  (`scripts/gallery-deferred-reasons.json`).

## Open / not modelled

- The validator's load-time walk, opLABEL tables, address parameters.
- Files a program opens (opFILE OPEN_*, logs), mailboxes and the COM_ instructions, daisy chains, buttons
  (none is ever pressed in the Lab), the display as pixels (drawing is recorded as events).
- Other program slots (the debug and terminal slots), PROGRAM_START's debug modes.
- A braked motor's 100 ms at a program's end; the instruction rate (above).
- lmsasm's `ARRAY16` / `ARRAY32` / `ARRAYF` variables allocate one byte per element (ASM `:107–131`: the size
  is multiplied only on an error); the fixtures use `ARRAY8` and `DATAS`.
