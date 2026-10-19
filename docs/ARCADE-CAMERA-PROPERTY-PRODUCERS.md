# Camera property constants in ordinary typed procedures

## Candidate scope

The compiler can validate the six canonical `CameraProperty` constants as
Number arguments to an ordinary typed procedure. The values are `X=0`, `Y=1`,
`Left=2`, `Right=3`, `Top=4`, and `Bottom=5`, matching the
[Arcade declaration](https://github.com/microsoft/pxt-common-packages/blob/master/libs/game/scenes.ts).
PXT resolves an enum member's constant value and emits its numeric literal;
this applies to these ordinary enum members, independently of a `const enum`
spelling. See the versioned
[PXT constant derivation](https://github.com/microsoft/pxt/blob/v13.2.1/pxtcompiler/emitter/emitter.ts#L3288-L3345)
and [property emission](https://github.com/microsoft/pxt/blob/v13.2.1/pxtcompiler/emitter/emitter.ts#L1786-L1798).
These links describe the source semantics; they do not qualify a new compiler
execution or every current upstream revision.

The producer requires an actual physical member expression with the builtin SDK
binding at that lexical use. A Number annotation, a user object with an `X`
field, a matching variable name, or a cast cannot establish that binding.
Namespace escapes, root/member writes, dynamic indexing, unknown members and
reflection involving that root remain outside this proof. A shadow in an
unrelated local scope does not change a genuine builtin use elsewhere.

The enum member is a compile-time numeric constant. Unrelated ordinary calls,
callbacks, arrays, classes and local writes therefore do not remove its numeric
producer. Their own translation, type and diagnostic checks still apply. This
operation grants no Image, Sprite, method, allocation or generic enum authority.
It does not require a fixture-wide list of SDK calls or method names.

The private compiler resolver reuses the existing lexical SDK classifier after
a structural binding-form check. Residual destructuring declarations, raw
ForOf, enum/namespace forms not handled by normal lowering, unknown forms,
dynamic lexical constructs and Throw retain the original conservative path.
These are pending binding/completion coverage gaps, not a permanent rejection
of valid language constructs. Every transformed Program needs a fresh derivation.

## Validation boundary

The new operation completes primitive-procedure validation inside the actual
compiler's synchronous parse and owned normalization path. It keeps its producer
graph private and returns only the completed diagnostics. Full source identity,
metadata, intrinsic and iterator checks surround the derivation. Uncertain or
changed inputs use the original validator; no retained source certificate, caller
trust option, callback or graph factory is accepted. This is an internal owned-AST
contract, not an unforgeable test for arbitrary Proxy objects.

The public source analyser and public validator retain their existing eager,
exceptional-completion and diagnostic behavior. Default lowering still performs
both original validation passes. A negative candidate filter selects the full
original validator when no CameraProperty member occurs; it grants no fact and
skips no validation obligation.

## Qualification still required

This is a source candidate. Its complete new controls and the unchanged affected
modules require execution. Actual camera import, editable Code, saved projects,
export, original-compiler behavior and affected native execution need their own
observations. No complete-suite, corpus, browser, runtime or performance result
is inferred from the source change.
