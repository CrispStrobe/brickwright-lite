# Robot Lab — geometry repairs and promotion for five nine-intake models (P3)

Status: ACTIVE — claim and change in one PR.
Owner: Claude, Robot Lab nine-intake geometry lane.
Branch: `lane/robot-nine-geometry-20261107`.
Depends on: #1639 (registers the nine-intake judge); contracts and promotion
land only after it merges.

Scope: `.ldr`/`.mpd` geometry of `toggle-press`, `footfall`, `phasekeeper`,
`vectorsum`, `pointweaver` (static/sim-lab/models); their honest piece counts
in `experimental-models.js`, `test/bw-sim-nine-intake-assets.test.mjs`,
`scripts/lib/sim-lab-nine-intake-gate.mjs`, `docs/ROBOT-LAB-NINE-MODELS-HANDOFF.md`
and lessons; then, for models that requalify, the promotion surfaces listed in
`lanes/2026-11-02-robot-batchab-promotions.md`, and checkpoint records for the
rest. `test/bw-sim-models-solid.test.mjs` is not loosened.

Geometry repairs (construction gate findings from the handoff, section 00 P3):
- footfall: removed `base_pin_support_A_-120`; the 3L `support_A_foot_pin`
  already runs through foot, spacer and cross (120 → 119 pieces).
- phasekeeper: removed `base_pin_120_±120`; the tower's 12L axles already run
  through the rail and base cross holes (81 → 79 placements).
- vectorsum: `output_axle` moved 2 LDU outward (x 100 → 102); still 8 of
  10 LDU in the 12-tooth bevel (122 pieces).
- toggle-press: each doubled guide-post hole's two 2L pins replaced by one
  3L pin through all three layers (−3 pins); `pivot_bridge` lowered 10 LDU so it
  meets `upper_toggle_UK` and the 2L `fixed_pivot_U` ends at both outer faces;
  bridge axles 4L → 5L and inner bushes lowered 10 LDU to match. The judge's
  bridge-plane coordinates (x/z) are unchanged (142 → 139 pieces).
- pointweaver: not repaired. At each rear motor-foot hole (z = −180) the
  stack foot, pad, rail and base cross is 70 LDU deep; no single standard pin
  fills it, two pins must share the rail hole, and dropping the rail-to-cross
  fasteners disconnects the front base from the hub section. Stays experimental.
