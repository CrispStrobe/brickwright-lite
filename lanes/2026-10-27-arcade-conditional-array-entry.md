# Conditional startup Array receiver readiness

Status: CLAIMED — implementation waits for this claim to merge.
Owner: Arcade integration, continuing its existing Array source lane in an
isolated worktree. Base: main `7b4f2f84ac55e238bbb75663acbdc1e26f3d0358`.
This does not take another runtime, supplier or editor lane.

## Observed gap

The retained snake program has four export refusal families after the readonly
Number candidate: Array item, indexOf, mutation and native addition. Its startup
assigns a literal counter, calls an ordinary helper, increments that counter,
then takes a deterministic branch into the level initializer. The initializer
allocates and populates a private Array and publishes the receiver before paint
registration. Existing unconditional availability summaries do not establish
this conditional producer frontier.

## Owned scope

Add `overlay/scratch-gui/src/lib/bw-makecode/project-conditional-array-entry.js`
and consume it in `array-reference-export-authority.js` in the same directory.
Own `test/project-conditional-array-entry.test.mjs`, a separately named affected
hosted SDK/native roundtrip test, any small independent fixture, exact test rows
in `scripts/lib/gui-scope-allowed.json`, this claim and relevant Arcade handoff
and GUI-gap documentation. Preserve other owners' rows. Existing descriptor-
checked direct-export fallback must retain direct/JSON parity; no new caller
object enrollment or callback substitution.

Prove only receiver readiness at actual occurrences. Bounded deterministic
scalar evaluation may follow actual literal writers, native arithmetic and
predicates to select an executed startup branch. Bind every control fact to
actual cells, physical blocks/sockets, complete writers, call sites and immutable
source identity. Unknown values, effects, selectors, recursion or completion
refuse. Model normal and throwing paths accurately; never invent completion of
an unknown or failing operation. Preserve original expressions and both branches
in emitted source. Private control facts cannot substitute values or become a
public Number, Array-element or general type authority.

Keep `array-source-start-reset-effects.js` unchanged. Its dead-reset discount
contract is not an initialization service. Keep existing Array producer,
compatible-writer, alias, element-domain and publication-currentness checks.
No supplier, runtime, pin, workflow, budget, threshold or assertion changes.

## Required controls and completion

Source positives: actual startup branch, nested ordinary callers, private
allocation/population/publication and later paint registration; both public
export routes and Code reimport. Negatives: false/unknown/malformed predicates,
missing allocation, cyclic or later scalar writers, null/Undefined/opaque
replacement, conditional publication, alternate incompatible writers, escaped
aliases, callback mutation, early/additional callers, recursive/escaped
procedures and registration before publication. Throwing/unknown operations
before publication cannot establish readiness. Copied identities, malformed
selectors/sockets and observed mutation/restoration must invalidate used facts.
Cut branch selection, complete-writer census and publication/registration order
independently; each must trigger a meaningful assertion. Retain original
failures, complete procedure bodies and all original statements.

The final combined head needs affected original SDK and Lite native execution,
both export routes, repeated conversion and same/fresh SB3 reload. Visible
Blocks/Code authoring, graphics/controller behavior and current diagnostics
remain separate connected acceptance. Preserve once-only official intake;
no extra full-CI label or duplicate dispatch. Merge only after every enabled
exact-head check succeeds, with matched head and verified parents/tree.

## Explicit remaining boundary

Initial receiver readiness does not prove element presence in repeated paint
callbacks. The game unshifts and conditionally pops; a separate mutation/lifetime
invariant must establish that each actual head/index read is present. Its
primitive element domain and downstream native addition remain independent
obligations. Source acceptance grants no corpus application or GUI completion.
