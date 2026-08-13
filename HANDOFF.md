# bw-bundle handoff — 2026-08-13 (session 3, saturated)

## What was done this session (bw-bundle agent)

### Pico wired as a full third target (bb69068 → 486fd62)

- **Device selector**: Pico in own "Raspberry Pi" group, `compile: true`, `emulator: 'rp2040js'`
- **debug-runner.js**: `pico` → `rp2040` compile target, base64 → Uint16Array halfwords for raw SRAM binary, full `attachRp2040js` path (serial/glow/trace/breakpoints)
- **debug-target-factory.js**: `'rp2040js'` in `getTargetKinds()`
- **rp2040js-debug.js**: Boundary-D debug target from bw-board (new file)
- **infer-netlist.js**: Fixed self-referencing `pid` bug, `where`-aware pin naming
- **board.js**: `isMcuKind()` for multi-arch board kinds (later retired — upstream owns it at 054a57f)
- **avr8js-adapter.js**: Lowercase pin names (later retired — upstream case-blind join at 6370e02)
- **Tests fixed**: rp2040-debug, rp2040-image, sb3-creator-motion-target matched to vendored API
- **Production proof PASSED** (coordinator, all 5 assertions green)

### retargetPseudocode surfaced in the app (2e538e6 → ce79322)

- **Code tab device switcher**: `setDevice` calls `SB3Creator.retargetPseudocode()` when code has PIN declarations. Refusal shows reasons in status bar and does NOT switch.
- **Code tab example dropdown**: `computeExampleCompat` fires on mount + device change. Incompatible examples disabled with specific retarget reasons in tooltips.
- **Code tab loadExample**: retargets hardware examples to current device on load. Falls back to as-authored with reasons shown.
- **Circuit tab ExamplesBrowser**: accepts `currentDevice` prop. Greyed-out cards show "Needs: STC12, Nano, Pico" from the `devices` list. `_retargetReasons` path ready for specific reasons.
- **circuit-tab loadExampleProgram**: retargets hardware examples to project device before parsing.
- **Production verified** by coordinator.

### Devices extension gating (bw-blocks agent, df194e5)

- **Servo + motor**: real on all three cores (PCA on 8051, Timer 1/2 on AVR, PWM slices on Pico)
- **NeoPixel**: 8051-1T only — hidden on 12T, AVR, Pico
- **`_isPico()` helper** added to devices extension

### Re-vendors performed

- sb3-creator at d95bd41 (DEVICE PICO, real PWM/servo/motor on gcc cores, retargetPseudocode, device extension gating)
- bw-board at 054a57f (rp2040js adapter + debug target, digital-input leg, case-blind pin join, high-z string guard, board-kind GPIO drive sync, inferNetlist with `where`)
- **Overlay patches RETIRED** — upstream owns lowercase pin join, inferNetlist `where`, getTargetKinds rp2040js, board-kind GPIO drive, high-z guard. Re-vendoring is now clean.

### Tests: 115/115 pass (5 new retarget tests)

## Nothing in flight

All changes pushed to `main`. No branches, no stashes, no WIP. Working tree clean.

## What the next session should know

- **Overlay patches are retired**: bw-board upstream (054a57f) owns all four fixes. Re-vendoring bw-board is safe without re-applying patches.
- **`_retargetReasons` on ExamplesBrowser cards**: shows "Needs: STC12, Nano, Pico" as fallback. For SPECIFIC reasons ("no ADC on this chip"), parent would fetch program source + run `retargetPseudocode`. Code tab's inline dropdown already does this. Low priority polish.
- **`extensionManager.refreshBlocks()`** forces `getInfo()` re-evaluation after `runtime.stc.device` change.
- **`window.__brickwrightStore`** is how to access the VM from Playwright (not `window.vm`).
- **`npx serve` is unreliable on this VPS** — use `python3 -m http.server` for build verification.
- **`integrate.mjs` wipes `build/`** — always rebuild after integrate.
- **debug-runner compile format**: was `'uf2'` for Pico, fixed to `'bin'` (deployed upstream).

## Open items

- **7 device stubs** hidden from palette — need drivers in bw-board
- **Code-tab debugger strip** — placement approved, not started
- **bw-cfront gallery vendoring**: app fetches `examples/index.json` at runtime; no sync script exists
- **Corpus campaign**: the fleet's main line now (sb3-creator reference/corpus-and-oracles.md)
