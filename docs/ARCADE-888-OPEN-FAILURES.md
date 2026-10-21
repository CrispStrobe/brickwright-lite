# PR #888: open Arcade test failures

Status of the Arcade foundation branch (PR #888) when it was landed on main's
documented-TODO mechanism. Each failing unit test below carries
`{todo: '<reason> — see docs/ARCADE-888-OPEN-FAILURES.md'}`; no assertion was
changed. Source of the list: hosted Build run 39297263647 (head f2ecafef1).

## Root-cause groups

### A. Array export authority (`array-reference-export-authority.js`) cannot yet prove the Array receiver (16)

- Tried: Added SDK list producers, callee push credit, later/earlier shrink accounting, reset/overwrite retirement, falsy guards, object fields, Sprite.data, generic passthrough, for-of bounds, settings reads, named-slot reads, dead `false &&` branches, concat length.
- Next: Per-slot types through `concat`/`slice` and push-built literals (an attempt did not converge); setter-before-read on the same object; null-first global SpriteKind namespace values without breaking the KIND reset refusal tests.
- Second pass (2026-10-20): 1 fixed (inert literal overwritten by an Array), 3 kept with counter-examples. Diagnosed but still open: `animation-resources-export` (a global written from `arcade_animationAssetFrames` in a flag script has no resolved animation producer; another is a start-script null reset overwritten by a call result); `array-copies` (a global written from `arrays_referenceItem` of a nested Array, whose element may be absent); `array-reference-flow` (an Array argument is not available at the callee's read); `class-accessors` (`arcade_objectField` producer not proven initialized); `declared-references`, `multiplayer-players`, `text-sprite-converter` (receiver types include an unproved writer); `math` fails a different gate (`Array.map: receiver requires actual initialized Array allocations`).

### B. Procedure parameter constraint: a producer is not yet proven Number/String/Boolean (11)

- Tried: Added Binary `&&`/`||`/`??`, CameraProperty, `**`, randint/Math/Infinity/NaN, closure entries, structural binary helpers, static callbacks, dead local resets, primitive comparisons, directed exporter producers.
- Next: Identify each producer kind (exported helper results, SDK reporters, inspect/runtime domains) and add a sound producer rule for it; keep the default-on refusal tests red.
- Second pass (2026-10-20): 1 fixed (stock call arguments reach formals; nullable formals export as `any`), 7 kept with counter-examples or a named missing half. Not re-examined: `managed-number-boundaries`, `randint-authoring`, `update-values` (consumed prefix/postfix).

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

### H. `Math.idiv` source/PXT path (1)

- Tried: The micro:bit census batch 1 program now passes: Math.idiv imports as
  `((a | 0) / (b | 0)) | 0` and that exact shape exports back as Math.idiv
  (owner decision 2026-10-20: Math.idiv imports with real semantics); its
  `{todo}` is removed.
- Next: The remaining Arcade source row (helper/captured operands).

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
| A | `test/makecode-arcade-source-typeof-export.test.mjs` | mixed local Array receivers keep array dispatch without changing an independently typed local | Fixed in d865fc9d1: a local first written with an inert primitive literal and immediately overwritten by an Array is discounted like a reset (globals, cell-reading and calling writers unchanged). |
| A | `test/makecode-arcade-sprite-collections.test.mjs` | allOfKind snapshots preserve sprite identity, kind changes and destroyed references through executable roundtrips | Kept TODO: fails at the second export. The reimported `__bwStartup` declares its locals `null` and assigns them only after `sprites.create(...)` calls, and the start script resets `actors = null` before calling `__bwStartup`. Discounting those resets was tried; it makes 17 refusal tests of `makecode-array-local-reset-proof` fail (e.g. 'managed call, yield and lifecycle commands retain the reset': their wrong inputs get accepted), so it was dropped. Needs the exporter to stop emitting the null prologue, not a wider reset rule. |
| A | `test/makecode-arcade-text-sprite-converter.test.mjs` | TextSprite source preserves original pixels, aliases, deferred property redraw and membership through editable roundtrips | +   'Array reference arrays_referenceLength ARRAY: requires an actual initialized Array producer and compatible all writers |
| A | `test/makecode-arcade-update-values.test.mjs` | prefix update in a condition performs required array initialization | Kept TODO, unsound to accept as is: the only writer of `entries` is conditional (`if(++attempts>=5)`). With `let attempts=0` PXT faults at `entries.indexOf(23)` while the VM logs `Array reference is null or expired` and continues (found -1, length 0). Accepting needs a proof that the condition holds (constant evaluation through the `prepare()` call). |
| A | `test/makecode-arcade-value-arithmetic.test.mjs` | numeric sums retain their type through index variables and procedure returns | Kept TODO, unsound to accept as is: `rows[shift(0)-1]` is a computed index, so the row may be absent. With `return index+5` PXT faults on `undefined[column]` while the VM continues. Accepting needs interprocedural constant evaluation of the index. |
| B | `test/makecode-arcade-accessor-pxt-staging.test.mjs` | selected PXT accessor receivers, setters and compound reads keep actual side-effect order across authoring routes | Kept TODO, unsound to accept as is: `pair(receiver().value, ...)` reads a getter returning the constructor formal `n` (`constructor(public n:number)`). Class formals have no call-site obligation, so `new Box(<any>"x")` would make `pair.a` a String. Same gap as the pxt-staging row. |
| B | `test/makecode-arcade-background.test.mjs` | background color changes in procedures and controller handlers survive all conversion layers | Kept TODO: the producer `scene.backgroundColor()` has no Number rule. It needs a closed-surface source rule (like `ordinaryPrimitiveSdkNumberCalls` for `info.score`) and a matching native producer owner (like the scene clock Number); the source side alone would not discharge the VM constraint. |
| B | `test/makecode-arcade-managed-number-boundaries.test.mjs` | ordinary-argument physical text across current graph, Code, SB3 and export/reimport | {"fixture":"ordinary-argument","physical":"text","observations":[{"route":"native-current-leaf","calls":0,"errors":["Error: Procedure parameter constraint: valu |
| B | `test/makecode-arcade-numeric-constant-values.test.mjs` | numeric source constants keep their type in arrays while numeric strings stay strings | Kept TODO: `numbers[0]` may be the out-of-bounds Undefined. A source rule (a literal in-bounds index into unescaped, never popped/shifted/length-written literal Arrays, plus `NumberFormat.<member>` as Number) was prototyped and discharges the source constraint, but the VM inspection then refuses `item of array reference` at runtime (`connected input lacks complete primitive domain evidence`). It needs a matching native producer rule in `console-inspect-values.js`; the source half alone would turn an import refusal into a runtime error, so it was not landed. |
| B | `test/makecode-arcade-pxt-staging.test.mjs` | selected PXT staging survives actual native, Code, fresh SB3, export and reimport | Kept TODO, unsound to accept as is: `pair(a,b)` is called with class constructor/method formals (`class Box{constructor(a:number,b:number){this.value=pair(a,b)}}`), whose own call sites are outside the ordinary constraint protocol (`constraints()` skips class members). `new Box(<any>"x",0)` would deliver a String to `pair.a`. Needs call-site obligations for class constructors and methods first. |
| B | `test/makecode-arcade-randint-authoring.test.mjs` | selected randint numeric provenance authoring and original export: typed | +   'Error: Arcade inspection: connected input lacks complete primitive domain evidence |
| B | `test/makecode-arcade-update-values.test.mjs` | consumed prefix/postfix updates preserve values, lazy choice and evaluated-once targets | +   'Procedure parameter constraint: actual current caller or writer requires Number', +   'Procedure parameter constraint: Game_pair.a requires Number from act |
| B | `test/makecode-arcade-value-arithmetic.test.mjs` | selected Arcade defaults distinguish omission from supplied Undefined and preserve operand order | Fixed in 7a70b2315: the scalar export flow now follows stock `procedures_call` arguments into formals, and a formal that receives Undefined/Null (an omitted optional argument) exports as `any`, not `number`. |
| B | `test/makecode-array-map-values.test.mjs` | twelve selected primitive Map cases preserve current indexed reads and identity through portable routes | Kept TODO: `mmCombine(..., [2].map(v => mmEffect(v))[0])`. In isolation `mmEffect.value` passes, but the array-callback entry proof (`proveArrayCallbackPrimitiveEntries`) is closed over the whole program, and any other member call in the matrix voids it. `mmCombine.right` reads an index of a map result, which in general may be the out-of-bounds Undefined. |
| B | `test/makecode-export-arcade.test.mjs` | exported stock stop-other and stop-all retain actual native lifecycle behavior | Kept TODO: depends on group I (`liftExporterStops` leaves the exporter's `_dead` helper unlifted, so its `t` formal trips the constraint). |
| B | `test/makecode-string-conversion-roundtrip.test.mjs` | original UTF-16 and nullable primitive strings survive source, Code, original export, reimport and fresh SB3 | Kept TODO, unsound to accept as is: the export declares `let f: any = 0` and assigns `f = Game_letter(...)` later, so on reimport `__bwSdkConcat(<any>f, g)`'s left has producers {Number 0, String} (and the `<any>` cast is Opaque). A flow-insensitive proof must refuse: if `h` were computed before `f`'s write, `left.concat` would run on the Number 0 and fault. Needs a flow-sensitive source producer proof and no receiver cast for statically String operands. |
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
| I | `test/makecode-arcade-loop-control.test.mjs` | condition and update side effects agrees with original PXT and complete roundtrips | Fixed in 63894a733: the inspection domain proof now computes a least fixpoint over flow cycles (`i=advance(i)`). |
| I | `test/makecode-arcade-loop-control.test.mjs` | for continue and update agrees with original PXT and complete roundtrips | Fixed in 63894a733: the inspection domain proof now computes a least fixpoint over flow cycles (`i=advance(i)`). |
| I | `test/makecode-discarded-map-edited-export.test.mjs` | typed discarded map survives actual Creator export and a current numeric input edit without annotation-derived ingress | Fixed in 5bc4a93db: owner decision 2026-10-20, every Scratch-sprite procedure exports as `<Sprite>_<name>`; the test now expects `Game_effect`. |
| I | `test/makecode-export-arcade.test.mjs` | stop blocks and not survive export and re-import, without the run-token machinery | Kept TODO: `liftExporterStops` (arcade-translate.js) fails three gates on the exporter's own output. (1) The stop-others recipe refuses any `sprites`/`SpriteKind` identifier, which includes the exporter's `GameSprite = sprites.create(..., SpriteKind.Player)`. (2) `guard()` keys the `_t <= _som && _t != _sok` guard on the stopping script's token, but each other Game script guards with its own token. (3) The shared `proof.ambient()` in generated-helper-recognition.js refuses `GameSprite.setPosition` and `SpriteKind.Player`. (1) and (2) have narrow fixes; (3) widens a check shared by every generated-helper recognizer and needs its own proof. The unlifted `_dead` then trips the procedure constraint. |

### Integration-only (PR #1085)

| Group | File | Test | Error |
|---|---|---|---|
| I | `test/makecode-arcade-legacy-tile-collisions.test.mjs` | legacy collision filters/order, captures, yielding, snapshot indices and scenes match PXT through all roundtrips | 'ABCA' !== 'ABCABC'. Kept TODO: intermittent in hosted CI. On #1125's head b9a7359be it failed in one Build run (shard 4) and passed in the next; it passes locally. The callback order depends on timing, so it needs a deterministic frame/callback schedule before the TODO can go. |

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

### unit (3/4): AshFactory collection exhaustion, INTERMITTENT, FIXED

- Test: `test/makecode-arcade-particle-effects.test.mjs`, "actual original AshFactory exhausts its
  single and multiple color collections without losing particles". Seen on #1121, #1125, #1141
  and #1133 as `colored 3, coloredSum 12, imageSum 2` against `4, 14, 0`.
- Root cause: not timing. `AshFactory` seeds its `FastRandom` from platform entropy
  (`Math.random` through `randomRange(1, 0xFFFF)`), and the original
  `FastRandom.percentChance(100)` draws `randomRange(0, 100) < 100`, so a draw of 100 keeps a
  pixel even at 100 percent. 2570 of 65535 seeds (3.9%) keep at least one of the four pixels.
  The original PXT run and the Lite run each drew an independent seed, so the test failed in
  about 7.7% of runs. The product matches PXT 4.2.1 and is unchanged.
- Fix: `runPxtArcade` takes `fixedEntropy`, and the test pins the same entropy on both sides.
  Seed 1 checks full exhaustion (4, 14, 0). Seed 153 checks the off-by-one case (3, 12, 2) on
  both sides, which is exactly the CI failure.

### browser (heavy): debug history and Arcade physics engine, INTERMITTENT, FIXED

Both failed on #1085 (and debug history also on main) and passed on a rerun.

- **Debug history** (`verify:debug-history`): `locator.click` timed out on a disabled
  Pause. Root cause, a product race: picking the Z80 bench starts a runner that boots
  BBC BASIC and waits for its fetch. The gate's assembled ROM then replaces that runner.
  When the old runner's fetch resolved after the new runner had started, the old runner
  still published `attaching`/`ready` through its `onChange`. That overwrote the new
  runner's `running`, so Pause stayed disabled for good. Record still looked live, because
  its state comes from the new runner. Fix: `lib/bw-debug/runner-ownership.js`. The panel
  claims each runner and applies notifications or adopts the runner only while its claim
  is current. A destroyed runner also publishes nothing (`emit`/`emitLive` in
  `debug-runner.js`). The gate now waits for `data-debug-phase="running"` before clicking
  Pause, because Record being enabled does not mean the runner is running. Test:
  `test/debug-panel-runner-ownership.test.mjs`.
- **Arcade physics engine** (`verify-arcade-physics-engine-browser.mjs:99`, `24 !== 20`):
  a timing-dependent count. `controller.right` sets minStep 4 / maxStep 2 at vx 100. The
  scene loop's frame delta is wall-clock time (PXT cadence, capped at 100 ms). A frame
  shorter than 22 ms moves at most 2 px, so its displacement is never split, and the
  sprite moves. Only longer frames stall. So x 24 (two short frames before a stalled one)
  was the correct PXT result for that fixture on a fast runner. Fix: the fixture uses
  vx/maxSpeed 5000. For every delta from 2 to 100 ms, halving then ends in (2 px, 4 px]
  and stalls. Under 2 ms the displacement is 0. The assertion is unchanged. Test:
  `test/makecode-arcade-physics-engine-stall.test.mjs`. It covers every delta from 0 to
  100 ms in 0.25 ms steps, and also proves the old fixture's 2 px moves.
  The same cause produced `oldX 22 !== 20` at line 99 on main (one short frame before
  the stall).
- **Arcade physics engine** (`verify-arcade-physics-engine-browser.mjs`, `waitValue`
  timeouts, for example at line 85): a second timing-dependent count, again faithful to
  PXT. Pinned pxt-arcade 4.2.1 `physics.ts` gives each frame
  `MAX_STEP_COUNT = toInt(maxSpeed / minStep * dtMs / 1000)` movement steps, rounded.
  The fixture's saved engine was maxSpeed 40 / minStep 2, so 20 steps per second, and
  every frame shorter than 25 ms got 0 steps: the sprite kept vx 40 but never moved. The
  replacement engine (120, 2, 4) got 0 steps under about 8.3 ms. The scene loop runs at
  about 20 ms per frame here (`game.onUpdate` with `pause(20)`), so whether the sprite
  moved depended on how slow the runner's frames were. Phases that wait for the sprite's
  own position (cap, restore, or the next cycle that depends on them) then timed out. A
  node replay of the gate's press sequence with 21 ms frames reproduces it: old actor
  stuck at x 20 with vx 40, `restoredObserved` never true. The product is unchanged; it
  matches the original. Fix: the fixture uses minStep 0.125 for the saved engine (set
  on A and down) and the replacement engine. That gives at least one step for every
  frame that has any displacement (2 ms or more). The cap of 40, the positions and every
  assertion are unchanged; no timeout was raised. Test:
  `test/makecode-arcade-physics-engine-step-count.test.mjs`, which also proves the old
  minStep 2 takes zero steps under 25 ms. A press shorter than a frame was checked
  in the same node replay and is delivered, so dropped input is not the cause.

## Already-TODO items owned by other work

These were already `# TODO` before this landing and are not part of this list:

- Robot Lab lane (`docs/ROBOT-LAB-VALIDATION.md`): gearbox efficiency under load; motor torque through an 8:24 mesh; dig-cycle base yaw; tilting-table tower; two-cart restitution (rolling resistance and the universal joint resolved 2026-10-20).
- Existing Arcade TODOs (their reasons now point here, per the docs-pointer rule): first HUD callback phase; restored callback phase; do-while `continue` posttest boundary; negative-kind initial overlap frame timing.
