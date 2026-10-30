## Arcade source-prelude identity during workspace projection — 2026-10-21

SOURCE candidate in the existing Arcade GUI/runtime integration repair lane.
The VM-to-Blockly workspace projection disables event generation only during
its synchronous clear/load and restores the previous disable depth and VM
listener in finally. Already queued user events remain queued. This prevents
synthetic delete/create events from replacing the current VM declaration
objects after the source prelude has bound them. Source-scalar/ref ownership,
project generation and declaration identity checks are unchanged.

Focused controls evaluate the actual handler and genuine tracked Blockly event
queue/filter/disable source with explicit workspace/DOM fixtures, including
a prequeued user edit, a rejected replacement declaration, nested disable depth,
load/parse/logger failures, listener restoration and original metrics/undo work.
They do not mount React or establish the browser journey. Complete focused and
existing scalar controls plus the unchanged legacy painter/browser save/restart
journey remain required; no assertion, timeout or authority relaxation is made.
