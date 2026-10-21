# Arcade complete private-input assessment — 2026-10-21

Owner: Codex, Arcade compatibility lane. Isolated branch:
`lane/arcade-private-assessment-20261021`, based on `2ccdde721`.
Status: claim-only proposal; implementation begins after this claim merges.

## Owned scope

- A manual workflow at `.github/workflows/arcade-private-assessment.yml`.
- Input admission, isolated static conversion, encrypted output sealing and
  independent result admission under `scripts/private-assessment/`.
- Complete policy/controller tests named `test/private-assessment*.test.mjs`.
- [The assessment contract](../docs/ARCADE-PRIVATE-ASSESSMENT.md) and this claim.

The operation covers the complete existing ordered corpus, including contextual
subjects and original failures. Keep the existing converter semantics, local
resource bounds, dependency pins, diagnostics and historical count unchanged.
Private inputs and recovery details stay private. Use scoped read-only input
credentials; remove credential access before conversion and upload ciphertext
only. Honor configured environment policies. This claim adds no required human
reviewer or permission workflow.

## Qualification and acceptance

First qualify the complete controllers and policies using synthetic public data:
source/ref/input admission, real credential-free network isolation, finite
resource enforcement, output/error preservation, encryption and rejection of
wrong artifacts. Define and review a separate finite hosted resource contract;
no larger local limit, filtered run or successful-prefix census is permitted.
The documentation-only claim uses applicable source/docs checks without a new
`ci:full` request.

A live assessment requires the merged, qualified controller, exact admitted
source and input manifests, complete normal dependency roles and a reserved
single run. Independently admit the official encrypted artifact and read every
ordered result privately. An incomplete report cannot replace the historical
147 translated / 36 partial / one malformed result. Runtime, original-SDK,
complete-game and GUI authoring acceptance remain separate.
