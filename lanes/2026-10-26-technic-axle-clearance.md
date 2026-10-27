# Stock Technic axle envelope at rack housings

Status: CLAIMED — merge before implementation.
Owner: Codex, nine-Technic-intake follow-up.
Branch: `docs/technic-stock-axle-clearance-20261026`.
Base: `b6f39a12348b984dc9c5f59b826e7680539b6148`.

CounterSlide retains the opposed-rack law but its axle contacts both rack
housings and pushes the freestanding chassis. An isolated diagnostic removes
only that axle's collider and eliminates the displacement; removing motor or
pinion colliders does not. Preserve all those diagnostic failures. Investigate
the stock shaft's collision envelope against the canonical vendored official
LDraw geometry: a square envelope can grow beyond the real shaft's swept radius.

Scope: stock ordinary-axle collider metadata in
`overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json`, its canonical metadata
builder if necessary, and geometry-envelope/actual-physics regression tests,
related exact GUI dependency declarations, and this claim. Restrict any change
to measured ordinary straight shafts; preserve connector/keying, length, mass,
other colliders, catalogue identity and official geometry provenance. A mesh
measurement or counterexample must justify every changed envelope. Require the
original colliding representation to fail the new test; a real obstructing
shaft or gear must still collide.

No solver, engine/fork, Jolt configuration, tolerance, timestep, material,
worker/session, measurement or API change; preserve the active floor-contact
and force/precision owners. No model-specific collision exclusion or hidden
anchor. Compose the qualified fix into the existing nine-model delivery and
run affected native, catalogue, construction and both-browser checks before
normal matched-head landing with all enabled exact-head checks successful.
