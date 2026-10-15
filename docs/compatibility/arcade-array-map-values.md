# Arcade Array.map values and callback iteration

## Scope and authority

This lane proposes value-producing `Array.map` in the Arcade source bridge.
The first slice uses an actual Array receiver and an inline callback with zero
to two distinct plain parameters. Expression callbacks and completely proved
straight-line bodies ending in one return are candidates. Unsupported callback
forms retain explicit diagnostics; discarding the mapped result is not support.

Receiver authority comes from actual allocations, aliases, arguments, returns
and all writers to their exact lexical bindings. An Array annotation, method
name, namespace prefix, opaque value or custom object's `map` method grants no
Array authority. Missing arguments, uninitialized reads, ambiguous declarations,
unknown callees and incompatible writers must remain visible to the proof.
Constraints and actual producer facts remain separate.

Extend the existing shared source producer analysis through a narrow optional
Array allocation/element interface rather than introducing another annotation
graph. Preserve its default Font, primitive, callable and inspection policies.
Source analysis does not mint a native reference owner or revive an expired one.

## Selected iteration semantics

The selected PXT implementation is the primary contract, including its indexed
reads after mutation. See the MIT-licensed
[PXT 13.2.1 array helpers](https://github.com/microsoft/pxt/blob/v13.2.1/libs/pxt-common/pxt-helpers.ts)
and [Array declarations](https://github.com/microsoft/pxt/blob/v13.2.1/libs/pxt-common/pxt-core.d.ts).
Retain applicable attribution if implementation text is derived from them.

- Evaluate the receiver exactly once, including a variable that the callback
  subsequently reassigns. Cache its initial length before invoking callbacks.
- Visit each original index in order. Read that index from the original Array
  immediately before the callback; earlier mutations affect later reads.
  Shrinking does not skip remaining original indices: missing elements supply
  undefined. Appending does not extend the original iteration range.
- Supply the actual element and index, preserve callback effects and append the
  returned value to a newly allocated result Array in the same order.
- Preserve surrounding expression evaluation, nested calls, lazy branches and
  the existing selected PXT staging rules. Lifting a loop must not move it ahead
  of an earlier argument effect or execute it on an unchosen branch.

Map results are real reference Arrays. Equal contents do not merge identity;
aliases of a result share later writes, and source/result allocations remain
distinct, including empty results. Reuse the existing owned Array operations and
lifetime rules rather than copying through text or JSON.

Primitive callback results are the initial target. Reference-valued results,
including nested Arrays and owned Image or class objects, require complete
element/owner proof before admission. Until then, refuse them explicitly and
track this limitation; never erase, stringify or clone their identities.
Stored/generic callbacks, default or rest parameters, arbitrary early returns,
callback escape, unsupported captures and wider callback signatures remain
separate followups unless independently proved within this contract.

## Existing callback paths

Audit existing statement-map, `forEach` and `filter` lowering against the same
selected helpers. Change their cached-length or receiver handling only after
an actual counterexample establishes a difference. Preserve filter's complete
predicate pass before a chained consumer and the original selected element
when a predicate mutates the source. Do not substitute JavaScript sparse-array
assumptions for the selected indexed helper semantics.

## Ownership and acceptance

Own a focused Array-map lowering module, additive producer-analysis hooks,
coordinated translator/staging hooks and self-authored tests. Coordinate shared
producer and callable passes with their owners. This lane does not change the
canonical physical Number-input Array operations, dependency pins, vocabulary,
SDK signature domains, frame timing or unrelated artwork handling.

Required controls cover receiver-once effects; initial-length append/shrink;
receiver rebinding; current element writes; callback element/index/effect order;
empty and distinct result identity; alias mutation; nested maps and surrounding
argument/lazy evaluation. Include opaque, shadowed, missing, mixed, stale and
foreign ownership negatives. Unknown callbacks and unproved results must fail
by name rather than execute partial output.

Prove source execution, editable Code and Blocks, same/fresh saved projects,
current edited export and reimport. Preserve existing reference-array, callback,
class and Font controls. Freeze actual source/export inputs before fresh
selected-compiler qualification and reserve the normal execution slot; retain
compilation inputs, outputs and SDK guards without replaying successful
unchanged programs. Native tests do not establish hosted editor acceptance.

Private retained contexts can identify failures but cannot become public
fixtures without applicable redistribution permission. Use independently
authored fixtures, retain original failures and input provenance privately, and
do not promote an entire project from a narrow map control.
