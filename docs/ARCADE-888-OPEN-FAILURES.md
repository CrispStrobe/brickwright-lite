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
| B | `test/makecode-arcade-background.test.mjs` | background color changes in procedures and controller handlers survive all conversion layers | +   'Procedure parameter constraint: paint.value requires Number from actual producers |
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
| D | `test/arcade-callable-metadata-construction.test.mjs` | Arcade metadata-only construction exposes its actual blocks without granting callable resources | "Cannot read properties of undefined (reading 'on')" |
| D | `test/makecode-arcade-keyboard-edges.test.mjs` | all manually dispatched registered hats explicitly bypass Scratch edge caches | "Cannot read properties of undefined (reading 'on')" |
| D | `test/makecode-arcade-pixel-drawing.test.mjs` | sprite pixel reporters and drawing commands execute through Code, SB3, PXT export and reimport | "Cannot read properties of undefined (reading 'on')" |
| E | `test/arcade-animation-resource-carrier.test.mjs` | edited resource pixels persist through current Code, same and fresh SB3 and current export | +   'Animation resource requires a stable ID and a name of 1–80 characters. |
| E | `test/arcade-native-animation-staging.test.mjs` | edited native resource pixels replace original payload without stale appended frames through fresh SB3 and export | +   'Animation resource requires a stable ID and a name of 1–80 characters. |
| F | `test/makecode-arcade-generated-images.test.mjs` | generated-image projectiles share live artwork and preserve all four creation modes | The expression evaluated to a falsy value: assert.ok(probeExtension(Arcade).opcodes.has('spawnImageProjectile')) |
| F | `test/makecode-arcade-generated-images.test.mjs` | image.create follows pinned PXT bounds and integer conversion; clones copy pixels independently | The expression evaluated to a falsy value: assert.ok(probeExtension(Arcade).opcodes.has(opcode)) |
| F | `test/makecode-arcade-image-mutation.test.mjs` | VM mutations isolate clones, update transparent collisions, and release renderer skins | The expression evaluated to a falsy value: assert.ok(probeExtension(Arcade, rt).opcodes.has('mutateSpriteImage')) |
| G | `test/makecode-arcade-buffer-lifetime.test.mjs` | independent Buffer owners in one runtime cannot resolve each other's issued IDs | Arcade exception runtime already has an owner |
| H | `test/makecode-arcade-idiv-source.test.mjs` | idiv actual mutable Number aliases ordinary helpers and captured entry dominance qualify | unsupported diagnostic; actual source: function outer(a){function read(){return a};return Math.idiv(read(),2)};let q=outer(7) |
| H | `test/makecode-pxt-runtime.test.mjs` | census batch 1: a program using every call comes back from lite and MakeCode compiles it | Math.idiv did not come back: let v = 0 basic.forever(function () { led.plotBarGraph(input.lightLevel(), 255) led.toggle(1, 2) led.setBrightness((v * 2)) led.sto |
| I | `test/makecode-arcade-loop-control.test.mjs` | condition and update side effects agrees with original PXT and complete roundtrips | checks 1 !== 4 |
| I | `test/makecode-arcade-loop-control.test.mjs` | for continue and update agrees with original PXT and complete roundtrips | updates 0 !== 4 |
| I | `test/makecode-discarded-map-edited-export.test.mjs` | typed discarded map survives actual Creator export and a current numeric input edit without annotation-derived ingress | 0 !== 1 |
| I | `test/makecode-export-arcade.test.mjs` | stop blocks and not survive export and re-import, without the run-token machinery | DEVICE ARCADE GLOBAL GameSprite GLOBAL _tokens GLOBAL _stopMark GLOBAL _som_Game GLOBAL _sok_Game GLOBAL Game_n GLOBAL Game_m SPRITE Game: |

### Integration-only (PR #1085)

| Group | File | Test | Error |
|---|---|---|---|
| I | `test/makecode-arcade-legacy-tile-collisions.test.mjs` | legacy collision filters/order, captures, yielding, snapshot indices and scenes match PXT through all roundtrips | 'ABCA' !== 'ABCABC'. Fails only with the stacked PRs merged; tried: none yet; next: compare callback order with #888 alone. |

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
