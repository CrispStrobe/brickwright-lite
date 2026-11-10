# PR #888: open Arcade test failures

Status of the Arcade foundation branch (PR #888) when it was landed on main's
documented-TODO mechanism. Each failing unit test below originally carried
`{todo: '<reason> — see docs/ARCADE-888-OPEN-FAILURES.md'}`; no assertion was
changed. Source of the list: hosted Build run 39297263647 (head f2ecafef1).

## Current status — 2026-11-02

Arcade documented TODO tests: 37 on main `bc39104b`; 33 after #1629 and #1631; 24 after the group A follow-up; 22 after the 2026-11-03 rows PR.

| Group | Before | After | Change |
|---|---|---|---|
| A Array receiver | 15 | 4 | stale marker; per-slot proofs cleared 10 rows |
| B primitive producer | 10 | 8 | `scene.backgroundColor()`; positional numeric constants |
| C named-array re-import | 3 | 1 | reimport recognizes the whole helper library (2d); the full-path row now stops at the second export |
| F image-mutation probe | 1 | 1 | same cause as G |
| G exception owner reuse | 1 | 1 | kept: original PXT has one runtime per simulator frame |
| H Math.idiv nested capture | 1 | 0 | nested parameter captures lifted (#1629) |
| I liftExporterStops | 1 | 0 | exporter stop machinery lifted (#1629) |
| timing phase / tile order / do-while | 5 | 5 | intentionally kept |

Corpus census (raw 184 importer/Creator source census, unchanged observer core
and inputs) on main `5956c6ab` (after #1629 and #1631): **156 translated, 27
partial, 1 parse failure**, up from 147/36/1; nine partials became translated
and none regressed. Source import only: no export, VM, PXT or browser claim.

**Remaining rows after 2026-11-03 (why each is still open).**
- A allOfKind second export: PARKED (operator, 2026-11-09). Both routes were tried and each contradicts deliberate controls: (1) a green-flag startup reset discount plus an exporter change that drops the staged locals' `= null` declarations (#1685) breaks about 25 reset-proof tests whose fixtures depend on those declarations, and its first version gave raw mutable projects Array authority (fixed by requiring an owned snapshot and a call-free overwrite); (2) keeping the exporter and discounting the staged locals' resets in the authority clears this test but contradicts `array-identity-constraint-prefix` "the intervening call must genuinely use the identity effect proof to discount the local reset": the second export has to cross `Game_steer(actors)`, an ordinary call. A third attempt (that authority rule alone, with the snapshot and call-free obligations) also breaks deliberate controls in `arcade-class-reset-effects` (constructor and callback effects between reset and read) and `array-source-start-reset-effects` (source-reference prelude obligations); narrowing it to respect them no longer clears this row. Reopen only if those three control sets are deliberately rescoped.
- A fresh animation re-export: the reimported frame helper procedures are not restored to animation blocks.
- A array-copy effects: needs a per-position proof over a mixed literal Array (`[undefined, NaN, [5]]`).
- A class accessor aliases: a setter-written field needs a field-writer proof.
- B map results (`[2].map(f)[0]`): the source half was built and works, but the VM lowers map to an index loop, so the native inspection would refuse at run time; it was not landed (an import refusal must not become a runtime error).
- B class constructor/method formals (2): need call-site obligations for class members in the source protocol and the VM.
- B flow-sensitive string, consumed prefix/postfix, physical text leaf, exporter nested stop tokens: fixed 2026-11-07 (run tokens plus null sprite prologue lift); the others unchanged; randint stays out of scope (bitwise).
- C named arrays (3 -> 1): the ambient helper proof now admits Array methods on the canonical `__bwArrayAccess(x)` result and on formals declared `any[]` (PXT compiles both as builtin Array methods), so the whole helper library, including the passive helpers and parse/JSON value helpers, is recognized on reimport. The remaining row fails at the second export, which refuses the reimported Array references.

**Group A decision (operator, 2026-11-02): no runtime guard; per-slot proofs only.** The follow-up cleared nine rows; the remaining five (fresh animation re-export, array-copy effects, class accessor aliases, allOfKind second export, computed index sums) stay TODO.
A runtime guard that behaves exactly like original PXT for an unproven Array
receiver is the identity: PXT already faults on a null or non-Array receiver,
so the guard changes nothing at run time. Emitted wherever the receiver proof
fails, it would admit every unproven receiver (a blanket allow) and overturn
nine test files that assert the refusal. The follow-up instead adds per-slot
proofs for the three or four most tractable rows; each needs flow-sensitive,
interprocedural initialization (for example `alias=read()` is an Array only
because the global was initialized before that call).

The remaining B rows are not SDK producers: class constructor/method formals
(two), possibly absent indexed reads (numeric constants, map results), a
flow-sensitive string producer, a native bitwise operand (randint; no bitwise
dispatch helper), a physically edited text leaf, consumed prefix/postfix
updates and the exporter's nested parallel-handler stop tokens.

## Qualified follow-up: metadata-only construction — 2026-10-20

The complete three-test `arcade-callable-metadata-construction.test.mjs` now
reports actual `ok` for all three unchanged bodies on the fresh normal
installation. The first body still carried its old TODO during that observation;
its TODO marker is removed in the follow-up. No assertion or product admission
was changed. Ordinary final-head hosted qualification is still required.

The Group D pixel case and every unrelated TODO remain open until their own
complete modules pass. The table below preserves the original
foundation failures and counts; it is not a current all-passing inventory.

## Qualified follow-up: keyboard/controller module — 2026-10-20

All four unchanged bodies in `makecode-arcade-keyboard-edges.test.mjs` now report
actual `ok`: the real Keyboard component, two actual VM/controller lifecycle
cases, and metadata hat dispatch. The last body retained its old TODO during
this observation; only that marker is removed in the follow-up. No body or
assertion changed. Existing listener warnings remain visible. No GUI dependency
fallback event occurred; no scope exception was added. This is headless installed
VM evidence, not rendered controller or hardware qualification. Complete final-head
hosted checks remain required.

## Root-cause groups

### A. Array export authority (`array-reference-export-authority.js`) cannot yet prove the Array receiver (16)

- Tried: Added SDK list producers, callee push credit, later/earlier shrink accounting, reset/overwrite retirement, falsy guards, object fields, Sprite.data, generic passthrough, for-of bounds, settings reads, named-slot reads, dead `false &&` branches, concat length.
- Next: Per-slot types through `concat`/`slice` and push-built literals (an attempt did not converge); setter-before-read on the same object; null-first global SpriteKind namespace values without breaking the KIND reset refusal tests.
- Second pass (2026-10-20): 1 fixed (inert literal overwritten by an Array), 3 kept with counter-examples. Diagnosed but still open: `animation-resources-export` (a global written from `arcade_animationAssetFrames` in a flag script has no resolved animation producer; another is a start-script null reset overwritten by a call result); `array-copies` (a global written from `arrays_referenceItem` of a nested Array, whose element may be absent); `array-reference-flow` (an Array argument is not available at the callee's read); `class-accessors` (`arcade_objectField` producer not proven initialized); `declared-references`, `multiplayer-players`, `text-sprite-converter` (receiver types include an unproved writer); `math` fails a different gate (`Array.map: receiver requires actual initialized Array allocations`).

### B. Procedure parameter constraint: a producer is not yet proven Number/String/Boolean (11)

- Tried: Added Binary `&&`/`||`/`??`, CameraProperty, `**`, randint/Math/Infinity/NaN, closure entries, structural binary helpers, static callbacks, dead local resets, primitive comparisons, directed exporter producers.
- Next: Identify each producer kind (exported helper results, SDK reporters, inspect/runtime domains) and add a sound producer rule for it; keep the default-on refusal tests red.
- Second pass (2026-10-20): 1 fixed (stock call arguments reach formals; nullable formals export as `any`), 7 kept with counter-examples or a named missing half. Not re-examined: `managed-number-boundaries`, `randint-authoring`, `update-values` (consumed prefix/postfix).

### C. Named-array helper re-import (1 left: second export)

- Tried: Export side fixed (34d5b2d0f). Reimport fixed (2d): typed Array receivers in the ambient helper proof (`generated-helper-recognition.js`); controls in `test/generated-helper-typed-array-receivers.test.mjs`.
- Next: reimport now lowers named pop/indexOf/remove helpers to native blocks and a live `X = registry` copy to `reference to named array` (2d follow-up), so the full-path test's second export is down to two refusals: `arrays_mutateReference` on `row` (its explicit global literal `0` writer from `let Game_row: any = 0`; covered by row 2e's exporter change, which drops a root default whose first use is a dominating assignment in the once-called `__bwStartup`) and `arrays_referenceLength` on `alias` after the registry is re-created. Both need export-side Array authority work.

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
| A | `test/makecode-arcade-animation-resources-export.test.mjs` | fresh resource export preserves native factory allocation and isolates array/image mutations in original PXT | Literal variant fixed (row 2g animation-export): after the native round trip each lookup call with a literal key is pruned to its matching `IF id == key THEN return frames` branch, including a THEN that builds the returned list (the String `id` argument is fixed separately). The `(key)` global-key variant is still a todo, pending a global exact-value proof for the key argument. |
| A | `test/makecode-arcade-animation-resources-export.test.mjs` | literal and computed resource IDs export shared typed images and original Arcade playback | Fixed 2026-11-02: a RESOURCE that reads a global whose stored value is a string, which no block writes and no slider can change, names that resource (shared project context for producer, authority and exporter). |
| A | `test/makecode-arcade-array-copies.test.mjs` | pxt-array-copy-effects-primary preserves original values and editable reference identity | Fixed (row 2g array-copies). Cause: no per-slot Array facts for a literal built by importer pushes or for its slice()/concat copies, so `[5]` read back was not a proven Array. Fix: exact slot lists for one allocation (structurally staged literal pushes in definite order, all other writes after the read; whole slice() and concat of exact operands copy slots) |
| A | `test/makecode-arcade-array-copies.test.mjs` | pxt-array-copy-primary preserves original values and editable reference identity | Fixed 2026-11-02: an exact undefined slice START/END is the default bound (0 / length) in PXT and the Arrays extension, so element presence follows the proven source length. |
| A | `test/makecode-arcade-array-reference-flow.test.mjs` | typed array reference authoring and original export: image-element | Fixed 2026-11-02: a closed parameterless getter that only returns a global is judged at its call site. |
| A | `test/makecode-arcade-array-reference-flow.test.mjs` | typed array reference authoring and original export: nullable | Fixed 2026-11-02: statements in the untaken branch of a literal-comparison if/else never run; the taken branch's first write ends the reset. |
| A | `test/makecode-arcade-array-reference-flow.test.mjs` | typed array reference authoring and original export: numeric-literal | Fixed 2026-11-02: call-site getter rule (see image-element). |
| A | `test/makecode-arcade-class-accessors.test.mjs` | ordinary accessor resource-aliases retains managed effects and all authoring routes | Kept TODO (row 2g, 2026-11-09, operator decision: deliberate rules unchanged). `holder.items[0]` reads accessor `items`, backed by `_items`. Two blockers: (1) accessor getters/setters are implicit (managed) entries whose parameters gain no producer facts from class metadata (pinned by `constructor initializer methods accessors and Sprite updates are implicit procedure entries`), so the setter argument cannot reach `_items`; (2) a field read is initialized only when every writer is a constructor-prefix statement, and the setter writes `_items` outside the constructor. |
| A | `test/makecode-arcade-declared-references.test.mjs` | uncalled typed resource helpers preserve executable array operations through original PXT and roundtrips | Fixed 2026-11-02: reads inside a procedure no block can enter (closed call graph, no other block names it) need no Array proof. |
| A | `test/makecode-arcade-math.test.mjs` | Arcade math calls preserve every operand and run | Fixed 2026-11-02: SDK `Math.map` on the unshadowed namespace is no longer collected as an Array map site. |
| A | `test/makecode-arcade-multiplayer-players.test.mjs` | scene-local player identities, properties, sprite references and arrays agree with original PXT across roundtrips | Fixed 2026-11-02: `mp.allPlayers()` is a fresh SDK Array producer. |
| A | `test/makecode-arcade-source-typeof-export.test.mjs` | mixed local Array receivers keep array dispatch without changing an independently typed local | Fixed in d865fc9d1: a local first written with an inert primitive literal and immediately overwritten by an Array is discounted like a reset (globals, cell-reading and calling writers unchanged). |
| A | `test/makecode-arcade-sprite-collections.test.mjs` | allOfKind snapshots preserve sprite identity, kind changes and destroyed references through executable roundtrips | PARKED (operator, 2026-11-09). Both routes were tried and each contradicts deliberate controls: (1) a green-flag startup reset discount plus an exporter change that drops the staged locals' `= null` declarations (#1685) breaks about 25 reset-proof tests whose fixtures depend on those declarations, and its first version gave raw mutable projects Array authority (fixed by requiring an owned snapshot and a call-free overwrite); (2) keeping the exporter and discounting the staged locals' resets in the authority clears this test but contradicts `array-identity-constraint-prefix` "the intervening call must genuinely use the identity effect proof to discount the local reset": the second export has to cross `Game_steer(actors)`, an ordinary call. A third attempt (that authority rule alone, with the snapshot and call-free obligations) also breaks deliberate controls in `arcade-class-reset-effects` (constructor and callback effects between reset and read) and `array-source-start-reset-effects` (source-reference prelude obligations); narrowing it to respect them no longer clears this row. Reopen only if those three control sets are deliberately rescoped. |
| A | `test/makecode-arcade-text-sprite-converter.test.mjs` | TextSprite source preserves original pixels, aliases, deferred property redraw and membership through editable roundtrips | Fixed 2026-11-02: the kind reset admits the kind-library initializer and a registered kind-name write. |
| A | `test/makecode-arcade-update-values.test.mjs` | prefix update in a condition performs required array initialization | Passes on main (stale marker removed 2026-11-02). |
| A | `test/makecode-arcade-value-arithmetic.test.mjs` | numeric sums retain their type through index variables and procedure returns | Fixed 2026-11-03: a constant computed index (literal arithmetic and a closed single-return procedure with constant arguments) proves element presence. |
| B | `test/makecode-arcade-accessor-pxt-staging.test.mjs` | selected PXT accessor receivers, setters and compound reads keep actual side-effect order across authoring routes | Kept TODO, unsound to accept as is: `pair(receiver().value, ...)` reads a getter returning the constructor formal `n` (`constructor(public n:number)`). Class formals have no call-site obligation, so `new Box(<any>"x")` would make `pair.a` a String. Same gap as the pxt-staging row. |
| B | `test/makecode-arcade-background.test.mjs` | background color changes in procedures and controller handlers survive all conversion layers | Fixed 2026-11-02: closed `scene` namespace source rule (`ordinarySceneBackgroundNumberCalls`) plus the native background colour reporter in the Number-on-normal-completion list; `test/arcade-scene-background-number.test.mjs` compares original PXT, Lite and the export. |
| B | `test/makecode-arcade-managed-number-boundaries.test.mjs` | ordinary-argument physical text across current graph, Code, SB3 and export/reimport | Refused by design (row 2h-2, operator decision 2026-11-09): a registered stock or managed Number formal rejects text before any body effects, pinned by the deliberate control `registered stock/managed Number rejects text before body effects` (`test/arcade-procedure-constraints-native.test.mjs`). A text-edited argument to a Number formal stays outside the roundtrip on purpose. |
| B | `test/makecode-arcade-numeric-constant-values.test.mjs` | numeric source constants keep their type in arrays while numeric strings stay strings | Fixed 2026-11-03: positional elements of never-mutated literal (and exporter push-built) Arrays, NumberFormat members as Number enum leaves, and the matching native inspection proof. |
| B | `test/makecode-arcade-pxt-staging.test.mjs` | selected PXT staging survives actual native, Code, fresh SB3, export and reimport | Kept TODO, unsound to accept as is: `pair(a,b)` is called with class constructor/method formals (`class Box{constructor(a:number,b:number){this.value=pair(a,b)}}`), whose own call sites are outside the ordinary constraint protocol (`constraints()` skips class members). `new Box(<any>"x",0)` would deliver a String to `pair.a`. Needs call-site obligations for class constructors and methods first. |
| B | `test/makecode-arcade-randint-authoring.test.mjs` | selected randint numeric provenance authoring and original export: typed | +   'Error: Arcade inspection: connected input lacks complete primitive domain evidence |
| B | `test/makecode-arcade-update-values.test.mjs` | consumed prefix/postfix updates preserve values, lazy choice and evaluated-once targets | Fixed 2026-11-09 (row 2h-1): the exported unary-plus helper is proved per call site, and a native dynamic `+` is Number when both own operands are proved Number. Controls in `test/arcade-consumed-update-number-proofs.test.mjs`. |
| B | `test/makecode-arcade-value-arithmetic.test.mjs` | selected Arcade defaults distinguish omission from supplied Undefined and preserve operand order | Fixed in 7a70b2315: the scalar export flow now follows stock `procedures_call` arguments into formals, and a formal that receives Undefined/Null (an omitted optional argument) exports as `any`, not `number`. |
| B | `test/makecode-array-map-values.test.mjs` | twelve selected primitive Map cases preserve current indexed reads and identity through portable routes | Fixed (row 2f). Import: inline `[literal].map(fn)[k]` reads in the procedure-constraint validator, per-Array callback entry facts (operator decision 2026-11-09 rescoped the fresh-Array-in-callback control variant), and function-local push-only Array families read in bounds (`local-array-family-entry.js`). VM: the same family proof for the importer's lowered `repeat while I < LEN` map loop. All routes pass. |
| B | `test/makecode-export-arcade.test.mjs` | exported stock stop-other and stop-all retain actual native lifecycle behavior | Fixed 2026-11-07: the second export gives each parallel handler its own run token, and the stop lift admits the second export's exact null sprite prologue (`let GameSprite: Sprite`, then `GameSprite = null` / `GameSprite = sprites.create(...)` in the start function). Near-miss prologues stay refused. |
| B | `test/makecode-string-conversion-roundtrip.test.mjs` | original UTF-16 and nullable primitive strings survive source, Code, original export, reimport and fresh SB3 | Fixed 2026-11-09 (row 2e, exporter): an unobservable start-script default of a String global is declared `= ""`, and String receivers call `.concat` directly instead of `__bwSdkConcat(<any>...)`. Controls in `test/arcade-startup-first-write-globals.test.mjs`. |
| C | `test/makecode-arcade-named-arrays.test.mjs` | named arrays retain scalar items, aggregate JSON, value parsing, nested aliases and replacement across all conversion paths | Fixed 2026-11-10 (row 2i): the first export no longer declares a dead `row` default, a read in the first statement of `if truthy(x)` on the same cell ignores x's null resets, and a named write before the named Array's re-creation no longer blocks its slot facts. Controls in `test/arcade-truthy-guard-array-authority.test.mjs`. |
| C | `test/makecode-arcade-named-arrays.test.mjs` | named operations evaluate their arguments once and distinguish includes from indexOf for NaN | Fixed (2d): typed Array receivers in the ambient helper proof. |
| C | `test/makecode-arcade-source-typeof-roundtrip.test.mjs` | E15 text versus JSON aggregate helper retains typeof through Code, saved projects and strict original export | Fixed (2d): typed Array receivers in the ambient helper proof. |
| D | `test/arcade-callable-metadata-construction.test.mjs` | Arcade metadata-only construction exposes its actual blocks without granting callable resources | Fixed in 681b3a281: Sprite update activation registered runtime listeners without a runtime. |
| D | `test/makecode-arcade-keyboard-edges.test.mjs` | all manually dispatched registered hats explicitly bypass Scratch edge caches | Fixed in 681b3a281: Sprite update activation registered runtime listeners without a runtime. |
| D | `test/makecode-arcade-pixel-drawing.test.mjs` | sprite pixel reporters and drawing commands execute through Code, SB3, PXT export and reimport | Fixed in 681b3a281: Sprite update activation registered runtime listeners without a runtime. |
| E | `test/arcade-animation-resource-carrier.test.mjs` | edited resource pixels persist through current Code, same and fresh SB3 and current export | Fixed in 681b3a281: the frame Array producer rejected costume records with no timeline; a malformed animation is still reported. |
| E | `test/arcade-native-animation-staging.test.mjs` | edited native resource pixels replace original payload without stale appended frames through fresh SB3 and export | Fixed in 681b3a281: the frame Array producer rejected costume records with no timeline; a malformed animation is still reported. |
| F | `test/makecode-arcade-generated-images.test.mjs` | generated-image projectiles share live artwork and preserve all four creation modes | Fixed in 681b3a281: the probe constructs without a runtime, which crashed before the fix (same cause as D). |
| F | `test/makecode-arcade-generated-images.test.mjs` | image.create follows pinned PXT bounds and integer conversion; clones copy pixels independently | Fixed in 681b3a281: the probe constructs without a runtime, which crashed before the fix (same cause as D). |
| F | `test/makecode-arcade-image-mutation.test.mjs` | VM mutations isolate clones, update transparent collisions, and release renderer skins | Kept TODO (2026-11-02): same root cause as G (the probe builds a second Arcade on the test's runtime). See G for why this stays open. |
| G | `test/makecode-arcade-buffer-lifetime.test.mjs` | independent Buffer owners in one runtime cannot resolve each other's issued IDs | Kept TODO (2026-11-02, checked against original PXT): the pinned simulator keeps exactly one program runtime per simulator frame. Starting a run kills the previous runtime and board first, `pxsim.runtime` is a single module-level value and `board()` reads `pxsim.runtime.board`; several simulators are separate frames (separate JavaScript realms) and `game.pushScene` is a scene stack inside one game. PXT has no two coexisting game runtimes in one realm, so two live Arcade owners on one Lite runtime have no original behavior to match; the duplicate-owner refusal (`test/arrays-only-coordinator-native.test.mjs`) stays. Lite's replacement path (dispose, then a new claim on PROJECT_LOADED) is the counterpart of PXT's kill-and-restart and is already covered. |
| H | `test/makecode-arcade-idiv-source.test.mjs` | idiv actual mutable Number aliases ordinary helpers and captured entry dominance qualify | Fixed 2026-11-02: nested function declarations that capture only never-written parameters of their root function are lifted with those parameters passed at each direct call (`liftNestedParameterCaptures`). Original PXT, Lite VM and export agree; written captures, enclosing locals and escapes are still refused. |
| I | `test/makecode-arcade-loop-control.test.mjs` | condition and update side effects agrees with original PXT and complete roundtrips | Fixed in 63894a733: the inspection domain proof now computes a least fixpoint over flow cycles (`i=advance(i)`). |
| I | `test/makecode-arcade-loop-control.test.mjs` | for continue and update agrees with original PXT and complete roundtrips | Fixed in 63894a733: the inspection domain proof now computes a least fixpoint over flow cycles (`i=advance(i)`). |
| I | `test/makecode-discarded-map-edited-export.test.mjs` | typed discarded map survives actual Creator export and a current numeric input edit without annotation-derived ingress | Fixed in 5bc4a93db: owner decision 2026-10-20, every Scratch-sprite procedure exports as `<Sprite>_<name>`; the test now expects `Game_effect`. |
| I | `test/makecode-export-arcade.test.mjs` | stop blocks and not survive export and re-import, without the run-token machinery | Fixed 2026-11-02: `liftExporterStops` admits only the exporter's own sprite prologue (passed as internal to the unchanged shared ambient proof) and keys each script's guard on its own run token. Refusal controls cover foreign prologues. |

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

### browser (light): debugger inspection and Arcade legacy layout, INTERMITTENT, FIXED

Both failed on unrelated PRs (#1141, #1150 and others) and passed on a rerun.

- **Debugger inspection** (`verify-debug-run-to-inspection.mjs:94`, waiting for
  `data-debug-phase="running"`): every failing screenshot reads "not running  assembled
  image on the Searle map — no designer board". That is the gate ROM runner's own
  pre-start `ready` snapshot. Root cause, a product race: each assembled ROM booted
  TWICE. circuit-tab re-dispatches the stashed `bw-asm-rom-ready` detail a frame after
  the first delivery (the machineBooted transition, and again on re-entering Circuit).
  `_bootFromMedia` drops a repeated media detail by identity, but `_onAsmRomReady`
  wrapped every delivery in a fresh detail, so the guard never matched. The first runner
  was torn down mid-attach, and when its attach finished after the second runner's
  start, its late `ready` replaced `running` for good. All four failing runs (2026-10-20
  16:01 to 2026-10-21 03:12 UTC) predate the runner-ownership guard of #1124, which now
  drops that late snapshot. This fix removes the double boot itself:
  `_onAsmRomReady` drops a repeated detail while the runner it booted lives. A repeat
  after something else tore that runner down still boots again. Test:
  `test/debug-asm-delivery-once.test.mjs`, which runs the gate's ROM on the real Z80
  runner and finds the screenshot state as its pre-start snapshot.
- **Arcade legacy layout** (`verify-arcade-legacy-layout.mjs:46`, second `runEdited`
  after the definition Save): both failing artifacts hold exactly 910 identical page
  errors, "Source scalar declaration has no current prelude binding", about one per
  frame for the 30 s wait. Root cause, a product race: the painter's Save calls
  `vm.emitWorkspaceUpdate()`. The GUI removes the VM's block listener, clears and
  reloads the Blockly workspace, and re-adds the listener. But Blockly queues the
  clear's delete events and the load's create events and fires them on a later task, to
  the listeners attached then, which includes the VM's. For a refresh of the same target
  the VM therefore deleted every block and recreated it from XML as a new object. A
  green flag sent before that task bound the Arcade source prelude to the old block
  objects, and the declaration then failed on every frame, so the game never set its
  tile map. The first `runEdited` usually won the race and the second, after the
  heavier definition Save, sometimes lost it. Fix:
  `lib/workspace-reload-events.js`. The reload runs under a reserved Blockly event
  group and the VM's listener ignores that group. Other listeners still get the events.
  The gate is unchanged. The echo had also been the only PROJECT_CHANGED after "To
  blocks" set `runtime.stc`, which the debugger pane and engine picker wait for, so
  the importer now emits PROJECT_CHANGED itself once it has set `runtime.stc`. Test: `test/workspace-reload-vm-roundtrip.test.mjs`, which
  replays the echo on the real VM after a green flag. Untagged, it reproduces the CI
  error. Tagged, the blocks keep their identity and the program runs.

## Already-TODO items owned by other work

These were already `# TODO` before this landing and are not part of this list:

- Robot Lab lane (`docs/ROBOT-LAB-VALIDATION.md`): gearbox efficiency under load; motor torque through an 8:24 mesh; dig-cycle base yaw; tilting-table tower; two-cart restitution (rolling resistance and the universal joint resolved 2026-10-20).
- Existing Arcade TODOs (their reasons now point here, per the docs-pointer rule): first HUD callback phase; restored callback phase; do-while `continue` posttest boundary; negative-kind initial overlap frame timing.
