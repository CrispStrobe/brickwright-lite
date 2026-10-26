# Arcade forward-fix reconciliation and remaining qualification failures

Status: DONE — implementation reconciled after claim #1426. Exact-head hosted
qualification and landing of the combined source remain pending.
Owner: Arcade integration. Work in an isolated integration tree; preserve the
active #1416 branch and its retained official-original intake. No duplicate
acquisition, replay or publication over another worker's live head.
Base: current main `5cd027707eceed3451bd62eaa21125a051650e59` plus the existing
Arcade source checkpoint and #1416 `4242d10ca8c` for review.

## Problem and contract

Reconcile the existing fix-forward changes with independently guarded math,
Sprite, Image, ordinary-entry and frame-result implementations. Source and
synthetic controls do not qualify an actual hosted VM or editor. Preserve all
source bodies, evaluations, currentness, complete writer checks and original
failures. Do not weaken assertions, add TODOs or hide failures for a green run.

Respect the approved Array source-bitwise and dormant-body behavior only where
actual source producers and execution roots justify it. Arrays are not generic
primitive/Number certificates. A dormant body stays emitted, while an unknown
entry or an actual reachable incompatible caller remains refused.

Math min/max/randomRange may return connected values unchanged. Non-additive
arithmetic can retain BigInt or run coercion effects. No opcode, type annotation,
menu or public flag alone grants Number. Preserve actual supported coercion and
error semantics; use independent operand proofs or completed result ownership.
Resolve Image-addition and GUI refusal expectations from actual semantics,
rather than unrelated presence of an Array or a temporarily unimplemented API.

## Exact owned implementation boundaries

Within `overlay/scratch-gui/src/lib/bw-makecode/`:
`export-arcade.js`, `scalar-export-flow.js`, `project-math-normal-results.js`,
`native-array-binary-domain.js`, `object-class-export.js`,
`callable-export-graph.js`, `source-value-producers.js`,
`array-reference-export-authority.js`, `procedure-constraint-export.js`,
`closed-ordinary-project-entry.js` and `ordinary-export-symbols.js`.

Within `overlay/scratch-vm/src/`:
`extensions/crispstrobe/arcade/index.js`,
`extensions/crispstrobe/arcade/console-inspect-values.js`, and the existing
utilities `util/bw-array-operations.js`, `util/bw-primitive-owner.js`,
`util/bw-procedure-constraint-model.js` and
`extensions/crispstrobe/arcade/procedure-parameter-constraints.js` only for the
measured current-operation, duplicate-procedure and coercion failures. Preserve
all actual cached caller, registration, runtime, graph and result gates. A new
shared helper or supplier change requires a separately scoped claim.

The existing #1416 regression fixtures and affected tests, focused new tests
for the above boundaries, `scripts/verify-arcade-numeric-authoring-gui.mjs`,
`test/fixtures/arcade-score-threshold.mjs`, exact GUI test rows, this claim and
Arcade handoff/qualification/capability documentation. Keep original score input
separate from any explicit observation variant. No pins, workflows, SDK copies,
new runtime algorithm or unreviewed upstream source change.

## Remaining failures to resolve

- Function-return receiver in writable Sprite flags compound assignment: prove
  actual return producers and generation/readiness, preserve one receiver and
  RHS evaluation, and reject opaque or stale alternatives.
- Duplicate procedure refusal: retain ambiguity rejection and observable named
  failure before effects. Verify the actual producer/VM/export boundary rather
  than replacing a test expectation blindly.
- Array coercion with JSON/SB3: inspect retained hosted evidence and actual
  current operation ownership. No mock or metadata bypass to reproduce green.
- Reconcile existing numeric-authoring refusal fixtures and supported Image,
  math, scalar and Array behavior consistently across Code/Blocks/export/runtime.

## Qualification and landing

Bounded source controls and meaningful mutations first; actual VM, SDK, browser,
controllers and fresh save/reopen run on the coordinated final hosted candidate.
Use the current six timing-balanced unit shards. Reuse each owner's retained
original once; preserve numeric terminal intake before publishing successors.
Do not trigger repeated full CI or add a full-browser tag without a required
acceptance boundary. Merge only after every enabled exact-head check passes
and reviewed/landed tree and parents match. Keep the 184-input raw corpus,
complete contexts, invalid original inputs and application execution distinct.

## Source checkpoint

Reconciles #1416's reviewed `62375e788598` with the existing guarded source
candidate. The final two distinct source cohorts pass 68 controls without skips or TODOs.
Focused source controls cover pure alias getters, exact entry roots,
String/Undefined math refusals, all-writer/readiness boundaries and Code/JSON/SB3
conversion. Three independent guard removals are detected and restored: actual
caller frontier, exported-entry rejection, and managed/callable alias entries.
These source controls do not qualify native execution. Existing enabled
exact-head checks and affected original SDK/VM/editor acceptance remain required
before landing. No corpus count is promoted by this checkpoint.
