# Named Array allocation and text conversion

Implementation in progress. The first connected VM regression reproduces a
real gap: `createEmpty` creates the named Array, but using its reference in
text addition is rejected because that allocation has no primitive backing
proof. Literal Array allocations already have a separate qualified path.

## First implementation scope

Support `createEmpty` with a primitive string name through a native empty
Array created by the host for the current operation. The supplier requests
that allocation through its existing operation service. The returned identity
is private to the current ticket until successful completion. A method name
or an Array-shaped object alone cannot grant primitive eligibility.

Before publication, require the same current named backing, its original empty
allocation state, unchanged operation and normal intrinsics. Reject duplicate
requests and expired operations permanently. Preserve existing standalone and
unqualified behavior; a requested host allocation that returns no body must
fail explicitly. No binding rollback is promised after a failed completion.

A named reference selected from an eligible backing must return that exact
backing. Preserve this identity through the current registry and closed result
lookup before publishing the reference.

## Acceptance

- Construct a named empty Array using connected real VM blocks, obtain its
  reference, and add text in both operand orders.
- Push a numeric item using the actual named push block; text conversion must
  produce that item's value in both operand orders.
- A reference from another runtime remains foreign; only the failing script
  stops and an unrelated script continues.
- Reject duplicate allocation, changed arguments or block metadata, reentry,
  replacement backing, changed intrinsics and stale or disposed operations.
- Preserve all existing native ownership, coercion, error-routing and cleanup
  controls without weakening their assertions.
- Qualify the exact supplier source and fresh normal installation, then the
  canonical registered extension and original/Code/exported program paths.

The supplier pin, source receipt, canonical carrier, test-source admission and
MPL notice must advance together after supplier qualification. Until then, a
prototype adapter result is not acceptance of the shipped extension.

## Follow-up families

Named JSON/2D/zero/range factories, slice/concat results, serialized aliases
and native object elements need their own allocation, alias and value
semantics. Extend the host's allocation protocol with evidence from each real
producer; do not mark a list of factory method names as trusted.

A passing component or VM regression does not update the historical corpus
counts or establish Blocks, Code, graphics, SDK or full-game compatibility.

## Proposed supplier for qualification

This branch proposes source `d7eb7e4c50275bd375b37b64d84ba60e59f17564` from
[extensions PR #56](https://github.com/CrispStrobe/extensions/pull/56). The
supplier's complete 26-group protocol module passes; the supplier PR remains a
draft and its hosted checks and Lite native qualification are pending. The
local pin, carrier, receipt, source admission, exact admission controls and MPL
notice are prepared together to make that qualification reproducible. This is
not adoption on main or acceptance of the shipped feature.
