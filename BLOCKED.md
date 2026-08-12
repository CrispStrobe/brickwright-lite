# bw-bundle — blocked items (campaign: circuit parity)

## ~~Example crash~~ — RESOLVED (bw-circuit-ui 2567fa6)

Root cause: Sim on a circuit with no MCU crashed the app. Fixed by the
owner in `8f26f20` (vendoring bw-circuit-ui 2567fa6). Not browser-specific,
not an interaction artefact — the trigger was pressing Sim on a pure
circuit, which Playwright never enters. My inability to reproduce was
correct; the missing piece was the trigger.

## Vendoring responsibility

**The owner now drives bw-circuit-ui vendoring into lite directly.** Five
owner commits (`a0e2381`–`b6d8720`) vendor bw-circuit-ui from their own
machine. bw-bundle (me) steps back from vendoring bw-circuit-ui to avoid
two vendoring runs against a moving upstream — the exact pattern that
reverted three fixes earlier in this campaign.

bw-bundle continues to own: CI guards, bundle budget, bw-board vendoring,
WASM pinning, sb3-creator vendoring, extension conformance, and deploy
verification.

## OPEN: debugger visibility from the Code tab

Verified on production: Run/Sim controls are in the Circuit tab.
Pause/Step appear after a program starts. The Code tab has NO debugger
controls. **Owner: bw-bundle.**

The DebugPanel is architecturally in the Circuit tab — it needs the
board, emulator, and pin declarations, all of which load there. Surfacing
it from the Code tab requires either: (a) a shared panel component that
mounts in both tabs, or (b) a link/button in the Code tab that switches
to the Circuit tab. Option (b) is simpler and matches the "one panel, one
owner" pattern.

## RESOLVED

- ~~loadExample must fill both code AND circuit~~ — already implemented
  in circuit-tab.jsx:190 `loadExampleProgram()`. Fetches program.bw,
  parses through SB3Creator, loads project, sets vm.runtime.stc.
- ~~Slice 1: debugState.bwMs~~ — RESOLVED (ceafc8d)
- ~~Slice 3: project.stc persistence~~ — IN PROGRESS
- ~~STC89 12T timing~~ — RESOLVED (ba6e001)
- ~~Naming rule~~ — RESOLVED (b787135 + 956fab6)

## FINDING: To-blocks drops stc12 extension blocks

Headless repro (Playwright, production site):
- Textarea filled with: DEVICE/CLOCK/PIN + WHEN flag clicked + turn on/off led1 + wait
- ⇦ To blocks clicked
- Stage has 5 blocks: event_whenflagclicked, 2× control_wait, 2× math_number
- MISSING: stc12_setpin (turn on/off led1) — 0 stc12 blocks
- stc.pins is EMPTY ([]) — PIN declaration not parsed
- editingTarget is Stage (correct for stage-only project)

The loss is in the parse → generateSB3 → loadProject chain. Either:
1. SB3Creator.parse() does not extract pins from the textarea input, or
2. The stc12 extension blocks are created but vm.loadProject drops them
   because the extension is not registered before the blocks arrive

**Owner: bw-bundle.** Next step: check creator.project after parse() in
the same headless run — does it have stc12 blocks and pins before
generateSB3?

## ~~To-blocks drops stc12 blocks~~ — FIXED (e155ca1), VERIFIED

**Post-fix headless repro (production, run 31366606123):**
- Hand-built .sb3 with extensions:["stc12"] + 2× stc12_setpin blocks
- vm.loadProject → Stage has **7 blocks**, stc12_setpin **present**
- stc12 extension **loaded** (pre-loaded from declared extensions)

Pre-fix: 5 blocks, 0 stc12. Post-fix: 7 blocks, 2 stc12_setpin. ✓

Root cause: sb3.js built extensionIDs from opcodes during deserialization,
dropping blocks whose extension prefix was unknown — circular.
Fix: deserializeProject pre-loads declared extensions before parsing targets.

**bw-blocks:** your side was clean (confirmed). The loss was in
vm.loadProject's deserialization, not in sb3-creator.

## IN PROGRESS: pane-slots (gui.jsx)

**Owner: bw-bundle.**

The reducer models content slots (`upper`/`lower` per column) and gui.jsx
reads only `.size`. PaneColumn exists and is unreferenced.

