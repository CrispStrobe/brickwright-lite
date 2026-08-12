# bw-bundle handoff — 2026-08-12 (session 3)

## What was done this session (0c1bb42)

### Pico debug chain: wired into the app

**Re-vendored:**
- sb3-creator at 3e2659b (DEVICE PICO + real PWM on AVR/RP2040)
- bw-board at 32582aa (rp2040js adapter + debug target + digital-input leg on both adapters)

**Overlay-specific fixes re-applied after vendor:**
- avr8js-adapter.js: lowercase pin names (`name.toLowerCase()`) to match
  bw-parts sidecar terminal conventions; ADC reads lowercase `a${channel}`
- board.js: `isMcuKind()` helper treats `arduino_uno`, `arduino_nano`,
  `pi_pico` identically to `mcu` in solver + walk chain
- infer-netlist.js: `pinId` function uses `p.where` for Arduino/Pico pins;
  fixed self-referencing bug (`const pid = pid(pin)` → `const pid = pinId(pin)`)
- checkWiring also updated to use `where`-aware pin IDs

**Device selector (pseudocode-importer.jsx):**
- Pico moved from MicroPython group to new "Raspberry Pi" group
- `compile: true`, `emulator: 'rp2040js'`

**debug-runner.js:**
- `COMPILE_TARGET` map: `'pico' → 'rp2040'`
- `selectDebugTargetKind('pico')` → `'rp2040js'`
- `attachRp2040js`: wires serial, glow, trace, breakpoints, value resolver
- `build()`: base64 → Uint16Array halfwords (little-endian) for Pico raw binary

**debug-target-factory.js:**
- `'rp2040js'` added to `getTargetKinds()` (label: "Simulated (RP2040)")

**New file: rp2040js-debug.js**
- Boundary-D debug target for RP2040 (from bw-board): breakpoints, stepping,
  position reporting, halt policy = freeze-timers

### Browser-verified (Playwright, local build)
- Pico appears in device selector
- Code compiles to blocks with DEVICE PICO
- "Raspberry Pi Pico" and "rp2040js" confirmed in bundle
- All chunks (bw-board, bw-debug, sb3-creator) contain rp2040/pico code
- Debug routing: pico→rp2040 compile target, rp2040js attach path present
- Zero page errors

### Build deployed
- Pushed to main at 0c1bb42, CI build queued

## Nothing in flight

All changes pushed to `main`. No branches, no stashes, no WIP.

## Prior session context (carried forward)

### AVR debug chain (session 2, d29198f)
- Full AVR debug wiring: Nano blink, yield breakpoints, serial output
- Licence confirmation: MPL-2.0 for bw-parts, bw-circuit-ui, bw-cfront, bw-bundle, sb3-creator

### Devices extension (e2ad1cf)
- Re-registered in builtinExtensions, picker entry added
- Runtime wiring bug fixed (constructor receives runtime)
- 29 blocks visible, 7 stubs hidden

### Three-engine routing (649f40d)
- debug-target-factory.js routes emulator/avr8js/rp2040js/serial
- Lazy imports: avr8js/rp2040js loaded on demand

## Open items

- **Full Pico debug chain test**: needs stc-compiler.vercel.app to accept
  target "rp2040" — coordinator to verify with production proof
- **7 device stubs** hidden from palette — need drivers in bw-board
- **Code-tab debugger strip** — placement approved, not started
- **SW failure-mode tests** — identified but not built
- **Spec-update 006** (stale hobby_gearmotor refs): bw-circuit-ui's fix upstream
- **F_CPU from compile response**: stc-compiler doesn't echo f_cpu yet for AVR
  (shows as undefined in test output — adapter falls back to 16MHz correctly)
- **bw-board pin name convention**: bw-board source still uses uppercase pin names
  on avr8js-adapter; overlay has the lowercase fix — next sync will need re-apply
