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
