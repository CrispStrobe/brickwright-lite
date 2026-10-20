# Null Sprite getters: physical primitive fault handoff

This implementation candidate follows the merged
[null Sprite getter contract](../ARCADE-NULL-SPRITE-GETTER.md).
Its controls require execution and review before qualification. The retained
selected original establishes the x failure boundary only; it does not establish
y, width, height, visible presentation or whole-game compatibility.

## Value and ownership boundary

Only the actual JavaScript null value in the already-evaluated ID argument can
issue this fault, for x, y, width or height. There is no string coercion, tagged
value decoding, fallback for absent input or second receiver expression
evaluation. The direct native service keeps its existing missing-ID behavior.
All non-null receiver handling remains in the existing getter implementation.

The primitive execution role grants no Number-input conversion. A fault must
have the active runtime/thread/argument-object loan, the reachable current
cached getter, unchanged block input/field/mutation identities and the genuine
registered function. A separate private declaration issuance binds the original
extension instance, prototype getter, adapter delegate and prepared registration.
Replacing the runtime registration and cached function together cannot renew
that ownership. Metadata refresh requires a fresh source-issued declaration;
replaying an old row cannot register a new owner.

## Exceptional completion

The getter privately issues one TypeError and receipt. Only its exact current
arguments, utility, runtime, thread, property, lifecycle generation and actual
primitive invocation loan can consume that receipt. A later invocation reusing
the same cached argument object cannot consume an earlier receipt.
Public properties, a copied receipt or an arbitrary Error
cannot enter the shared exception path.

The existing exception owner records the primitive fault and uses its existing
lineage retirement and invocation cleanup. Earlier effects remain committed;
linked managed callers settle exceptionally and unrelated detached fibers keep
running. No stopAll or default getter result represents the fault. Stop, Load
and disposal invalidate pending receipts. An actual subsequent activation must
obtain a new receipt under its current registration and engine loan.

## Controls and remaining gates

`test/arcade-null-sprite-getter-owner.test.mjs` contains synthetic ownership,
registration, lifecycle and shared-lineage controls. They are boundary controls,
not evidence of executing a game in the native VM.

`test/arcade-null-sprite-getter-native.test.mjs` contains proposed native
source/getter/effect-order controls, ordinary nested calls, independent callbacks,
direct-service compatibility and source/Code/same/fresh SB3/current export
routes. These controls need an explicit candidate provider with identical owned
overlay modules. Test helper resolution checks shared singleton bytes.

Retain the authentic selected source and all diagnostic channels in a separate
bounded native observation. Keep the pre-fault actor and downstream-operation
counts, saved/current graph and actual error attribution. Editing each physical
getter and reopening in the GUI remain separate gates. No original replay,
SDK execution, full compatibility or corpus-count reduction follows from adding
this implementation or its authored controls.
