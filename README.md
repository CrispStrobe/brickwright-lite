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
- **Built-in extensions (bundled, offline)** — our own extensions ship as vanilla built-ins: the
  **LEGO family** (SPIKE Prime BLE/BTC, Powered Up, BOOST, WeDo 2, EV3, NXT, …), **gamepad**,
  **Arrays**, **CSP**, **Planète Maths** and **TTS**. Each wraps its TurboWarp/Xcratch source
  through a `Scratch`-shim adapter.
- **External extension loading** — the picker fetches the
  [CrispStrobe gallery](https://crispstrobe.github.io/extensions/) (~117 extensions) and loads any
  at runtime via a clean-room BSD path (not TurboWarp's MPL loader). GPL/third-party extensions
  live there, not in the shipped build.
- **Editor polish** — full-width (double-byte) numbers usable as values; external links open in the
  system browser; de-branded (Brickwright robot as favicon / logo / default sprite; the dead
  Share / Community / My-Stuff / account UI removed).

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
- [ ] Hardware-verify each transport against real LEGO hardware (macOS BLE done).
- [ ] Apple code-signing for a distributable iOS build.
- [ ] A few editor-parity items (multi-line say/think, palette-edge, cleanup layout) — see PLAN §26.

Tradeoff vs mainline Brickwright: you own a frozen fork (no free upstream fixes) and lose
TurboWarp's compiler speed + addon system — in exchange for a permissive app you can bundle and
ship on Apple / Google / Microsoft directly, with native LEGO Bluetooth on every platform.

## License

BSD-3-Clause. Vendored web components keep their own permissive licenses (BSD-3 / Apache-2.0); the
Tauri app's Rust crates are BSD/MIT/Apache; glue is MIT/BSD. The offline-library pack is Scratch
"Support Materials" under CC BY-SA 2.0 (trademarked mascots excluded) — it is fetched/served, not
part of the shipped code.
