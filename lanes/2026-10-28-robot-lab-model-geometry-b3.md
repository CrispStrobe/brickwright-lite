# Robot Lab — geometry repair of experimental models (batch 3)

Status: DONE in this PR (claim and change together).
Owner: Claude, Robot Lab model-geometry lane (batch 1 is `2026-10-28-robot-lab-model-geometry.md`).
Branch: `fix/robot-lab-model-geometry-b3-20261028`.
Base: `49dcf7e1aeb` (origin/main at claim time).

Scope: `paired-door-sync` (`.ldr`/`.mpd`) and its checkpoint record. Four
carriage pins move along their own axes so that their collars and ridges sit
outside the carriage and rack holes. After the move the construction checks and
the compiler report nothing. The model stays experimental: its judge is not on
main, and judges belong to the batch lane.

Looked at, not changed here:
- apex: same-layer housing links overlap their neighbours.
- aster-governor: the weight key's collider overlaps the flyweight (60483 against 39367p01).
- vesper-quickreturn: the bearing beam's collider overlaps the motor.
- bloom: 24 anchor pins (43093) report 2.0 LDU inside the 32192 hub hole even
  when seated and clocked, and spacers' colliders overlap the hubs.
The meshes are clean in aster-governor and vesper-quickreturn, so those are
candidates for the mesh-derived collider lane. apex and bloom need a part-level
look first.
