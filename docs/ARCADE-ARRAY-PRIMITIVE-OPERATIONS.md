# Owned Array addition candidate

The candidate adds an operation-scoped Array primitive string for the existing addition block. It uses the actual current Array allocation, runtime generation, operand slot, cached primitive and backing graph. It changes neither generic reference prototypes nor Scratch Cast, and grants no new Sprite, image, callable or other resource value. Standalone adapters without the service retain their existing behavior.

The initial profile covers reference-literal allocations and their owned nested backing Arrays, same-body aliases and mutations. Holes, null and undefined contribute empty entries; numbers, text and booleans use their primitive text; repeated aliases render repeatedly and an active-path cycle contributes empty text. Unknown or foreign bodies, opaque elements, custom properties/prototypes and accessors refuse explicitly. Named legacy allocations, slice/concat results without a literal backing proof, and user-defined coercion are outside this initial profile.

The finite profile limits traversal to 4,096 distinct bodies, 65,536 visited elements, depth 128 and one MiB of produced text. It refuses excess; it does not use an object-text fallback. A literal ingress witness closes the actual parser, decoder and heap identities after once-only input conversion; indexed fresh allocation avoids replaceable Array species. The operation completion fence rechecks source metadata, backing data and each visited object prototype after any other operand conversion, preserving actual execution order and errors.

These are source candidates with an actual locally committed supplier revision explicitly selected in the embedding candidate; final adoption review, a fresh normal installation and genuine affected execution remain pending. `test/arrays-owned-plus-native.test.mjs` supplies focused native controls; existing native operation and Number ingress modules remain mandatory. Public import, current Code, save/reopen and all three genuine original/reconstructed/exported contexts require separate qualification. Existing addition blocks supply the authoring surface; no browser interaction or full application acceptance is claimed.

## Remaining allocation compatibility

The literal profile does not yet qualify text coercion for `create1D`, `create2D`, `createEmpty`, `createZeros`, `createRange`, named references, or reference slice/concat results. Each needs its actual fresh-body or current-owner proof, nested and alias cases, mutation behavior, and original semantics tested through the public pipeline and a fresh installed runtime. These are follow-up compatibility tasks, not a permanent rejection policy or a full Array addition claim.

Metadata-only registered constructors remain permanently inert when created without a valid runtime; attaching a runtime later cannot issue operation authority. Existing-heap lookup accepts primitive identity fields, performs no allocation or listener registration, and alone grants no coercion authority. Rendering retains the descriptors actually consumed, including holes and prototypes, and refuses publication when a later observation or operand callback changes them.

## Metadata and alias admission in this profile

Mutable encoded data objects require private evidence of their actual native JSON allocation. Unknown encoded boxes must have an invariant immutable shape: nonextensible, complete nonconfigurable readonly own-data fields with the specified primitive value and ordinary or null prototype. Arbitrary mutable objects inserted by a host callback are refused; admitting such objects safely remains a compatibility task. Ordinary primitive numbers do not need this metadata path.

Mutable reference metadata must be the actual native outer and tuple objects constructed by the value service, or have the same invariant immutable shape. A serialized alias that normalizes through an existing canonical reference remains covered. On an interning cache miss, the existing decoder can return the incoming mutable object; that object is outside this profile unless properly normalized or made invariant. A cached-wrapper control therefore does not claim general fresh save/reload alias coverage. Native provenance is recorded before interning and never assigned blindly to an existing returned wrapper.

Publication first completes all potentially trapping observations for every operand loan, then checks every trusted native backing and parsed-data row in one callback-free final pass. No later raw-reference, graph or WeakRef callback can invalidate an earlier operand after that pass. This new narrowed profile has not yet been executed or qualified; earlier source-only mutable-box examples are retained as unqualified predecessors, not evidence of an existing feature regression.

Metadata module loading and `getInfo()` remain available when native WeakRef is absent. The operation service is permanently inert on that engine: this candidate provides no strong-reference fallback or Array runtime qualification there. Installing a WeakRef constructor after module loading cannot activate the captured unsupported profile.

## Failure routing candidate

