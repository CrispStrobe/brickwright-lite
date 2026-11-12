# Finite ordinary value calls in the conditional Array entry

Status: first source candidate on the Arcade integration branch. Claim and
change travel together in the integration PR; not runtime-qualified.
Owner: Arcade integration, continuing its conditional Array entry lane.
This does not take another runtime, supplier or editor lane.

## Owned scope

`overlay/scratch-gui/src/lib/bw-makecode/project-conditional-array-entry.js`,
the new `test/project-conditional-array-value-calls.test.mjs`, its row in
`scripts/lib/gui-scope-allowed.json`, this claim and the Arcade handoff text.
The export authority, symbols table, runtime and SDK stay unchanged.

## Boundary

The private startup interpreter now follows actual `arcade_callFunction`
calls to ordinary definitions with formals. It requires the validated symbol
identity and the authority's actual call row, walks the physical managed
argument chain to exactly one VALUE per formal, evaluates arguments in source
order, binds them into a fresh frame keyed by the prototype's formal names,
checks each actual `arcade_declareParameterConstraint` against the bound value
without conversion, and completes the call only on an explicit returned
primitive. Prototype reporters are declarations, not reads; body reporters
and `arcade_getLocal` read the frame. Stock `procedures_call` with arguments,
recursion, returned Arrays, missing returns, String or unknown arguments,
malformed chains and renamed formals or callees refuse.

## Controls

Six source groups: actual argument order (swapped arguments and nested calls
change the selected branch), both export routes and Code reimport over two
generations, constraint type and physical String VALUE, missing return (a
truthy Undefined would otherwise select the branch), returned Array,
recursion, five physical chain/formal/name edits, and used-proof expiry on
ambient mutation. Guard cuts for argument order, constraint checking and the
explicit-return requirement each fail a group; arity and returned-Array cuts
are covered by independent guards (authority arity invalidation and the
primitive call result) and are recorded as redundant, not as tested.

## Remaining

The unchanged snake keeps its four refusal families: its `newFood`,
`show` and `nextLevel` need random/while, loops and SDK effects, and
`inSnake` needs indexOf on a ready receiver. Loop/repeated-publication
preservation, element presence and SDK effect framing remain separate tasks.
