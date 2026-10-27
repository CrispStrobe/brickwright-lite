# Robot Lab brick buttons: default only with handlers, optional in Manual controls

Status: CLAIMED together with its change (one PR).
Owner: Robot Lab UI session, isolated worktree. Base: main `7d2c3ce1d45`.

## Owned scope

- `overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-brick-handlers.js` (new)
- `overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-pane.jsx` (brick panel placement only)
- `overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-motor-mixer.jsx` (optional Brick controls section)
- `test/robot-lab-brick-controls-default.test.mjs` (new)
- `scripts/lib/sim-lab-connections-gate.mjs` (opens the panel via Manual controls when not shown by default)
- `test/ci-browser-scope.test.mjs` (expected shard list synced with the robotaddon10–12 shards already on main; main was red)

The "Brick buttons" panel shows by default only when the program uses a
brick-button block; otherwise Manual controls offers a folded "Brick controls"
section with the same panel. Hold behaviour and accessibility are unchanged.