The current native controls exposed a distinction between rejecting an unsafe
Array operation and correctly retiring its actual VM fiber. The candidate keeps
strict value and primitive proofs, while using a separate engine-owned witness
only to route failures from the current `valueBinary` or `createReference` call.
The witness is an opaque token: it exposes no engine arguments or utility.
Internal dispatch forwards context only to private lease validation; the token
alone cannot invoke a value API or retire a fiber. Original entry ownership
survives later input/cache/registration edits solely for rejection.
Copied arguments cannot borrow value authority. An arbitrary Error or publicly
returned witness cannot supply the private rejection lease; returned, unrelated
and stale calls cannot retire another fiber. Existing legacy caught-copy probes
retain their behavior. Malformed tracked references are recognized for rejection
without granting their altered shape any access. Fresh native and original
three-context semantics qualification are still required.

Private failure state uses captured native map and reflection operations.
Failure dispatch and lease consumption hold their actual module functions from
initialization, so later loader/prototype edits cannot intercept engine context.
The cyclic helpers publish stable frozen function exports before loading their
dependencies; no runtime dispatcher registration or caller trust flag is used.
These additional controls remain pending fresh native qualification.


## CommonJS initialization follow-up

Operation, exception and primitive-owner exports use immutable records with a
null prototype. Node's circular-require warning logic decorates ordinary-object
exports; freezing such an ordinary object before the cycle closes prevents
that decoration and can stop initialization. A null prototype keeps the exact
frozen own function exports and eager closed dispatch identities without
opening a mutable export or delaying dependency capture. Three native loader
controls exercise each coordinator module as the first entry using an isolated
cache, restoring the original cache in `finally`. The existing 45 native
controls remain unchanged. Fresh installation and complete affected execution
are required; this source correction alone does not qualify runtime semantics.

The primitive-owner record must also have a null prototype: publishing its
exports near the end of the module does not mark the module loaded while its
final eager exception dependency is still initializing. The three entry-order
controls require null prototypes for all three records. No module is allowed
to defer dispatch capture, expose mutable exports or bypass the native loader.


## Explicit supplier operation-map revision

The source candidate selects supplier commit
`1c7eb396173673c858e6c80a66529cb9dce87553`: 108862 source bytes, SHA-256
`28e88ecfbb26feedea25baaaffc9c9bc552c3d9c621c7c38eec71e334e71cca3`.
Its MPL-2.0 source and author header remain in the canonical carrier. Pin,
receipt, notice and explicit admission agree on that exact body. Canonical
producer scripts and registration remain unchanged; a fresh installation must
reproduce the installed mirror before native qualification.

The supplier captures native WeakMap get/set/delete methods for every private
operation-record lookup, publication and retirement, through its already-held
Reflect.apply. It also retains the compatible captured own-property check for
hosts without Object.hasOwn. Later WeakMap prototype hooks cannot substitute
that private record or intercept its retirement. The complete supplier protocol
controls pass for this revision; that does not transfer to Lite native results.

The existing C6 installation and its completed 45-pass/three-fail native episode
apply to the earlier `d4015c4ac7653f50f1bfa28fbb43a284a55337ca` body. Preserve
those failures. This adoption changes supplier identity without changing the
48 native semantic assertions. Fresh normal installation, all affected native
controls and genuine original, Code and exported expected values are still
required. Active Throw completion is a separate host-runtime repair; this pin
does not establish its correctness or general Array coercion support.


## Current computation Error disposition candidate

The complete native run exposed a remaining error path: an actual operand
conversion can throw before an Array operation returns. The candidate handles
that completion only for the active `valueBinary` or `createReference` ticket
and an Error accepted by the existing own-data string-message policy.
Its private single-use failure lease authorizes retirement of that call's
lineage. A coordinator-private identity distinguishes this disposition from
ordinary guard rejection; public Error fields or completion flags cannot grant
it. The actual Error object, subtype, frozen own descriptors and existing cause
are preserved. Already adopted signals remain unchanged. Ordinary guard errors
keep their existing Error-with-cause route, and other legacy operations retain
their throw policy. This does not add support for arbitrary non-Error thrown
JavaScript values or grant any value, Number or Cast authority.

A failed managed cleanup is retained in the private computation signal record,
with a read-only diagnostic count; it does not replace the original Error's
cause or modify a frozen Error. The new focused native group uses the actual
registered Arrays implementation and real linked VM threads for Error,
TypeError and RangeError identities, including an actual registered cleanup
failure and an unrelated continuing script. All previous 48 native assertions
remain unchanged. Supplier private-operation tracking corrections and explicit
supplier adoption are separate changes. A fresh combined normal installation,
complete native execution and the unchanged original/Code/exported semantic
journey remain required; no full-game or GUI acceptance follows from source.
