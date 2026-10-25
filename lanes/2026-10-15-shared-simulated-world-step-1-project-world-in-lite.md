## Shared simulated world, step 1 — project world in Lite — 2026-10-15

CLAIM — Claude, branch feat/world-step1-20261015, [local path omitted]
isolated blobless clone. Expose bw-board's per-project world (bw-board
`src/world.js`, its own claim/PR; adopted here by a normal pin bump through
the repo's writers) in Lite: one world per project shared by every simulated
board the Circuit tab and its runners build (ambient temperature, humidity,
air pressure, light, sound); the existing bench-temperature control drives the
world's temperature; new Lite-native `bwworld` blocks "set world [KEY] to
[VALUE]" and "world [KEY]"; persistence with the project in a Stage comment
written only when the world differs from its defaults, so projects without a
world stay byte-for-byte unchanged.

Envelope: this ledger; new `overlay/scratch-gui/src/lib/bw-world.js`;
`overlay/scratch-gui/src/lib/bench-temperature.js`,
`overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx` (world
attach/handler lines only); new `overlay/scratch-vm/src/extensions/crispstrobe/bwworld/`;
extension-manager builtin row, extension library entry and
`scripts/spike/bundled-upstream.mjs` LITE_ONLY row; their tracked
packages/ twins; new focused tests; `docs/WORLD.md`; the bw-board pin bump
surfaces the writers move. No SPIKE arena/pane/native file and nothing the
SPIKE G02/G03 lanes claim. Steps 2 (positioned sensors) and 3 (surface
colour/distance) get their own claims. Merge this claim before implementation.
