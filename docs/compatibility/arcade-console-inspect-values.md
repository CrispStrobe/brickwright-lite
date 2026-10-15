# Arcade console inspection values

## Claim and selected authority

Proposed ownership: `corpus_gap_analysis`, isolated Arcade inspection lane.
Merge this docs-only contract before product edits. This lane adds the genuine
String result of `console.inspect(value, maxElements)` to source, Blocks, Code,
native execution and current export. Console logging remains a separate effect.

The selected Arcade target 4.2.1 / PXT 13.2.1 bundle contains `base/console.ts`
with SHA-256 `2edc2e28b6922524e312fb76fc41f5b282822360b0c52cadbf56778049796cdf`.
The [primary console implementation](https://github.com/microsoft/pxt-common-packages/blob/ced6d5508d818f996c9d09644f62f7edb49d0521/libs/base/console.ts)
provides a public source reference; qualification must bind the actual selected
bundle bytes and compiler inputs rather than infer identity from a branch name.
Retain Microsoft copyright and MIT notices for any incorporated source.

Inspection returns a String and does not notify console listeners. Strings are
returned unchanged; Numbers use the selected primitive conversion. Other
supported primitives follow the selected string coercion, with null and
Undefined kept distinct. Arrays use comma joining and, when the length exceeds
the limit, a sliced prefix followed by three dots. The default limit is 20.
Object inspection also has custom conversion, key enumeration and property
reads; these are separate behaviors outside the initial admission below.

The concrete blocked caller is Carnival `splashMP`, which inspects its title and
an optional truthy subtitle before dialog effects. Prove its actual callers and
writers; an `any` parameter annotation does not establish a primitive producer.
A successful bounded control does not qualify Carnival, StatusBar or a complete
project with other unsupported operations.

## Initial admitted values

The first source/runtime slice covers actual String, Number, Boolean, null and
Undefined producers. A flat Array slice may follow within this claim only after
selected-original controls establish element conversion and limit behavior.
Admit those Arrays through actual current Array ownership and complete primitive
element/writer proof, including historical aliases and foreign target writers.
Never infer element safety from a declaration, initial sample or current value
alone. Preserve receiver identity and evaluate the Array only once.

Before Array admission, retain named refusals for that domain. Nested or cyclic
Arrays, raw objects, custom conversion/getters, managed classes, Sprite, Scene,
Image, Font, Buffer and callable references remain explicit refusals. A canonical
reference handle must never become printable text by accidental object coercion.
No generic Any, String namespace cast, JSON replacement, speech or logging
substitution supplies the result.

Evaluate VALUE and an explicitly supplied LIMIT exactly once in selected PXT
order, even when the String/primitive branch does not use the limit. Preserve
argument effects, omitted versus explicit Undefined, special Numbers, negative
zero and any relevant numeric carrier behavior. Establish selected slice/join
and default semantics with actual compiler/runtime controls before accepting
fractional, negative, NaN, Infinity or otherwise unproved limits; do not clamp or
normalize them by guess. Unsupported forms keep diagnostics rather than a fake
String result.

## Ownership and authoring

Own a new dedicated native inspection module and focused tests, with coordinated
index/getInfo hooks, strict source producer and lexical SDK-callee validation,
String result-flow seeds, current export expression and a paired canonical
producer word if existing operations cannot express the exact behavior.
Coordinate existing callable/result-flow, Font, primitive carrier and named Array
helpers; do not overwrite their owned branches or move unrelated pins.

A new reporter must have a real connected VALUE input and a distinct Number
LIMIT input with the selected default. Its result metadata is String. Canonical
producer, native metadata, decompiler and Code parser must agree on both input
slots; no menu/input/field mismatch or hidden unsupported String opcode. Export
uses actual `console.inspect` with the current connected operands and preserves
receiver, argument and side-effect ordering. Reimport must independently prove
that source again, without restoring a retained original body over user edits.

Source proof must resolve the actual unshadowed SDK console root/member. Reject
shadowed roots, substituted methods, unproved aliases, wrong arity, unresolved
producers and adjacent unsupported bodies. Current Blocks proof validates actual
reporter/target/container, inputs, parentage, all writers and current project
membership. Cached argument objects, sibling reporters, copied handles and stale
Stop/reload/dispose generations cannot grant authority. Pure primitive formatting
must not invoke a user object's conversion method while deciding admission.

## Acceptance before capability claims

- Selected-original primitive matrix: empty/nonempty/unicode Strings, booleans,
  null, Undefined and special/finite Numbers, plus argument effects and the
  distinction between inspection and actual console logging.
- Separate Array matrix before admitting Arrays: empty/flat mixed primitives,
  default and boundary limits, delimiter/ellipsis bytes, aliases, mutations and
  every proposed limit edge; nested/cyclic/reference elements must refuse until
  separately qualified.
- Source/native/Code/same and fresh SB3/current export/reimport comparisons with
  exact String values and effect counts. Compile and execute genuinely changed
  exported inputs with the selected SDK; retain actual inputs, output files,
  binaries, observations, consumed guards and first failures.
- Meaningful adversaries for SDK shadow/replacement, opaque casts, foreign or
  late element writes, current input/body edits, malformed input chains, stale
  cached operations, Stop, repeated Start and same/fresh project loads.
- Hosted official-artifact GUI journey: import, visibly edit VALUE and LIMIT in
  Blocks, edit Code, save/reopen fresh SB3, export actual current bytes and
  reimport. Compare displayed inspection text and deterministic complete frame
  pixels where the control draws that text. Source/native proof does not stand
  in for this editor journey.

Keep immutable raw184 and authenticated complete-context measurements separate.
Do not promote a game, legal/resource closure or the raw corpus denominator from
this bounded reporter or a private project comparison.

## Primitive implementation boundary

The primitive source slice uses the shared directed producer graph. Function,
class and enum values, reference declarations, unresolved names and unknown
writers do not become Undefined evidence. A direct unchanged ordinary function
can still supply its proved primitive return. Optional absent arguments and real
fallthrough Undefined remain distinct from unknown producers.

An untyped global without an initializer or inferred concrete/unknown writer
uses the existing Any scalar declaration to reset its storage to Undefined.
That reset is not evidence for later values: inspection checks every actual
writer. Mixed primitive writers remain eligible; a reference or unknown writer
refuses. Current export follows directed writers separately from an Any storage
annotation, and refuses hidden/foreign writers or computed local names.

Uninitialized lexical local reads retain an explicit producer refusal while their
source local-storage ABI is qualified. Explicit Undefined initializers and omitted
optional actual arguments remain separate cases. This is not a change to the
default value of an ordinary Scratch local.

Native and source portable controls do not establish selected-original execution
or the hosted editor journey. Arrays and reference values remain outside this
initial slice.
