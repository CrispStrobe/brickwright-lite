# Brickwright

**Build circuits. Program machines. See how they work.**

Brickwright is an open-source visual computing workbench. Build and measure
circuits, program with blocks or code, run emulated machines, debug them live,
and follow guided lessons — in a browser or the native app.

**For learners** discovering electronics and microcontrollers.
**For teachers** who need a zero-install lab that runs on school Chromebooks.
**For retro-computer builders** wiring Z80 and 6502 machines on virtual
breadboards before soldering the real thing.

**Live (web):** <https://brickwright-lite.vercel.app> and
<https://crispstrobe.github.io/brickwright-lite> — both auto-deploy from `main`.
**Native binaries:** built by CI for macOS, Windows, Linux, iOS and Android
(see **Actions** / **Releases**).

### Source ownership and upstream integrity

Fast landing does not mean local forking. `bw-board` and `bw-circuit-ui` are
installed from exact git SHAs; `sb3-creator`, the sole vendored upstream, is
checked for pinned byte identity, derived rewrites, and matching tracked
mirrors. Shared behavior lands in its upstream repository first and reaches
Lite through an explicit pin move. See [the vendoring regime](docs/VENDORING-REGIME.md)
for the enforced invariants, and [the lane ledger](LANES.md) for the separate
human coordination and qualification process.

## What it does

### Circuit Designer and hardware workbench

- Place, wire, and simulate parts on breadboards: power, passives, LEDs,
  transistors, MOSFETs, ICs, sensors, displays, motors, servos, meters, and
  microcontroller boards.
- Backed by a real circuit engine (modified nodal analysis): node voltages, LED
  brightness, buzzer tone, current/voltage warnings, and design-rule checks for
  common mistakes (missing resistors, reversed polarity, shorts, floating
  inputs, unsafe GPIO voltage).
- Realistic board view plus a generated read-only schematic.
- Supported chips: **8051** (STC12), **AVR** (Arduino Uno/Nano via avr8js),
  **RP2040** (Raspberry Pi Pico via rp2040js), **6502** (W65C02), **Z80**.
  Instruction-level emulation, debugger run/pause/step/reset, register and
  memory inspection.

ATtiny88 (including the QFN-32 Blinkenrocket board) deliberately uses the
permissively licensed avr8js path, extended in `bw-board` with the ATtiny88
memory map, ports, timers, EEPROM and analog comparator. That target supplies
instruction/block/over/out stepping, code/yield/write breakpoints, writable
SRAM, symbols and instruction/memory/device events. LabWired's native AVR core
is fast (the `bw-board` receipt records a 21.43x median on its AVR loop), but
the LabWired WASM bridge now admits only its proven ATmega328P/Arduino Uno
descriptor. Brickwright converts the compiler's Intel HEX to flash bytes and
the adapter wraps those bytes in an AVR (`EM_AVR`) ELF for LabWired. Its debug
surface is narrower: instruction step, code breakpoints and read-only memory. It therefore adds an
optional Uno whole-SoC comparison without pretending to implement ATtiny88;
ATtiny85/88 raw images and full debugger workflows remain on avr8js.

The current pinned hosted RTx receipt clears real time on every measured
engine: Z80 186x, 6502 150x, avr8js ATmega328P 13.3x, emu8051 5.23x, rp2040js
RP2040 1.66x, and LabWired STM32F0 24.2x (three-pass medians, bw-board GitHub
run 36384508630). In particular, RP2040 moved from a 0.94x median to 1.66x
after the exhaustively differential-tested Thumb tier-zero dispatch path.

### Block and code editor

- **Scratch-based block editor** with a "Code" tab for Brickwright Code,
  Python and JavaScript representations. Conversion and generated-view limits
  are kept explicit instead of promising that every construct round-trips.
- 23 built-in extensions (LEGO family, gamepad, arrays, CSP, TTS, circuit
  surface) plus 150 reviewed gallery extensions. Web and native builds allow
  the gallery by default; a deliberately self-contained artifact can be built
  with `BW_REMOTE_CODE_POLICY=deny`, or only URL extensions can be removed with
  `BW_REMOTE_EXTENSIONS_POLICY=deny`.
- SoundFX creator, costume editor, German i18n.
- The green flag starts Scratch scripts and the circuit simulation together.

### Bring a MakeCode project in, and take one back out

