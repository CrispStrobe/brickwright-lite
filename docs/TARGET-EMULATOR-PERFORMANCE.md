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
| SPIKE Prime | Pybricks MicroPython WASM and the virtual-hub protocol model | **84.63x unpaced**, UI selects 1x | no exact F413 board | no | **exact STM32F413VG platform merged and qualified; RTx unmeasured**; not yet a Lite process adapter |
| EV3 | MakeCode source simulator where source is present; real-brick transport | Renode paced ~1x by policy; **0.44–0.57x unpaced on the contended VPS**, not a release pass | no ARM9/AM1808 | no | **merged exact AM1808 foundation**: 300 MHz ARM926, high-vector SRAM, UART1, AINTC and GDB; not yet a Lite process adapter or full EV3 |

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
as target claims. A repeatable exact-firmware virtual-time/wall-time receipt is
still required before assigning Prime Renode an RTx value.

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

## Remaining gaps, in order

1. **Complete board peripherals.** The exact nRF52833 and ATSAMD51 CPU paths,
   addressed ELF/HEX/UF2 loading, pin maps and >=1.0x hosted post-boot receipts
   are complete. micro:bit v2 still needs its charlieplexed
   5x5 display, buttons and sensor paths. PyBadge still needs the ST7735,
   buttons, NeoPixels, audio, QSPI and USB paths. PXT/MicroPython remain the
   complete source-level experiences while those device models are partial.
2. **Connect the merged Prime backend to Lite.** The public Renode fork now has
   an exact F413VG platform, six LPF2 UARTs, display, IMU, flash, buttons,
   sound, tests and a bounded `brick-state/v1` TCP/NDJSON contract. Add a
   supervised optional native process adapter, then record representative RTx;
   do not call the old F412 proxy an exact result.
3. **Grow EV3 from its executable AM1808 boundary.** The current foundation
   proves ARM926 reset/instruction execution, high-vector SRAM, UART1, AINTC
   interrupt entry/acknowledge and GDB support without recovery firmware. Linux
   or unchanged EV3 firmware still needs Timer64, PSC/PLL/pinmux, EDMA,
   MMC/SD, GPIO/LCDC and the EV3 motor/sensor front ends. PRU follows the boot
   path rather than preceding it. Its current 133–171 MIPS unpaced VPS result
   is below the 300-MIPS real-time target, so optimize/measure on a quiet host
   before promoting the native backend.
4. **Keep hosted target-level performance gates honest.** Require median
   >=1.0x for every CPU-backed target promoted from experimental to shipped.
   Source-level simulators get deadline/frame tests, and native Renode targets
   get a fixed firmware workload plus both virtual and wall time instead of an
   idle-loop number.

The immutable integration points are bw-board `bdffe947` for the exact
LabWired target bridge, Renode `d82f6466` for SPIKE Prime, Renode `64b51361`
for EV3 including its honest 300-MIPS clock, and Infrastructure `d4353862` for
their peripheral models. Public
simulation firmware is kept in its separate MIT repository; no private
recovery image is read, copied, bundled or required by these source-only gates.
The public simulation firmware used by the current SPIKE qualification is
`b4cfe1fa`.
