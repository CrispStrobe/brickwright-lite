# Primitive inspection of registered captured cells

This extends the primitive `console.inspect` lane. Capture lists describe cell
links, not the values stored in those cells. They never supply String, Number,
Player, or reference authority.

A current block graph must have one actual registration and one matching hat of
its actual callback kind and literal token across all original targets. An
explicit captured name must resolve to a real local or formal parameter of the
registering scope. An inherited name follows the registration chain. Ordinary
managed procedure calls retain that chain only through actual incoming calls.
Cycles, unresolved links, duplicate registrations, duplicate hats, and foreign
target collisions are refused.

Primitive admission examines every actual local and captured writer and every
incoming formal argument. Computed storage names, unresolved capture lists,
dynamic procedure calls, and callable escapes cannot hide a writer. An opaque
sibling capture does not invalidate a distinct, proved primitive cell. A closure
expression may use an outer cell proved initialized before that actual closure
allocation; a hoisted declaration gains no such initialization assumption.
Later reference writers and missing initialization remain refusals.

The native and export adapters use the same generated pure capture-link
analysis. The native adapter retains the current cached-operation, argument,
thread, target, full-project snapshot, Stop/restart, and disposal checks.
Export independently checks the actual connected operands and all writers.
`VALUE` and `LIMIT` keep their separate primitive-domain requirements.

## Acceptance and limits

Controls exercise actual multi-cell mutation, an unrelated Image sibling,
nested registration inheritance, Code, same and fresh SB3 loading, current
export/reimport, Stop/restart, and edited opaque/dynamic/duplicate/foreign graphs.
Structural service adversaries additionally cover stale graph, target,
container, killed-thread, and disposed-owner rejection. These are separate from
selected SDK execution and hosted graphical authoring qualification.

The complete Lyla input can structurally export after these capture links are
proved. Its unused `holdText` helper still exposes a separate ordinary-procedure
parameter-constraint round-trip limitation. Its body is retained and the
reimport diagnostic remains explicit. This does not qualify the whole game,
assets for redistribution, audio, or graphical authoring, and does not change
the raw corpus denominator or partial-case count.