- Open a MakeCode `.hex`, `.uf2`, `.elf` or `.png` cartridge and get the
  project, not the machine code: MakeCode embeds its own source in everything
  it downloads. A **micro:bit** project becomes blocks; a **MakeCode Arcade**
  game becomes a Scratch project — sprites with their real artwork, overlaps as
  `touching`, the controller as the arrow keys, levels painted whole as
  backdrops.
- A micro:bit **MicroPython** `.hex` (python.microbit.org, uflash) needs no
  translating at all — the simulator runs it as it is.
- Import from a MakeCode share link, or save a project as a `.hex` that
  makecode.microbit.org opens.
- What has no equivalent here is listed rather than dropped: every refusal is
  marked in the code and counted in the status line.

### Guided lessons

- Three first-run journeys lead to a useful circuit, board, or LEGO project.
- A searchable English/German catalog teaches circuits, safe measurement,
  programming representations, debugging, controls, and machine architecture.
- Lessons stay beside the live project and use prediction, observation, hints,
  resumable progress, and manual fallbacks rather than a click-through slideshow.

### Native app (Tauri 2)

One Tauri 2 project produces binaries for macOS, Windows, Linux, iOS and
Android, with a native ScratchLink so LEGO hubs connect over **Bluetooth LE
and Bluetooth Classic** without a browser or a separate install.

- Offline asset library, camera + microphone, native `.sb3` save/load/share,
  file associations and deep links.

## Quick start

**Terminal CLI:** `bwlite` is the command for this repository; the older `bw`
command belongs to the separate `sb3-creator` compiler repository. A `.bw`
file is Brickwright pseudocode. After the web-build setup has populated
`packages/`, run
`npm link` once to put `bwlite` on your PATH (or use `npm run cli --`).

```bash
bwlite --help
bwlite spike probe
bwlite spike run scripts/spike/example-usb-stream.bw
bwlite convert program.bw --to sb3 --out program.sb3
bwlite convert program.bw --to c --out program.c
bwlite read program.c --out recovered.bw
bwlite 8051 build program.bw --out program.ihx
bwlite 8051 flash program.ihx --port /dev/cu.usbserial-XXXX
bwlite toolchain status
bwlite machine validate machine.json
```

`convert` reads `.bw`, `.sb3`, `.c`, `.py`, `.js`, and `.bas` and can write
pseudocode, SB3, C, host C, Python, JavaScript, MicroPython, or BASIC. It uses
the same pinned `SB3Creator` and language readers as the Code tab. The older
`compile PROGRAM.bw --to ...` command remains an alias for conversion; use
`toolchain compile FILE.c --mode local|online` for the separate 8051 compiler.
`devices` and `retarget` expose the compiler's device mapping. `toolchain`,
`machine`, `fpga`, and `makecode` forward to their existing repository CLIs;
`machine` manages emulator configurations and boot plans, while interactive
chip emulation and debugging still run in the app. `8051 build` uses installed
SDCC to make Intel HEX from STC pseudocode or C; `8051 flash` uses installed
`stcgal` and requires an explicit serial port. Flashing an STC also requires
its usual cold power cycle into the ISP bootloader.

SPIKE USB needs LEGO MINDSTORMS MicroPython firmware and Python with `pyserial`.
The [CLI guide](docs/CLI.md) maps old `bw` references to the current Lite
commands. The [USB guide](scripts/spike/README-usb-stream.md) covers the Mac/iPad WLAN
bridge; the [MINDSTORMS guide](docs/mindstorms-lms.md) covers `.lms` import and
export.

**Web build:**

```bash
npm ci --ignore-scripts --no-audit --no-fund      # root tooling + pinned engine/UI packages (Node 22)
npm run vendor                                   # fetch pinned sources into packages/
node scripts/integrate.mjs                       # overlay our delta
cd packages/scratch-gui
npm install --ignore-scripts --legacy-peer-deps
node ../../scripts/apply-vm-overlay.mjs          # built-in extensions + upstream fixes
node ../../scripts/apply-paint-overlay.mjs       # the extended costume designer
node ../../scripts/apply-render-overlay.mjs      # text costumes wait for the lazy render fonts
NODE_ENV=production npm run build                # -> build/
```

**Native app** (needs the web `build/` first):

```bash
cd apps/tauri && npm ci
npx tauri dev                 # desktop
npx tauri android build --apk # or:  npx tauri ios build
```

