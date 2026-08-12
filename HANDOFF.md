# bw-bundle handoff — 2026-08-12 (session 2)

## What was done this session (d29198f)

### AVR debug chain: end-to-end wiring completed

**Re-vendored:**
- sb3-creator at e9fe382 (volatile scheduler variables on AVR)
- bw-board at 1ab92cd (avr8js adapter with USART + ADC + debug target factory)

**Fixed in debug-runner.js:**
- AVR onChange handler: now calls `glow(st.tasks)` for Level-1 position,
  `shouldSkip()` for conditional breakpoints, `clearGlow()` on resume,
  records variables+tasks in trace — was a stub that traced but never lit blocks
- Device-to-target mapping: `arduino-nano` → `atmega328p` for the compile
  endpoint (which accepts chip names, not board names)
- `pins()` method: uses `pin.where` for Arduino-style names (D13 not Pundefined.undefined)
- Wires `setValueResolver` and `_bwDebugVariables` for the AVR path

**Fixed in infer-netlist.js:**
- Arduino pins use `pin.where` (D13) instead of `P${port}.${bit}` — board
  terminal names now match what the avr8js adapter drives through `setPin()`

**Fixed in sync-bw-board.mjs:**
- Excludes `pin-functions.js` (Node-only, imports `node:fs`)

### Browser-verified (Playwright, local build)
- **Nano blink**: D13 toggles at 500ms, 5 transitions in 3s, LED brightness
  0 ↔ 0.145
- **Yield breakpoint**: pauses at `bw_task0/state=1` (forever yield), Level-1
  position shown, glowing block mapped correctly
- **Serial output**: "hello" lines accumulate via USART0
- 1654 bytes compiled, 4 yield points, F_CPU=16MHz, bw_ms tracks correctly
- Zero page errors

### Licence confirmation updated
MPL-2.0 directly confirmed by owner (2026-08-12) for bw-parts, bw-circuit-ui,
bw-cfront, bw-bundle, sb3-creator. BLOCKED.md updated from provisional to final.

## Nothing in flight

All changes pushed to `main`. No branches, no stashes, no WIP.

## Prior session context (carried forward)

### Devices extension (e2ad1cf)
- Re-registered in builtinExtensions, picker entry added
- Runtime wiring bug fixed (constructor receives runtime)
- 29 blocks visible, 7 stubs hidden

### Three-engine routing (649f40d)
- debug-target-factory.js routes emulator/avr8js/rp2040js/serial
- Lazy imports: avr8js/rp2040js loaded on demand

### What was ruled out
- Node cannot reproduce the extension-block deserialization bug (browser-only)
- bw-debug is not vendored (8 files, lite's own glue code)
- rp2040js: GPIO/stepping/breakpoints work, no MicroPython compiler yet

## Open items

- **7 device stubs** hidden from palette — need drivers in bw-board
- **Code-tab debugger strip** — placement approved, not started
- **SW failure-mode tests** — identified but not built
- **Spec-update 006** (stale hobby_gearmotor refs): bw-circuit-ui's fix upstream
- **F_CPU from compile response**: stc-compiler doesn't echo f_cpu yet for AVR
  (shows as undefined in test output — adapter falls back to 16MHz correctly)
