# bw-blocks handoff — 2026-08-13 (devices gating session)

## What was completed

### Devices extension gating updated (df194e5, already pushed by predecessor)

The per-device gating in `overlay/scratch-vm/src/extensions/crispstrobe/devices/index.js`
was updated to match sb3-creator 0970462+ (motor real on gcc cores):

- **Servo + motor**: `noPCA` changed from `is12T || isAVR` → `is12T` only.
  Real C drivers exist on all three cores: PCA on 8051, Timer 1/2 on AVR,
  PWM slices 0/1 on Pico.
- **NeoPixel**: guard changed from `is12T || isAVR` → `is12T || isAVR || isPico`.
  Bit-timed inline assembly is 8051-1T only.
- **Added `_isPico()` helper**: matches `/pico/i` and `/rp2040/i`.

### sb3-creator reference updated (d95bd41, pushed)

`reference/extensions/devices.js` in sb3-creator got the same `_isAVR()`,
`_isPico()`, and NeoPixel guard updates. It previously only had `_is12T()`.

### Browser-verified

Playwright test against a production build verified all 6 device identifiers:

| Device | Servo | Motor | NeoPixel |
|---|---|---|---|
| STC12C5A60S2 | V | V | V |
| STC89C52 | H | H | H |
| arduino_nano | V | V | H |
| arduino_uno | V | V | H |
| pi_pico | V | V | H |
| rp2040 | V | V | H |

Verification script: `/tmp/verify-devices2.cjs` (requires Playwright from
`/home/claudeuser/.npm/_npx/e41f203b7505f1fb/node_modules/playwright`).

### sb3-creator re-vendored into lite

`npm run sync:sb3creator -- --dir /mnt/volume1/code/sb3-creator` picked up
0970462 (motor) + d95bd41 (ref gating). `overlay/scratch-gui/src/lib/sb3-creator.js`
has the AVR (D3/OC2B, D7/D8 H-bridge) and Pico (GP18 slice 1A, GP19/GP20
H-bridge) motor drivers.

## Nothing in flight

All changes pushed to `main` in both repos. No branches, stashes, or WIP.

## What I learned (not in a spec-update)

- **`extensionManager.refreshBlocks()`** is the correct way to force
  `getInfo()` re-evaluation after changing `runtime.stc.device`. Neither
  `_refreshExtensionPrimitives` nor `emitWorkspaceUpdate` triggers it.
  The device selector in the UI presumably calls this already.

- **`window.__brickwrightStore`** is how to access the VM from Playwright
  (set in `app-state-hoc.jsx`). Not `window.vm`. Path:
  `__brickwrightStore.getState().scratchGui.vm`.

- **`npx serve` is unreliable on this VPS** — it silently fails to bind.
  Use `node -e "require('http').createServer(...)..."` or `python3 -m
  http.server` for build verification.

- **`integrate.mjs` wipes the `build/` directory** inside
  `packages/scratch-gui/` (it copies the overlay fresh). Always rebuild
  after integrate.

## Open items (carried forward from predecessor)

- **7 device stubs** still hidden from palette — need drivers in bw-board
- **Code-tab debugger strip** — placement approved, not started
- **bw-board pin name convention**: bw-board source uses uppercase pin names
  on avr8js-adapter; overlay has the lowercase fix — next sync needs re-apply
- **Example gallery (cfront)**: retarget landed, gallery can compute
  supported-device lists per example
