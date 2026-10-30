# Closed local class lineage

The private primitive-result analysis follows actual, lexically bound local
parents declared before their children. It combines inherited field writers,
separate getter and setter halves, and concrete receiver dispatch through base
constructors and methods. An ancestor constructor can invoke a child override
before child fields are initialized; those earlier Undefined values remain in
the result domain. Every inherited method remains in the writer census even
when no call to it is observed. Missing constructor arguments and defaults use
the actual source, rather than annotations.
The selected structural default profile currently admits Number, Boolean, Null
and signed numeric literals. String and nonliteral defaults remain unsupported
in this path; extending that profile needs separate source admission and does
not follow from possible original MakeCode support. This is not blanket
MakeCode parity.

The original getter read or complete method call remains once in the private
model. This analysis neither changes source execution nor grants Array body,
Number input or runtime ownership authority. Unknown effects, constructor
escapes, opaque writers, changed source, cyclic/replaced/unresolved parents and
unsupported structural conflicts retain refusal. Selected source rules resolve
accessor halves independently and reject super accessor reads/writes.

## Qualification and remaining work

The complete eight affected pure source modules pass all 27 controls with no
skips. The first run preserved a missing sparse fixture failure (26 pass, one
ENOENT); adding the exact tracked fixture allowed the complete group to pass.
Product source and assertions were unchanged between those two runs. This
qualifies source analysis only, not native execution, original-SDK compatibility
or browser authoring.
The focused controls cover multi-level inheritance, actual super arguments,
constructor defaults and missing arguments, opposite accessor halves, virtual
dispatch before field initialization, inherited uncalled writers, escapes,
parent replacement, structural conflicts and source currentness. Two former
local-inheritance negatives become explicit positives, each paired with an
unresolved-parent negative. Original failures remain part of the evidence.

SDK Sprite ancestry, selected SDK slot descriptors, Image ingress and
allOfKind receiver sets are separate work. No SDK name or annotation is an
authority grant here. The historical corpus partial count is unchanged.

GUI acceptance remains pending: represent inherited members and super in
Blocks and pseudocode, retain diagnostics for unsupported paths, and distinguish
property authoring from actual child overrides. Verify Code → Blocks → Code,
original export/reimport and fresh SB3 reopening with exact values and effect
traces, including constructor virtual dispatch before child initialization.
Source-only results do not qualify those visible editing or application routes.


## SDK Sprite x and closed registry source candidate

