## Native Arcade frame phases — 2026-10-13

CLAIMED — Codex Arcade scheduler; claim PR881 is merged. Initial branch
`lane/arcade-frame-scheduler-20261013`, base
`b86d1cb9f294052bd0ae6dc4cd97d5bc57193c55`.
The claim landed before product implementation. Source-phase and timer controls
are qualified; complete installed GUI cadence remains open.
Envelope: the Arcade-specific phase hook in `scripts/apply-vm-overlay.mjs`,
new `overlay/scratch-vm/src/extensions/crispstrobe/arcade/frame-phase.js`,
necessary phase/lifecycle hunks in that directory's `index.js`, focused
`test/makecode-arcade-frame-phase*.test.mjs` controls, this ledger and
[the scheduler contract](docs/ARCADE-FRAME-SCHEDULER.md).
Coordinate shared-file hunks with the existing Arcade integration owner.
Preserve other runtime patches, producer vocabulary/pins, particle factories,
import/export and independently owned complete-game qualification.
Qualify original startup through its first authored yield, initial frame delta0,
due pause/callback continuations, frame-fiber eligibility, one shared work
budget, scene ownership, Stop/disposal/restart and debugger guards. Retain the
observed missing update0 and delayed pause/creation caller failures; preserve
the separate original 50 fps / GUI compatibility-mode 30 fps cadence limit. No fixed tick delay,
counter/registry patch or diagnostic execution-order promotion. Exact-source
Code/Blocks/export/reimport/fresh SB3 and installed GUI comparisons are required
before closure; a private prototype is separate from product qualification.
