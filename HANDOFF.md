# bw-bundle handoff — 2026-08-13 (session 4)

## What was done this session

### Per-device pin palettes (d1c499a)

One extension (`stc12`), n faces — the block-palette gap from
`reference/corpus-and-oracles.md` §5.

- **`stc12/index.js`**: `deviceFamily()` reads `runtime.stc.device`, returns
  `'8051'` / `'avr'` / `'mega'` / `'pico'`. `getInfo()` uses it for:
  - **Name**: "STC12 / 8051 Pins" / "Arduino Pins" / "Arduino Mega Pins" / "Pico Pins"
  - **Color**: `#3d7ea6` (steel blue) / `#00878F` (Arduino teal, shared by Mega) / `#8E44AD` (purple)
  - **Gating**: `settone`, `setport`, `readport` → `hideFromPalette: !is8051`
    (tone not ported to gcc cores; PORT registers are an 8051 construct)
  - **Pin hints**: empty dropdown says "(declare a PIN like D22 or A8 …)" for Mega, etc.
- **Extension library**: 4 tiles (STC12, Arduino, Arduino Mega, Pico), all `extensionId: 'stc12'`.
- **`apply-vm-overlay.mjs`**: patched `_refreshExtensionPrimitives` in runtime.js
  to propagate `color1/color2/color3` on `refreshBlocks()` (upstream only updated name).

### ATmega168P + Arduino Mega added (c7b7626)

- **Device switcher**: `arduino-mega` and `atmega168p` added to the Arduino (AVR) group.
  ATmega168P = identical face to Uno/Nano. Mega gets its own "Arduino Mega Pins" name.
- **Re-vendored sb3-creator at b999a80**: device definitions (pin maps for ports A–L,
  MUX5 ADC for 16 analog channels, Timer 1/2 routing for PWM on D9–D12, servo on D11/D12),
  plus 4 new device-specific examples (mega01-blink, mega02-adc-print, mega03-port-current,
  168p01-blink) with computed device lists for 127 examples.
- **Browser-verified** (Playwright): all 6 device faces correct (default 8051, Uno, 168P,
  Mega, Pico, STC12). Gating, colors, names, toolbox XML confirmed.

## Prior session (session 3) highlights

- Pico wired as third target (device selector, debug-runner, rp2040js-debug)
- retargetPseudocode surfaced in Code tab + Circuit tab ExamplesBrowser
- Devices extension gating: servo/motor real on all cores, NeoPixel 8051-1T only
- Overlay patches retired — upstream owns all four fixes
- 115/115 tests pass

## Nothing in flight

All changes pushed to `main`. No branches, no stashes, no WIP. Working tree clean.

## What the next session should know

- **Extension ID stays `stc12`** for backward compat — saved projects reference `stc12_setpin` etc. Only the palette name/color changes.
- **`refreshBlocks()` now propagates colors** — the runtime.js patch is in `apply-vm-overlay.mjs`, re-applied on every build.
- **Palette updates on project load**, not on device switch. `setDevice` retargets text + sets `runtime.bwDeviceId`; `runtime.stc.device` (which the extension reads) updates on Run. The palette and pin dropdowns stay consistent.
- **`deviceFamily()` returns `'mega'` for `arduino-mega`** — tested before `'avr'` so the specific match wins. Mega shares `isAVR` gating (same hidden blocks) but gets its own palette name.
- **`window.__brickwrightStore`** is how to access the VM from Playwright (not `window.vm`).
- **`npx serve` is unreliable on this VPS** — use `python3 -m http.server` for build verification.
- **`integrate.mjs` wipes `build/`** — always rebuild after integrate.

## Open items

- **7 device stubs** hidden from palette — need drivers in bw-board
- **Code-tab debugger strip** — placement approved, not started
- **bw-cfront gallery vendoring**: app fetches `examples/index.json` at runtime; no sync script exists
- **Corpus campaign**: the fleet's main line now (sb3-creator reference/corpus-and-oracles.md)
- **`setDevice` → `refreshBlocks` shortcut**: low priority — would update palette name immediately on device switch instead of waiting for Run
