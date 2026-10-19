# Ordinary procedure calls with omitted optional arguments

## Scope

Recover the existing fixed procedure ABI when an actual ordinary TypeScript call
omits a trailing optional argument. The first domain is a uniquely bound ordinary
module or flattened namespace procedure with no signature defaults, rest parameter,
generic parameters, constructor call or spread arguments. This is a transport
rule for a particular invocation, not support for every declared parameter type.

For example, a call to `begin(seconds, mode, effect?)` with two actual arguments
supplies an actual Undefined value to its third formal. Its declaration does not
produce an Effect. Another call that supplies a third argument must independently
prove that argument's actual value and satisfy every consumer obligation.

Do not specialize this rule for package or procedure names. Preserve all configured
helper bodies, declaration order, call order and existing diagnostics. Recovering
an argument list does not establish complete app support.

## Source ownership and actual missing slots

Before lowering changes the program, bind each eligible call to its unique,
unchanged actual declaration and lexical callee binding. Associate every ordered
argument position with that declaration's actual formal identity. A spelling,
optional type annotation, copied metadata object or matching parameter count does
not establish this relationship.

Prove all of the following:

- The callee is an ordinary direct call to that declaration. No ambiguous,
  reassigned, escaped, computed, generic, constructor or captured callable route
  borrows its proof.
- Formal identities and order are unique and unchanged. Every absent position
  belongs to the declaration's actual optional suffix. Missing required arguments,
  excess arguments and unsupported signature shapes retain named refusals.
- The actual call's ordered argument list establishes which slots are absent.
  No zero, empty text, Null or explicit Undefined value is classified as absence.
- Configured writers, declaration replacements and unsupported neighboring code
  cannot silently invalidate the callee or formal proof.

Use a reusable per-call, per-formal proof. A missing argument on one call cannot
make the formal globally Undefined. Retain other full argument lists and forwarding
calls. A procedure with no incoming calls has no observed argument producer; its
optional annotation cannot supply one.

## Canonical value transport

Emit the existing canonical `undefined value` reporter for an actually absent,
eligible slot in the fixed ABI. This must work independently of the selected
whole-program translation route. Do not pass a synthetic Undefined AST node
through a fallback that turns it into numeric zero, text or an ordinary variable.
Do not append values merely to satisfy the parser's expected arity.

Evaluate each provided argument exactly once and in its original order. Preserve
argument object/reference identity, all body effects, return values and exceptional
completion. Explicitly supplied Undefined remains a provided value. With no
signature defaults, both an omitted optional argument and a supplied Undefined
reach the unchanged procedure body as actual Undefined; their source presence
facts must not be confused during admission.

The existing default-bearing protocols retain their own omission bit and editable
default body. In the selected target, an absent argument and explicitly supplied
Undefined can differ at that boundary. This lane must not replace the omission
bit with an Undefined test, repeat default evaluation, move initialization or
admit arbitrary reference defaults. Typed/defaulted primitive, nested, captured
and generic callable support remains governed by its existing contracts.

## Parameter types are obligations, not producers

Optional signature information may describe a parameter without establishing a
runtime value. An annotation such as `effects.BackgroundEffect` or `music.Melody`
does not create an Effect or Melody domain, reference, body or service owner.
An omitted slot's producer is actual Undefined, justified only by that call's
absence. A provided reference still requires separately qualified actual producer,
owner, lifetime and consumer support. Unknown provided references remain named
unsupported inputs; do not coerce them, borrow a neighboring call's evidence or
accept an SDK-looking carrier.

Preserve existing primitive parameter constraints, source reference contracts,
all-writer and initialization proofs and runtime value protocols. This lane does
not widen Any, class/callable signatures or arbitrary SDK reference domains.
Manual fallback/default statements already in a helper body remain unchanged.

## Current Blocks, Code and export

Bind the current procedure definition and prototype, ordered formal IDs, actual
call mutation, argument sockets, connected reporters and body to the current
owner. Preserve optional signature information separately from actual producer
facts. Source metadata cannot authorize a later edited call or restore an old
body in place of current Blocks.

Validate rename, reorder, reconnect, replacement and all relevant writers.
Disconnected sockets, duplicate prototypes, foreign/stale identities and opaque
provided values must retain explicit refusals. The normalized fixed ABI uses real
Undefined reporters; an absent connection alone must not fabricate one.

Export the actual current argument list and body. Preserve supported optional
signature information only under the current declaration's validated signature
contract. For the no-default domain, an actual normalized Undefined operand may
be written explicitly as `undefined`; exact source omission spelling is not the
semantic claim. If a required signature domain or current value lacks export
support, report that boundary. Never reconstruct retained source, erase provided
operands or suppress an unsupported type to obtain a successful round trip.

## Qualification and user interface obligations

Meaningful controls must cover unrelated procedure names, distinct owners,
missing versus provided Undefined, mixed missing/full forwarding calls, unused
helpers, alias/writer changes, missing required/excess arguments and unchanged
body order. Retain existing default omission-bit controls. Check current graph
edits and unknown provided reference refusals independently of source parsing.

Native qualification must use the actual current managed procedure invocation,
argument objects, callback/caller lineage and value service. Observe canonical
Undefined ingress, provided argument evaluation and effects, return/exception
behavior and unrelated fiber preservation. Synthetic IDs or manufactured runtime
errors cannot supply ownership. Source controls alone do not qualify native
execution.

Blocks and Code must expose the actual normalized operands and editable bodies.
A user must be able to see and change a supplied Undefined value without silently
changing a default's omission semantics. Track declaration/optional-parameter
controls, call editing, save/reopen and current export/reimport as distinct GUI
gates. Graphics and other editors must retain their existing value ownership;
this transport lane introduces no reference resource by itself.

A fresh affected app conversion must retain all diagnostic channels and partial
outputs. Parser acceptance, lower error counts or correct arity alone is not
runtime, current export, GUI or whole-app success. Any unavailable stage stays
explicitly unavailable until separately qualified.

## Implementation envelope

After this claim merges, own a narrow ordinary-call omission planner, coordinated
source-call emission hooks, current procedure signature/argument validation and
export hooks, focused controls and documentation. Reuse existing actual callee
analysis, primitive constraints, canonical Undefined transport and omission-bit
protocols. Coordinate shared files with their existing owners.

No new Effect/Melody producer domain, new dependency pin, supplier adoption,
callable allocation ABI, generic/captured/nested declaration support or arbitrary
default semantics is authorized. Expand those contracts separately if needed.
