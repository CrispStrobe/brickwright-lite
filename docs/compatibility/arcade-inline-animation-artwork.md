# Inline animation artwork and source provenance

Imported inline image arrays remain ordinary arrays at runtime. PXT staging
still allocates the array and evaluates each item in its original order.
Grouping does not bypass constructors, calls, pushes, aliases or image copies.

## Editor model

For a source array containing at least two literal `img` values, staging retains
scalar artwork metadata: a source-site group ID, frame index and frame count.
The empty array initializer retains that group ID. Metadata has no AST children,
callable values or runtime operations. Arrays containing effectful/nonliteral
items keep their existing staging without being classified as a literal group.

The artwork collector validates complete ordered groups, creates one hidden
Scratch art carrier with a costume per frame, and maps each actual staged image
literal to its corresponding costume. Runtime image expressions still request
fresh copies, so distinct source arrays and distinct literal sites retain their
image identities even when their SVG bytes are identical.

A declared frame variable supplies the readable carrier name. Namespace
constants keep their original final member name. An unnamed inline animation with a directly identified actor
uses that actor name plus `Animation`. Conservative alias sets prevent a reused
variable from assigning an actor name to an ambiguous source group. Normal
name collision handling supplies suffixes when needed.

## Verification and boundary

Focused checks cover:

- Source AST immutability, scalar-only provenance and unchanged push order.
- Ordinary arrays with effects retaining all item operations.
- One carrier with ordered named costumes and native animation playback.
- Named, aliased and namespace frame arrays retaining readable names.
- Pixel mutation through aliases and distinct image identities across separate
  source sites, editable Code, same/fresh SB3, original MakeCode export and
  reimport.

Tests are `test/arcade-inline-animation-artwork.test.mjs` and the relevant
controls in `test/makecode-arcade-editable-art.test.mjs`. Use the matching pinned
compiler/runtime and the admitted selected SDK; do not substitute dependency
versions to pass them.

This establishes the editable artwork model and focused runtime routes.
Hosted production GUI selection, costume painting, persistence and controller
playback still require the matching official build-artifact journey. Native
animation resources with their own Pixel documents use the separately qualified
complete-factory path; this grouping does not replace that resource protocol.
