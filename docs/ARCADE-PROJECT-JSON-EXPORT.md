# Exporting an immutable project JSON snapshot

`projectJsonToArcade(json, options)` exports the complete serialized project as a
fresh, deeply frozen snapshot. `json` must be a primitive string. The constructor
uses the parser captured at module initialization and refuses if the global JSON
object or its `parse` descriptor has changed. Every parsed object and array is
frozen before any export or asset callback runs. Module initialization relies on
the application's trusted JavaScript environment; this is not clean-realm
attestation.

The snapshot constructor does not accept or register caller objects, revivers,
flags or provenance hints. Its private origin identifies only immutable data it
constructed itself. The existing `projectToArcade(project, options)` API remains
available for direct AST inputs, including mutation/currentness checks. Arbitrary
AST monitor records cannot acquire the immutable snapshot's watcher capability.

The snapshot route supports default, read-only variable watchers only when their
actual IDs and names resolve uniquely to noncloud Stage variables. Interactive
sliders, lists, foreign owners, cloud variables and unknown watcher schemas are
refused by the Sprite flags proof. A watcher's displayed cached value never
supplies a Number, primitive or Array fact. Native bitwise flags operands still
require the actual receiver and all writers to satisfy the independent proof.

Asset callbacks receive frozen targets, costumes or sounds. They should read
assets by their saved identifiers. `costumePalette(target, costume, position)`
also receives a frozen `{targetIndex, costumeIndex}` for the actual serialized
snapshot, so separate palettes for duplicate assets remain distinguishable.
The old object API retains its original callback receiver and two arguments,
even when explicitly passed a constructor-owned snapshot. Snapshot
callback mutations fail honestly; callback errors are not replaced with success.
Animation documents supplied separately in options retain their existing resource
validation and currentness obligations.

The GUI exports the current VM's serialized project after its normal asset-library
projection. The CLI uses the actual Creator or saved SB3 project and preserves
original artwork indices across that projection. The conversion journey and
roundtrip driver use the same explicit serialized boundary. Saving and reopening
an SB3 does not grant an AST object a certificate: the next export constructs a
new immutable snapshot from its actual JSON.

All eleven controls in the complete snapshot, Sprite flags and actual CLI
palette modules pass. The composed five-module set, including score callbacks
and compound operators, passes all seventeen controls with zero skips. The
unchanged GUI dependency-scope checker accepts the measured named consumers.
Browser export, original-runtime equivalence and complete-project coverage
remain separate acceptance. This API does not change native Array coercion, dependency pins or SDK
admission.
