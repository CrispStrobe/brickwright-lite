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
- Unknown names, empty fields, and missing bindings must produce a diagnostic;
  normalization never invents a kind or advances allocation.
- Original builtin kinds are constants; assigning Player was refused by the
  original compiler. Custom metadata rebinding remains explicit and preserves
  already captured numeric identities.

The standalone module and finite original controls do not qualify integration
with native sprite creation, memberships, event registration, Code, export,
SB3, or the GUI. Those are subsequent acceptance gates. Numeric NaN strict
comparison follows JavaScript equality in the helper; NaN/Infinity gameplay,
allocation exhaustion, and program restart through product controls were not
executed in these controls.
