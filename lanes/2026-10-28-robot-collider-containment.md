# Robot Lab mesh-collider containment and repeatable generation

Status: CLAIMED — correction scope only; merge before new implementation.
Owner: Codex, user-approved ordered qualification continuation.
Carrier branch: `lane/robot-coast-steering-20261028` (scope-only stage).
Base: `b9fa2e844f66566f9f801c94a4dfd425e973bdd6`.

PR1521 delegates completion of published collider PR1512. Independent source
review of its frozen `ac6484a7a6a097821bf4f2fbd55c514e521b42cb` identifies
admission gaps: vertex selection alone does not bound faces crossing a slab;
independent rounded centres/extents can shrink coverage; and replacing only
the old collider shape does not establish repeatable regeneration. These are
source-review findings, not a claim of a measured collision defect in a model.

Own a source-preserving successor for `scripts/lib/derive-mesh-colliders.mjs`,
`scripts/gen-part-colliders.mjs`, their focused tests and independent containment
fixtures, `docs/data/part-collider-derivations.json`, affected generated collider
entries in `lib/bw-sim/part-meta/parts.json` and corresponding GUI mirror, this
claim and relevant collider/qualification documentation. Preserve existing model
geometry/programs, other parts, source provenance and material/solver settings.
No new supplier, pin, restricted reference data or blanket licence claim.

Use clipped polygon/triangle sections or another demonstrated complete bound;
add independent crossing-slab and rounded-boundary controls rather than merely
reusing the production derivation helper as its own oracle. Prove conservative
coverage and bounded overhang for each declared section and repeat generation
without changing the result. Do not expand or relax construction tolerances to
make a model pass. Preserve actual source, part and adaptation identities.

Existing full qualification of the frozen published PR may continue; retain
its outcomes, but it cannot establish these missing geometric properties or
qualify a changed successor. Keep the one-shot full-CI label already applied;
ordinary substantive successors qualify their own new head without another
label, Ready cycle or duplicate dispatch. Source/model repair owners retain
their unrelated files and dirty worktrees.

Before normal guarded landing, require independent geometry controls and clean
affected native/solid/browser qualification with every currently shipped model's
verdict unchanged. If a verdict changes, stop and investigate rather than silently
promoting, demoting or weakening it. Acquire new originals once after metadata
admission, audit saved bytes independently, and preserve old failures. Admit all
enabled exact-head checks, only declared skips, then verify predicted/actual
parents/tree and preservation of unrelated main entries. Overall user goal stays
open through subsequent rotor, coasting, steering and contact acceptance.
