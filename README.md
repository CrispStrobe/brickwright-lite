# Brickwright

Build circuits on breadboards, program them in blocks or pseudocode, run them
on emulated chips, and debug them live — all in the browser (or a native app
on any platform).

**For learners** discovering electronics and microcontrollers.
**For teachers** who need a zero-install lab that runs on school Chromebooks.
**For retro-computer builders** wiring Z80 and 6502 machines on virtual
breadboards before soldering the real thing.

**Live (web):** <https://brickwright-lite.vercel.app> — auto-deploys from `main`.
**Native binaries:** built by CI for macOS, Windows, Linux, iOS and Android
(see **Actions** / **Releases**).

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

### Block and code editor

- **Scratch-based block editor** with a "Code" tab: blocks, pseudocode,
  Python and JavaScript side by side.
- 23 built-in extensions (LEGO family, gamepad, arrays, CSP, TTS, circuit
  surface) plus 150 gallery extensions loadable at runtime.
- SoundFX creator, costume editor, German i18n.
- The green flag starts Scratch scripts and the circuit simulation together.

### Native app (Tauri 2)

One Tauri 2 project produces binaries for macOS, Windows, Linux, iOS and
Android, with a native ScratchLink so LEGO hubs connect over **Bluetooth LE
and Bluetooth Classic** without a browser or a separate install.

- Offline asset library, camera + microphone, native `.sb3` save/load/share,
  file associations and deep links.

## Quick start

**Web build:**

```bash
npm run vendor                                   # fetch pinned sources into packages/
node scripts/integrate.mjs                       # overlay our delta
cd packages/scratch-gui
npm install --ignore-scripts --legacy-peer-deps
node ../../scripts/apply-vm-overlay.mjs          # built-in extensions + upstream fixes
node ../../scripts/apply-paint-overlay.mjs       # the extended costume designer
NODE_ENV=production npm run build                # -> build/
```

**Native app** (needs the web `build/` first):

```bash
cd apps/tauri && npm ci
npx tauri dev                 # desktop
npx tauri android build --apk # or:  npx tauri ios build
```

CI does this for all platforms: `.github/workflows/release.yml` (desktop) and
`mobile.yml` (Android APK + iOS simulator).

## Roadmap

- [x] Permissive base pinned and verified (BSD-3 / Apache-2.0 / MIT).
- [x] Code tab — blocks / pseudocode / Python / JS.
- [x] SoundFX creator; German i18n.
- [x] 23 built-in + 150 gallery extensions.
- [x] Tauri native app for all five platforms.
- [x] Native ScratchLink — BLE + Bluetooth Classic + WiFi bridge.
- [x] Native save/load/share, offline library, camera + microphone.
- [x] Circuit Designer: breadboards, schematic, DRC, autosave, undo/redo.
- [x] 8051/AVR/RP2040/6502/Z80 instruction-level emulation and debugging.
- [ ] Hardware-verify each LEGO transport against real hardware (macOS BLE done).
- [ ] Complete Arduino Uno/Nano peripheral fidelity and source-level debugger.
- [ ] RP2040/MicroPython compilation path for Pico.
- [ ] Schematic symbol coverage beyond the generated projection.
- [ ] Apple code-signing for a distributable iOS build.

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
```

`packages/` is gitignored — `vendor.mjs` repopulates and validates it.

## Simulator and oracle policy

The browser and shipped app use only permissive execution paths. External
emulators are developer-side test oracles, never bundled:

- `ucsim-stc` (GPL) — STC/8051 oracle, paired with the MIT `emu8051-stc`
  differential runner.
- `simavr` — optional external AVR hardware/peripheral oracle.
- MIT `cemeyer/avr-emu` and `Gregwar/avrel` — independent CPU-level cross-checks.

GPL/AGPL oracle code stays outside the product and dependency graph.

## Licensing

**BSD-3-Clause / Apache-2.0 / MIT.** The entire shipped build is permissive.

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

Anything GPL (e.g. gallery extensions) is *fetched at runtime from a URL*,
never bundled — so it never contaminates the distributed app.

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

You own a frozen fork (no free upstream fixes) and lose TurboWarp's compiler
speed + addon system — in exchange for a permissive app you can bundle and
ship on Apple / Google / Microsoft directly, with native LEGO Bluetooth on
every platform.

### Affiliation

Not affiliated with or endorsed by Scratch / MIT, STC, Arduino, or
Raspberry Pi. Trademarks belong to their owners.
