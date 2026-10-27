# Actual accessor and Sprite operands in native addition

Status: CLAIMED; merge before implementation.
Owner: Arcade integration, continuing the existing #1128 source lane.
Base: main `29f304204af`.

## Measured failures

Preserve the complete inherited Base/Child positive in
`test/makecode-arcade-class-primitive-export.test.mjs`. Its getter/setter class
exports refuse `this.n + 10`. The private class view infers primitive fields,
but its receiver-readiness rule excludes every accessor-containing class.
Removing that exclusion alone would omit implicit getter/setter call edges.

Preserve `test/arcade-owned-text-game-original.test.mjs` and its original
fixture, artwork, rendering and controller assertions. Source export refuses
the left Member operand of the third native addition in its A-button callback:
the actual Sprite coordinate read remains Opaque. Successful original execution
or a nominal Sprite/Number annotation does not prove this operand.

## Owned scope and implementation contract

Within `overlay/scratch-gui/src/lib/bw-makecode/`, extend only
`native-class-scalar-view.js`, `native-sdk-sprite-source.js`,
`ordinary-primitive-sdk-number-source.js`, `native-array-binary-domain.js`,
the existing Sprite producer/frontier slice in `source-value-producers.js`, and
necessary consumer plumbing in `export-arcade.js`. Add focused source tests,
retain the two original positives, and update exact GUI dependency rows and the
Arcade handoff as needed. This continues the same source owner and does not
transfer another lane's runtime, suppliers or qualification scripts.

For accessors, inventory implicit getter/setter edges, including inherited
halves, overrides and compound/update operations. Require actual accessor
identity, concrete receiver lineage, supported synchronous shape, exact arity
and argument domains. Retain complete constructor/field/alias writer census,
unknown-effect poisoning and source/ambient lifetime checks. A declaration,
getter name or unexecuted body never grants readiness.

For SDK coordinate reads, diagnose the actual factory and callback receiver
through immutable source bindings and the complete relevant writer/escape
census. Consume the existing canonical SDK descriptor only for that proved
receiver. TextSprite or unrelated effects must not supply Sprite provenance.
Do not replace an Opaque operand with zero or accept every numeric-looking
property. Preserve actual left/right evaluation, helper-family closure and
Array coercion/refusal behavior. Keep export selection separate from import. The existing Sprite writer/use
invariant already covers coordinate reads; if its actual source-entry callback
frontier is the blocker, extend that specific frontier through proved SDK
registrations and actual ordinary callers. Registration must follow allocation
on every path; retain early, recursive, exported and unknown-entry refusals.
An event literal supplies no receiver, Number or initialization authority.

No runtime algorithm, SDK/supplier/pin, timeout, budget, baseline, assertion or
workflow changes. If a different producer boundary is required, scope it before
implementation.

## Qualification and next-agent reproduction

Start with the two named fixtures and retain their exact refusal operands.
Require direct and JSON clean exports, retained bodies/evaluations, reimport
and fresh SB3 reopen. Add malformed accessor signatures, inherited halves and
overrides, incompatible setters, dormant writers, escapes, unknown effects,
early/uninitialized receivers and mutation/restore negatives. Use meaningful
guard cuts and preserve failed originals. Source controls do not qualify SDK,
VM, controller or editor behavior and do not promote a corpus application.

Run affected original/native and editor/controller checks on one final hosted
candidate. Reuse retained evidence once; no duplicate dispatch or full label.
Merge only every enabled exact-head check successful, with matched head and
reviewed parents/tree verified. Record unresolved boundaries explicitly.
