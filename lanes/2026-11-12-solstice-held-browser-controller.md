# Robot Lab — held Solstice browser diagnostic controller

Status: CLAIMED — implementation held until this narrow ownership record lands.
Owner: Robot Lab held diagnostic lane.
Branch: `lane/solstice-held-browser-controller-20261112`.
Base: `ec14e24f2054bc8d077a077efc11a0458e5e6326`.

Scope: explicit held-only Solstice selection, contract and R4 causal-control routing, independent base/control failure retention, source/build evidence binding and focused nonvacuity controls in exactly:

- `scripts/lib/sim-lab-q5-held.mjs` (new)
- `scripts/lib/sim-lab-q5-browser-gate.mjs`
- `scripts/lib/sim-lab-intake-roundtrip.mjs` (held-only page-error retention and primary-error-preserving cleanup)
- `scripts/verify-sim-lab-browser.mjs`
- `test/robot-lab-held-solstice.test.mjs` (new)

This coordinates with the existing R4 start-guard lane and supersedes its browser-controller ownership only for this held diagnostic. Existing promoted cases and ordinary example-filter behavior stay unchanged. No model, program, pose, solver, judge implementation, threshold, capture implementation, promoted registry, dependency pin, workflow or concurrency block is owned here.

Solstice remains experimental. Preserve the original full-track browser refusal: beam 0.1158895856 degrees and piston 0.1717399387 mm exceed the unchanged 0.1 degree / 0.1 mm limits. No hidden startup exclusion or guest, promotion or physical-build claim.

Qualification: actual-source controller tests, distinct nonvacuous mutation controls, unchanged corrected-judge refusal of the retained failing track, and affected clean source/build-bound browser diagnostics on the approved external execution route. Source/fake tests alone qualify no guest. Do not add `ci:full` or dispatch full CI; use only already authorized automatic checks. Record remaining failures and limits before implementation landing.
