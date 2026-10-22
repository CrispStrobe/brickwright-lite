## Robot Lab virtual transports, part 4: NXT over Web Serial and the bridge, SPIKE over the bridge — 2026-10-21

CLAIMED and done in one PR to main — Claude (hub coverage lane, virtual transports). Re-vendors
legonxt and spikeprime at CrispStrobe/extensions 5841b15 (#58: legonxt's serial and bridge backends
could not connect; spikeprime's BridgeLink sent the relay base64) with `scripts/spike/vendor-bundles.mjs`
(`UPSTREAM_COMMIT`, `bundled-upstream-pins.json`; no other bundle moved). New
`overlay/scratch-gui/src/lib/bw-sim/transports/virtual-spike-stream.js` (the 2.x REPL double as a byte
stream). `test/helpers/spike-lab-routes.mjs` gains route 'bridge'. Tests
`test/bw-sim-virtual-transports-nxt.test.mjs`, `test/bw-sim-spike-bridge.test.mjs`. Matrix rows in
`docs/ROBOT-LAB-HUB-COVERAGE.md`. Stacked on parts 1-3 (#1156, #1157, #1158). Touches the pin files
#1128 also changes (different entries); lands after it.
