# Robot Lab — geometry and pose repair of experimental models (batch 1)

Status: DONE for batch 1 (claim and change in one PR); later batches follow in their own PRs.
Owner: Claude, Robot Lab model-geometry lane.
Branch: `fix/robot-lab-model-geometry-20261028`.
Base: `49dcf7e1aeb` (origin/main at claim time).

Scope: minimal, reviewed LDraw edits to experimental Robot Lab models whose
promotion is blocked only by construction or saved-pose defects, using real
LEGO part geometry and keeping each mechanism's principle and law. Batch 1:
Phasor Twin (`stirling-quadrature-v1`, and its in-phase control) and High
Select (and its exchanged-input comparison).

Owned paths: those models' files under
`overlay/scratch-gui/static/sim-lab/models/` (and their source fixtures or
archives where the checkpoint names one), their entries in
`docs/data/robot-lab-experimental-checkpoint.json`, and — only if every
qualification step passes — their promotion through the contract, registry,
catalogue, mechanisms and lessons generators. The shared harness keeps its
validation logic; this lane may only add a judge import and ids to
`QUALIFICATION_JUDGES`.

Not touched: other models, tolerances, thresholds, baselines, and the
qualification harness logic. A program changes only if its own guard is wrong,
with the reason recorded.

## Batch 1 result

- **Phasor Twin** (`stirling-quadrature-v1`): repaired and promoted. The 40T
  idler now sits on the motor's output face (it was 7.5 LDU inside the output
  disc), with the 16T crank gears in its plane and the bearing blocks below
  them; the crank axles and their half bushes are clocked 45° to the crank
  plates' axle holes; floor members, ties, posts and feet sit on the 20 LDU
  grid so every pin passes fully through its holes (the x=60 posts are 7L, so
  they stay clear of the connecting rods' sweep). Each edit is listed in the
  checkpoint. After the repair the construction checks report nothing, and the
  real-VM hubless qualification passes: 803.9 mm² per crank turn against
  π r² = 804.25 mm², strokes 32.001 mm, cranks 90.0003° apart. It also passes
  the frozen-output and 0.01 mm world-shift controls, and removing
  `conrod_B`/`wristpin_B` leaves piston B 0.026 mm of stroke while the input
  still turns 720°. The in-phase control gets the same repair and stays an
  experimental comparison.
- **High Select**: no edit needed. The cold-settle back-drive was already fixed
  on main by the rest-stop bushes of `1b251e04231`. Both motors now read
  0.195° after a 500 ms or 1000 ms cold settle, under the program's 0.5° guard,
  and construction is clean. The guard is correct. Its promotion and its `max-select-v1`
  judge belong to the batch lane (#1508); this lane leaves its records alone.

Next batches: equal-share, stroke-shift, triad-table, paired-door-sync, apex,
aster-governor, vesper-quickreturn, and bloom (geometry; final-squeeze is repaired in #1508);
spiral-scribe (rack pitch); solstice-pumpjack and tempest-pendulum (pose);
inertia-loop last, after #1494.
