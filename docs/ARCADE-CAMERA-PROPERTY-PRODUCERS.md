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
Namespace declarations participate in lexical binding, and raw `var` for-of
bindings are hoisted within their actual function. A namespace or loop variable
named `CameraProperty` cannot be mistaken for the builtin enum; unrelated
namespaces and separate local function scopes do not invalidate a genuine use.
The function-variable hoist census stops at namespace boundaries, matching the
resolver’s separate namespace scope.

The enum member is a compile-time numeric constant. Unrelated ordinary calls,
callbacks, arrays, classes and local writes therefore do not remove its numeric
producer. Their own translation, type and diagnostic checks still apply. This
operation grants no Image, Sprite, method, allocation or generic enum authority.
It does not require a fixture-wide list of SDK calls or method names.

The private compiler resolver reuses the existing lexical SDK classifier after
a structural binding-form check. Residual destructuring declarations, raw
ForOf, enum/namespace forms not handled by normal lowering, unknown forms,
dynamic lexical constructs and Throw retain the original public validation path.
A private proof declining does not imply a Number diagnostic when that public
path independently proves the same canonical leaf.
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

The public source analyser and public validator preserve current main’s explicit
`ordinaryPrimitiveSdkNumbers` opt-in: the six canonical leaves are Number when
enabled, and remain Opaque by default or with the option false. Their eager,
exceptional-completion and diagnostic behavior remains authoritative on fallback. Default lowering still performs
both original validation passes. A negative candidate filter selects the full
original validator when no CameraProperty member occurs; it grants no fact and
skips no validation obligation.

## Current composition and qualification still required

The composed source passed 53 pure conversion/observer controls and 49 native
Array controls at their separate observed boundaries. The complete 225-subject
conversion assessment remains incomplete, so the historical 36 partial results
are unchanged rather than a current improvement count.

The first composed Camera/default/delete run observed 33 passes and nine
failures among 42 tests. They exposed stale compiler-only opt-in expectations
and genuine public enum omissions for casts, physical metadata, unknown source
and ambient dynamic lexical calls. The proposed successor preserves the public
opt-in and closes those omissions. Changed-intrinsic and foreign-membership
fallback controls compare actual original full returns or thrown errors; they
retain all private source/intrinsic/expiry fences and exact one-pass errors.
Known harmless namespace, enum and loop forms do not automatically lose the
main public producer merely because the more conservative private path declines.
Unknown members, shadows, namespace writes, extraction, aliases and dynamic
indices retain refusal controls.

This successor is a source candidate. Its complete affected modules require
fresh execution; the original nine failures remain historical evidence. Actual camera import, editable Code, saved projects,
export, original-compiler behavior and affected native execution need their own
observations. No complete-suite, corpus, browser, runtime or performance result
is inferred from the source change.

## Deletion syntax

Source `delete receiver.property` and `delete receiver[index]` are parsed as
actual unary mutations. They cannot appear as an unrelated identifier followed
by a harmless member read. The common translator explicitly reports deletion
as unsupported in both value and statement positions, including ordinary user
objects. It does not substitute an operand read, emit a successful Boolean
result, or implement property deletion semantics. Arcade routes this operation
before numeric folding; micro:bit uses the same common diagnostic path.

This parser and diagnostic correction preserves the Camera identity/mutation
refusals. It does not make deletion a supported target operation or qualify
runtime behavior.
