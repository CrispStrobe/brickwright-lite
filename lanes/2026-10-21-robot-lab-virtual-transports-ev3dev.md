## Robot Lab virtual transports, part 2: a virtual ev3dev brick — 2026-10-21

CLAIMED and done in one PR to main — Claude (hub coverage lane, virtual transports). New files
`overlay/scratch-gui/src/lib/bw-sim/transports/virtual-http.js` (a `fetch` double for endpoints on the
network) and `virtual-ev3dev.js` (the HTTP requests the ev3dev extension sends to its on-brick bridge,
answered by the scene's EV3). Test `test/bw-sim-virtual-ev3dev.test.mjs` drives the real ev3dev
extension (`scratchtoev3`) in the Lab physics; the helper `test/helpers/virtual-transport-vm.mjs`
gains an `http` route. Matrix row in `docs/ROBOT-LAB-HUB-COVERAGE.md`. Stacked on part 1 (#1156).
