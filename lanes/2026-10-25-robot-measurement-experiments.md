# Robot Lab measurement experiments — 2026-10-25

Status: CLAIMED — Codex, user-requested six-item continuation. Isolated branch
`lane/robot-measurement-experiments-20261025`, base `23ec908232f6d4c4604ed6f7dcb23b75af19053d`.
Merge this claim before implementation. Carry all six items through qualification
and closeout; delivery, experimental model batch, configured API and release
lanes remain with their existing owners.

1. Scene-assisted measurement targets: select and highlight existing part
   identities, preview the definition, preserve editor cancellation and binding
   fences, keyboard selection and supported 2D/3D behavior.
2. Audit existing Jolt and mechanism diagnostics; expose additional dynamics
   only where the observed state supports a documented value and units.
   Unsupported force or torque stays unavailable. No dependency or engine pin
   change, solver tuning or hardware-accuracy claim.
3. Bounded experiment recording, CSV export and comparison of retained runs,
   with simulated timestamps, gaps and source/target identity preserved.
4. Extend authored measurement lessons to existing gear, pulley, spring and
   pneumatic mechanisms; validate targets and expected analytic relationships.
   Do not edit the other owner's experimental model batch.
5. Verify documented material estimates, tracked-vehicle mass/inertia floors
   and steering limitations against current source and independent analytic
   controls. Repair only demonstrated defects within this scope; preserve
   estimates and unresolved physical calibration explicitly.
6. Retain successful measurement browser SB3/JSON evidence and independently
   audit saved bundle bytes, sidecar and source joins after metadata admission.
   Apply retention to new affected qualifications; do not replay old successes.

Path envelope: measurement panel/plots and measurement integration in
`overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-pane.jsx`; helpers in
`overlay/scratch-gui/src/lib/bw-sim/measurements/`; scene-selection integration
in the existing view; read-only diagnostic publication in physics/worker paths
where required; focused tests and existing measurement browser gates; the
measurement gate artifact-upload section of `.github/workflows/build.yml`;
`docs/ROBOT-LAB-MEASUREMENTS.md`, lesson/dynamics and physical-validation docs;
this claim. Generated GUI mirrors follow the established overlay process.
No native/firmware, transport, model API, release, dependency, unrelated CI or
experimental model source ownership is transferred.

Acceptance: real rendered interaction and actual Jolt browser journeys, stable
saved identities and save/reopen, bounded memory/CSV and cross-run controls,
independent analytic expectations and meaningful negative controls, retained
successful originals audited without producer imports or guest replay, every
enabled final-head check admitted, and reviewed/predicted/landed parents/tree.
Keep original failures, thresholds and deadlines. No physical/reference,
performance, signed release or licence-clearance claim follows.
