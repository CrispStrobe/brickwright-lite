# Arcade discarded value statements

## Measured gap and scope

Valid expressions can appear as statements: their evaluation still occurs even
when their value is unused. Current Arcade conversion refuses self-authored
String, bound Identifier and Binary statements, and a staged lazy expression
ends in an unsupported Identifier statement. A branch containing such a value
can consequently produce an empty-body warning. This is separate from missing
Array.map support; neither diagnostic may be silently removed.

Own one bounded discarded-value lowering helper, its narrow translator/staging
hooks and focused authoring/export tests. Preserve the existing Assignment,
Update and command-call paths. Start with expressions whose actual reads,
operators, calls and producers are already supported. A new context cannot
authorize an otherwise unsupported operator, unknown binding, opaque coercion,
SDK producer or unproved ownership.

## Semantics and implementation decision

Evaluate the complete expression exactly once, in its original sequence and
activation. Preserve operand effects, short circuit and conditional branches,
receiver identity, initialization rules and abrupt completion. Preserve the
already qualified selected PXT staging and eager operand effects: consume the
actual staged result without evaluating its original expression again or
substituting JavaScript lazy semantics. Keep the actual
value evaluation even for apparently pure expressions. Do not replace unknown
expressions with comments, zero, no-ops or an empty body.

Use an existing current local-value sink only if it preserves evaluation,
activation ownership and export/reimport without exposing a user variable or
colliding with an actual source binding. Generated names must be fresh against
all source and generated bindings. Otherwise introduce a proper, separately
qualified editable evaluate/discard command through the canonical compiler;
no handwritten vendor delta or hidden unsupported spelling. No new vocabulary
or dependency pin is assumed by this contract.

A sink is not a producer certificate. Retain independent source/current-body
proofs, all-writer checks, raw input ownership, per-invocation frames and stopped,
stale or foreign-reference refusals. Unsupported compound expressions remain
explicit diagnostics, including their unknown constituent operation.

## Acceptance

Independently authored controls cover literals, bound globals/locals/formals,
effectful binary operands, lazy and conditional branches, nested invocation,
loop bodies, generated-name collisions and evaluation order before/after
neighboring effects. Check that unsupported or unbound values remain refused.
Observe real effects and any relevant reference identity; absence of warnings
alone is insufficient.

Verify source, editable pseudocode/Blocks, same and fresh SB3 save/reopen,
current edited export and reimport. Qualify new original compiler/guest inputs
only after freezing their actual bytes and reserving the normal shared SDK
slot; do not replay successful identical originals. Visible GUI acceptance and
broader expression capabilities remain separate until actually exercised.

This lane does not implement value-map, procedure parameter constraints, Image
literal resources, new SDK signature domains or any independently owned API.
Private dependency bodies are diagnostic inputs, not public fixtures without
applicable redistribution permission. Public fixtures must be independently
authored and retain any applicable primary-source attribution.
