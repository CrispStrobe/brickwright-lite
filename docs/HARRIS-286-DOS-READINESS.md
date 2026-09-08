# DOS readiness: distinguish the two execution paths

Assessment: 2026-09-08, based on the checked-in CPU, board and DOS bench code.

## Existing 8086 path

The application already has a `.COM`/`.EXE` DOS bench (`i8086-dos-bench.js`) with
a loader and an emulated DOS service layer (`i8086-dos.js`). It implements console,
keyboard and several file/memory services, and reports unsupported calls. This is
not the new wired 286 board and must not be described as that board booting DOS.
The [8086 core plan](I8086-CORE-PLAN.md) also records upstream real DOS 2.0 boot
and period-utility acceptance; those receipts belong to their stated upstream
machine/pin, not the experimental 286 CPU.

For running supported DOS programs soon, use and validate the existing bench.
Do not delay all application compatibility work until the wireable 286 is complete.

Direct local proof: `test/harris-dos-readiness.test.mjs` runs an owned `.COM`
through the application bench, checks `Hi\r\n`, termination, exit code zero and
no unsupported services. Its second test executes `INT 21h` on the wired 286
and checks the explicit unsupported-opcode fault after only the reset jump.
These two tests passed; they are not a claim of general DOS compatibility.

## New wireable 286 path

The current boot CPU executes byte/word MOV, ADD/SUB/CMP/AND/OR/XOR and TEST,
register INC/DEC, short conditional jumps and loops, segment loads/overrides,
word stack operations, near calls/returns and single-bit SHL/SHR, NOP/CLI and a
model-level HLT. It lacks ADC/SBB, general shifts/rotates, interrupt dispatch/return,
string instructions and much else. Its board currently supplies 64 KiB RAM,
64 KiB ROM, ideal control/latching and memory transactions. There is no working
console/disk system or DOS loader/kernel on this path.

The owned loop ROM and preserved Paterson FAT12 routines prove instruction fetch
and wired RAM access. This
does not measure a percentage of DOS compatibility. Visual editing adds topology
authoring and diagnosis, not missing instruction or operating-system behavior.

| Gate | Required evidence |
| --- | --- |
| Useful real-mode CPU | Byte/word operations, flags, segments, stack, calls/returns, strings and software interrupts, tested against independent instruction results and wired wait-state cases |
| Useful board I/O | Console output/input and storage paths through explicit board components; no hidden host RAM or fictional device responses |
| Bootable DOS machine | Matching memory map and firmware/console/disk interfaces, real guest boot to a command prompt and a directory listing |
| First selected apps | Exact named/versioned binaries run, produce expected output, read input/files and exit; unsupported calls and faults are recorded |

DOS's machine-dependent console/disk interface and its application syscall
interface are separate contracts: see Microsoft's original
[device-driver documentation](https://github.com/microsoft/MS-DOS/blob/main/v2.0/source/DEVDRIV.txt),
[system-call documentation](https://github.com/microsoft/MS-DOS/blob/main/v2.0/source/SYSCALL.txt)
and [initialization source](https://github.com/microsoft/MS-DOS/blob/main/v2.0/source/SYSINIT.ASM).
An OEM DOS port to a custom 286 board and running unmodified PC software are
different targets: PC-specific applications may require the expected PC BIOS,
display, keyboard, timer and storage hardware behavior in addition to DOS calls.

## Recommended next execution work

Byte operations and initial stack/call/segment support have now landed with
Paterson PACK/UNPACK acceptance. Prioritize remaining real-mode operations,
software interrupts and I/O before adding more
editor polish or acceleration. Keep all these operations resumable through the
wired bus; existing synchronous CPU coverage is a reference, not proof that a
new resumable implementation is correct.

First target a small text-mode program with explicit output/input/exit assertions.
Use named target applications to choose subsequent devices and DOS API coverage.
Protected-mode 286 software and 386/DOS-extender programs are later, separate gates.

There is no evidence-backed calendar estimate yet. For the wired board this is
several substantial CPU/system milestones, not another UI iteration. A useful
estimate requires a real-mode instruction coverage inventory, chosen DOS/firmware
and named first applications; a percentage based on the demo ROM would mislead.
