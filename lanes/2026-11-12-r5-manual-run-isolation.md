# R5 workflow manual-run isolation

Status: CLAIMED. Owner: R5 qualification continuation.

Scope: the workflow-level concurrency groups in the following owned workflows:
`ack-z80-cpm`, `arcade-controls`, `basic-oracle`, `build`, `debugger`,
`i80386-hdd-gui-actual`, `i8086-execution`, `makecode-arcade-bases`, `mobile`,
`native-installed-qualification`, `pascal-ack-image`, `robot-lab-own-firmware`,
`rust-notices`, `spike-linux-package`, `target-performance`, and `tauri`.
Keep existing push and pull-request supersession and label-group distinctions;
isolate manual, tag and other non-superseding events by unique run identity so
queued or running events cannot displace one another.

The focused policy test may be added under `test/`. The R5-folded
`test/i80386-hdd-gui-actual.test.mjs` and `test/rust-notices-generator.test.mjs`
may update their exact policy admission only while preserving historical byte
hashes, trigger and guard checks, and negative controls. Model measurements,
cycle qualification, vendor freshness and their separately claimed test files
are outside this scope. Do not change any other workflow body, dependency, pin,
product code, threshold or one-shot event.

Qualification: source-bound event/ref matrices and negative mutations, exact
historical reverse projections, affected CI and all enabled exact-head checks.
No claim of physical or browser qualification follows from policy tests.
