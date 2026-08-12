# bw-bundle handoff — 2026-08-12 (session 3)

## What was done this session

### Pico debug chain: wired into the app (0c1bb42, 486fd62)

**Re-vendored:**
- sb3-creator at ab68d1b (DEVICE PICO + real PWM + servo on gcc cores + retargetPseudocode)
- bw-board at 32582aa (rp2040js adapter + debug target + digital-input leg on both adapters)

**Overlay-specific fixes re-applied after vendor:**
- avr8js-adapter.js: lowercase pin names to match sidecar conventions
- board.js: `isMcuKind()` helper for `arduino_uno`/`arduino_nano`/`pi_pico`
- infer-netlist.js: `pinId(p)` function uses `p.where` for non-STC pins;
  fixed self-referencing bug (`const pid = pid(pin)` → `const pid = pinId(pin)`)

**Device selector:** Pico in its own "Raspberry Pi" group, `compile: true`, `emulator: 'rp2040js'`

**debug-runner.js:** `pico` → `rp2040` compile target, base64→Uint16Array for raw
binary, `attachRp2040js` with serial/glow/trace/breakpoints

**debug-target-factory.js:** `'rp2040js'` in `getTargetKinds()` (label: "Simulated (RP2040)")

**New file: rp2040js-debug.js** — Boundary-D debug target for RP2040 from bw-board

**Tests fixed:** rp2040-debug, rp2040-image, sb3-creator-motion-target — matched to vendored API

### retargetPseudocode wired into UI (2e538e6)

**Device switcher:** changing device on code with PIN declarations calls
`SB3Creator.retargetPseudocode()`. Pins are rewritten to the target's conventional
wiring (RETARGET_POOLS). If the target lacks a feature (no ADC, wrong core), the
switch is refused with reasons in the status bar.

**Example browser:** loading a hardware example with a different device selected
retargets it automatically. Incompatible examples are greyed out with reason tooltips.

**5 new tests:** STC→Pico (GP25), STC→Nano (D13), ADC refusal on STC89, unknown
device, pool coverage.

### Test counts
- 115/115 pass locally
- CI green for all pushed commits

## Nothing in flight

All changes pushed to `main`. No branches, no stashes, no WIP.

## Prior session context (carried forward)

### AVR debug chain (session 2, d29198f)
- Full AVR debug wiring: Nano blink, yield breakpoints, serial output

### Devices extension (e2ad1cf)
- Re-registered in builtinExtensions, picker entry added
- 29 blocks visible, 7 stubs hidden

## Open items

- **Full Pico debug chain test**: needs stc-compiler.vercel.app to accept
  target "rp2040" — coordinator runs production proof
- **7 device stubs** hidden from palette — need drivers in bw-board
- **Code-tab debugger strip** — placement approved, not started
- **bw-board pin name convention**: bw-board source still uses uppercase pin names
  on avr8js-adapter; overlay has the lowercase fix — next sync needs re-apply
- **Example gallery (cfront)**: with retarget landed in the app, the gallery
  can compute supported-device lists per example by dry-running retargetPseudocode;
  manual per-device example sets (nano01-04, pico01-04) are now golden fixtures
