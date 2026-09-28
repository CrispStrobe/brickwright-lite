# Board targets and emulator performance

Measured 2026-09-28 from Lite `dec8f2a`, bw-board `7a4b1e1`, and LabWired
`1cf3d3b8`. RTx means simulated seconds per wall second; 1.0x is real time.
The in-process figures below are three-pass medians from the quiet GitHub
Ubuntu 24.04 runner in [run 36404517587](https://github.com/CrispStrobe/brickwright-lite/actions/runs/36404517587).
Run `npm run bench:board-targets` to repeat them; set `LABWIRED_WASM` and
`LABWIRED_CORE` to add the heavy-tier rows.

## What runs now

| Target | Shipped execution path | VPS RTx | LabWired | avr8js | Renode |
|---|---|---:|---|---|---|
| Arduboy / ATmega32U4 | avr8js, including the real Brickwright adapter | **3.93x** | no 32U4 model | **yes** | no AVR CPU |
| Blinkenrocket / ATtiny88 | avr8js, including board callbacks | **7.09x** | no ATtiny88 model | **yes** | no AVR CPU |
| Arduino Uno | avr8js; optional LabWired comparison | **3.38x** adapter | yes, ATmega328P | **yes** | no AVR CPU |
| micro:bit v2 | MicroPython WASM for `.py`; MakeCode source is translated | intentionally wall-paced | **CPU/model exists but is not wired into Lite: 23.69x core ceiling** | no | nRF52840 proxy **2.71x**, not an exact-board claim |
| MakeCode Arcade | PXT's source-level simulator | intentionally wall-paced | depends on selected Arcade board | no | depends on selected Arcade board |
| PyBadge / ATSAMD51J19 | PXT Arcade source-level simulator | intentionally wall-paced | **CPU/model exists but is not wired into Lite: 27.63x core ceiling** | no | SAMD51 core/platform proxy **2.9x**, not an exact-board claim |
| SPIKE Prime | Pybricks MicroPython WASM and the virtual-hub protocol model | **84.63x unpaced**, UI selects 1x | STM32F411 proxy **4.70x**, no exact F413 board | no | STM32F412 proxy **4.79x**; exact Prime model remains on an unmerged fork branch |
| EV3 | MakeCode source simulator where source is present; real-brick transport | intentionally wall-paced | no ARM9/AM1808 | no | ARM926 CPU exists, but no AM1808/EV3 platform; no virtual EV3 in Lite |

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
Renode's proxy figures in the table were measured on that VPS with immediate
virtual-time advance; they are capability estimates, not release gates.

“Intentionally wall-paced” is not a failed benchmark. Those engines model an
API and animation timeline, not chip cycles, and their browser loop sleeps to
keep one simulated second equal to one user-visible second. A CPU RTx number
would be invented. Pybricks exposes an unpaced mode, which is why SPIKE has
both a throughput figure and a UI figure.

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

## Gaps to close, in order

1. **Wire LabWired nRF52833 into micro:bit v2.** The descriptor now exists and
   is L3-gated upstream. Add the micro:bit edge-pin map, convert the linked
   MakeCode image to an ELF accepted by the bridge, and add the charlieplexed
   5x5 display plus buttons. Keep MicroPython WASM as the fast source path.
2. **Wire LabWired ATSAMD51 into PyBadge/Arcade.** The engine now has PORT,
   MCLK/GCLK and SERCOM3, so the old “no SAMD51 emulator” statement is stale.
   It is only L1 and USB/QSPI are stubs. Add the PyBadge pin map and, before
   claiming games, ST7735, buttons, NeoPixels, timers and audio.
3. **Land or retire the exact SPIKE Prime Renode branch.** The fork has an
   exact STM32F413 platform, display, IMU, flash, buttons, sound, LPF2 devices,
   state server and tests on `feat/spike-essential-platform`, but those 57
   commits are not on main. Rebase it, build the matching Infrastructure
   submodule, publish a versioned binary, and connect it as an optional native
   heavy tier. Until then the F412 number above is explicitly a proxy.
4. **Build EV3 deliberately.** Renode can execute ARM926, but neither Renode
   nor LabWired models the TI AM1808/DA850 SoC and its PRU/peripherals. The
   shortest product path is the already planned virtual EV3 direct-command
   adapter over Lite's shared hub state, not Linux/SoC emulation. Add exact
   Renode hardware only if unchanged EV3 firmware or kernel debugging is a
   product requirement.
5. **Add hosted target-level performance gates.** Keep the existing core gate,
   add this script to a quiet GitHub runner, and require median >=1.0x for every
   CPU-backed shipped target. Source-level simulators get deadline/frame tests
   instead of a fictitious chip RTx.
