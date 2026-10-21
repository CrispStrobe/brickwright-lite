# Complete private-input Arcade assessment

Status: claim merged in [PR1167](https://github.com/CrispStrobe/brickwright-lite/pull/1167); controller implementation and qualification in progress. No credential setup, dispatch or complete-corpus result.

Honor actual configured environment policies; this proposal introduces no mandatory human reviewer or confirmation gate. Scope a manual, reviewed Actions workflow and bounded input-admission, isolated-converter and ciphertext-only upload controllers. Use a repository-specific read-only deploy key, remove credential access before conversion, and admit every original raw and contextual subject without filtering. Use the already selected private input repository; a separate minimal input repository is an optional alternative, not a prerequisite.

Run the existing `scripts/compat-audit.mjs` operation with its normal integrated dependencies. Independently verify the pinned input manifest: the CLI corpus-commit field is currently declarative. Retain all diagnostics, original compiler outcomes and incomplete stages. Additional journey, compiler or runtime gates remain separate assessments.

The hosted aggregate resource envelope needs a concrete reviewed source contract and qualification; this proposal neither changes the local execution limits nor establishes that the full assessment fits. Keep finite per-file and aggregate output limits without truncating reports.

Encrypt complete outputs to an approved public recipient before uploading ordinary Actions artifacts. Keep the private decryption identity outside Actions. Public logs and artifacts must contain no raw application inputs, diagnostics or input-repository identifiers. Independently admit the official ciphertext and read the decrypted report privately without executing producer code.

Acceptance requires real credential-free isolation controls, ciphertext-only inventory, complete ordered subject coverage, stable source/dependency guards and a separately admitted single execution. Historical partial counts remain historical until a complete current report is independently accepted. This does not qualify full-game behavior, browser rendering or original-SDK equivalence.

Proposed owned paths: a new dated claim in `lanes/`; a manual workflow; controllers under `scripts/private-assessment/`; complete policy/controller tests; and `docs/ARCADE-PRIVATE-ASSESSMENT.md`. No converter semantics, dependency pins or existing thresholds change in this work package.

## Implementation and remaining work

The independently reviewable components are [pinned Git input admission](ARCADE-PRIVATE-ASSESSMENT-INPUT.md), [output encryption](ARCADE-PRIVATE-ASSESSMENT-ENVELOPE.md) and [the independent receiver](ARCADE-PRIVATE-ASSESSMENT-RECEIVER.md). Their source and synthetic controls are separate from hosted isolation or a live corpus run. Never publish their private return values or raw failures.

The complete encryption/independent-receiver modules pass all 13 controls, and the complete actual synthetic-Git admission module passes all seven, with no failures, skips or TODOs. Independent source review preceded execution. Original source-review holds are retained: IV acquisition now sits inside the key-cleanup region, and filesystem reads allocate only the admitted initial size before checking EOF and final identity. These are component results; no hosted isolation or corpus execution is implied.

Complete these steps in order:

1. Qualify the complete component test modules, including negative identities, original byte retention, authenticated tampering and bounds. Record original failures rather than replacing their evidence.
2. Freeze the exact original ordered 184 raw inputs and 41 contextual subjects into an admitted Git manifest. Preserve the full original catalogue and derive a separately hashed 41-subject catalogue view; passing both 184 positional inputs and the original 225-subject catalogue would double count. Pin every retained source, configuration, asset and original outcome by bytes, hash and Git object identity. The known frozen invocation selects Arcade for every subject; a mixed target catalogue must fail the current CLI's target rule explicitly.
3. Implement the hosted controller with a trusted controller revision separate from the immutable converter candidate revision. Admit the normal dependency roles and actual source identity; an absent Git identity or declarative corpus-commit field cannot stand in for verified provenance.
4. Prove real credential removal, disabled network access, nonroot execution, read-only admitted inputs/source, descendant CPU accounting, finite writable storage and bounded termination. Preserve the original outputs and incomplete termination status. A Docker command-line policy test alone does not prove isolation.
5. Connect the manual workflow and scoped read-only input credential. Keep the recipient identity outside Actions. Run complete synthetic isolation and encrypted-artifact controls before reserving the single live assessment. Honor configured environment policies.
6. Admit the official run and ciphertext once, verify the receiver independently, and read every ordered report result privately. Reconcile completeness, original failures and diagnostics before replacing the historical count. Then prioritize remaining gaps by shared missing capability and qualify execution/export/reimport and GUI authoring separately.

The proposed hosted converter envelope is 600 cumulative descendant CPU seconds, TERM at 900 wall seconds, KILL at 903 and terminal refusal at 905, with a 512 MiB Node heap, 16 GiB address space, 8 MiB per output leaf and 64 MiB aggregate owned output. These are an unqualified hosted proposal until the actual controller and complete controls establish them; they are not a measured fit or a change to local bounds. Credential collection, setup, sealing and receiver admission need their own finite bounds. Never reinterpret a resource failure as a complete census or split a failed full census into passing prefixes.
