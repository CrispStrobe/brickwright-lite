# Admit the selected fast CI tier

Owner: Circuit/editor integration maintainer. Status: IMPLEMENTED; final combined hosted
qualification and landing pending.

The operator requests fast-tier PR qualification by default and no `ci:full`
labels. The legacy `full CI requested` verdict nevertheless rejects code PRs
whose fast jobs are selected. Align that policy verdict with the selected tier;
this is not permission to merge failed tests or substitute host checks for
actual affected application acceptance.

Own only the `full-ci-gate` comment, environment and shell admission block in
`.github/workflows/build.yml`, and its executable controls in
`test/ci-docs-only.test.mjs`. Keep the existing job/check name, dependencies,
PR condition and time limit for compatibility. Admit docs-only inputs or an
actually selected fast/thorough tier; reject code inputs with neither tier,
missing/invalid values and empty label-only attempts. Do not infer execution
from label presence or a no-browser-path exception.

Preserve every tier/shard selector, main and dispatch behavior, test/browser/
FPGA condition, source/runtime threshold, workflow budget, fixture, package pin,
artifact custody and deployment rule. Every enabled selected job must still
succeed independently. Actual affected production/GUI evidence remains required.

Execute the actual workflow shell blocks under controlled event/tier inputs,
including code-fast without labels, explicit thorough selection, docs-only,
main/dispatch and rejected empty/invalid selections. Detect removed admission
branches and unconditional-success mutations; retain original policy failures.
Normally compose the bounded fix with the existing editor candidate, qualify
its final source and verify matched-head parents/tree before normal landing.
No label mutation, duplicate dispatch or completed-study replay is authorized.

Registration landed at `f5acf3b3b898`. The implementation preserves every byte
outside the policy guard block. Six focused workflow controls execute its actual
shell: thirteen admission cases, eight selector/event cases and four buildable
mutants. Missing or non-boolean inputs, labels without selected execution and
no-browser flags without execution refuse. Fast, thorough and docs-only
branches are each load-bearing; unconditional success is detected. The existing
job/check identity, PR condition and budget are unchanged. The operator's no-label
rule remains; no new workflow dispatch is needed. This component proof does not
replace final enabled checks or actual affected application acceptance.
