## Robot Lab hub coverage, batch 2: SPIKE routes, SPIKE 3 Python, Code-tab hub calls — 2026-10-21

CLAIMED and done in one PR to main — Claude (hub coverage lane). New tests drive the real spikeprime
extension in the Lab physics over each SPIKE route: legacy spikeprimeble / spikeprimeBTC projects
(migrated), Scratch Link BT Classic and Scratch Link BLE (`test/bw-sim-spike-routes.test.mjs`, helper
`test/helpers/spike-lab-routes.mjs`). SPIKE 3 Python goes through the importer into the Lab
(`test/bw-sim-spike3-python-lab.test.mjs`). The Code-tab Python/JS hub-call gap is pinned as todo
(`test/hub-runtime-calls-to-blocks.test.mjs`). Two fixes to the virtual SPIKE 2.x RFCOMM double
(`lib/virtual-hub/spike-classic-scratch-link.js`, `spike-hub-state.js`): the port report streams, and
the distance is in cm. Matrix rows in `docs/ROBOT-LAB-HUB-COVERAGE.md`. Nothing under `bw-sim/`.
