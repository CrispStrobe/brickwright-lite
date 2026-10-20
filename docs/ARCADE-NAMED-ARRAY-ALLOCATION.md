# Named Array allocation and text conversion

Locally implemented; hosted adoption and public roundtrip qualification remain
pending. The first connected VM regression reproduced a
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

## Local execution checkpoint — 2026-10-20

The exact proposed supplier and host install through the normal producer; all
364 installed outputs and180 current runtime files pass independent readback.
The shipped source-admission CLI and all57 real VM controls pass, with no skips:
49 previous controls remain unchanged and eight new groups cover empty and
pushed named arrays, both operand orders, foreign ownership, legacy creation,
actual heap/late completion substitutions, original Error identity and inherited
private-field access. The combined episode used21.37 CPU seconds and23.84 wall
seconds within its existing limits. Independent saved-result checks pass.

These are local component/runtime results. Supplier PR56 and the Lite adoption
remain pending; browser authoring, named-factory Code/export/reimport and
MakeCode SDK acceptance have not passed from these tests. Source review predicts
that a named getter can make export/reimport reconstruct through create1D.
Capture that actual route and support its distinct JSON allocation semantics;
do not change the emitted factory or omit the getter to conceal a refusal.

## Public execution blocker — 2026-10-20

The two authored public Code journeys now execute through the actual Creator
and VM. Both fail in their original runtime stage because an Arrays-only
project has no exception coordinator; the primitive operation cannot acquire a
current ticket. The native57 fixture explicitly created that coordinator, so
its passing result did not cover this project initialization boundary.
Downstream Code/export/reimport remains unattempted for these journeys.

The next repair must initialize a shared private runtime coordinator from the
admitted Arrays binding while retaining an exclusive Arcade capability claim.
Extension load order, project replacement, generation cancellation and disposal
need real lifecycle controls. Preserve all existing native tests and the
original public failure; no dummy Arcade blocks belong in the test programs.

## Next JSON producer qualification

The named JSON supplier protocol candidate passes its complete34 controls:
26 existing controls and eight new groups. Its first run retained three failing
observer expectations; the correction distinguishes the original registry
preflight from publication and preserves deferred property-key coercion. Product
code stayed unchanged between those two runs.

The matching host implementation and ten native JSON allocation/currentness
groups still need execution through the exact pinned supplier, a fresh normal
installation and the public authoring/export journeys. Malformed JSON must
retain each original factory fallback and actual Error behavior; custom parsers,
nonarray JSON, object elements and legacy/no-ticket cases must keep their
separate semantics. Protocol success is not runtime or MakeCode acceptance.


## Combined JSON and replacement qualification proposal

The current local proposal advances Arrays to
`035ab22a4d946fe5b8e367013caf898cd763e5f4`. All40 supplier protocol tests pass
with zero skips. The canonical targeted producer generated the matching carrier
and per-file receipt; the source-admission contract and MPL notice move with
that explicit pin. Other component pins and receipt rows remain unchanged.

This combines named JSON allocation, Arrays-only coordinator initialization
and prior-binding replacement. The earlier C10 whole64 run had61 passes and
three failures; it does not qualify this candidate. Two fixture corrections and
a real reload ownership repair are now composed. A fresh normal installation,
all64 existing native controls, all14 new JSON/replacement controls and the
public Code/export/reimport journeys remain required. The proposal is not an
adoption on Lite main or a reduction of corpus partial counts.

All three native input names (Number values, named JSON and replacement fault
controls) refer explicitly to the same admitted canonical source file. Workflow
controls reject a missing input, an unreviewed replacement path or bypassed
admission. A source candidate must not rely on a local-only environment variable
that the hosted unit shard never supplies.
