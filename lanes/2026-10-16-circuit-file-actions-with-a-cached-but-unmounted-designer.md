## Circuit File actions with a cached but unmounted designer — 2026-10-16

CLAIMED — Codex root,
branch `fix/circuit-file-wake-20261016`, claim base canonical main `7ce90fc38`.
Prepare the implementation on the already qualified local combined A13 graph
`6681f1868`, then reconcile current main, including the independent Sim Lab
addition, before final source qualification. This does not change package pins.
Actual combined browser evidence retains Save circuit from Code producing no
download after the designer had already been loaded. The debugger-only right
portal unmounts the designer, while `_circuitFileWake` mistakes cached
`state.Designer` for a mounted command receiver. Cold cached-component loading
and mounted-receiver readiness must remain distinct.

Own only the File-command wake/replay and connected Circuit-tab activation in
`overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx` and its exact
package mirror, focused `test/circuit-file-menu-reach.test.mjs` controls, and
cold/warm Code-tab actual File-menu journeys in existing
`scripts/verify-circuit-export-completeness.mjs`, plus this ledger. Reveal the
existing Circuit view on an explicit command that lacks a receiver, queue its
action, and replay through the existing upstream channel after the receiver
mounts. Preserve existing mounted single delivery, replay suppression, lazy
loading, debugger sessions and all four existing actions.

No supplier/pin, runtime, serialized circuit, new file format, editor-shell,
workflow/budget or other owner's feature change. Preserve original failures
and require actual menu-driven download/import and focused omitted-wake and
omitted-replay negatives; no direct VM state injection or invented output.
Merge this claim before implementation. Source merge requires all enabled
exact-head CI, with normal composition preserving the pending A13 CPX bridge.
