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
- **Devices extension unregistered** (ad0384f) — 31 of 36 blocks were stubs.
  Re-register when drivers exist.
- **SDCC WASM byte-identity** not verified. Behind localStorage flag. Preview only.
- **Licence choice is owner's call.** MPL-2.0 was added to bw-circuit-ui (01860ac)
  and bw-bundle (e3ad9f6). Owner has not ruled. Do not change any LICENSE file.
