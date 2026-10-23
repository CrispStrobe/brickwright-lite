# Root Bridge import-profile investigation

DONE — investigation; owner: Robot Lab mechanics intake; isolated implementation
branch `lane/integral-library-20261022`. This closes the bounded extension of
claims #1238 and #1240; implementation and final qualification stay in that lane.
Other owners' worktrees, supplier menus/notices, NXT/Run/sensor/Arcade work and
the four protected physics/compile files remain preserved.

The original comparison suggested declaring the imported model's 0.02 N m
bearing resistance independently of author credit. Further isolation showed
that the ordinary importer also changes collision filtering and relieves hinge
loops. Resistance alone did not repair the authored machine. Actual contact
records instead identified right-input rails/supports crossing the left input
and passive output. Full construction checks also found shared holes and
intersecting studded feet that a functional run could not establish as buildable.

The mechanical repair uses 447 real placements, shorter rails and spines,
relocated crossbars, individual Technic feet and correctly engaged foundation
studs. Ordinary and serialized strict native programs complete all fifteen
input cells with every pin hinge retained, zero imported resistance and normal
authored collision rules. The actual passive geometric mean error is below
0.025 mm; observed base tilt is below 0.016 degrees and translation below
0.22 mm. A translated-machine negative control is rejected independently of
relative geometry. All eight full-library construction checks pass.

The experimental bearing declaration/parser/physics changes were discarded;
there is no new parameter, model joint, broadened collision exclusion, imposed
pose, controller tuning, threshold relaxation, pin, firmware or release change.
Original passing and failed experiments are preserved. Chromium/WebKit raw
imports, manual controls, lessons, instructions and complete saved-project
program replays pass. Exact-head hosted CI and normal landing remain in the
parent intake lane; this evidence is simulation, not hardware calibration.
