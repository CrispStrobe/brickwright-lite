# Crane gallery metadata derived from the shipped model

Status: DONE (implementation) — combined source qualification and landing pending.
Owner: Codex, continuation of the merged bytecode/files/crane claim.

Scope: only the existing `crane` lesson row in
`scripts/gen-robot-lab-catalog.mjs`, its generated `crane.ldr` row in
`overlay/scratch-gui/src/lib/bw-sim/model/example-catalog.js`, and the crane's
expected membership in `test/bw-sim-example-catalog.test.mjs`.
Update actual piece/motor counts and the English/German description to match
its authored winch and physical support feet. Preserve every other catalog
entry, the model registry, filters and the existing greater-than-50 size
boundary. Do not touch experimental entries or another model owner's source.

The existing exact-count gallery assertion exposed the stale crane row during
qualification of the three-package candidate. Retain that original failure;
regenerate from actual compiled model data, verify non-crane rows unchanged,
and keep the unchanged catalog-count assertion and size boundary. Compose the
metadata repair normally into the owned source candidate before fresh affected
hosted qualification, all enabled exact-head checks and matched-head landing.
This claim does not authorize physics, dependency, workflow, API or UI changes.

The regenerated crane row reports 67 pieces and three motors. Its English and
German descriptions include the winch and support feet. Every non-crane output
byte is unchanged. Both existing gallery tests pass locally; the exact-count
assertion and greater-than-50 boundary are unchanged. The combined candidate
still requires fresh hosted qualification and matched-head landing.
