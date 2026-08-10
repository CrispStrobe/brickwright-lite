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

The DebugPanel renders in the Circuit tab when a project has PIN
declarations. Owner wants it discoverable from the Code tab too. Not
verified on production. **Owner: bw-bundle.**

## RESOLVED

- ~~loadExample must fill both code AND circuit~~ — already implemented
  in circuit-tab.jsx:190 `loadExampleProgram()`. Fetches program.bw,
  parses through SB3Creator, loads project, sets vm.runtime.stc.
- ~~Slice 1: debugState.bwMs~~ — RESOLVED (ceafc8d)
- ~~Slice 3: project.stc persistence~~ — IN PROGRESS
- ~~STC89 12T timing~~ — RESOLVED (ba6e001)
- ~~Naming rule~~ — RESOLVED (b787135 + 956fab6)
