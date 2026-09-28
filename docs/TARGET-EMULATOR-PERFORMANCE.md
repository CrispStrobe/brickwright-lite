# Board targets and emulator performance

Baseline measured 2026-09-28 from Lite `dec8f2a`, bw-board `7a4b1e1`, and
LabWired `1cf3d3b8`. The exact-board follow-up uses LabWired engine commit
`cdd2f1fa` (merged as `313252d4`) and bw-board `bdffe947` (the exact target
bridge landed at ancestor `47e0cb0b`). RTx means simulated
seconds per wall second; 1.0x is real time. Functional and throughput evidence
remain separate.
The in-process figures below are three-pass medians from the quiet GitHub
Ubuntu 24.04 runner in [run 36404517587](https://github.com/CrispStrobe/brickwright-lite/actions/runs/36404517587).
Run `npm run bench:board-targets` to repeat them; set `LABWIRED_WASM` and
`LABWIRED_CORE` to add the heavy-tier rows.

## What runs now

| Target | Shipped execution path | Measured RTx / status | LabWired | avr8js | Renode |
|---|---|---:|---|---|---|
| Arduboy / ATmega32U4 | avr8js, including the real Brickwright adapter | **3.93x** | no 32U4 model | **yes** | no AVR CPU |
| Blinkenrocket / ATtiny88 | avr8js, including board callbacks | **7.09x** | no ATtiny88 model | **yes** | no AVR CPU |
| Arduino Uno | avr8js; optional LabWired comparison | **3.38x** adapter | yes, ATmega328P | **yes** | no AVR CPU |
| micro:bit v2 | MicroPython WASM for `.py`; MakeCode source is translated; ELF/HEX/UF2 can use the exact-board debugger | **3.32x optimized post-boot smoke median**; earlier general tight-loop ceiling 1.04x | **yes, exact nRF52833 CPU/flash/GPIO/UART path**; display/sensors incomplete | no | no exact target |
| MakeCode Arcade | PXT's source-level simulator | intentionally wall-paced | depends on selected Arcade board | no | depends on selected Arcade board |
| PyBadge / ATSAMD51J19 | PXT Arcade source-level simulator; ELF/HEX/UF2 can use the exact-board debugger | **3.78x optimized post-boot smoke median**; earlier general tight-loop ceiling 1.76x | **yes, exact ATSAMD51J19A CPU/flash/GPIO/Feather UART path**; display/buttons/QSPI/USB incomplete | no | no exact target |
| SPIKE Prime | Pybricks MicroPython WASM and the virtual-hub protocol model | Pybricks **84.63x unpaced**; exact Renode F413 **1.770x median, 1.383x minimum**; UI selects 1x | no exact F413 board | no | **exact STM32F413VG platform and guarded active-workload RTx qualified**; not yet a Lite process adapter |
| EV3 | MakeCode source simulator where source is present; real-brick transport | **1.361x median, 1.207x minimum** on an active ARM926 loop in hosted CI | no ARM9/AM1808 | no | **merged exact AM1808 foundation**: 300 MHz ARM926, high-vector SRAM, UART1, AINTC, GDB and a guarded throughput harness; not yet a Lite process adapter or full EV3 |

The 2026-09-28 hosted core receipt remains the less noisy comparison for the
already integrated CPU engines: Z80 186x, 6502 150x, avr8js ATmega328P 13.3x,
8051 5.23x, RP2040 1.66x, and LabWired STM32F0 24.2x. The lower AVR values in
this document are intentional: they include timers, peripherals, debug-event
instrumentation, time conversion, and board callbacks rather than timing only
the instruction decoder.

The same target harness on the shared four-vCPU host ranged widely. Its first
usable pass put Arduboy at 1.55x; while unrelated browser/OCR/test jobs pushed
load average to 19.5 it fell to 0.50x. That is oversubscription, not an engine
regression, and is why release RTx gates run on an isolated hosted runner.
The removed Renode F411/F412 proxy figures were useful capability estimates,
but they are not measurements of Prime's F413 platform and are no longer used
as target claims. The exact F413 qualification now retires 96 million active
guest instructions in each of five hosted passes and retains both the JSON
receipt and UART proof in [run 36440006278](https://github.com/CrispStrobe/renode-spike-prime/actions/runs/36440006278).

“Intentionally wall-paced” is not a failed benchmark. Those engines model an
API and animation timeline, not chip cycles, and their browser loop sleeps to
keep one simulated second equal to one user-visible second. A CPU RTx number
would be invented. Pybricks exposes an unpaced mode, which is why SPIKE has
both a throughput figure and a UI figure.

The exact Cortex-M receipt is
[`2026-09-28-labwired-cortex-m-self-branch.json`](receipts/2026-09-28-labwired-cortex-m-self-branch.json).
It builds the released Node WASM on a Kaggle worker, applies the same
`recommended_tick_interval()` contract as the bw-board adapter, boots the
public micro:bit v2 and ATSAMD51 smoke ELFs until each prints `OK`, then measures
their terminal `b .` steady state. It is evidence for post-boot real-time
capacity, not for the still-unimplemented display, sensor, QSPI, USB or audio
devices.

## Circuit audit

The private repo contains 314 project-example directories. Every Lite
worktree on this VPS has exactly the same directory-name set as remote main,
and none has modified or untracked example files. The other apparent corpus is
the 49 JSON circuits in `bw-circuit-ui/gallery`; Lite already consumes that
gallery at pinned commit `1510d38`, and its gallery is byte-unchanged through
current upstream `6d6a464`. Copying those JSON files into Scratch project
examples would duplicate a different format, not integrate missing circuits.

The remaining `.hex` files found outside those repos are FPGA/toolchain test
firmware under `apicula/examples`; they are not Brickwright circuits. There
was therefore no orphan circuit to import from this VPS.

## Ordered target checkpoints

This table is the execution order, not a wish list. Work starts on the first
`NEXT` row. A checkpoint becomes `DONE` only when its definition of done is
met and the evidence column names an immutable commit, PR or hosted run. Later
rows must not be marked complete while an earlier row remains open.

| ID | State | Checkpoint | Definition of done | Evidence |
|---|---|---|---|---|
| CP01 | DONE | Reconcile the target ledger | Every currently claimed target has an exact engine, workload and non-idle result; stale EV3 VPS and F412-proxy claims are removed. | Renode [run 36437429134](https://github.com/CrispStrobe/renode-spike-prime/actions/runs/36437429134), docs `7a5d4173`; LabWired `bdffe947` |
| CP02 | DONE | Enforce ordered evidence | A repository test rejects fewer than ten checkpoints, malformed IDs/states, completion without immutable evidence, and any completed row after the first open row. | Brickwright Lite [PR 472](https://github.com/CrispStrobe/brickwright-lite/pull/472) |
| CP03 | DONE | Qualify exact SPIKE Prime RTx | The STM32F413VG platform runs a source-built public firmware workload; five non-idle passes report exact instruction deltas, median/minimum RTx, UART/brick-state proof, and median plus minimum are at least 1.0x. | Renode [PR 7](https://github.com/CrispStrobe/renode-spike-prime/pull/7), [run 36440006278](https://github.com/CrispStrobe/renode-spike-prime/actions/runs/36440006278), merge `06d86c51` |
| CP04 | NEXT | Supervise Renode as an optional native backend | The Tauri broker launches a pinned Renode executable without a shell, uses a random loopback port and token, enforces time/output limits, and always kills the process tree on reset, project close and app exit. | pending |
| CP05 | TODO | Connect SPIKE Prime to Lite | The debugger can load the public simulation firmware, run/pause/reset/step, inspect registers and memory, set a breakpoint, and receive bounded `brick-state/v1` updates through CP04. | pending |
| CP06 | TODO | Connect EV3 to Lite | The same debugger contract operates the source-built EV3 smoke image through Renode/GDB, including UART and AINTC IRQ evidence, without private recovery firmware. | pending |
| CP07 | TODO | Model DA8xx Timer64 | Exact documented register behavior and IRQ routing are covered by unit tests and exercised by a source-built ARM926 payload. | pending |
| CP08 | TODO | Model EV3 boot clocks and pinmux | PSC, PLL and pinmux behavior required by the public DA850/EV3 boot path is modeled with mutation-sensitive tests. | pending |
| CP09 | TODO | Model AM1808 EDMA | The required EDMA channels, completion/error interrupts and memory transfers pass peripheral and executable payload tests. | pending |
| CP10 | TODO | Model MMC/SD boot storage | A redistributable test image is read through the modeled AM1808 MMC/SD path with bounded media input and deterministic block receipts. | pending |
| CP11 | TODO | Model EV3 GPIO and LCDC | GPIO direction/edge IRQs and the LCD controller's required framebuffer path are observable in tests and through the debugger. | pending |
| CP12 | TODO | Model EV3 motors and sensors | Permissive front ends cover the extension-visible motor and sensor subset and publish it through the neutral brick-state contract. | pending |
| CP13 | TODO | Complete micro:bit v2 board I/O | The LabWired target drives the 5x5 display, buttons and selected sensor/audio paths with board-level tests while retaining >=1.0x hosted RTx. | pending |
| CP14 | TODO | Complete PyBadge board I/O | ST7735, button mux, NeoPixels, audio and QSPI are exercised by public firmware and debugger-visible tests; USB is either implemented or explicitly isolated, while hosted RTx remains >=1.0x. | pending |

CP07–CP12 are intentionally ordered by the public EV3 boot path. PRU support is
not promoted ahead of those dependencies. PXT/MicroPython remain the complete
source-level experiences while CP13 and CP14 are partial.

The immutable integration points are bw-board `bdffe947` for the exact
LabWired target bridge, Renode `d82f6466` for SPIKE Prime, Renode `7a5d4173`
for EV3 including its active-workload 300-MIPS qualification, and Infrastructure `d4353862` for
their peripheral models. Public
simulation firmware is kept in its separate MIT repository; no private
recovery image is read, copied, bundled or required by these source-only gates.
The public simulation firmware used by the current SPIKE qualification is
`b4cfe1fa`.
