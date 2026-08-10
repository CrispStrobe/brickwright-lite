# bw-bundle — blocked items (campaign: circuit parity)

## OPEN: example crash — unreproducible headlessly

Owner reports loading an example crashes the browser window. Playwright
tests show 0 page errors. The stale-service-worker hypothesis is **ruled
out**: SW is network-first for documents (e695dd6), served hashes match
the latest deploy (verified with positive control). The crash is real and
unexplained.

**What would help:** the owner's exact steps, browser, and console output.
A crash for a hand-tester but not Playwright suggests browser-version or
existing-tab-state interaction (autosave restore, cached circuit data).

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
