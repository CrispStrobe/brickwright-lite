# brickwright-lite

A **fully-permissive** (BSD-3-Clause / Apache-2.0 / MIT) foundation for Brickwright — a
*contained* fork of the pre-relicense Scratch stack that you can **bundle and ship on any app
store** (no GPL, no AGPL, no consent, no remote-loading required), with the
blocks ⇄ code ⇄ Python/JS "Code" tab and a large set of LEGO extensions.

It is two things at once:

1. **A permissive web editor** — the "own every part" track. The mainline
   [Brickwright](https://github.com/CrispStrobe/brickwright) is a TurboWarp fork (GPL-3.0 editor
   chrome); this one starts from the last permissive Scratch source, so gui / vm / blocks / paint
   are all local, editable, and licence-clean.
2. **A native app for every platform** — [`apps/tauri`](apps/tauri) wraps that same web build in
   **Tauri 2** to produce one binary each for **macOS, Windows, Linux, iOS and Android**, with a
   native ScratchLink so LEGO hubs connect over **Bluetooth LE *and* Bluetooth Classic** without a
   browser or a separate Scratch-Link install.

**Live (web):** <https://brickwright-lite.vercel.app> — auto-deploys from `main`.
**Native binaries:** built by CI for all platforms (see **Actions** / **Releases**).

## Why this base

Scratch Foundation relicensed the whole stack **BSD-3-Clause → AGPL-3.0 on 2024-11-25**
(scratch-gui commit `3de24da0`). Everything *before* that is BSD-3; `scratch-blocks` is
Apache-2.0 throughout. Xcratch's own gui/vm forks followed upstream to AGPL, so they aren't a
clean base either — only its MIT tooling/extension format stayed permissive. So we pin the **last
BSD-3 commit** and freeze it:

| Component | Pin | License |
|---|---|---|
| **scratch-gui** | commit `7a72429477eb` (v4.1.7, 2024-11-23) | **BSD-3-Clause** |
| **scratch-blocks** | `1.3.0` (classic — *not* the 2.x Blockly rewrite) | **Apache-2.0** |
| **scratch-vm** | `4.8.115` | **BSD-3-Clause** |
| **scratch-paint** | `2.2.518` | **BSD-3-Clause** |
| scratch-render / audio / storage / svg-renderer | pinned | **BSD-3-Clause** |

> **Do not** swap in `scratch-blocks@2.x` — it's a ground-up Blockly rewrite (ESM, new API)
> incompatible with the v4 GUI's classic `ScratchBlocks.*`; that combination fails to build.

The whole point is **distribution**: the shipped build is permissive-only. Anything GPL (e.g.
gallery extensions) is *fetched at runtime from a URL*, never bundled — so it never contaminates
the app you distribute (the same "we link, we don't redistribute" basis as the offline library).

## The native app (`apps/tauri`)

One Tauri 2 project → all five platforms. The web VM already dials a local ScratchLink, so an
unmodified web bundle "just works" once the native side is up.

- **Native ScratchLink** (`src-tauri/src/scratchlink/`) — a local WS server on
  `127.0.0.1:20111` that the web VM already talks to, routing `/scratch/{ble,bt}`:
  - **BLE** via `tauri-plugin-blec` / btleplug — all modern LEGO (SPIKE, Essential, BOOST,
    Powered-Up, WeDo 2, Technic, DUPLO, Mario).
  - **Bluetooth Classic (RFCOMM/SPP)** per OS — macOS IOBluetooth, Linux BlueZ (`bluer`),
    Windows WinRT, Android JNI, iOS MFi ExternalAccessory — for EV3 and legacy-firmware SPIKE.
  - Plus a plain WiFi **bridge** mode for hubs reached over the network.
- **Offline asset library** — an in-app downloads-manager (`File ▸ Offline library…`) fetches the
  costume/sound/backdrop library to the device and serves it locally, so the editor works with no
  internet. We host and bundle **nothing**: assets come from Scratch's own CDN on demand, or as a
  single CC BY-SA 2.0 pack (trademarked mascots excluded). See `PLAN.md` §25.
