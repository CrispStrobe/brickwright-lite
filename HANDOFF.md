# bw-bundle handoff — 2026-08-12

## What was done this session (29b89ce)

### Devices extension registered and fixed
- **Re-registered** `devices` in `builtinExtensions` (`extension-manager.js`)
  and added a picker entry in the extension library (after Circuit, before TTS).
- **Runtime wiring bug fixed** (`devices/index.js`): constructor took no args,
  set `this._runtime = null`. Every `_board()` call returned null — all 36 block
  methods silently no-oped. Fixed: constructor takes `runtime`, register passes
  `Scratch.vm && Scratch.vm.runtime` (same pattern as `stc12/index.js`).
- 29 blocks visible, 7 stubs hidden (showdigit, setrgb, setpixel, clearmatrix,
  devicestate, ircode, whenirreceived). NeoPixel hidden on 12T, servo/motor/
  direction hidden on STC89 (no PCA, commit 69bd839).

### Browser-verified (Playwright, local build)
- Example 53-servo-sweep entered via Code ⇄ Blocks tab, To-blocks clicked
- `devices` extension loaded: YES
- `devices_setservo` blocks present: 2 (correct)
- Zero page errors
- STC config parsed: device=stc12c5a60s2, clock=11059200, pin led1
- 52/52 local tests pass, build succeeds (2 expected size warnings)

### Licence decision recorded
MPL-2.0 is owner-confirmed for bw-circuit-ui, bw-cfront, bw-parts, bw-bundle,
sb3-creator. Written into BLOCKED.md with full reasoning so nobody reopens it.

## Nothing in flight

All changes pushed to `main`. No branches, no stashes, no WIP.

## What I learned (not yet in a spec-update)

- **File ownership trap on VPS**: `overlay/scratch-vm/.../devices/` was owned by
  root (created by a root-run agent). Rebase failed with "Permission denied" on
  ~200 files across bw-circuit-ui, bw-board, test/. Fixed with
  `sudo chown -R claudeuser:claudeuser` on the whole repo. Future agents should
  check/fix ownership before rebasing if files were created by another user.

- **Remote had 41 new commits** when first push was attempted. The failed rebase
  left the repo needing recovery: `git stash`, `git reset --hard origin/main`,
  re-apply edits, commit, push.

## Prior session context (carried forward)

### Three-engine routing (649f40d)
- `debug-target-factory.js` routes `emulator` (emu8051), `avr8js`, `rp2040js`, `serial`
- Lazy imports: avr8js/rp2040js loaded on demand, STC12-only users never load them
- **Gap**: routing tests run in Node, not against the built bundle — a lazy chunk
  that 404s in production would not be caught

### Licence notices
- bw-circuit-ui (MPL-2.0), bw-board (MIT), sb3-creator (MPL-2.0): directory LICENSEs
- avr8js (MIT, 0.21.0), rp2040js (MIT, 1.3.3): THIRD-PARTY-NOTICES.md entries

### What was ruled out
- Node cannot reproduce the extension-block deserialization bug (browser-only)
- bw-debug is not vendored (8 files, lite's own glue code)
- **rp2040js execution** now exists for raw UF2/flash images: GPIO feedback,
  vector-table reset, instruction stepping, raw XIP breakpoints, registers, and
  code/SRAM memory access are tested. Still no MicroPython compiler,
  ELF/source-symbol mapping, yield points, or full peripheral parity.

## Open items

- **7 device stubs** hidden from palette — need drivers in bw-board before unhiding
- **Code-tab debugger strip** — placement approved, not started
- **SW failure-mode tests** — identified but not built
- **Spec-update 006** (stale hobby_gearmotor refs): bw-circuit-ui's fix upstream
- **AVR end-to-end**: boundary-D complete, Intel HEX/UF2 parsers built, factory
  wired. Needs avr-gcc compile endpoint (bw-cfront) and browser execution test.