The next source candidate adds a distinct private SDK receiver model. It does
not turn the Sprite descriptor's `number` annotation into a field body. The
selected source contract is Arcade 4.2.1 / common packages v14.1.4:
[`sprite.ts`](https://github.com/microsoft/pxt-common-packages/blob/v14.1.4/libs/game/sprite.ts)
(SHA256 `c452013b5ddea08284a6d9e6ee34e86fdc59df2dead6f34cf12d01a2dda2d4da`)
and [`extendableSprite.ts`](https://github.com/microsoft/pxt-common-packages/blob/v14.1.4/libs/game/extendableSprite.ts)
(SHA256 `5deac86004236ed206f821987efe310e8217e6e581e446e23bfe70ca2b95931b`).
See the existing [SDK ABI provenance](ARCADE-SDK-DRAWABLE-ABI.md).

The matching current runtime path is `sdk-sprite-classes.js` `heapHooks.get/set`
through `index.js` `spriteProperty`, `setSpriteProperty`,
`_initializeSdkSprite` and `_installSpriteFixedPoint`. Construction initializes
numeric dimensions/coordinates from an actual Image; the x getter returns the
fixed-point coordinate as a Number. The setter performs Number/fixed-point
conversion. These normal-return facts do not authorize object coercion:
every source writer must have a closed primitive input. Opaque writers decline
the added facts, including callbacks that might run during conversion.

SDK construction calls virtual setImage/setKind. This first candidate refuses
source overrides of those operations, update/draw/hitbox hooks, unknown factory
calls, callbacks, scene changes and arbitrary kind mutations. Existing runtime
and original-SDK tests retain those behaviors; a private proof declining their
source is not a change to their implementation or an acceptance claim.

The existing Image producer issues private tokens only for actual unshadowed
bounded img literals and zero-argument clone calls on issued receivers. The
class graph uses exact constant frame indices, including the emitted
Math.round/modulo form, and preserves original Index/clone expressions and
possible throws. Image collections do not become flat primitive Arrays.
Dimensions in the private token are not pixel or general bounds authority.

The allOfKind result is a distinct collection carrying all possible compatible
concrete classes plus Undefined on indexing. It never selects a particular
instance or asserts equality/order. Every possible receiver must close its
actual x lookup; unknown effects and unsafe classes retain refusal. The
module-owned descriptor snapshot binds identity/currentness and is not an SDK
annotation-based type oracle. Caller metadata cannot enroll a descriptor.

The complete nine-module pure source cohort passes all 35 controls, with no
skips or TODOs: the existing 27 controls are preserved unchanged and the new
SDK receiver module contributes eight groups. The two unchanged conversion
cases also pass, covering the Sprite accessor and local object heap. Independent
saved-output reviews verified complete graphs, both exported files per case,
and unchanged original source, imported code and exported TypeScript. The Sprite
operands now close as Number; the previously passing heap facts remain unchanged.
This is import, project creation and export evidence, without VM execution or
original-SDK execution.
Fresh normal installation, complete native/original-SDK class/accessor modules,
Code and exported-file reimport, fresh SB3, and visible GUI/pseudocode authoring
remain pending. No retained application or corpus count has changed.


### Pending constructor inputs

The first B2 qualification exposed a real constructor-ingress gap: an empty
Image/kind domain returned early while an instance's x normal-result fact was
already available. The original local-lineage negative remains unchanged.
The successor records every actual SDK construction/super edge and discharges
its input obligations after monotone propagation converges. Missing or opaque
inputs revoke the concrete receiver, and that refusal propagates through the
whole graph before projection. Actual forwarded parameters can converge first;
empty domains never stand for successful construction. The complete successor cohort now passes all 35 controls; the original
34-pass/one-failure result is retained.


A later SOURCE review found that a valid constructor site's merged formal could
mask an empty actual input at a different site. The successor also retains
actual allocation/call argument cells before formal merging. Every SDK
allocation input must close independently. An empty observed ordinary call or
local allocation edge conservatively revokes only the additional SDK facts,
since it might forward through shared formals or owned fields. This is an
explicit closed-world limit, not a new input type/initialization permission or
a change to ordinary B1 class facts. Uncalled opaque inputs are not assumed to
be Images merely because another call supplied one. The final source cohort and unchanged two-case conversion checks pass; the
held intermediate source and its withdrawn provisional review are preserved.
Native execution, original-SDK execution, current normal installation consumption
and visible editing still require their own complete checks.

## Ordinary Sprite factories and forwarded normal results

The next source candidate reuses `native-sdk-sprite-source.js` and the existing
`native-class-scalar-view.js` value cells for class-free ordinary factories.
Actual unshadowed `image.create` uses the existing bounded literal-dimension
Image issuer; `sprites.create` requires an issued Image alternative and a genuine
builtin kind. Actual function arguments, returns and aliases carry the resulting
allocation-site receiver. This is no per-invocation identity or Array certificate.

The selected [SDK factory](https://github.com/microsoft/pxt-common-packages/blob/v14.1.4/libs/game/sprites.ts)
runs matching created handlers synchronously before returning its real Sprite.
Every allocation row therefore exists before effect propagation; unknown
registrations, callbacks, namespace writes, extraction and foreign effects revoke
these facts even when they occur before the factory in the source. Empty/dormant
inputs, omitted arguments, unsupported defaults and opaque callers cannot borrow
a formal populated by another call. Refusal is propagated again to convergence.

Only these ordinary rows acquire selected x/y normal results and an owned Image
field. Image fill returns Undefined, clone retains a fresh issued Image, image
reads retain stored Image alternatives, and setImage joins actual Image writes
while null remains a no-op. Generated nullable locals preserve their original
faults; only successful Image alternatives enter the stored field. Actual getters,
factories, calls and arguments remain once in the original execution. No input
initialization, bounds, termination or exact pixel/position value is inferred.
The older subclass x-only/override and registry rules remain independent; mixed
local-class/ordinary-factory programs still need a separately qualified extension.

The complete hosted receiver module reports **12/14**, and the original Sprite
forwarding native/Code/MakeCode/export/reimport/fresh-SB3 test passes. Two receiver
controls remain blocking: an invalid additional allocation failed to revoke other
ordinary rows, and changing a literal factory width failed to revoke source facts.
The next repair poisons the ordinary profile for any unclosed factory site and
checks complete physical source descriptors before publishing new ordinary facts.
Literal replacement, in-place edits, descriptor changes and observed restoration
cannot revive an old proof. Functions are retained by identity; their internals
are not inspected or qualified. The existing no-class/no-factory and class routes
remain independent. These repairs and stronger literal-currentness controls still
need fresh hosted qualification. GUI parity and the application partial count
are not established by the conformance results.

The class-free no-factory route retains its original no-op behavior. A bounded
data-descriptor syntax selection chooses full validation for possible factories
or uncertain shapes; it grants no namespace, argument, value or getter fact.