- **Camera + microphone** (Video Sensing, loudness, record-a-sound) wired for every platform.
- **Native `.sb3` save / load / share** — file dialogs on desktop, the OS share sheet + "open with"
  on mobile, `.sb3` file associations and `turbowarp://` deep links.
- **`?extension=<url>`** loading (Xcratch-style) with a trust/confirm gate for untrusted URLs.

> Transports compile and build green on every platform in CI; live-verified so far on macOS BLE.

## The editor: what's integrated

- **The "Code" tab** — blocks ⇄ pseudocode ⇄ Python ⇄ JavaScript
  ([sb3-creator](https://github.com/CrispStrobe/sb3-creator)), with in-editor Run (Skulpt / JS)
  and a Custom-sprite-art dialog.
- **SoundFX creator** (crispfxr) in the sound editor.
- **Built-in extensions (bundled, offline)** — **23** of our own extensions ship as vanilla
  built-ins: the **LEGO family** (SPIKE Prime BLE/BTC, Powered Up, BOOST, WeDo 2, EV3, NXT, …),
  **gamepad**, **Arrays**, **CSP**, **Planète Maths**, **TTS**, the **circuit** surface and the
  **STC12** pair. Each is *our* source written in the TurboWarp extension format — the
  `// Name: / // ID: / // Description:` header plus `Scratch.extensions.register` — and loaded as
  a built-in through our own `Scratch`-shim adapter, which also accepts Xcratch's ES-module shape.
  Format compatibility, not shared code: see [Licensing](#licensing-what-is-actually-in-a-build).
- **External extension loading** — the picker fetches the
  [CrispStrobe gallery](https://crispstrobe.github.io/extensions/) (**150** extensions: 21 ours,
  129 inherited from the upstream fork) and loads any of them at runtime over HTTPS, via a
  clean-room BSD path rather than TurboWarp's MPL loader. Third-party extensions are *fetched*,
  never bundled — nothing in a shipped build depends on the gallery being reachable.
- **Editor polish** — full-width (double-byte) numbers usable as values; external links open in the
  system browser; de-branded (Brickwright robot as favicon / logo / default sprite; the dead
  Share / Community / My-Stuff / account UI removed).

## Circuit Designer and embedded hardware workbench

The Circuit tab is a second, integrated workspace inside Scratch. It is useful without a
microcontroller for ordinary electronics experiments, and becomes a live visual companion to the
Scratch program when the project declares hardware pins.

### Scratch integration

- The normal Scratch stage and sprite/background pane can be exchanged for the Circuit view from
  **Settings**. The same menu controls the debugger dock (`Top`, `Right`, or `Off`), the
  stage/full-width layout, and the Circuit Designer light/dark style.
- Tutorials live under **File**. The Git revision and project information are consolidated in the
  **About** dialog rather than occupying permanent toolbar space.
- The green flag starts Scratch scripts and the circuit simulation together. Stop-all stops both.
  A circuit can still be designed and simulated independently when no Scratch hardware program is
  present.
- Circuit declarations are derived from the physical wiring and written back into the live project
  contract, so adding a board or wiring an output does not leave the Code tab with stale pin data.

### Circuit editing and simulation

- Place, drag, rotate, flip, duplicate, delete, and wire parts on a grid; parts can also be seated
  on full, half, and mini breadboards with conductive strips, power rails, and hole-to-hole jumpers.
- The palette includes power sources and posts, resistors, capacitors, diodes and LEDs, switches,
  buttons, potentiometers, buzzers, transistors, MOSFETs, motors, servos, relays, displays, sensors,
  logic ICs, memory and I/O parts, meters, and microcontroller boards.
- The simulator is backed by the circuit engine rather than UI-made-up readings. It reports node
  voltages, LED brightness, buzzer tone, current/voltage warnings, and component behavior where a
  model exists. Hardware-only views explicitly suppress readings that cannot be measured.
- Simulation controls include pause, resume, single-tick stepping, and 0.25×/1×/4× speed. Debugger
  halt state is reflected in the board so program time and circuit time stay coherent.
- The realistic board view has a read-only generated schematic view. It supports pan, cursor-centered
  zoom, double-click-to-fit, connected-pin labels, junctions, orthogonal net routing, and an implicit
  GND symbol when the solver uses the negative terminal of a source as its reference.
- Design-rule checks explain common electrical mistakes instead of silently accepting plausible wrong
  results: missing LED resistors, excessive pin/load current, missing flyback diodes, floating inputs,
  supply shorts, reversed polarized parts, missing I²C pull-ups, aggregate current, and unsafe Pico
  GPIO voltage connections.

### Boards and current execution boundary

The board selector and pin chooser use sidecar data with three deliberately separate states:
audited alternate functions, audited pins with no alternates, and known-but-unaudited pins. The UI
never turns missing data into a hardware claim.

- **STC12C5A60S2 / 8051** — the existing STC board path includes datasheet-grounded pin descriptions,
  netlist integration, instruction-level emulation, debugger run/pause/resume/reset/step, and circuit
  feedback. The pin map excludes AT89C51-only ghost pins.
- **Arduino Uno and Nano / ATmega328P** — both can be placed and wired. Uno/Nano declarations use
  Arduino-style D0–D13 and A0–A5 names, and the AVR8JS target provides instruction-level simulation
  for this MCU family. Nano alternate functions are audited in the sidecar; Uno alternates remain
  visibly marked unaudited until verified.
- **Raspberry Pi Pico / RP2040** — the board, pin geometry, GP alternate-function metadata, wiring,
  schematic, declarations, and safety checks are available. Pico GPIO is treated as 3.3 V only;
  the MIT `rp2040js` target now executes raw UF2/flash images, feeds GPIO into the circuit engine,
  supports instruction stepping, raw XIP code breakpoints, register/memory inspection, and honors
  the Cortex-M vector table. MicroPython compilation, ELF symbols/yield points, and full peripheral
  parity remain open; the UI must not present those as complete.

This boundary is intentional: a board may be useful as electrical geometry and documentation before
it has a clean-room executable model. Unsupported execution is reported in the UI instead of falling
back to a fake simulator.

### Project and circuit files

Circuit edits are undoable and redoable, can be copied and pasted, and can be saved/loaded as JSON
circuit files. The board state is autosaved locally so a reload does not discard an unfinished
experiment. DRC results, declarations, board readiness, and simulator state remain derived from the
same circuit model.

## Simulator and oracle policy

The browser and shipped native app use only the permissive execution paths
listed in the device matrix. External emulators are developer-side,
black-box test oracles and are never bundled into Brickwright. The current
oracle roles are documented in [Oracle testing](docs/oracle-testing.md):

- `CrispStrobe/ucsim-stc` is our project-specific GPL STC/8051 oracle, paired
  with the MIT `emu8051-stc` differential runner.
- `simavr` is an optional external AVR hardware/peripheral oracle for Uno and
  Nano traces.
- MIT [`cemeyer/avr-emu`](https://github.com/cemeyer/avr-emu) may provide
  independent CPU-level AVR instruction and debugger cross-checks.
- MIT [`Gregwar/avrel`](https://github.com/Gregwar/avrel) is a pedagogical
  opcode/reference source, not a board simulator.

GPL/AGPL oracle code stays outside the product and dependency graph. Oracle
agreement is evidence for a specified fixture and clock configuration, not a
claim of complete silicon equivalence.

## How it's built: vendor + overlay

We're **frozen on pinned versions**, so the base never shifts under us and we don't string-patch it
every build. Instead we **own full copies of the files we change** in `overlay/`, and the build
copies them over the vendored sources. To change base behaviour, edit the file in `overlay/`.

```
overlay/scratch-gui/   ← gui files we own: the Code tab, SoundFX creator, webpack.config.js,
                          de-branded menu-bar/render-gui, extension picker, offline-library modal,
                          storage local-first store, robot icons + default sprite
overlay/scratch-vm/    ← built-in extensions (extensions/crispstrobe/*) + their registration
apps/tauri/            ← the Tauri 2 native app (ScratchLink, downloads-manager, save/share)
scripts/
  vendor.mjs           ← fetch the pinned permissive sources into packages/ (gitignored)
  integrate.mjs        ← copy overlay/ over the vendored gui + micro:bit stub + package.json fields
  apply-vm-overlay.mjs ← post-install: lay the vm overlay onto node_modules/scratch-vm + two small
                          upstream fixes (xmlEscape category name; full-width numbers in Cast)
  apply-paint-overlay.mjs ← post-install: lay the paint overlay onto node_modules/scratch-paint
                          (the extended costume designer); asserts the exact pinned base version
  build-library-pack.mjs ← assemble the CC BY-SA offline-library pack
```

`packages/` (the vendored sources) is gitignored — `vendor.mjs` repopulates and validates it, so a
partial CI/Vercel build cache self-heals.

## Quick start

**Web build:**

```bash
npm run vendor                                   # fetch pinned BSD-3/Apache sources into packages/
node scripts/integrate.mjs                       # overlay our delta
cd packages/scratch-gui
npm install --ignore-scripts --legacy-peer-deps  # --ignore-scripts skips the flaky micro:bit download
node ../../scripts/apply-vm-overlay.mjs          # built-in extensions + the small upstream fixes
node ../../scripts/apply-paint-overlay.mjs       # the extended costume designer
NODE_ENV=production npm run build                # -> build/  (CI/Vercel run scripts/vercel-build.sh)
```

The production build sets `devtool:false` (no source maps) — source maps over ~80 MB of blockly
were the exit-137 OOM on 7–8 GB CI runners; the fix drops peak RSS from >8 GB to ~4.8 GB.

**Native app** (needs the web `build/` first):

```bash
cd apps/tauri && npm ci
npx tauri dev                 # desktop
npx tauri android build --apk # or:  npx tauri ios build
```

CI does this for all platforms: `.github/workflows/release.yml` (desktop macOS/Windows/Linux) and
`mobile.yml` (Android APK + iOS simulator).

## Roadmap

- [x] Pin & verify the last-BSD permissive base (installs + builds, green on CI + Vercel).
- [x] **The `sb3-creator` "Code" tab** — blocks ⇄ pseudocode ⇄ Python ⇄ JS, build-verified.
- [x] SoundFX creator; German i18n for our additions.
- [x] Bundle our LEGO family + gamepad + Arrays + CSP + Planète Maths + TTS as built-ins.
- [x] Runtime loading of the CrispStrobe gallery (clean-room BSD) + `?extension=<url>`.
- [x] **Tauri native app** for macOS / Windows / Linux / iOS / Android.
- [x] **Native ScratchLink** — BLE (all platforms) + Bluetooth Classic (per-OS) + WiFi bridge.
- [x] Native save / load / share, `.sb3` associations, deep links, camera + microphone.
- [x] Offline asset library (on-demand fetch + one-file CC BY-SA pack).
- [x] Integrated Circuit Designer with realistic editing, breadboards, schematic projection, DRC,
      autosave, undo/redo, and Scratch green-flag synchronization.
- [x] Circuit settings: debugger dock placement, stage/full-width routing, light/dark Circuit style,
      About dialog, and File tutorials.
- [x] STC12/8051 instruction-level circuit/debugger path and AVR8JS Uno/Nano boundary adapter.
- [x] Uno/Nano/Pico board geometry and pin sidecars, with audited-vs-unaudited pin provenance shown
- [x] RP2040 raw-image execution, GPIO feedback, vector reset, instruction stepping, and raw code breakpoints via rp2040js
      in the chooser.
- [ ] Hardware-verify each transport against real LEGO hardware (macOS BLE done).
- [ ] Complete Arduino Uno/Nano peripheral fidelity and source-level AVR debugger mapping.
- [ ] Add a clean-room RP2040/MicroPython compilation path for Pico (runtime raw-image execution exists).
- [ ] Improve schematic symbol coverage and hand-layout controls beyond the generated projection.
- [ ] Apple code-signing for a distributable iOS build.
- [ ] A few editor-parity items (multi-line say/think, palette-edge, cleanup layout) — see PLAN §26.

Tradeoff vs mainline Brickwright: you own a frozen fork (no free upstream fixes) and lose
TurboWarp's compiler speed + addon system — in exchange for a permissive app you can bundle and
ship on Apple / Google / Microsoft directly, with native LEGO Bluetooth on every platform.

## Licensing: what is actually in a build

BSD-3-Clause. Vendored web components keep their own permissive licenses (BSD-3 / Apache-2.0); the
Tauri app's Rust crates are BSD/MIT/Apache; glue is MIT/BSD. The offline-library pack is Scratch
"Support Materials" under CC BY-SA 2.0 (trademarked mascots excluded) — it is fetched/served, not
part of the shipped code.

### The extensions, specifically

The question that decides whether this can ship: **does a build contain any copyleft code from
the upstream extension gallery?** It does not, and the checks are cheap to repeat.

**What is bundled.** 23 extensions under
`overlay/scratch-vm/src/extensions/crispstrobe/`. Every one carries a licence header —
**20 MPL-2.0 and 3 MIT** — and MPL-2.0 is file-level weak copyleft: a covered file may
be combined into a Larger Work distributed under other terms, provided the MPL files stay MPL and
their source stays available. It is in this repository. That is compatible with closed distribution
channels in a way GPL-3.0 is not.

**Where the GPL in the upstream gallery actually lives.** `TurboWarp/extensions` is mixed-licence:
extension `.js` files carry per-file headers (MIT historically, MPL-2.0 now), sample projects are
CC-BY 4.0, and **GPL-3.0 covers the images, the development server and the website** — the
infrastructure around the extensions, not the extension code. None of that infrastructure is
vendored here: no gallery images, no dev server, no site code.

**A handful of third-party gallery extensions do carry copyleft**, and they are worth naming rather
than glossing: `lab/text.js`, `Lily/Cast.js` and `Lily/McUtils.js` are *MIT AND LGPL-3.0*;
`CubesterYT/KeySimulation.js` is *MIT AND MPL-2.0*. **None is bundled.** They live in the gallery
and are fetched at runtime if a project asks for one.

**How that was established**, so it can be re-run rather than trusted:

| check | result |
|---|---|
| licence header of every bundled extension | 20 MPL-2.0, 3 MIT, 0 GPL |
| our 21 gallery extensions vs the 129 third-party ones, distinctive lines ≥60 chars | **0 shared of 3,114** |
| bundled extensions vs upstream TurboWarp's own `gamepad.js`, `bitwise.js`, `text2speech.js` | **0 shared** |
| bundled extensions vs every copyleft-flagged third-party extension | **0 shared of 424 indexed** |
| gallery images / dev server / site code vendored into the build | **none** |

**On "wraps its TurboWarp/Xcratch source".** Earlier wording in this file said that, and it read as
provenance when it meant interface. Our extensions are written in the TurboWarp extension *format*
and our own adapter loads them; `adapter.js` additionally rewrites Xcratch's ES-module exports to
CommonJS because the source runs through `new Function`, where `export` is a syntax error. Writing
to someone's interface is not deriving from their code.

What none of this proves: that nobody ever read an upstream extension while writing ours. Absence of
shared lines rules out copy-paste, not influence. MIT and MPL-2.0 both permit derivation anyway
provided headers survive — and since the GPL-3.0 upstream is the site rather than the extensions,
even a derived extension would not pull it in.
