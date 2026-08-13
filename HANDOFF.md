# bw-bundle handoff — 2026-08-13 (session 5)

## What was done this session

### EATER6502 wired into the bundle (ca4b69e)

Full switch-device + palette face integration for the 6502 breadboard machine.

- **sb3-creator vendored at 8f6ac0a** (f914bc0): W65C22 VIA pins (PA0-PA7,
  PB0-PB6), cc65 C target, Timer 1 timebase, paced ACIA serial, 74HC595
  shift_out on all cores, 08-led-chaser-595 rejoins all device gallery lists.

- **Device switcher** (pseudocode-importer.jsx): `eater6502` in a new "6502"
  group with `core: 'w65c02'`, `emulator: null` (no browser emulator yet).

- **Palette face** (stc12/index.js): `deviceFamily()` returns `'6502'` for
  `eater6502|w65c02`. Name: "6502 Pins". Color: `#B8860B` (dark goldenrod).
  Pin hint: "(declare a PIN like PA0 or PB3 in the Code tab)".

- **Capability gating**: 4 blocks hidden — `setpwm` (no PWM on VIA),
  `settone` (8051 only), `setport`/`readport` (8051 port registers).
  8 blocks visible — setpin, toggle, writepin, read, setpart, print,
  whenpin, tableindex.

- **Extension library**: "6502 Pins" tile with VIA pin description.

- **Debug runner**: eater6502 falls through to default target (no browser
  emulator); compile target mapped as `'eater6502'`. Also wired
  `arduino-mega` and `atmega168p` into `selectDebugTargetKind` → `avr8js`.

### Playwright-verified

- Device dropdown: `eater6502` present, labeled "Eater 6502"
- Extension loads as "6502 Pins" with color `#B8860B`
- Hidden: setpwm, settone, setport, readport
- Visible: setpin, toggle, writepin, read, setpart, print, whenpin, tableindex
- Zero page errors

### Tests

115/115 pass, 0 fail.

## Nothing in flight

All changes pushed to `main`. No branches, no stashes, no WIP.

## What the next session should know

- **`deviceFamily()` tests `eater6502|w65c02` BEFORE the Arduino regex** so it
  won't accidentally match a future device with "6502" in the name.
- **`hasPWM` flag** gates `setpwm` — any future device without PWM just adds
  itself to the `is6502` check (or rename the flag to `!noPWM`).
- **No browser emulator for 6502** — `selectDebugTargetKind` returns `'emulator'`
  (the STC12 default), which will fail. This is intentional — the debug runner
  already throws a clear error for unsupported targets rather than silently running
  the wrong emulator.
- **`compile: false`** in the device entry — the stc-compiler service doesn't have a
  cc65 backend. When it does, flip to `true` and the compile flow will work.
- **Pin naming**: PA0-PA7, PB0-PB6 (VIA ports). PB7 is Timer 1 output — the
  emitter refuses it as a GPIO pin.
- **Gallery examples**: 18 examples in sb3-creator's computed device lists include
  eater6502 (blink, shift_out, etc.). Served at runtime from bw-cfront.

## Prior session (session 4) highlights

- Per-device pin palettes: one extension, n faces (STC12/Arduino/Mega/Pico)
- ATmega168P + Arduino Mega device switcher + palette faces
- `refreshBlocks()` propagates colors
- 6 device faces browser-verified

## Open items

- **6502 browser emulator** — no wasm engine exists yet; closest candidate is
  a minimal 6502 core (MIT-licensed W65C02S implementations exist)
- **cc65 compile service** — stc-compiler needs a cc65 backend endpoint
- **7 device stubs** hidden from palette — need drivers in bw-board
- **Code-tab debugger strip** — placement approved, not started
- **bw-cfront gallery vendoring**: app fetches `examples/index.json` at runtime
