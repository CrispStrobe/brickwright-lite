# Animation resources as Array producers

## Observed gap

The current Array export authority recognizes constructed Arrays and selected
SDK producers. It does not recognize the actual Array of image handles returned
by a valid authored animation resource. The native-library import regression
therefore refuses both an item read and a length read on imported frames.
Merely accepting the reporter opcode would be incorrect: the runtime returns
Undefined when the resource cannot be resolved or validated.

## Implementation contract

- Admit only an actual current animation document through the existing resource
  validator. Bind its unique resource ID, revision, dimensions, palette and frame
  data to the exact project, target, reporter and literal or menu input graph.
  Unknown, duplicate, malformed, missing or dynamic resource selection remains
  unproved; a text annotation cannot establish an Array.
- Coordinate exporter resource preparation with the Array authority through a
  narrow validated resource interface. A serializable record supplied by a
  caller is not authority by itself. Reject stale graph or resource changes.
- Preserve the difference between shared cached frames and fresh frames.
  Shared references for the same resource and revision must share alias and
  mutation facts. Fresh evaluation must preserve separate allocation behavior.
  Retain all-writer, argument, return, escape and initialization checks.
- Initial frame count does not prove that a mutable shared Array still contains
  an element. Model relevant mutation before item reads; retain empty, removed,
  unknown-index and unknown-writer refusals. Images are not nested Arrays.
- Preserve existing public diagnostics for unresolved or unsafe cases. No
  fallback source execution, fabricated frame, default value, pin change or
  generic type assertion is part of this work.

## Required evidence

Use authored positive and adversarial controls: direct and transported fresh
frames, shared aliases, mutation through an alias, two independent fresh reads,
valid menu selection, invalid or duplicate documents, missing and dynamic IDs,
resource revision changes, graph replacement, unknown writers and absent items.
Check actual import, Creator, Code, saved Blocks/artwork and current export
without removing assets or diagnostics. Qualify the affected native Array and
animation behavior with real image handles and independent observations. Keep
existing failed originals and immutable corpus membership. A focused pass alone
does not change a whole-project compatibility classification. Visible editor
qualification and all enabled final-head checks remain separate required gates.

## Boundaries

This claim changes conversion authority and its narrow exporter interface only.
Animation resource editing, cached runtime semantics, new Array operations,
source reset relaxation, renderer behavior and dependency versions remain with
their existing owners. Coordinate shared files before composing implementation.

## Current implementation boundary

The source implementation uses the existing animation document validator and
keeps resource data separate from the Array consumer's requested type. A shared
resource ID identifies one shared allocation; a fresh reporter retains its own
allocation site and the existing invocation and initialization restrictions.
Image elements never establish nested Array authority.

Resource currentness includes the original document graph, property presence
and descriptor flags, numeric pixel values, and typed pixel buffer identity,
offset and length. Numeric containers retain compact value and flag copies;
frame and layer objects retain their actual identities. Replacing a document
with equal content does not reuse its earlier producer proof.

Authored controls cover the public Creator and exporter as well as the narrow
producer and current graph authorities. These source controls remain distinct
from affected native qualification, rendered editor checks and complete project
compatibility. No runtime qualification is implied by this implementation note.

The exporter captures resource validation before invoking artwork callbacks.
Its animation files and Array authority share the same immutable normalized
resource objects through an internal branded interface. A final currentness
check runs after later artwork callbacks; an edit during export produces an
explicit refusal instead of refreshing the proof against different data.

The rich companion uses an immutable copy of the original admitted serialized
document. A later callback edit therefore preserves the earlier consistent
source and native artwork in partial output while the final currentness check
reports the edit. Partial output never counts as a clean current export.

Array facts additionally require the same full document validator used by the
editor's resource publisher. Behavior-only normalized inputs may still retain
their existing export and diagnostic path; they cannot acquire Array authority
when the publisher would reject them. Normalized behavior-only resource identifiers retain their existing rules.
Published version 4 and 5 documents use the existing UUID identity schema.
The authored positive controls use complete valid artwork documents. Typed
pixel data controls exercise snapshot currentness while retaining the full
publisher's refusal to admit that unpublished document representation.
