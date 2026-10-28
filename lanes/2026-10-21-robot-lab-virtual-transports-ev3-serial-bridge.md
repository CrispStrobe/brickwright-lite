## Robot Lab virtual transports, part 1: EV3 over Web Serial and the WebSocket bridge — 2026-10-21

CLAIMED and done in one PR to main — Claude (hub coverage lane, virtual transports). New files only
under `overlay/scratch-gui/src/lib/bw-sim/transports/`: `virtual-serial.js` (a `navigator.serial`
double whose ports are the BT-classic registry's peripheral records) and `virtual-bridge.js` (a
WebSocket double for an extension's local relay, framing per extension: binary, base64 or text).
Test helper `test/helpers/virtual-transport-vm.mjs` and `test/bw-sim-virtual-transports-ev3.test.mjs`
drive the real ev3comprehensive through its own connect blocks, with no Scratch Link present, to the
Virtual EV3 in the Lab physics (wall stopper, plus controls). Matrix row in
`docs/ROBOT-LAB-HUB-COVERAGE.md`. No hub, session or extension file changes.