**Verilog to SVG** (needs Yosys):

```bash
npm run render:fpga -- design.v --output render --title "My circuit"
```

The renderer preserves named modules and expands one hierarchy level by
default. Use `--expand-depth 0` for macro boxes, `--expand-depth 2` to expose
another level, or `--top module_name` when a file contains several candidates.
Large repeated arrays stay collapsed automatically; adjust that threshold with
`--max-expanded-instances`.

For an installable physical-iPad development package, use the production asset
pipeline even when signing with an Apple Development profile:

```bash
cd apps/tauri
npm run ios:device-build
```

Do not package a device app with `tauri ios dev --no-dev-server`. That command
still compiles Tauri in development mode, where `tauri://localhost` expects a
live development endpoint instead of serving the embedded web build. The
result installs successfully but cannot open its start page offline.

CI does this for all platforms: `.github/workflows/release.yml` (desktop) and
`mobile.yml` (Android APK + iOS simulator).

## Roadmap

- [x] Permissive base pinned and verified (BSD-3 / Apache-2.0 / MIT).
- [x] Code tab — blocks / pseudocode / Python / JS.
- [x] SoundFX creator; German i18n.
- [x] 23 built-in extensions everywhere; 150 additional gallery extensions on the web.
- [x] Tauri native app for all five platforms.
- [x] Native ScratchLink — BLE + Bluetooth Classic + WiFi bridge.
- [x] Native save/load/share, offline library, camera + microphone.
- [x] Circuit Designer: breadboards, schematic, DRC, autosave, undo/redo.
- [x] 8051/AVR/RP2040/6502/Z80 instruction-level emulation and debugging.
- [ ] Hardware-verify each LEGO transport against real hardware (macOS BLE done).
- [ ] Complete Arduino Uno/Nano peripheral fidelity and source-level debugger.
- [ ] RP2040/MicroPython compilation path for Pico.
- [ ] Schematic symbol coverage beyond the generated projection.
- [x] Signed macOS and iOS builds uploaded to App Store Connect/TestFlight.

## How it's built: vendor + overlay

We freeze on pinned versions of the pre-relicense Scratch stack, own full
copies of changed files in `overlay/`, and copy them over the vendored sources
at build time:

```
overlay/scratch-gui/   <- gui files we own
overlay/scratch-vm/    <- built-in extensions + registration
apps/tauri/            <- the Tauri 2 native app
scripts/
  vendor.mjs           <- fetch pinned sources into packages/ (gitignored)
  integrate.mjs        <- copy overlay/ over the vendored gui
  apply-vm-overlay.mjs <- lay the vm overlay onto node_modules/scratch-vm
  apply-paint-overlay.mjs <- the extended costume designer
  apply-render-overlay.mjs <- SVGSkin waits for the lazy render-fonts chunk when an SVG has text
```

`packages/` has ignore rules, but many files there are already tracked in Git.
For files present in both the GUI overlay and the tracked GUI tree, edit the
overlay and refresh the tracked mirror with `node scripts/integrate.mjs` in the
same change. The overlay/package equality test checks committed copies.
`vendor.mjs` populates packages whose `package.json` is absent; its cache check
does not verify every existing file against the pinned upstream contents.

The main runtime layers are `sb3-creator` for representation conversion,
local or hosted compiler routes for executable images, `bw-circuit-ui` for
circuit construction, `bw-board` for machines and debug adapters, and
`bw-debug` for recording, inspection and replay. The language/device matrix
describes supported paths. Project saves carry Scratch content plus Brickwright
Code, Circuit and Controller state in an `.sb3` sidecar. Tauri supplies native
file, serial and ScratchLink transports around the web application.

[PLAN.md](PLAN.md) records the current sequence; [ROADMAP.md](ROADMAP.md)
contains the scoped session tracks and engineering backlog. Check
[LANES.md](LANES.md) before claiming implementation.

## Development and tests

