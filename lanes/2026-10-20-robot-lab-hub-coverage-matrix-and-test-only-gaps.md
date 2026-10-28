## Robot Lab hub coverage matrix and test-only gaps — 2026-10-20

CLAIMED and done in one PR to main — Claude (hub coverage lane). New
`docs/ROBOT-LAB-HUB-COVERAGE.md` (hub x extension x route x code-flavour matrix from code and tests, gaps
ordered by user impact) and two new test files that drive the REAL bundled extensions against the
existing virtual hubs: `test/lab-hubs-coverage.test.mjs` (legoboostunified over Scratch Link BLE,
legopoweredup on the Move Hub and the City Hub) and `test/bw-sim-rcx-legorcx.test.mjs` (legorcx blocks
sent with its own block into the Lab RCX). No `overlay/scratch-gui/src/lib/bw-sim/**` change: the open
Robot Lab PRs #1123/#1127/#1129/#1130 own that tree; gaps that need it wait for them to merge.
