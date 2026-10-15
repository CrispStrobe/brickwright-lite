# Ordinary procedure parameter constraints

Status: proposed ownership and acceptance contract. Implementation requires this
claim to land normally first. Compiler adoption, selected original execution,
and hosted graphical authoring remain separate gates.

## Concrete gap

The [Lyla tutorial's complete project](https://github.com/microsoft/pxt-arcade/blob/8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02/docs/tutorials/lyla-jr.md#4)
contains an unused ordinary namespace helper whose parameter is declared String:
`holdText(thisText: string)`. Its body calls `game.showLongText`.
The importer retains that declaration while translating, but the current DEFINE
and prototype representation loses the Number versus String constraint.
With no incoming calls, export has no actual parameter producer and emits
`thisText: any`. Reimport then correctly refuses unproved primitive text.

The helper stays present. The solution must preserve an authored constraint,
not infer String from the desired display operation or manufacture a caller.
A parameter constraint is not an observation that a String value exists.

## First bounded protocol

Add one explicit ordinary-procedure parameter-constraint declaration protocol,
with a proper canonical producer word and native editable block. Its visible
controls select an actual procedure, one of its actual parameters, and a fixed
`Number`, `String`, `Boolean`, or `Any` constraint. Code must express the same
selection reversibly. An opaque JSON-only product flow is insufficient.

The record binds the current target, unique actual definition/prototype, ordered
formal names and IDs, and selected formal. Labels alone are not authority.
Code parsing resolves its explicit selection against the definitions it really
builds; SB3 retains the binding. A parameter rename or reorder must either
preserve that real formal association correctly or report a stale declaration.
Duplicate records, duplicate definitions/formals, missing bindings, foreign
owners, computed selectors, and incompatible edited bindings are refusals.

Fresh supported source imports record their actual declared primitive parameter
constraints. Existing projects whose annotations have already been erased do
not regain them from retained source, hidden original text, a fixture, or a
consumer's desired type. The user may author an explicit constraint in Code or
Blocks, subject to the same complete current-graph checks.

The first source scope is ordinary module/namespace function declarations with
required, simple primitive parameters. Unsupported optional/default/rest,
generic, overload, destructured, reference, or callable parameter forms must be
explicitly refused by this protocol. This does not introduce function values,
new callback signatures, inheritance, physical Sprite/Font admission, or a
broader callable default gate.

## Constraints and actual values

Keep two distinct analyses:

- Declared constraints are obligations for source rendering and validation.
- Directed producers describe actual values, including Undefined, aliases,
  mutations, and invocation inputs.

Do not seed console, Font, Player, callable, or general scalar producer facts
from a declaration. `Any` is not permission to pass an opaque value to a
primitive-only API. An uncalled constrained formal still has no actual value
producer. Its retained constraint may render the TypeScript parameter while
remaining absent from concrete value facts.

Validate every actual incoming call and formal writer, including registered
captured-cell writers, aliases, and every reachable call path. A supported body
must satisfy its consumer obligations under its declared parameter constraints;
actual callers must in turn discharge those constraints with real producers.
No-caller rendering is allowed only for a genuinely unescaped declaration with
its body and obligations retained. Unknown calls, unproved escapes, dynamic
callees, unresolved writers, or cycles that lack evidence cannot disappear from
that check.

Preserve real argument order, evaluation once, return/Undefined behavior, and
existing managed frame/capture ownership. Do not cast numeric text, replace
stored values, add a fake call, prune a helper, or use an original source body
instead of the edited current one. An inconsistent declaration is a named
admission/export refusal, not a type rewrite or silent execution no-op.

The native declaration must bind and validate the actual current procedure
contract. It must retain Stop/restart, dispose, same/fresh project load, target,
prototype, and current-body ownership rules. Old declarations or saved references
cannot authorize a different project, renamed formal, or edited body.

## Ownership

Consumer work is isolated to new procedure-constraint helpers, narrow source
lowering and procedure rendering/admission hooks, a native declaration service,
its getInfo/menu/method integration, focused controls, and documentation.
Existing captured-console, class/callable, numeric, Font, and source-cell
certificates remain independent. Coordinate shared frontend/export/index hunks
before editing. Preserve the separately owned statement-cycle renderer guard.

The canonical producer owns the word table, parser/decompiler, proper field/menu
schema, and round-trip controls. Coordinate its exact base and files with its
current owner. Adoption requires the normal matched-head merge and all enabled
checks, plus a separately qualified consumer pin and generated mirrors. Do not
move unrelated pins or waive gates to publish this protocol.

## Acceptance

1. Preserve String, Number, Boolean, and Any constraints through fresh source,
   Code, actual editable Blocks, same/fresh SB3, current export, and reimport.
   Preserve actual parameter identity through supported rename/reorder edits.
2. Keep a truly unused String helper and its body; export its String parameter
   without adding a value fact or fake invocation. A producerless
   `console.inspect` use still refuses.
3. Prove real supported callers and argument-value alias forwarding, mutable formals and
   registered captures, correct evaluation order/once effects, and actual
   Undefined/omission handling. Unsupported omission/default forms must refuse.
4. Refuse Number/Text contradictions in both directions, Boolean mismatches,
   Image/Font/Sprite/Array/opaque producers, later and disconnected bad writers,
   computed names/callees, foreign writers, duplicate prototypes/formals/records,
   malformed linkage, unproved function escapes, and producerless cycles.
5. After preparation, edits to the target, definition/prototype, ordered formals,
   declaration, call arguments, body, or captured writers revoke old authority.
   Exercise Stop, repeated Start, disposal, and same/fresh project load with
   stale declarations and foreign runtime/target negatives.
6. Reimport an already-erased `any` project without a declaration and retain its
   precise refusal. Then author the actual constraint through Code and Blocks;
   validate all current callers/writers before admitting the corrected project.
7. Use the unchanged authenticated complete Lyla input for fresh import,
   current export and reimport with zero unsupported items and producer warnings.
   Keep unknown-license art private. This is structural evidence, not a whole
   game, graphics, audio, controller, or asset-redistribution qualification.
8. Qualify genuinely new self-authored source and actual edited-export programs
   against the selected SDK compiler/execution with frozen inputs and guards.
   Reuse old original evidence only for byte-identical inputs; preserve failures.
9. Use the actual admitted official GUI artifact to add/edit the declaration in
   visible Blocks, select the procedure/formal/type controls, change a real
   caller or constraint, inspect Code, save a fresh SB3, export, and reimport.
   A type contradiction must be visible. Native-only controls do not close this
   hosted authoring gate.

Keep raw corpus counts and authenticated complete-context results separate.
No promotion follows merely from a new word, retained annotation, or passing
self-authored fixture.
