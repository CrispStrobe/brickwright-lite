## Robot Lab virtual transports, part 3: the Powered Up / BOOST HTTP bridge — 2026-10-21

CLAIMED and done in one PR to main — Claude (hub coverage lane, virtual transports). New file
`overlay/scratch-gui/src/lib/bw-sim/transports/virtual-ble-bridge.js`: the HTTP BLE bridge
legopoweredup's and legoboostunified's BridgeAdapter talks to (`/scan`, `/connect`, `/write`,
`/notifications`, `/disconnect`), served by the scene hub's GATT peripheral. `test/helpers/lab-hubs-vm.mjs`
gains `transport: 'bridge'`; `test/lab-hubs-bridge.test.mjs` drives the real extensions in the Lab
physics. Matrix rows in `docs/ROBOT-LAB-HUB-COVERAGE.md`. Stacked on parts 1 and 2 (#1156, #1157).
