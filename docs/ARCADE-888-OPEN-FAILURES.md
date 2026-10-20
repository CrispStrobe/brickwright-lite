# PR #888: open Arcade test failures

Status of the Arcade foundation branch (PR #888) when it was landed on main's
documented-TODO mechanism. Each failing unit test below carries
`{todo: '<reason> — see docs/ARCADE-888-OPEN-FAILURES.md'}`; no assertion was
changed. Source of the list: hosted Build run 39297263647 (head f2ecafef1).

## Root-cause groups

### A. Array export authority (`array-reference-export-authority.js`) cannot yet prove the Array receiver (16)

- Tried: Added SDK list producers, callee push credit, later/earlier shrink accounting, reset/overwrite retirement, falsy guards, object fields, Sprite.data, generic passthrough, for-of bounds, settings reads, named-slot reads, dead `false &&` branches, concat length.
- Next: Per-slot types through `concat`/`slice` and push-built literals (an attempt did not converge); setter-before-read on the same object; null-first global SpriteKind namespace values without breaking the KIND reset refusal tests.

### B. Procedure parameter constraint: a producer is not yet proven Number/String/Boolean (11)

- Tried: Added Binary `&&`/`||`/`??`, CameraProperty, `**`, randint/Math/Infinity/NaN, closure entries, structural binary helpers, static callbacks, dead local resets, primitive comparisons, directed exporter producers.
- Next: Identify each producer kind (exported helper results, SDK reporters, inspect/runtime domains) and add a sound producer rule for it; keep the default-on refusal tests red.

### C. Named-array helper re-import is not recognized (3)

- Tried: Export side fixed (34d5b2d0f).
- Next: Statement-order reasoning in `generated-helper-recognition.js` for `let X: any = 0` followed by a definite assignment before use; the `__bwNamedJsonValue` optional default (ordinary-call-omission).

### D. Runtime mock lacks `.on` (`Cannot read properties of undefined (reading 'on')`) (3)

- Tried: Not yet diagnosed.
- Next: Find which helper builds a runtime without an EventEmitter `on` for these extension probes.

### E. Animation resource ID/name validation rejects the edited resource (2)

- Tried: Not yet diagnosed.
- Next: Compare the resource id/name the editor round-trip produces with the validator added on the branch.

### F. Extension probe lacks an expected opcode (3)

- Tried: Not yet diagnosed.
- Next: Check the probed opcode list against the current Arcade extension getInfo.

### G. Arcade exception runtime already has an owner (1)

- Tried: Not yet diagnosed.
- Next: Two extension instances in one runtime; scope the exception owner per instance or test fixture.

### H. `Math.idiv` source/PXT path (2)

- Tried: Not yet diagnosed.
- Next: Compare the idiv lowering and the census program with main.

### I. Other export/roundtrip regression (4)

- Tried: Not yet diagnosed.
- Next: Diff the exported program against main for the named test.

## Failing unit tests

| Group | File | Test | Error |
|---|---|---|---|
| A | `test/makecode-arcade-animation-resources-export.test.mjs` | fresh resource export preserves native factory allocation and isolates array/image mutations in original PXT | +   'Array reference arrays_referenceItem ARRAY: requires an actual initialized Array producer and compatible all writers', +   'Array reference arrays_referenc |
| A | `test/makecode-arcade-animation-resources-export.test.mjs` | literal and computed resource IDs export shared typed images and original Arcade playback | +   'Array reference arrays_referenceItem ARRAY: requires an actual initialized Array producer and compatible all writers |
| A | `test/makecode-arcade-array-copies.test.mjs` | pxt-array-copy-effects-primary preserves original values and editable reference identity | +   'Array reference arrays_mutateReference ARRAY: requires an actual initialized Array producer and compatible all writers', +   'Array reference arrays_refere |
| A | `test/makecode-arcade-array-copies.test.mjs` | pxt-array-copy-primary preserves original values and editable reference identity | +   'Array reference arrays_mutateReference ARRAY: requires an actual initialized Array producer and compatible all writers |
| A | `test/makecode-arcade-array-reference-flow.test.mjs` | typed array reference authoring and original export: image-element | +   'Array reference arrays_referenceItem ARRAY: requires an actual initialized Array producer and compatible all writers |
| A | `test/makecode-arcade-array-reference-flow.test.mjs` | typed array reference authoring and original export: nullable | +   'Array reference arrays_referenceItem ARRAY: requires an actual initialized Array producer and compatible all writers |
| A | `test/makecode-arcade-array-reference-flow.test.mjs` | typed array reference authoring and original export: numeric-literal | +   'Array reference arrays_mutateReference ARRAY: requires an actual initialized Array producer and compatible all writers |
| A | `test/makecode-arcade-class-accessors.test.mjs` | ordinary accessor resource-aliases retains managed effects and all authoring routes | +   'Array reference arrays_referenceItem ARRAY: requires an actual initialized Array producer and compatible all writers |
| A | `test/makecode-arcade-declared-references.test.mjs` | uncalled typed resource helpers preserve executable array operations through original PXT and roundtrips | +   'Array reference arrays_referenceItem ARRAY: requires an actual initialized Array producer and compatible all writers |
| A | `test/makecode-arcade-math.test.mjs` | Arcade math calls preserve every operand and run | +   'Array.map: receiver requires actual initialized Array allocations and compatible all writers', 'Math.map() — written out as its formula; it goes back to Ma |
| A | `test/makecode-arcade-multiplayer-players.test.mjs` | scene-local player identities, properties, sprite references and arrays agree with original PXT across roundtrips | +   'Array reference arrays_referenceLength ARRAY: requires an actual initialized Array producer and compatible all writers', +   'Array reference arrays_refere |
| A | `test/makecode-arcade-source-typeof-export.test.mjs` | mixed local Array receivers keep array dispatch without changing an independently typed local | +   'Array reference arrays_mutateReference ARRAY: requires an actual initialized Array producer and compatible all writers |
| A | `test/makecode-arcade-sprite-collections.test.mjs` | allOfKind snapshots preserve sprite identity, kind changes and destroyed references through executable roundtrips | +   'Array reference arrays_referenceLength ARRAY: requires an actual initialized Array producer and compatible all writers', +   'Array reference arrays_refere |
| A | `test/makecode-arcade-text-sprite-converter.test.mjs` | TextSprite source preserves original pixels, aliases, deferred property redraw and membership through editable roundtrips | +   'Array reference arrays_referenceLength ARRAY: requires an actual initialized Array producer and compatible all writers |
| A | `test/makecode-arcade-update-values.test.mjs` | prefix update in a condition performs required array initialization | +   'Array reference arrays_referenceIndexOf ARRAY: requires an actual initialized Array producer and compatible all writers', +   'Array reference arrays_refer |
| A | `test/makecode-arcade-value-arithmetic.test.mjs` | numeric sums retain their type through index variables and procedure returns | +   'Array reference arrays_referenceItem ARRAY: requires an actual initialized Array producer and compatible all writers |
| B | `test/makecode-arcade-accessor-pxt-staging.test.mjs` | selected PXT accessor receivers, setters and compound reads keep actual side-effect order across authoring routes | +   'Procedure parameter constraint: pair.a requires Number from actual producers |
| B | `test/makecode-arcade-background.test.mjs` | background color changes in procedures and controller handlers survive all conversion layers | Kept TODO: the producer `scene.backgroundColor()` has no Number rule. It needs a closed-surface source rule (like `ordinaryPrimitiveSdkNumberCalls` for `info.score`) and a matching native producer owner (like the scene clock Number); the source side alone would not discharge the VM constraint. |
| B | `test/makecode-arcade-managed-number-boundaries.test.mjs` | ordinary-argument physical text across current graph, Code, SB3 and export/reimport | {"fixture":"ordinary-argument","physical":"text","observations":[{"route":"native-current-leaf","calls":0,"errors":["Error: Procedure parameter constraint: valu |
| B | `test/makecode-arcade-numeric-constant-values.test.mjs` | numeric source constants keep their type in arrays while numeric strings stay strings | +   'Procedure parameter constraint: observe.value requires Number from actual producers |
| B | `test/makecode-arcade-pxt-staging.test.mjs` | selected PXT staging survives actual native, Code, fresh SB3, export and reimport | +   'Procedure parameter constraint: pair.a requires Number from actual producers', +   'Procedure parameter constraint: pair.b requires Number from actual prod |
| B | `test/makecode-arcade-randint-authoring.test.mjs` | selected randint numeric provenance authoring and original export: typed | +   'Error: Arcade inspection: connected input lacks complete primitive domain evidence |
| B | `test/makecode-arcade-update-values.test.mjs` | consumed prefix/postfix updates preserve values, lazy choice and evaluated-once targets | +   'Procedure parameter constraint: actual current caller or writer requires Number', +   'Procedure parameter constraint: Game_pair.a requires Number from act |
| B | `test/makecode-arcade-value-arithmetic.test.mjs` | selected Arcade defaults distinguish omission from supplied Undefined and preserve operand order | +   'Procedure parameter constraint: Game_count.times requires Number from actual producers |
| B | `test/makecode-array-map-values.test.mjs` | twelve selected primitive Map cases preserve current indexed reads and identity through portable routes | +   'Procedure parameter constraint: mmEffect.value requires Number from actual producers', +   'Procedure parameter constraint: mmCombine.right requires Number |
| B | `test/makecode-export-arcade.test.mjs` | exported stock stop-other and stop-all retain actual native lifecycle behavior | +   'Procedure parameter constraint: _dead.t requires Number from actual producers |
| B | `test/makecode-string-conversion-roundtrip.test.mjs` | original UTF-16 and nullable primitive strings survive source, Code, original export, reimport and fresh SB3 | +   'Procedure parameter constraint: __bwSdkConcat.left requires String from actual producers |
| C | `test/makecode-arcade-named-arrays.test.mjs` | named arrays retain scalar items, aggregate JSON, value parsing, nested aliases and replacement across all conversion paths | +   'Named Array helper requires closed current callee and builtin effects', +   'Ordinary call omission: __bwNamedJsonValue signature defaults require a separa |
| C | `test/makecode-arcade-named-arrays.test.mjs` | named operations evaluate their arguments once and distinguish includes from indexOf for NaN | +   'Ordinary call omission: __bwNamedJsonValue signature defaults require a separately qualified default protocol', +   'isNaN() as a value', +   'JSON.parse() |
| C | `test/makecode-arcade-source-typeof-roundtrip.test.mjs` | E15 text versus JSON aggregate helper retains typeof through Code, saved projects and strict original export | +   'Ordinary call omission: __bwNamedJsonValue signature defaults require a separately qualified default protocol', +   'isNaN() as a value', +   'String.charC |
| D | `test/arcade-callable-metadata-construction.test.mjs` | Arcade metadata-only construction exposes its actual blocks without granting callable resources | Fixed in 681b3a281: Sprite update activation registered runtime listeners without a runtime. |
| D | `test/makecode-arcade-keyboard-edges.test.mjs` | all manually dispatched registered hats explicitly bypass Scratch edge caches | Fixed in 681b3a281: Sprite update activation registered runtime listeners without a runtime. |
| D | `test/makecode-arcade-pixel-drawing.test.mjs` | sprite pixel reporters and drawing commands execute through Code, SB3, PXT export and reimport | Fixed in 681b3a281: Sprite update activation registered runtime listeners without a runtime. |
| E | `test/arcade-animation-resource-carrier.test.mjs` | edited resource pixels persist through current Code, same and fresh SB3 and current export | Fixed in 681b3a281: the frame Array producer rejected costume records with no timeline; a malformed animation is still reported. |
| E | `test/arcade-native-animation-staging.test.mjs` | edited native resource pixels replace original payload without stale appended frames through fresh SB3 and export | Fixed in 681b3a281: the frame Array producer rejected costume records with no timeline; a malformed animation is still reported. |
| F | `test/makecode-arcade-generated-images.test.mjs` | generated-image projectiles share live artwork and preserve all four creation modes | Fixed in 681b3a281: the probe constructs without a runtime, which crashed before the fix (same cause as D). |
| F | `test/makecode-arcade-generated-images.test.mjs` | image.create follows pinned PXT bounds and integer conversion; clones copy pixels independently | Fixed in 681b3a281: the probe constructs without a runtime, which crashed before the fix (same cause as D). |
| F | `test/makecode-arcade-image-mutation.test.mjs` | VM mutations isolate clones, update transparent collisions, and release renderer skins | Kept TODO: `probeExtension(Arcade, rt)` builds a second Arcade on the test's runtime, so this is group G (see its counter-example). |
| G | `test/makecode-arcade-buffer-lifetime.test.mjs` | independent Buffer owners in one runtime cannot resolve each other's issued IDs | Kept TODO, unsound to accept as is: `capture`, `arrayCoordinatorReady`, `rejectArrayOperation` and `rejectConditionWait` in `bw-arcade-exceptions.js` resolve ONE owner per runtime. With a second live owner, instance B's array or condition rejection on a thread would be issued through A's signal registry and checked against A's generation. Needs signal and lease routing per owner, not per runtime. |
| H | `test/makecode-arcade-idiv-source.test.mjs` | idiv actual mutable Number aliases ordinary helpers and captured entry dominance qualify | Kept TODO: not idiv-specific. `function outer(a){function read(){return a};return read()};let q=outer(7)` is refused (`read() as a value`), because a nested function called as a value is unsupported. Needs nested-function closure lifting in `translate-base.js`. |
| H | `test/makecode-pxt-runtime.test.mjs` | census batch 1: a program using every call comes back from lite and MakeCode compiles it | Kept TODO: the micro:bit import writes `Math.idiv(a,b)` as `((a / b) bitor 0)`, which is not Math.idiv for fractional operands: `Math.idiv(3.5, 0.5)` is idiv(3, 0) = 0, but `(3.5 / 0.5) | 0` is 7. Exporting that shape as Math.idiv is unsound (5f74cb924). The sound fix is to import `((a bitor 0) / (b bitor 0)) bitor 0` and name only that exact shape on export. That contradicts current pinned assertions (`makecode-export-integer-division` 'explicit operand coercions stay connected', `makecode-translate` census batch 1 import line and 'Math.idiv truncates toward zero'), so it needs the owner's decision. |
| I | `test/makecode-arcade-loop-control.test.mjs` | condition and update side effects agrees with original PXT and complete roundtrips | Fixed in 63894a733: the inspection domain proof now computes a least fixpoint over flow cycles (`i=advance(i)`). |
| I | `test/makecode-arcade-loop-control.test.mjs` | for continue and update agrees with original PXT and complete roundtrips | Fixed in 63894a733: the inspection domain proof now computes a least fixpoint over flow cycles (`i=advance(i)`). |
| I | `test/makecode-discarded-map-edited-export.test.mjs` | typed discarded map survives actual Creator export and a current numeric input edit without annotation-derived ingress | Kept TODO: the export now names the procedure `Game_effect` (sprite-prefixed), but the test requires an exported `effect`. This needs the owner to decide which naming is intended; it is not a proof gap. |
| I | `test/makecode-export-arcade.test.mjs` | stop blocks and not survive export and re-import, without the run-token machinery | Kept TODO: `liftExporterStops` (arcade-translate.js) fails three gates on the exporter's own output. (1) The stop-others recipe refuses any `sprites`/`SpriteKind` identifier, which includes the exporter's `GameSprite = sprites.create(..., SpriteKind.Player)`. (2) `guard()` keys the `_t <= _som && _t != _sok` guard on the stopping script's token, but each other Game script guards with its own token. (3) The shared `proof.ambient()` in generated-helper-recognition.js refuses `GameSprite.setPosition` and `SpriteKind.Player`. (1) and (2) have narrow fixes; (3) widens a check shared by every generated-helper recognizer and needs its own proof. The unlifted `_dead` then trips the procedure constraint. |

### Integration-only (PR #1085)

| Group | File | Test | Error |
|---|---|---|---|
| I | `test/makecode-arcade-legacy-tile-collisions.test.mjs` | legacy collision filters/order, captures, yielding, snapshot indices and scenes match PXT through all roundtrips | Fixed in 63894a733 (TODO removed; passes on current main with these fixes). |

## Browser gates

### browser (heavy): Arcade carnival, KNOWN-OPEN

- Gate: `scripts/verify-arcade-carnival-browser.mjs`, judged by `scripts/known-open-gate.mjs`
  against `scripts/lib/browser-known-open.json` (entry `arcade-carnival`).
- Open failure: `AssertionError: import exposes the carnival pseudocode command`. The carnival
  import still reports unsupported constructs, so its pseudocode lacks the countdown command.
- The gate still runs and prints its result. Only that exact assertion is reported as known-open;
  any other carnival failure still fails the job. If the gate passes, the job fails until the
  entry is removed, so a stale entry cannot linger.
- Next step: clears with groups A/B. Then remove the entry here and in the JSON.

### browser (robotlab): Sim Lab, INTERMITTENT (owner: Robot Lab lane)

Not marked known-open. When it fails, rerun only the failed job. Failures seen:

| Run context | Gate | Failure |
|---|---|---|
| #888 | `scripts/lib/sim-lab-touch-gate.mjs` | `Select all selects every part` (1 !== 16) |
| #1097 | `scripts/lib/sim-lab-touch-gate.mjs` | `Select all selects every part` (1 !== 16) |
| #1085 | `scripts/lib/sim-lab-cad-gate.mjs` `focusOn` | expected `['p16']`, got `[]` |
| #1097 | scale gate | 120 s screenshot timeout |

## Already-TODO items owned by other work

These were already `# TODO` before this landing and are not part of this list:

- Robot Lab lane (`docs/ROBOT-LAB-VALIDATION.md`): rolling resistance; gearbox efficiency under load; motor torque through an 8:24 mesh; dig-cycle base yaw; tilting-table tower; two-cart restitution; universal joint not buildable.
- Existing Arcade TODOs (their reasons now point here, per the docs-pointer rule): first HUD callback phase; restored callback phase; do-while `continue` posttest boundary; negative-kind initial overlap frame timing.
