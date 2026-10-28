# Arcade throw statements and exception handoff

## Measured gap

The parser currently splits `throw "failure"` into two expression statements,
Identifier `throw` and String `failure`. An independent minimal source reproduces
the paired diagnostics. This is a genuine syntax and runtime gap. Discarded-value
support must preserve the unbound keyword refusal while this lane is open.
Do not erase a throw, synthesize a return, or mark its containing branch complete.

The selected PXT compiler emits an explicit throw operation. Its simulator
keeps actual handler frames and thrown values, including finally propagation;
uncaught values produce a real unhandled-exception error. See the MIT-licensed
[PXT v13.2.1 compiler](https://github.com/microsoft/pxt/tree/v13.2.1/pxtcompiler)
and [simulator runtime](https://github.com/microsoft/pxt/tree/v13.2.1/pxtsim).
Use the actual selected source and original observations for the execution
contract. A generic host JavaScript error is not automatically equivalent.

## Bounded first slice

Own actual Throw parsing, narrow shared parser/source/control-flow hooks,
an explicit editable Arcade throw command and its properly qualified canonical
compiler word, source/native/current-export integration and self-authored tests.
Parse the complete thrown expression and respect the existing token line numbers:
a missing expression or prohibited line break remains a syntax error. Preserve
single evaluation and earlier operand effects; subsequent operations cannot run
as though the throw returned a value.

Start with actual primitive values already represented faithfully by the bridge.
Preserve String contents, Number, Boolean, Null and Undefined as actual values
until the selected error-formatting boundary. Unknown expressions, unsupported
reference values and coercions remain explicit diagnostics; a declaration,
annotation or token-looking string does not create reference authority.

Measure the selected original's uncaught error, current-fiber and other-fiber
behavior before choosing a native termination backend. Report the actual thrown
value/error visibly through the app's runtime error path. Preserve source frames,
receiver/capture ownership and failure propagation. Each actually unwound
managed frame and return ticket must complete exceptionally and release its
owned continuation or loan exactly once. Never fulfill success or leave its
waiter permanently pending. Old frames and tickets stay invalid after Stop or
reload. Own the minimal managed-call and engine error handoff needed for these
semantics, including real stock same-thread procedure frames. Do not substitute game-over effects or a
comment, successful completion or arbitrary continued execution.

Recognize neighboring exception syntax sufficiently to refuse it accurately.
Try/catch/finally, caught reference values, rethrow and structured unwinding need
complete handler/activation/value proofs and their own acceptance before they
are admitted. Do not parse those keywords as ordinary value statements or
pretend that uncaught-throw support completes structured exceptions.

## Qualification and coordination

Qualify throws inside taken and untaken branches, nested ordinary calls and
callbacks (including callback to ordinary-call throws), original effect order,
visible earlier effects, no following effects, fresh restart, exact primitive error
contents and reload/Stop behavior. Retain unknown/unbound/foreign/stale negatives.
Verify source, visible Blocks/pseudocode, same/fresh SB3, current edited export
and reimport. Intentional runtime failure is an expected outcome only when the
actual selected error and side effects match; a timeout is not a thrown-value
observation. Freeze genuinely new original inputs, preserve compilation files,
results and guards, and reserve the shared SDK slot before qualification.
Verify actual primitive VALUE input ownership, including a physical Number 20
versus text "20". A BLOCKS_ERROR event followed by Undefined, rejected Promise
alone, or retirement of the throwing child as a successful call cannot fulfill
this contract.

Canonical word work coordinates with the ordinary parameter-constraint owner;
no shared supplier branch overwrite, unreviewed vendor delta or silent pin bump.
Keep Array-map, discarded-value, Image resource and unrelated device lanes
intact. This first slice does not promote an entire dependency or claim caught
exceptions, full JavaScript support or hosted GUI acceptance without evidence.
