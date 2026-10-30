# Robot Lab — mesh-derived colliders for over-sized part boxes

Status: ACTIVE — claim and change in one PR.
Owner: Claude, Robot Lab model-geometry lane (widened for this PR).
Branch: `fix/robot-lab-mesh-colliders-20261028`.
Base: `49dcf7e1aeb` (origin/main at claim time).

Scope: the colliders of `2909.dat` and `2910.dat` (shock absorber 9L cylinder
and rod) and the end-frame box of `92693c01.dat` (linear actuator body) in
`overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json`. Each was wider
than the part's own mesh, so parts seated against the real geometry in
equal-share, stroke-shift and triad-table overlapped the box.

Each new box is derived from the LDraw mesh. The derivation (ranges and the
box each replaces) is in `docs/data/part-collider-derivations.json`, it is
applied by `scripts/gen-part-colliders.mjs`, and
`test/bw-sim-collider-derivations.test.mjs` recomputes every box. No number
is hand-tuned.

Qualification: the full native qualification suite and the solid-construction
suite must show every shipped model's verdict unchanged. If any verdict changes,
the lane stops before merging.

Not touched: model files, programs, judges, tolerances and the qualification
harness. Equal-share, stroke-shift and triad-table are not promoted here; their
judges belong to the batch lane.
