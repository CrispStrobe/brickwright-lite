# Complete the published motor-power supplier adoption

CLAIMED — owner: user-requested PR repair sweep, branch
`lane/motor-power-supplier-adoption-claim-20261022`, base `b6def08e8`.
Continues PR1162 and the merged PR repair claim; preserve other worktrees.

Actual current-main composition retains the qualified SPIKE/compiler pins but
the EV3 and Powered Up native program tests have no motor-power opcode in their
bundled extension. Their bundles still use the older shared default. PR1162
previously moved that default globally; do not repeat that unrelated adoption.

Own targeted immutable adoption of the already published
`CrispStrobe/extensions` source `ff74f1309b8807713508884048292182a369f8f5`
for only `ev3comprehensive`, `legoboostunified`, `legonxt` and `legopoweredup`.
Review each actual source delta, preserve subsequent fixes, record independent
per-extension keys in `vendor-pins.json` and exact entries in
`scripts/spike/bundled-upstream.mjs`. Regenerate only those four `index.js`
bundles and the canonical `bundled-upstream-pins.json` through
`scripts/spike/vendor-bundles.mjs --only`; integrate canonical mirrors.
Keep the shared default, all other supplier pins and installed dependencies.

Require actual upstream commit/source identity, offline/fetched bundle and
pin-chain controls, genuine EV3/NXT and Powered Up program/transport/duty
measurements, dialect roundtrips and final exact-head qualification. No local
supplier fork, workflow/gate/resource change, firmware or native activation.
The separate observed steering-stop physical failure remains a blocking result;
this adoption does not waive or broaden its existing physical assertions.

## Early rack drive cutoff

The native program reaches a peak near 119.5 degrees but settles near 111.7,
short of the unchanged 114.6-degree geometric stop. Actual scalar and SIMD
factory runs produce identical tracks, with the motor still busy. Current
`physics/jolt-core.js` cuts torque within 0.5 mm of a slider limit, a substantial
fraction of a tooth; the prior rack phase rebasing concealed this early cutoff.

Own only the slider end-stop proximity/drive-cutoff rule in that file and
focused controls in `test/bw-sim-rack-frame.test.mjs`, preserving the complete
Differential car assertions. Prove the cutoff cause against actual slider and
hinge measurements. Derive any proximity correction from the existing physical
contact/constraint accuracy contract, not from an observed passing angle.
Preserve hinge-stop handling, drive reversal, passive joints, torque limits,
collision filters/shapes, timesteps, solver budgets and every physical bound.
Require complete affected rack, motor, steering and rollback controls plus
final exact-head hosted physical/browser qualification before normal landing.