Install the root dependencies with Node 22 or newer, then run the bounded
source-only suite without preparing the generated GUI tree:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run check:setup
npm run test:source
```

Root tests import owned GUI modules from `overlay/scratch-gui`; generated
`packages/scratch-gui/src` is not a test input. The registered GUI-scope hook
resolves bare GUI dependencies from the prepared GUI package. Tests that need
those dependencies or assembled build artifacts still require `vendor`,
`integrate`, the GUI dependency install, and the VM/paint/render overlay steps.
Use `npm run check:setup -- --integrated` to verify that runtime before those
tests. `BW_INTEGRATED_ROOT` may explicitly select a prepared external dependency
and build root, but it does not replace the source under test.

## Simulator and oracle policy

The browser and shipped app use only permissive execution paths. External
emulators are developer-side test oracles, never bundled:

- `ucsim-stc` (GPL) — STC/8051 oracle, paired with the MIT `emu8051-stc`
  differential runner.
- `simavr` — optional external AVR hardware/peripheral oracle.
- MIT `cemeyer/avr-emu` and `Gregwar/avrel` — independent CPU-level cross-checks.

GPL/AGPL oracle code stays outside the product and dependency graph.

## Licensing

Brickwright's application code is BSD-3-Clause. The shipped dependency set is
open source under BSD-3-Clause, Apache-2.0, MIT, and MPL-2.0; no GPL or AGPL code
is bundled. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) for the exact
file and package inventory.

### Why this base

Scratch Foundation relicensed the whole stack BSD-3-Clause -> AGPL-3.0 on
2024-11-25 (scratch-gui commit `3de24da0`). We pin the **last BSD-3 commit**:

| Component | Pin | License |
|---|---|---|
| **scratch-gui** | `7a72429477eb` (v4.1.7, 2024-11-23) | **BSD-3-Clause** |
| **scratch-blocks** | `1.3.0` | **Apache-2.0** |
| **scratch-vm** | `4.8.115` | **BSD-3-Clause** |
| **scratch-paint** | `2.2.518` | **BSD-3-Clause** |
| scratch-render / audio / storage / svg-renderer | pinned | **BSD-3-Clause** |

> **Do not** swap in `scratch-blocks@2.x` — it is a ground-up Blockly rewrite
> incompatible with the v4 GUI.

No GPL code is bundled. Web and native editions can opt into separately
distributed GPL tools or media, with their licence and corresponding source
shown at the point of download. These user-initiated downloads remain separate
from the BSD-3 application. A review-specific, self-contained build can disable
remote toolchains, machine images and extension JavaScript at compile time with
`BW_REMOTE_CODE_POLICY=deny`; the normal build policy is `allow`. The narrower
`BW_REMOTE_EXTENSIONS_POLICY`, `BW_REMOTE_TOOLCHAINS_POLICY`, and
`BW_REMOTE_MACHINE_IMAGES_POLICY` variables independently override the umbrella,
so review-channel restrictions do not unnecessarily disable unrelated features.

### The bundled extensions

23 extensions under `overlay/scratch-vm/src/extensions/crispstrobe/`:
**20 MPL-2.0 and 3 MIT**. MPL-2.0 is file-level weak copyleft — covered files
may be combined into a Larger Work under other terms, provided the MPL files
stay MPL and their source stays available (it is in this repository).

The upstream `TurboWarp/extensions` gallery's GPL-3.0 covers images, dev
server and website — the infrastructure, not the extension code. None of
that is vendored here.

**How that was established** (re-runnable, not trust-based):

| check | result |
|---|---|
| licence header of every bundled extension | 20 MPL-2.0, 3 MIT, 0 GPL |
| our 21 gallery extensions vs 129 third-party, distinctive lines >= 60 chars | **0 shared of 3,114** |
| bundled vs upstream TurboWarp's own extensions | **0 shared** |
| bundled vs every copyleft-flagged third-party extension | **0 shared of 424** |
| gallery images / dev server / site code vendored | **none** |

### Tradeoff vs mainline Brickwright

Brickwright owns a frozen integration of the last BSD Scratch stack (so upstream
security and compatibility fixes must be ported deliberately) and does not use
TurboWarp's compiler or addon system. In exchange, the product can ship its own
electronics, debugger, lesson, and native-device layers—including direct LEGO
Bluetooth—without depending on TurboWarp. Brickwright Lite is not a TurboWarp
fork.

### Affiliation

Not affiliated with or endorsed by Scratch / MIT, STC, Arduino, or
Raspberry Pi, nor by the makers of the circuit file formats the Circuit tab
imports and exports (KiCad, EasyEDA, EAGLE, LTspice). Those names describe
file formats only. Trademarks belong to their owners.
