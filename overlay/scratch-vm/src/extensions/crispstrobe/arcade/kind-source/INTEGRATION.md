# Original numeric sprite kind identity

The complete MIT `spritekind.ts` comes from the retained Arcade 4.2.1 target,
whose recorded source revision is
[`2d7d59b5226e8a1a1e05e8042dd9f5248ed68fea`](https://github.com/microsoft/pxt-arcade/blob/2d7d59b5226e8a1a1e05e8042dd9f5248ed68fea/libs/game/spritekind.ts).
Source and license hashes are pinned in the generator and provenance record.
`kind-source-pxt.js` executes this complete source in a fresh closure. The
registry delegates allocation to its original `SpriteKind.create` function.

## Observed original behavior

Finite controls compiled and executed with the pinned original worker/runtime
established these values:

| Operation | Numeric identity |
| --- | --- |
| Original Player, Projectile, Food, Enemy | 1000, 1, 1001, 1002 |
| First dynamic create, even without builtin kind references | 1003 |
| Unused declared kind followed by used kind | 1003, 1004 |
| Unused Text v1.3.0 dependency initializer, then main dynamic create | 1003, 1004 |
| Text dependency, main custom declaration, next dynamic create | 1003, 1004, 1005 |
| Create before, during, and after scene push/pop | 1003, 1004, 1005 |

The identical Text/custom original binary started in two fresh original runtime
instances gave identical allocations. A registry belongs to one program and
survives scene changes. Reset it for a new program, together with the program's
sprite references, library instances, handlers, and source bindings.

Within main source, calls and namespace initializers execute in source order:
a call before a later kind declaration takes 1003 and the declaration takes
1004. Interleaved calls/declarations remain interleaved. File configuration order
alone is insufficient: the original compiler placed a Text root file before
main even when `pxt.json.files` listed main first. Dependency/root initialization
must follow the original compiler's actual ordered input and initializer
semantics. This registry does not select or infer that order.

## Integration contract

- Allocate at execution with `create()`. Namespace declarations bind the
  returned value with `bindName`; aliases bind the same number. Binding metadata
  never allocates. Do not use translation-time counters or guess IDs by names.
- Execute genuine library kind initializers even when their public APIs are
  unused. A library's lazy animation/image state does not make its independent
  kind declaration lazy. Admission must account for the complete original source.
- Normalize builtin/custom authoring names and serialized numeric fields at
  sprite and handler boundaries. Store captured numeric values in memberships
  and registered handlers. Later label rebinding must not retarget a handler.
- `Sprite.kind()` returns the stored number. Keep labels separately for the GUI.
  Original controls retained kind 1.5 and -2 exactly. `allOfKind(1.5)` included
  the sprite; `allOfKind(-2)` was empty because original `setKind` only inserts
  kinds at least zero into the scene's membership sets. Do not round kinds.
  This exclusion does not apply to event handlers: original `onCreated(-2)`
  fired, and `onOverlap(-2, Projectile)` fired on each observed overlapping
  frame while `allOfKind(-2)` remained empty.
- Unknown authoring names, empty fields, and missing name bindings must produce a diagnostic;
  normalization never invents a kind or advances allocation. Genuine typed
  null/undefined inputs pass through unchanged: original `sprites.create(img)`
  and `sprites.create(img, null)` defaulted to -1, while `sprite.setKind(null)`
  left its kind unchanged. Reading a later declared namespace kind before its
  initializer executed was valid original source and created a -1 sprite.
  Preserve source variable absence; do not replace it with an unresolved GUI
  label or numeric zero. These API defaults belong to their callers.
- Original builtin kinds are constants; assigning Player was refused by the
  original compiler. Custom metadata rebinding remains explicit and preserves
  already captured numeric identities.

## Native boundary and authoring words

The native runtime owns one registry per program. Sprite records and managed
kind registrations store numbers; `spriteProperty(kind)` returns that number.
`kindName` is display metadata. Opaque `arcade:n` graphic identifiers and scene
sprite IDs remain independent from kind allocation.

| Opcode | Canonical phrase | Inputs / result |
| --- | --- | --- |
| `createSpriteKind` | `arcade create sprite kind` | Number reporter |
| `spriteKindValue` | `arcade sprite kind value {NAME}` | String NAME; Number reporter |
| `bindSpriteKind` | `arcade bind sprite kind name {NAME} to {KIND}` | String NAME; Number KIND; command |
| `initializeSpriteKindLibrary` | `arcade initialize sprite kind library {LIBRARY} version {VERSION}` | String LIBRARY and VERSION; command |

Named lookup and binding do not allocate. Unknown names are explicit errors.
Existing KIND field labels normalize to builtin numbers or explicit metadata
bindings; typed numeric reporter connections preserve their actual values.
Custom source variables must hold the actual create result, including undefined
before initialization. A display lookup must not replace such a forward read.

The only admitted library initializer here is `textsprite`, with version
`v1.3.0` or its exact revision `fa2439314c6633943666a763fdae32a5c67a9ae8`.
It initializes the complete original Text module once, creating and binding
Text at that execution phase. A retained Text source file must emit this
command at its original file phase and then assign its real namespace binding
from the Text lookup. Repeated calls do not allocate twice. Scene push/pop
preserve both module and registry; project start recreates them.

Hand-authored projects containing Text operations automatically initialize
Text before main, because their exported original project includes that
dependency. An explicit library initializer anywhere in the project suppresses
automatic initialization, allowing preceding retained library initializers
to consume IDs in their original order. Other libraries' genuine initializer
ordering remains the source preparation/lowering pipeline's responsibility.

Original controls additionally established NaN, Infinity and -Infinity sprite
kinds. NaN and negative Infinity queries are empty; positive Infinity queries
contain the sprite. Native values and queries agree without consuming IDs.
Projectile creation uses the original `kind || SpriteKind.Projectile` fallback
once after decoding; ordinary creation maps typed null/undefined to -1, and
setKind with those inputs is a no-op. Managed null kind event registration is
ignored, matching the original APIs.

Focused controls exercise original compiler/runtime, actual native adapter,
scenes, and runtime project-start reset. The unchanged negative-kind source
control confirms creation callbacks, image changes and negative query behavior,
and retains an exact timing failure as an explicit TODO control: its first four original update
observations contain overlap counts 0,0,1,2, while native observations contain
0,1,2,3. The same count/scene-clock sequence is reproduced on the frozen
predecessor runtime before kind integration. Original scene observations are
0/20/40/60ms; native observations are 40/60/80/100ms using actual 20ms
helper steps. This predecessor uses a wall timer for its program clock.
Negative overlap events run in both; their initial frame phases are
not qualified as equivalent. Managed registration capture is tested separately
from legacy hats whose dynamically rebound display fields remain unqualified.

The exact failing timing control remains runnable with
`BW_REQUIRE_EXACT_KIND_TIMING=1 node --test --test-name-pattern="unchanged negative-kind" test/makecode-arcade-kind-native.test.mjs`.
Without that option, it is a reported TODO failure and is not counted as PASS.

Source initializer lowering, four-word Code/Blocks roundtrips, export, fresh
SB3, installed GUI, allocation exhaustion, and whole applications remain
separate acceptance gates. These finite controls do not change the corpus
classifications or qualify whole-game behavior.
