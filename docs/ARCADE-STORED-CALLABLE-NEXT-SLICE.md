# Typed stored callbacks: next bounded slice

Generic class-method syntax now retains the real method name, ordered type parameters, constraints/defaults, parameter types and return type. The importer explicitly refuses runtime lowering of these methods until their invocation and callable descriptor bridge is qualified. This parser capability does not provide editable generic-method or callable-field authoring in Blocks, Code, saved projects or original export yet.

## Target and prerequisites

The retained MIT [StatusBar v0.4.1](https://github.com/jwunderl/pxt-status-bar/blob/v0.4.1/status-bar.ts) uses `applyChange<T>(action: (sb: statusbars.StatusBar) => T): T`. It invokes the action on its same status object, updates that object's display, assigns the resulting image to the same physical Sprite and returns the action result. [Sprite Utils v0.3.1](https://github.com/jwunderl/arcade-sprite-util/blob/v0.3.1/spriteutils.ts) also stores typed callback fields and invokes them on live Sprite references. These are requirements beyond the independently bounded zero-argument numeric factory gate.

The first owned control should use an ordinary managed State object and a Holder with the same generic action signature, plus a typed stored numeric callable field. Two calls on the same Holder must independently infer Number and String results without specializing or widening the shared method. The action must receive the actual State reference; writes must be visible through its alias. This establishes the class/callable bridge before attempting whole StatusBar physical rendering or Sprite callback arguments.

## Implementation boundaries

1. Preserve generic and callable declaration syntax through namespace qualification. Type parameters shadow same-spelled class/namespace names. Existing callable signature substitution is invocation-local; it must not join Number and String results into a single field or global Any type.
2. Add an explicit callable field/signature descriptor to the existing managed class envelope. A runtime field holds the existing current-run callable reference, never a copied function body or unvalidated string identifier. The class descriptor and callable declaration must agree on parameter/result types and actual procedure/target ownership. Undefined fields before initialization remain genuinely undefined.
3. Bind a captured class receiver from the actual managed method/constructor frame. Preserve its object identity and selected-PXT capture mode; do not manufacture a caller from an observer, constructor name, HAT or global flag. Invocation uses existing managed dispatch, shared quantum and generation cancellation. Keep method-reference binding and host callback registration refused until separately qualified.
4. Preserve generic method type parameters and source callable signatures in editable Code/Blocks/SB3 class declarations. Current-body export must validate the actual declaration, procedure, receiver, ordered arguments and writes before rendering typed source. Original export retains the real generic method or an independently qualified representation; it does not erase the whole class to Any.

## Required controls

- Stored callback alias, replacement, distinct factories and escaped callback lifetime.
- Same State alias receives both numeric and String-returning actions; result types remain separate per invocation.
- Callback mutation happens before display/image follow-up and before method return. A paused callback proves serial managed continuation.
- Reads during construction see actual undefined until their authored initializer executes.
- Code edits to a callback body/result, saved same-VM and fresh-VM reload, actual original export execution and reimport preserve values, identity and order.
- Wrong signature/arity, unresolved generic result, constrained/defaulted generics, opaque callback alternative, captured receiver from another target/run, stale Stop/restart/project-load references and forged declaration metadata refuse explicitly.
- The current numeric factory gate remains unchanged. Ordinary Scratch variables and unrelated source profiles retain their existing behavior.

The full StatusBar target additionally requires its retained status class, Sprite image/flag services and update/render order. Sprite Utils additionally requires Sprite parameters, scene-owned frame registration and interval catch-up semantics. Those projects remain unqualified until the complete affected source and authoring routes pass; supporting one callback field is not whole-library admission.
