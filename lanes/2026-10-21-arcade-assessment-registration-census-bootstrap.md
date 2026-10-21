# Arcade assessment registration census bootstrap — 2026-10-21

Owner: Codex, Arcade assessment lane.
Branch: `lane/arcade-registration-census-bootstrap-20261021`.
Base: `6d3472a6fd9fdace87c19f14eb89d9dacd7180ef`.
Status: claim only; merge before implementation.

## Scope amendment

Amend the merged private-assessment claim from PR1167 only for:

- `docs/generated/ci-step-census.json`: a scoped declaration for the new
  `.github/workflows/arcade-private-assessment.yml` manual entry.
- `CI-POINTERS.md`: one dated, explicit registration-only pointer for that
  workflow's unobserved bootstrap state.
- This claim file.

The original claim owns the manual workflow, assessment controllers, their
specific tests and assessment contract. It does not implicitly own every
file under `docs/`. This amendment transfers no generator, test, classifier,
browser workflow or resource-policy ownership. In particular,
`docs/generated/browser-gate-readings.json` and all browser budgets remain
unchanged.

## Required behavior

The registration PR's ordinary unit failure names the workflow missing from
`ci-step-census.json`. Preserve that original failure. The workflow has no
completed observation before default-branch registration; do not manufacture
one or dispatch a qualification merely to populate a census.

Use a bounded invocation of the existing exported `census` and
`mergeWorkflowReadings` APIs with the admitted exact workflow declaration and
actual unregistered-workflow metadata. Record zero observed runs, declared
steps and their truthful source revision. Preserve every existing workflow
record, run record, pointer, main source revision and newest-main-run identity.
No full-history fetch, hand-authored outcome, successful-prefix substitution,
measurement, threshold or timeout change is authorized.

The dated pointer must explicitly retain the unobserved registration state
and describe the manual condition for the first admitted public metadata
probe. It must not claim a completed probe, isolation qualification or live
assessment. Keep the existing census and pointer verdicts unchanged.

## Qualification and landing

Root executes the complete six-group `test/ci-step-census.test.mjs` module
under the standing bounded source-control envelope. Preserve all original
assertions and mutation controls; no filtering, skipping, sharding or larger
local resource limit. Independently check that only the new declaration,
refresh metadata and one dated pointer changed.

This claim itself needs the applicable source/docs policy checks. It does
not request a full-CI label or a workflow run. The final workflow-containing
implementation head still needs every enabled exact-head check, including
full CI when required by the existing classifier, before a normal matched-head
merge. No classifier exemption is authorized.

After actual default-branch registration, independently admit fresh official
workflow metadata before the separately reviewed single public metadata
probe on its exact candidate ref. Public kernel controls and live private
assessment remain separate, unqualified gates. This amendment authorizes no
credentials, private inputs, privileged execution, workflow dispatch or
assessment publication.
