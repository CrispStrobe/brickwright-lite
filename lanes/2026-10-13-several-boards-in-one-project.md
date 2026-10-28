## Several boards in one project (radio pair first) — 2026-10-13

CLAIMED — VPS Claude (opus), `lane/multi-board-project-20261013`.
Goal: one project holds several boards, each owning its own program and
sprites, the board being a layer above sprites; first demo a micro:bit remote
driving a Calliope mini car over the simulated radio. One-board projects must
load, save, compile and decompile byte-for-byte as today.
Envelope, in landing order (each its own PR): (1) a board model helper under
`overlay/scratch-gui/src/lib/bw-boards/` and routing the existing applied-device
reads through it (`gui.jsx`, `stage-header.jsx`, `controls.jsx`,
`debug-panel.jsx`, `microbit-sim-pane.jsx`, `arcade-device-pane.jsx`,
`bw-debug/block-menu.js`, `pseudocode-importer.jsx` applied-device path,
`circuit-tab.jsx` device writers); (2) per-target board tag and additional
board configuration comments in the sb3 hooks (`scripts/apply-vm-overlay.mjs`,
`scripts/lib/*-sb3-hooks.mjs`); (3) in sb3-creator (own producer repository,
then a pin move here): `DEVICE <id> AS <Name>:` board sections, the per-board
configuration cursor, the decompiler's board sections, Calliope motor words;
(4) per-board MakeCode export/compile in
`overlay/scratch-gui/src/lib/bw-makecode/{export.js,microbit-translate.js}`;
(5) radio relay between two MakeCode simulator frames
(`scripts/makecode/host.html`, `makecode-sim-pane.jsx`) and a board strip in
`components/target-pane/`; (6) later, the firmware tier: a Calliope mini board
and a shared-air hook in bw-board, then a multi-machine runner here. Tracked
`packages/scratch-gui` twins and tests follow each step.
Not in scope: Arcade authoring, painter, Buffer, SPIKE and peer-session code;
no change to what a one-board project does. Evidence so far (not committed):
both tutorial programs compiled offline and run as firmware on the pinned
engine with the emulated radio stack; holding a remote button runs the
matching Calliope motor line on a shared air and nothing moves on separate airs.
