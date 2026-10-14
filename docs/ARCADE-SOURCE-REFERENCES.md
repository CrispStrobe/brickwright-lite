# Arcade source reference initialization

Status: proposed lane claim. This extends the merged [source scalar](ARCADE-SOURCE-SCALARS.md) and [class reference](ARCADE-CLASS-AND-OBJECT-SEMANTICS.md) contracts. Product changes require the claim to land first. Whole-project and installed editor qualification remain separate.

## Selected source behavior

The selected Microsoft PXT compiler exposes an uninitialized Sprite, Image, array or managed class global as `undefined`. This also applies to function-mediated reads before its declaration executes and to constructors or registered callbacks that run before its initializer. Explicit `null` remains distinct. Assigning a reference copies its identity; mutating through an alias affects the same image, sprite, array or managed instance.

The selected compiler and simulator controls are the authority. [PXT 13.2.1 emitter source](https://github.com/microsoft/pxt/blob/v13.2.1/pxtcompiler/emitter/emitter.ts) provides primary compiler context. Do not infer other compiler profiles from this contract.

## Portable declaration

The proposed command is `arcade_declareSourceReference`, with Code form:

```text
declare arcade source reference {VARIABLE} as {TYPE:reference-type}
```

The type is a validated quoted **direct field**, for example `as "Sprite"`, `as "Image"`, `as "number[]"` or `as "Box"`. Qualified class names such as `"Namespace.Box"` require exact resolution to an actual supported declaration. The canonical grammar must explicitly support quoted type fields, brackets and qualified names. Neither the existing name input slot nor a reporter or menu shadow can stand in for the field. Code, Blocks, variable rename and fresh SB3 must retain its representation.

`VARIABLE` binds an actual stock `data_variable` reporter and variable ID. Reject literal names, computed values, list and broadcast reporters, missing or foreign IDs and stale project bindings.

Known built-in types, element-specific array types and actual managed class declarations provide type authority. Dynamic menu choices may expose project-owned classes by inspecting their declarations; a string that resembles a class name is insufficient. Preserve exact class resolution even when a typed class variable is never instantiated. An array declaration retains its proven element type. Unknown types, unsupported array elements, callable values and other unqualified reference domains receive named diagnostics. Never replace them with `Any` or a generic object.

This command annotates and initializes a source cell. It does not allocate a sprite, image, array, class descriptor or object, issue a reference token or grant heap authority. Existing constructors, reference codecs and descriptor/lifecycle validation retain their responsibilities.

## Atomic source prelude

Reference and scalar declarations may be interleaved in the initial declaration prefix of an actual `arcade_whenSourceStarts` hat. Validate every prefix, type, variable owner and duplicate/conflicting binding across both families before changing any cell. Then write typed `undefined` before SDK/module initialization or any source initializer/callback runs. A failure leaves all existing variable values intact.

The body declaration subsequently validates its registered binding without resetting an initialized value. Reject late, nested, ordinary-hat and orphan declarations. Preserve dependency, namespace and main initialization order. Source reference declarations without initializers retain `undefined`; explicit null and real initializers retain their values. Scene changes do not reinitialize global cells. Stop, restart, project replacement and disposal invalidate declaration authority appropriately. Ordinary Scratch variables retain their saved defaults.

## Separate type flow and export

Reference declaration inventory and flow remain separate from scalar inference. Preserve class descriptors, array element types, aliases, argument/return flow and reference lifetimes using their existing graph. Do not merge reference cells into Boolean/Number flow, guess types from variable spelling, seed unknown values as `Any`, or infer allocation authority from the declaration metadata.

Export retains the exact supported source type and nullable state. A typed class declaration remains typed when no constructor is called. Exported Sprite/Image/class references cannot acquire scalar or array-index privileges. Original compilation and execution, Code decompilation, same/fresh SB3 reload and reimport must preserve both typing and observed values.

## Required controls and ownership

Required controls include function-mediated forward reads, typed declarations without initializers, undefined versus explicit null, aliases before and after initialization, mutations through shared references, constructor/created callbacks, and known reference arguments/returns. They also include invalid/computed type fields, unowned class declarations, wrong binding kinds, duplicates across scalar/reference declarations, atomic refusal and Stop/restart/load/disposal.

Qualify through actual selected original execution and actual installed native VM, followed by Code, Blocks representation, fresh SB3, original export execution and reimport. Keep failures and unsupported domains. Dynamic callee staging remains the separate captured-callable lane; this claim does not admit it. No corpus promotion follows from these focused controls.

The lane owns new source-reference type/inventory/prelude helpers and focused tests; narrow source initialization, declaration, converter/export and declaration field/menu hunks; the paired canonical producer grammar/word/tests and reviewed pin adoption; this contract and the lane ledger. Coordinate class graph/accessor/callable owners and the event-bus startup owner. Do not change their heap, callback, scheduler or allocation semantics.

## Focused implementation boundary

The declaration service validates interleaved scalar/reference prefixes before writing typed undefined to actual variable IDs. The importer keeps reference provenance separate from scalar inference, including literal images, explicit reference annotations and lexical class names. Mixed Boolean/reference values and unresolved or callable domains do not acquire scalar or reference declaration authority.

The executable fixtures in `test/makecode-arcade-source-reference-roundtrip.test.mjs` cover ten bounded Sprite, Image, typed array and managed class programs, including early aliases, function returns, constructor/creation callbacks and never instantiated classes. They exercise native execution, editable Code, saved and fresh SB3, selected original export execution and reimport. Separate tests cover atomic refusal, rename and restart/project replacement. These controls do not qualify arbitrary inferred array argument/element flows, captured callables, dynamic callee staging, complete corpus games or installed GUI journeys.