**Approach decision needed:** The Scratch `<Tabs>` component hardcodes the
block palette + workspace as one TabPanel. The "code" preset wants the
pseudocode editor in the middle column instead. Two options:

1. **Decompose Tabs** — break the palette and workspace into separate
   content surfaces that PaneColumn can place independently. High risk,
   breaks the existing tab switching behavior.

2. **Content swap inside the existing TabPanel** — when the preset says
   `middle.upper === 'code'`, render the pseudocode editor in the blocks
   TabPanel instead of the workspace. Lower risk, keeps Tabs intact.

Option 2 is simpler and preserves the existing tab structure. The Code
tab already exists as TabPanel index 3 (PseudocodeImporter); the preset
would just change which TabPanel is selected, not where content renders.

**Status:** reading the structure, not yet editing gui.jsx.

---

## Wind-down note (2026-08-10, quota pause until Aug 15)

### What was just finished
- Licence notices for all three vendored sources: bw-circuit-ui (MPL-2.0,
  directory LICENSE + THIRD-PARTY-NOTICES), bw-board (MIT, directory LICENSE +
  THIRD-PARTY-NOTICES), sb3-creator (MPL-2.0, sb3-creator-LICENSE + THIRD-PARTY-NOTICES).
- Each sync script verified: none can delete the notice it sits beside.
- integrate.mjs confirmed to carry all three into packages/ via recursive cpSync.
- bw-debug confirmed as lite's own code, not vendored — no notice needed.

### What is NOT done
1. **SW failure-mode tests** — Playwright tests for chunk 404, fetch timeout,
   stale entry vs fresh chunks. Identified but not built. The owner found the
   white-screen bug by hand (9886889); these would catch the class.
2. **Code-tab debugger strip** — placement approved (strip under Circuit tab bar,
   shared runner via vm.runtime.bwDebugRunner). Not started. Owner may build it.
3. **Pane-slots full routing** — content swap works, full PaneColumn decomposition
   not done (high risk, not worth it per coordinator).

### What was ruled out (expensive to rediscover)
- **Node cannot reproduce the extension-block deserialization bug.** sb3.js in
  node keeps blocks with unknown extension prefixes; the browser drops them.
  Any guard for this class MUST be a headless browser test. The CI verify-gui
  job already has one (e155ca1 extension guard).
- **bw-debug is NOT vendored.** 8 files, no sync script, no upstream repo. All
  lite's own glue between sb3-creator design docs and bw-board's session API.
- ~~Devices extension unregistered (ad0384f)~~ — RE-REGISTERED. 29 of 36
  blocks have implementations that drive parts through `circuitBoard`. 7 stubs
  (showdigit, setrgb, setpixel, clearmatrix, devicestate, ircode, whenirreceived)
  remain hidden from the palette; methods exist so saved projects load. Runtime
  wiring bug fixed (constructor now receives runtime from adapter).
- **SDCC WASM byte-identity** not verified. Behind localStorage flag. Preview only.
- **Licence choice: CONFIRMED (2026-08-12).** Owner directly confirmed MPL-2.0
  for bw-parts, bw-circuit-ui, bw-cfront, bw-bundle, and sb3-creator (including
  relicensing sb3-creator from AGPL-3.0 to MPL-2.0, needed because lite vendors
  ten of its files into a BSD-3 tree and AGPL anywhere in a bundle blocks
  app-store distribution). Reasoning: MPL-2.0 requires attribution, keeps
  improvements open at file level, permits combination into a larger work under
  other terms, and §3.3 leaves the door open to GPL/AGPL later while the reverse
  would not. The commits that appeared without explanation (01860ac, e3ad9f6) were
  applied by the owner over ssh — unannounced, not unsettled.
  Repos NOT under MPL-2.0 are inherited, not chosen: ucsim-stc = GPL-2 (from
  ucsim), emu8051-stc = MIT (from Jari Komppa), brickwright-lite = BSD-3 (from
  upstream Scratch), stc lab = MIT + Apache-2.0 NOTICE for two derived examples.

## RESOLVED: camera hit-testing (a798d56)

Owner's schematic camera verified by headless Playwright hit-testing
(01-blink, "5V" label, `elementFromPoint` + parent walk to symbol `<g>`):

