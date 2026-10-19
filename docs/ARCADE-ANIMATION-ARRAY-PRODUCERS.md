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
