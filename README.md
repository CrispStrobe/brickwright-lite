# Brickwright

**Build circuits. Program machines. See how they work.**

Brickwright is an open-source visual computing workbench. Build and measure
circuits, program with blocks or code, run emulated machines, debug them live,
and follow guided lessons — in a browser or the native app.

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

- **Scratch-based block editor** with a "Code" tab for Brickwright Code,
  Python and JavaScript representations. Conversion and generated-view limits
  are kept explicit instead of promising that every construct round-trips.
- 23 built-in extensions (LEGO family, gamepad, arrays, CSP, TTS, circuit
  surface) plus 150 gallery extensions loadable at runtime.
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

**Web build:**

```bash
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

`packages/` is gitignored — `vendor.mjs` repopulates and validates it.

## Development and tests

Install the root dependencies with Node 22 or newer, then run the bounded
source-only suite without preparing the generated GUI tree:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run check:setup
npm run test:source
```

Tests that exercise the assembled GUI still require `vendor`, `integrate`, the
GUI dependency install, and the VM/paint/render overlay steps. Use
`npm run check:setup -- --integrated` to verify that runtime before those tests.
`BW_INTEGRATED_ROOT` may explicitly select a prepared external GUI checkout.

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

Brickwright owns a frozen integration of the last BSD Scratch stack (so upstream
security and compatibility fixes must be ported deliberately) and does not use
TurboWarp's compiler or addon system. In exchange, the product can ship its own
electronics, debugger, lesson, and native-device layers—including direct LEGO
Bluetooth—without depending on TurboWarp. Brickwright Lite is not a TurboWarp
fork.

### Affiliation

Not affiliated with or endorsed by Scratch / MIT, STC, Arduino, or
Raspberry Pi. Trademarks belong to their owners.
