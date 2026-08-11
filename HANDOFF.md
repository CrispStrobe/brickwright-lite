# bw-bundle handoff — 2026-08-11

## What was done

### Three-engine routing (649f40d)
- `debug-target-factory.js` routes `emulator` (emu8051), `avr8js`, `rp2040js`, `serial`
- Unknown kind throws loudly — no silent default to 8051
- 7 assertions in `test/debug-target-routing.test.mjs`, 86/86 suite green

### Lazy imports (4faecb7, verified in 649f40d)
- avr8js and rp2040js adapters are dynamically imported inside their factory
  functions, not at the top level. An STC12-only user never loads them.
- Tests 6–7 in the routing suite import each adapter from the integrated
  `packages/scratch-gui/src/` tree and assert the constructor function exists.

### What those tests CANNOT see
**Built-bundle chunk resolution.** The routing tests load from
`packages/scratch-gui/src/` (Node, pre-webpack), not from `build/chunks/`.
A lazy chunk that 404s in production would not be caught by any test in the
suite. This is the single most important gap: the avr8js and rp2040js
adapters were made lazy specifically so they load on demand, and a lazy
import that fails only for the users who need it is the exact failure shape
this project has caught twice before (the flag gate whose `import()` fired
before the check, and the schematic that rendered every symbol and no wires).

Testing this requires a headless browser against the deployed site that
actually triggers each engine path — which requires a compile endpoint for
each architecture. The AVR endpoint is bw-cfront's track and not yet
deployed. Until then, CI's webpack build is the only check that the chunks
exist, and it says nothing about whether they resolve at runtime.

### Clean-install-from-lockfile
Not tested end-to-end locally. The lockfile is tracked (`c1692f0`) and CI
runs `npm install` from it, so CI is the de facto test. A local
reproduction would duplicate CI but would catch a lockfile that names a
package the registry no longer serves.

### Sidecar drift — closed (3ac31ad)
115 → 123 sidecars, 4 renames resolved (old files deleted). Sync script
now deletes files that vanish upstream, with a KEEP set protecting the
MPL-2.0 LICENSE. Verified: 123 JSON, 123 SVG, LICENSE intact.

### Licence notices
- **bw-circuit-ui** (MPL-2.0): directory LICENSE in `overlay/.../bw-circuit-ui/LICENSE`.
  MPL is file-level copyleft; vendored files stay MPL inside the BSD-3 bundle (§3.3).
  Source availability: the vendored JS in this public repo IS the source (§3.2a).
  Sync script cannot delete it (KEEP set).
- **bw-board** (MIT): directory LICENSE in `overlay/.../bw-board/LICENSE`.
  Sync script discovers only `.js` files; LICENSE is safe.
- **sb3-creator** (MPL-2.0): `overlay/.../lib/sb3-creator-LICENSE` with file manifest.
  Sync script writes a hardcoded FILES list that does not include it.
- **avr8js** (MIT, 0.21.0): THIRD-PARTY-NOTICES.md entry. npm dependency in
  `integrate.mjs`, lazy-imported.
- **rp2040js** (MIT, 1.3.3): THIRD-PARTY-NOTICES.md entry. npm dependency in
  `integrate.mjs`, lazy-imported.

### Camera hit-testing (0c5a9d2)
Owner's schematic camera (a798d56) verified correct. Repeatable Playwright
spec at `scripts/verify-interaction.mjs`:
- Pan: hit at new position, miss at old
- Cursor-anchored zoom: hit at new, anchor keeps target in place (≤20px shift)
- Pan+zoom: hit at new, miss at old

### Device selector (1ceb065)
Grouped dropdown in Code tab header: STC12 (6), Arduino (3), MicroPython (2).
Reads/writes DEVICE line in pseudocode buffer. Publishes `vm.runtime.bwDeviceCore`
and `vm.runtime.bwDeviceId` for the debug panel.

### Schematic verification — closed (c49f2d7)
Case 3 (LED chaser) went from 0→20 wire nets after vendoring 92c6450.
Instrument committed at `scripts/verify-schematic.mjs`.

## What was ruled out

- **Node cannot reproduce the extension-block deserialization bug.** The browser
  and Node disagree about whether sb3.js drops blocks with unknown extension
  prefixes. Any guard for this class must be a headless browser test.
- **bw-debug is not vendored.** 8 files, no sync script, no upstream repo.
  Lite's own glue code.
- **Devices extension unregistered** — 31 of 36 blocks were stubs. Re-register
  when drivers exist.
- **rp2040js execution** is later — no compile backend, adapter contract is
  in the factory but untested end-to-end.

## Open cross-repo items

- **Spec-update 006** (stale hobby_gearmotor refs): bw-circuit-ui's fix. 5 code
  references to the old slug survive. Lite carries them via the vendor — cannot
  fix without the next sync overwriting. Highest acted on: bw-parts 005.

## AVR integration — parked as plan

Written up in BLOCKED.md. avr8js/rp2040js MIT verified, adapter contracts
documented, Intel HEX parser built, factory wired, debug-runner path exists.
What remains: avr-gcc compile endpoint (bw-cfront), end-to-end execution test
(bw-board), block-level debugging for AVR (yield-point model).
