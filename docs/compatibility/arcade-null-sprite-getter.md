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

## Missing Sprite and Image operands, and what a fault ends

The same sealed machinery now covers five more physical primitives, each with its
own declaration, adapter binding, registration and receipt (`kinds` in
`bw-null-sprite-getter.js`): `setSpriteImage` (missing Sprite receiver) and the
Image operations `blitImage`, `drawImage` (fillRect/drawLine), `drawImageCircle`,
`setImagePixel` and `mutateImage` (missing receiver, and for `blitImage` a missing
source). Only an actual null or Undefined operand issues a receipt; numbers, text,
other references and a missing argument never do (original: they do not throw).
`setImage(undefined)` on a real Sprite is a no-op in the original and stays one.
Each opcode is in the primitive-owner role table so the engine loan reaches it.

An uncaught exception ends exactly one original fiber. Brickwright now matches:

| context | original fiber | after the fault |
| --- | --- | --- |
| controller, update intervals, `onUpdate`, `onPaint`/`onShade`, screen update | the scene's single frame fiber | the scene's frame loop never runs again, even when the scene is restored; the display keeps its last frame until the 200 ms fallback refresh shows the partly drawn screen (paint) |
| button event handler | the event fiber under the queue lock | that (event, button) queue stays locked, later events are never delivered |
| `forever` handler | the handler fiber holding `lock` | that handler never runs again, siblings do |
| overlap handler | a fiber started with `runInParallel` | the pair stays marked overlapping and never fires again |
| other parallel, timer and interval fibers | the fiber itself | only that fiber ends |

`test/arcade-fatal-faults.test.mjs` compares each row against the original
simulator through the differential harness.
