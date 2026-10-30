# Readonly startup Number operands for actual arithmetic results

Status: DONE in the source candidate — claim merged as PR #1461.
Final combined-head SDK/native/editor qualification is pending; this status
does not report a completed corpus application.
Owner: Arcade integration, continuing its existing source lane in an isolated
worktree. Base: main `696f00761b92cc2a4121a568d94b496241ef8afe` plus the existing
Arcade integration candidate. No other runtime, supplier or editor takeover.

## Measured problem and scope

The retained snake program imports and reconstructs Code cleanly but still has
six export refusal families. randomRange bounds contain native subtraction of
startup variables whose actual producers are not covered by the closed math
provider. Arithmetic output annotations cannot establish Number: native
arithmetic can retain BigInt or execute coercion. This task addresses only that
numeric producer frontier. Conditional Array initialization and element presence
are separate tasks; source acceptance does not complete an application.

Add private `project-readonly-number-operands.js` beside the existing
`project-math-normal-results.js` in `overlay/scratch-gui/src/lib/bw-makecode/`.
Consume it only from that provider and necessary plumbing in `export-arcade.js`.
Own focused tests, exact dependency rows in `scripts/lib/gui-scope-allowed.json`,
this claim and relevant Arcade handoff/GUI documentation. Preserve other rows.

Issue only a current Number-domain fact for an actual physically canonical
arithmetic result with independently proved Number operands. Bind target,
variable identity/name/ID, actual RHS tree/socket ownership, every writer,
readonly startup dependency order and every reachable caller/registration.
Protocol resets remain real writers. Only a proved definite overwrite before
the occurrence establishes readiness. Retain complete relevant namespace,
extension, caller, escape and unknown-effect census. A callback may consume an
already-established fact only after its actual registration frontier.

No annotation, output signature, default value, public callback or expected game
result establishes a fact. No arbitrary direct variable-to-Math admission,
generic initialization/Array authority, frozen-value substitution, optimistic
cycles or provisional self-facts. Preserve original expression evaluation,
errors and helper-family domains. Bind every used fact to the immutable project
snapshot and sticky source/ambient currentness, including mutation/restoration.
Unsupported shapes refuse. No supplier, pin, runtime, workflow, SDK, budget,
threshold or assertion changes.

## Controls and completion

Retain the original program, all six procedures and six refusal families.
Cover literal/nested readonly startup dependencies, actual ordinary callers,
registration ordering and direct/JSON parity. Negative controls: String,
Undefined, object, unknown or later writers; conditional/missing/late prefix;
early additional callers/hats; wrong targets/cell IDs/names; monitor/cloud/
dynamic writes; escaped/foreign entries; dependency cycles; malformed selectors,
sockets and ownership; opaque/BigInt operands; exceptions; same-value/ABA
mutation. Keep direct arbitrary variable operands outside the existing math
grammar. Cut complete-writer, entry-readiness and operand-domain guards
independently; each must trigger a meaningful assertion.

Bounded source controls first. The final combined head still needs affected
original SDK/native and visible Code/Blocks/controller/save-reopen qualification.
Preserve once-only original intake and numeric terminal intake before successors.
No extra full-CI label or duplicate dispatch. Merge only every enabled exact-head
check successful, matched head and reviewed/landed parents/tree verified.
Record GUI acceptance separately; promote no corpus app on source evidence.

## Source checkpoint and next acceptance

The private readonly issuer and both public export routes are implemented.
Twenty-four focused source groups plus seven unchanged math-consumer groups
pass without skips. They cover real Creator/importer graphs, two export
reimports, emitted binding collisions, callback-only paint-witness transport,
complete writers, entry order, operand domains and sticky helper metadata.
Three independent guard cuts (complete writers, entry readiness and operand
domain) each trigger a meaningful assertion; original source is restored.
The retained snake source probe now has four refusal families, down from six;
Array item/indexOf/mutation and native addition remain unsupported. The raw
184-input census stays 147 translated / 36 partial / one parse failure.

`test/makecode-startup-number-roundtrip.test.mjs` is hosted-only acceptance, not
a locally observed result: original and exported pinned SDK execution, both
export routes, three Lite generations, actual callback-only paint execution,
and same/fresh VM SB3 reopen. The next source owner must retain its actual
outcome and qualify visible Blocks/Code edits and connected graphics/controller
behavior on the final head. General formatter alpha-renaming and conditional
Array allocation remain separately scoped in `docs/ARCADE-AGENT-HANDOFF.md`.
