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

## Implementation and measured controls

Targeted supplier adoption is DONE; final-head hosted qualification remains
required. All four decoded bundles independently equal the actual Git object
bytes at `ff74f1309b8807713508884048292182a369f8f5`, with matching
canonical byte counts and hashes. Shared/default and every other pin and
metadata entry remain unchanged. Canonical offline/pin-history controls pass
44 tests with no skips, using the real supplier repositories.

The cutoff cause is proved by the same actual scalar and SIMD Jolt factories:
the old proximity cutoff settles near 111.7 degrees; leaving native rack limits
active without that cutoff reaches the geometric stop. Several intermediate
corrections failed the unchanged physical controls; those results are retained.
The final correction keeps the original incoming-impact brake, then permits
bounded torque toward the true geometric end once forward motion has stopped
or reversed. Native position stagnation also ends the impact phase at the
solver's actual coordinate resolution. It introduces no new physical tolerance
and never increases/reverses the current commanded torque. Approach state is
explicitly checkpointed and restored. Hinge/passive handling is unchanged.

All 64 complete affected motor/rack/steering/worker/forklift/slider controls
pass, plus 20 adjacent rack/end-stop/dialect/roundtrip controls, no skips.
Nineteen complete controls also pass with the actual baseline factory selected
by refusing only the SIMD capability probe. At 50 percent power the Differential
car settles at both 114.6-degree stops with the original impact, rest, chassis
yaw and velocity bounds intact. A checkpoint during impact replays every body
and joint frame exactly; omitting the new phase registrant fails that control.
Both measured existing Jolt providers now name only the new SPIKE-power test
as their additional actual consumer. No provider or dependency is added.

The first hosted qualification subsequently exposed a loaded Forklift hold
failure: the existing prolonged manual-drive API case stopped 0.527 degrees
from its target, outside its unchanged 0.5-degree bound. The original failure
is retained. The end-stop correction now retains the stationary external load
support measured from native motor and coupled limit impulses, reflected through
the existing coupling ratio. It uses the existing spring stiffness and clamps
the result within the commanded torque. Native position and angle stagnation
identify rest; there is no new tuning constant or tolerance. All coupled stop
reactions are included so a limit reaction cannot masquerade as a gravity load.

The learned support and phase remain checkpointed. An additional loaded
Forklift control exercises the original prolonged drive/Stop sequence and
replays every native body and joint frame through support and reversal.
All 94 controls in the complete affected and adjacent modules now pass with
the actual SIMD factory; all 29 rack, steering, motor-power and Robot Lab API
controls also pass with the actual baseline factory. Neither run skips tests.
Fresh production GUI/browser checks and final-head hosted qualification remain
required before landing this correction.
