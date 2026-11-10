# I6: MakeCode import, micro:bit V2 Run reaches its Debug pane again

Status: claim and change in one PR. Owner: MakeCode lane (task I6 in
`docs/OPEN-TASKS-2026-09-29.md`, section I). Base: main `d318ed6e22fb`.

Scope: `pseudocode-importer.jsx` (overlay and its `packages/` mirror),
this file, the I6 row. No engine, supplier pin, workflow, gate or assertion change.

Cause: #1691 made the circuit tab and gui keep a device dock (`makecode`,
`controller`, ...) in memory and leave the debugger column to gui.jsx while
one is selected. "Run on the emulated micro:bit V2" chose the debugger dock
from localStorage alone and only announced it when storage still named a
device dock. When storage disagrees with the live panes (private mode,
another tab, a cleared origin; in the browser gate, the harness init script
clears localStorage again in every same-origin frame, including the MakeCode
simulator frame), the panes stayed on the MakeCode dock and no Debug pane was
mounted: `{"dock":null,"panels":[]}`. Not the engine split of I1/I2: the
LabWired engine is never reached.

Change: the emulate path always stores and announces the chosen debugger dock
(the stored debugger dock, or `right` instead of a device dock).

Done when: `verify-makecode.mjs` passes on the browser (light) shard with no
check weakened.
