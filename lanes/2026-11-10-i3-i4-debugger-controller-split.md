# I3 + I4: debugger Pause beside the x86 Widgets dock

Status: claim and change in one PR. Owner: browser-shard failure lane (rows I3,
I4 of `docs/OPEN-TASKS-2026-09-29.md`). Base: main `d318ed6e22fb`.

Scope: `overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx` (and
its integrated `packages/scratch-gui` copy), `test/debugger-pane-state.test.mjs`,
`test/circuit-designer-ux-contract.test.mjs`, rows I3/I4. No verifier, gate,
threshold, pin, workflow or debug-panel change.

Cause: #1691 made `CircuitTab` remember device docks (`controller`, ...) and
made `_stagePortalOn()` return false for every one of them. Before it, a
`controller` selection was refused there, so the debugger kept its circuit dock
(`right` by default) and `_layoutStageHost` split the stage column with the
Widgets dock: Widgets above, debugger below (the layout documented at
`data-bw-stage-dock` in gui.jsx). An x86 machine run selects the controller
dock, so after #1691 the debugger portal was no longer shown at all, and both
browser gates failed waiting for its Pause button.

Change: `_controllerSplitLive()` — the `controller` dock beside a debugger with
a live machine or program (`machineBooted` or a driving STC program) — keeps
the stage portal, the debugger pane branch and the split layout. Every other
device dock, and `controller` without a live debugger, still owns the whole
column as #1691 intended. The verifiers are unchanged.

Acceptance: `verify-i80386-freedos-vga-browser.mjs` and
`verify-debugger-pause-hit.mjs` pass on the browser shards; unit tests cover the
split and a mutant that drops it.