| Scenario | Hit at NEW pos | Miss at OLD pos |
|---|---|---|
| Pan (3×30px wheel) | HIT | MISS |
| Cursor-anchored zoom (3×ctrl+wheel) | HIT | HIT (correct — anchor keeps target in place) |
| Pan + zoom combined | HIT | MISS |

No stale hit regions. SVG viewBox-based camera updates hit areas
correctly — the browser recomputes from the viewBox, unlike CSS
transforms which can leave hit regions at old coordinates. The
cursor-anchored zoom correctly keeps the point under the cursor
nearly stationary (11px shift over 3× zoom), so the old position
still hits — this is the intended behavior, not a stale region.

The owner's camera arrived correct.

## OPEN: spec-update 006 (stale hobby_gearmotor refs) — bw-circuit-ui's fix

bw-parts `006-stale-gearmotor-refs.md`: 5 code references to the old slug
`hobby_gearmotor` survive in bw-circuit-ui after the sidecar resync. DRC,
wire router, circuit model, and thumbnail renderer still match the old name.
lite carries the same stale refs via the vendor — fixing them here would be
overwritten by the next sync. bw-circuit-ui must fix upstream, then we
re-vendor.

### Spec-update convention

Adopted per bw-parts `a6f9240 CONVENTION.md`. At session start, scan
`/mnt/volume1/code/*/spec-updates/` for items addressed to bw-bundle or
lite. Highest acted on: bw-parts 005 (sidecar drift, resolved `3ac31ad`).

## RESOLVED: sidecar-count drift (115→123)

bw-circuit-ui `4064e96` resynced from bw-parts. Vendored into lite
at `3ac31ad`: 123 JSON + 123 SVG, 4 old-name files deleted, LICENSE
intact. The sync script now deletes files that vanish upstream (with
a KEEP set protecting LICENSE). 53/53 tests pass.

## RESOLVED: schematic zero-wires defect

Headless verification (Playwright, 3 cases, deployed site at `c2c1e62`):
- Case 1 (Blink): 6 symbols, 3 nets, 12 segments — unchanged by fix
- Case 2 (Dimmer): 7 symbols, 5 nets, 22 segments — unchanged by fix
- Case 3 (LED chaser): 20 symbols, **0→20 nets**, **0→67 segments**, 0→9 junctions

Root cause: `fromJSON` did not resolve terminal aliases against each part's
real terminal list. Wire endpoints referencing legacy names never matched,
`_syncNetlist` produced 0 nets, schematic drew 0 wires. Fixed in
bw-circuit-ui `92c6450`. Cases 1 and 2 were unaffected — their circuits
already resolved. Screenshots: `/tmp/schematic-{1,2,3}-*.png`.

## PLANNED: avr8js emulator integration

**Owner: bw-bundle.** Not started — write-up only, to hand forward.

### Verified

- **avr8js** npm: MIT, wokwi/avr8js, v0.21.0 (Arduino 8-bit AVR simulator)
- **rp2040js** npm (later): MIT, wokwi/rp2040js, v1.3.3 (RP2040/Pico)
- Both need THIRD-PARTY-NOTICES.md entries when installed

### Adapter contract (coordinator, bw-board)

```
createAvr8jsAdapter({clockHz=16MHz, vcc=5, program?: Uint16Array})
  → { cpu, loadProgram(words), attachBoard(board), advanceNs(deltaNs), timeNs(), stats }
```

Boundary A identical to emu8051. Pin names: D0-D13, A0-A5
(ATMEGA328P_PINS map exported). Time-first-edge-second rule.

### What needs building

1. Intel HEX → Uint16Array parser (little-endian byte pairs, small)
2. `targetKind: 'avr8js'` path in debug-runner.js (parallel to emu8051, lines 345-410)
3. `getTargetKinds()` entry in debug-target-factory.js
4. avr-gcc compile endpoint — bw-cfront's track, not ours
5. THIRD-PARTY-NOTICES.md entries for avr8js (and rp2040js when added)

### What was ruled out

- rp2040js is later — no compile backend, no adapter contract yet
- Do not guess the adapter API — the contract must land on bw-board master first
  (as of 2026-08-10, `avr8js-adapter.js` not yet on master)
