# Conversion capabilities and GUI gap worklist

Updated: 2026-10-02. Scope: Brickwright Lite's current conversion work, with
MakeCode Arcade as the main compatibility target, plus ordinary MakeCode,
Calliope and Scratch/TurboWarp paths. This file is an implementation inventory
and a handoff for agents improving the Blocks, Code and graphics editors.

The inventory was reconstructed from the current source, tests and dated
compatibility reports. It describes implemented subsets, not universal MakeCode
compatibility. A converter case, an existing block, successful compilation and a
successful browser authoring workflow are different pieces of evidence.

## 1. How to use this document

1. Choose a capability ID below and its corresponding GUI gap IDs.
2. Read the linked converter/runtime code and the relevant tests before editing.
3. Reuse the actual value model and APIs. Do not create a separate GUI-only
   implementation, replace unknown producers with empty collections, or hide
   unsupported diagnostics.
4. Author the feature through the editor, run it, save/reload SB3, switch Code ↔
   Blocks, export to MakeCode, compile, reimport and run again.
5. Record browser evidence and the remaining limits. Update this file's status
   only after the required path has been tested.

**Status vocabulary:**

- **Implemented subset:** code/runtime/conversion evidence exists for the stated
  subset. This does not mean every applicable GUI workflow has been verified.
- **Verified GUI subset:** a particular built-browser interaction is measured.
- **Open GUI task:** missing functionality or a workflow requiring investigation.
  An investigation task is not an assertion that the feature is absent.
- **In progress:** edits are being integrated; do not treat them as supported.
- **Unsupported:** retain a named diagnostic until semantics are implemented.

Latest completed Arcade baseline: 184 sources; **89 translated, 94 partial,
1 parse failure**, **300 reported gap occurrences**. MakeCode structural roundtrips: **82
preserved / 60 loss / 41 partial**. Project/Code: **88 preserved / 93 partial /
2 loss**. These are structural counts, not proof that all games run correctly.

Sources of current evidence:

- [Friction regression](../test-results/arcade-friction-regression-current.json).
- [Friction controller/browser workflow](../test-results/arcade-friction-browser-current.json).

- [Multi-sprite physics regression](../test-results/arcade-multi-physics-regression-current.json).
- [Multi-sprite controller/browser workflow](../test-results/arcade-multi-physics-browser-current.json).

- [Compatibility work history](ARCADE-COMPAT-PLAN.md): dated implementation slices,
  original-simulator probes, regressions and remaining work.
- [Arcade authoring/runtime reference](ARCADE-SPRITES.md).
- [Audit and CLI guide](COMPATIBILITY-AUDIT.md).
- [Scene regression](../test-results/arcade-scenes-regression-current.json).
- [Scene editor/controller browser workflow](../test-results/arcade-scenes-browser-current.json).
- [Camera regression](../test-results/arcade-camera-regression-current.json).
- [Camera editor/controller browser workflow](../test-results/arcade-camera-browser-current.json).
- [Terrain event regression](../test-results/arcade-terrain-events-regression-current.json).
- [Terrain event browser workflow](../test-results/arcade-terrain-events-browser-current.json).
- [Terrain collision regression](../test-results/arcade-terrain-regression-current.json).
- [Terrain editor/controller browser evidence](../test-results/arcade-terrain-browser-current.json).
- [Animation/namespace regression](../test-results/arcade-animation-namespace-regression-current.json).
- [Animation editor/controller browser evidence](../test-results/arcade-animation-browser-current.json).
- [Latest tile-data regression](../test-results/arcade-tile-data-regression-current.json).
- [Latest tile browser test](../test-results/arcade-tile-data-browser-current.json).
- [Current 184-source audit](../test-results/compat-arcade-184-current.json).
- [Current conversion permutations](../test-results/conversion-arcade-184-current.json).

## 2. Architecture and ownership

| Layer | Authoritative source | Responsibility |
|---|---|---|
| TypeScript syntax | [ts-import.js](../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js) | Parse the supported MakeCode TypeScript subset; preserve evaluation structure and diagnostics. |
| Shared translation | [translate-base.js](../overlay/scratch-gui/src/lib/bw-makecode/translate-base.js) | Control flow, declarations, scalar/array lowering, unsupported reporting. |
| Arcade import | [arcade-translate.js](../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js) | Resource identity, events, native Arcade APIs and legacy fallbacks. |
| Arcade export | [export-arcade.js](../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js) | Blocks → real PXT TypeScript, types, helpers, assets, dependency files and diagnostics. |
| Other MakeCode | [microbit-translate.js](../overlay/scratch-gui/src/lib/bw-makecode/microbit-translate.js), [export.js](../overlay/scratch-gui/src/lib/bw-makecode/export.js) | micro:bit/Calliope import and export subsets. |
| Code ↔ Blocks/SB3 | [sb3-creator.js](../overlay/scratch-gui/src/lib/sb3-creator.js) | Parse/decompile editable Brickwright Code, build projects and preserve metadata/assets. |
| Type inference | [value-type-graph.js](../overlay/scratch-gui/src/lib/bw-makecode/value-type-graph.js) | Connect aliases, procedure parameters/results and nested array element types. |
| Typed values | [bw-values.js](../overlay/scratch-vm/src/util/bw-values.js) | Undefined/nonfinite values, scoped resource references, equality and shared array heap. |
| Arcade execution | [Arcade extension](../overlay/scratch-vm/src/extensions/crispstrobe/arcade/index.js) | Sprite/image/tile state, controller state, events, rendering and runtime APIs. |
| Array execution | [Arrays extension](../overlay/scratch-vm/src/extensions/crispstrobe/arrays/index.js) | Named arrays, typed reference arrays, value operations and tensor/table features. |
| Pixel data | [pixel-image.js](../overlay/scratch-gui/src/lib/bw-makecode/pixel-image.js), [arcade-assets.js](../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js) | Palette pixels, SVG/JRES/image literals, quantization and asset roundtrips. |
| Pixel GUI | [pixel-art-editor.jsx](../overlay/scratch-gui/src/components/tw-pseudocode/pixel-art-editor.jsx), [costume-tab.jsx](../overlay/scratch-gui/src/containers/costume-tab.jsx) | Existing palette editor, save/revert, costume selection and normal paint-editor switch. |
| Controller GUI | [arcade-device-pane.jsx](../overlay/scratch-gui/src/components/tw-pseudocode/arcade-device-pane.jsx) | Mirror the renderer in a 160×120 viewport and post controller input. |

GUI overlay files must be mirrored under `packages/scratch-gui/src/`. VM source
is installed by `node scripts/apply-vm-overlay.mjs`; do not treat installed
node_modules as the source of truth. Coordinate shared-file ownership across
agents, preserve unrelated dirty changes, and never overlap GUI builds.

## 3. Containers, conversion paths and diagnostics

| ID | Implemented capability | Evidence / limits | GUI work |
|---|---|---|---|
| C01 | Recover embedded project sources from MakeCode HEX, universal HEX, UF2, ELF and PNG cartridges. | [embedded-source.js](../overlay/scratch-gui/src/lib/bw-makecode/embedded-source.js), [import tests](../test/makecode-import.test.mjs). A binary without recoverable source is not magically translated. | G01, G02 |
| C02 | LZMA and PNG decoding for embedded project recovery. | Local decoders support the formats exercised by fixtures; not arbitrary image/container variants. | G01 |
| C03 | Import source/project data from MakeCode share links and direct TypeScript. | [share.js](../overlay/scratch-gui/src/lib/bw-makecode/share.js), [index.js](../overlay/scratch-gui/src/lib/bw-makecode/index.js). Share import needs network; a bare main.ts may omit dependencies/art. | G01, G02 |
| C04 | Extract micro:bit MicroPython HEX scripts, including the supported V1/V2 storage forms. | [micropython-hex.js](../overlay/scratch-gui/src/lib/bw-makecode/micropython-hex.js); can route extracted Python to the micro:bit simulator. | G01, G23 |
| C05 | Convert imported MakeCode into editable Brickwright Code/Blocks/SB3. | [CLI tests](../test/makecode-cli.test.mjs), [UI contract](../test/makecode-ui-contract.test.mjs). Native Arcade and older fixed-target paths coexist. | G03, G04 |
| C06 | Export project Blocks to PXT TypeScript and MakeCode source containers; supported firmware compilation paths use synced PXT bases. | [export tests](../test/makecode-export.test.mjs), [Arcade export tests](../test/makecode-export-arcade.test.mjs). Source-only HEX is distinct from flashable firmware; hardware/board/package support varies. | G02, G24 |
| C07 | CLI conversion, corpus import audits, compile checks and conversion permutations. | [makecode.mjs](../scripts/makecode.mjs), [compat-audit.mjs](../scripts/compat-audit.mjs), [conversion-roundtrips.mjs](../scripts/conversion-roundtrips.mjs). Reports distinguish parse/import/compile/runtime/assets failures. | G02, G25 |
| C08 | Preserve SB3 project assets and optional typed-value metadata. | Standard scalar fields remain schema-valid; `bwSpecialValues` carries special values. Live heaps are recreated by program restart, not checkpointed. | G04, G20 |
| C09 | Named unsupported APIs, missing opcodes, external extensions, unsupported block modes and nonrepresented assets. | [nothing-vanishes tests](../test/makecode-nothing-vanishes.test.mjs), audit scripts. A zero error count alone is not a behavioral proof. | G02, G25 |

### CLI entry points for agents

```sh
npm run makecode -- to-sb3 game.ts --target arcade -o game.sb3 --bw game.bw
npm run makecode -- to-ts game.sb3 --target arcade -o main.ts
npm run makecode -- to-hex game.sb3 --target arcade --board rp2040 -o game.uf2
npm run compat:audit -- --target arcade --compile --execute /path/to/corpus
```

Read the [CLI guide](COMPATIBILITY-AUDIT.md) for source-only output, firmware
bases and supported inputs. Do not interpret a successful compile as correct
controls, graphics, sound, physics or hardware behavior.

## 4. Language and value semantics

| ID | Implemented subset | Important boundary / evidence | GUI work |
|---|---|---|---|
| L01 | Unicode identifiers, annotations, supported declarations, operators, tagged image/template literals and callback/function syntax. | [parser/base](../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js), [translation tests](../test/makecode-translate.test.mjs). This is a subset parser, not all TypeScript/JavaScript. | G03, G05 |
| L02 | Shared scalar control flow and supported loops; calls inside supported callbacks are walked rather than discarded. | Base/Arcade translators and nothing-vanishes gate. Break/continue, assignment/update expression values and some lexical scopes remain gaps. | G05, G06 |
| L03 | Native invocation locals, parameters, returned values, early-return paths and paused procedure results. | [locals](../test/makecode-arcade-locals.test.mjs), [returns](../test/makecode-arcade-function-returns.test.mjs), resource-return tests. General first-class functions/closures are not complete. | G06 |
| L04 | Image/Sprite/array/tile-location aliases and resource-valued procedure parameters/results. | Type graph propagates resource/element types into PXT signatures; identity is not replaced by copied assets. | G06, G07 |
| L05 | Optional/default procedure arguments: omitted values become undefined; defaults do not replace null/zero/text values. | [optional arguments](../test/makecode-arcade-optional-procedure.test.mjs). Missing required arguments remain diagnostics. | G06 |
| L06 | Actual undefined/null, Boolean/string/number values, NaN, infinities and negative zero through native stores, calls, Code and SB3 metadata. | [arithmetic](../test/makecode-arcade-value-arithmetic.test.mjs), [coercion](../test/makecode-arcade-array-coercion.test.mjs), [SB3 booleans](../test/sb3-boolean-values.test.mjs). Do not serialize missing values as empty text. | G05, G07, G20 |
| L07 | Operand-preserving lazy `&&`/`||` lowering and conditions with real value truthiness. | [lazy values](../test/makecode-arcade-lazy-values.test.mjs); runtime evaluates only the selected branch and preserves its value. | G05 |
| L08 | Primitive binary/unary arithmetic and comparisons with MakeCode-compatible tested coercions. | Numeric literal reporters preserve number type; text-looking numbers remain text unless explicitly converted. Generic object/resource conversion still has named limits. | G05, G07 |
| L09 | Compound array/sprite stores and statement increments/decrements with receiver/index evaluation exactly once. | [plan](ARCADE-COMPAT-PLAN.md#compound-targets-and-statement-updates-2026-10-01). Expression-valued updates/assignments remain separate work. | G05 |
| L10 | Balanced nested Code parsing and escaped quotes/control characters/Unicode string roundtrips. | Named-array/JSON tests and parser updates. Keep new syntax equally parsable and decompilable. | G03, G05 |
| L11 | Verified pure helper-body recognition on PXT reimport. | Operator, legacy JSON/parser and array-access helpers are recognized by full supported bodies/uses, not names alone. | G03 |
| L12 | Supported math reporters and authored Scratch min/max numeric conversion on export. | [math tests](../test/makecode-arcade-math.test.mjs), [min/max](../test/makecode-arcade-native-minmax.test.mjs). Native MakeCode Math.min/max NaN import semantics are still not fully equivalent. | G05 |
| L13 | Safe qualified namespace bindings, exported/private access, nested exported namespaces, lexical shadowing and numeric enum constants (negative values, supported arithmetic/prior-member initializers, implicit increments). | [binding tests](../test/makecode-namespace-bindings.test.mjs), [executed original/exported PXT roundtrip](../test/makecode-arcade-namespace-runtime.test.mjs). Reopened namespaces, namespace objects/computed access, escaped functions, local enums and unsupported enum initializers remain diagnosed. Editable enum declaration objects are not preserved. | G03, G06, G26 |

## 5. Arrays and JSON

| ID | Implemented subset | Evidence / boundary | GUI work |
|---|---|---|---|
| A01 | Zero-based array access and mutation, lengths, search, push/pop/shift/unshift, supported insertion/removal and element assignment. | [reference arrays](../test/makecode-arcade-reference-arrays.test.mjs), [discarded pop](../test/makecode-arcade-array-pop.test.mjs). Callback APIs are not all supported. | G07 |
| A02 | Typed array references, shared aliases, fresh allocations, heterogeneous values and Image/Sprite/location elements. | Shared heap and type graph; ordinary ID-like strings and foreign project scopes cannot resolve a reference. | G07, G20 |
| A03 | Nested multidimensional arrays, shared/detached rows and recursive/self-containing type graphs. | Existing reference-array tests and the real nested-array game. Some higher-order arrays and union type flow remain open. | G07 |
| A04 | Missing/sparse elements, null/undefined and tested index normalization/identity comparisons. | Do not replace a missing array with `[]` or a missing element with zero. | G07 |
| A05 | Legacy named-array creation, push/set/insert/remove/delete and supported reads/search/JSON export. | [named arrays](../test/makecode-arcade-named-arrays.test.mjs); aliases retain old array identity after replacement/deletion. Dynamic names/constructors and remaining range/matrix exports remain gaps. | G07 |
| A06 | Bridge reporters: named-array reference, legacy parse input, JSON text of value. | Real JSON semantics for tested primitives/nested arrays/nonfinite values, escaped controls and Unicode. Cycles/wrong-kind resources report errors. | G07, G20 |
| A07 | JSON argument/return chains preserve typed references and special numbers. | Chains are transport representation, not strings to expose as normal array values. | G06, G07 |
| A08 | Sprite collections via `sprites.allOfKind`: fresh snapshots, live-kind insertion order and retained destroyed handles in old arrays. | [collections](../test/makecode-arcade-sprite-collections.test.mjs); dynamic kind queries remain diagnostics. | G08 |
| A09 | Tile-location collections via `tiles.getTilesByType`: fresh refs, column-major ordering and image equality. | [tile data](../test/makecode-arcade-tile-data.test.mjs). Requires supported map data. | G09, G10 |

## 6. Arcade sprites, controls, lifecycle and UI-related APIs

| ID | Implemented subset | Evidence / boundary | GUI work |
|---|---|---|---|
| S01 | Dynamic native sprite creation with independent instances, local/global aliases and resource-valued factories. | [handles](../test/arcade-sprite-handles.test.mjs), named/local projectile and function-result tests. Older fixed-target imports still exist. | G08 |
| S02 | Constructor centering, odd/even image sizes and positioned creation ordering around callbacks. | [fixed point](../test/makecode-arcade-sprite-fixed-point.test.mjs): odd one-pixel center 79.5/59.5. Positioned spawn differs from the constructor. | G08 |
| S03 | Atomic setPosition and tested signed 24.8 property/velocity/acceleration storage, edges and overflow. | Individual property setters and displacement conversion are not interchangeable. Default fixed-point frame integration now has original-simulator evidence (T10); friction is implemented (T11); engine references/settings are tested (T12); full geometry/physics parity remains open. | G08 |
| S04 | Sprite properties, image reads/replacement, kind changes and supported flags. | [flags](../test/makecode-arcade-flags.test.mjs); unsupported effects/flag behavior stays named. | G08, G11 |
| S05 | Destruction callbacks and retained resource properties after destruction. | [destroyed](../test/makecode-arcade-destroyed.test.mjs), fixed-point/text tests. Lifetime of the world entry differs from the retained object. | G08 |
| S06 | Created/overlap events, runtime registration, callback sprite identity and tested captures. | [registration](../test/makecode-arcade-created-registration.test.mjs), [creation order](../test/makecode-arcade-created-order.test.mjs). Arbitrary closure/capture semantics remain incomplete. | G06, G08 |
| S07 | Side/source projectiles, live Image inputs, returned projectiles and tested creation placement. | [source projectiles](../test/makecode-arcade-projectile-source.test.mjs), [local projectiles](../test/makecode-arcade-local-projectiles.test.mjs). Terrain-aware placement remains open. | G08 |
| S08 | Native controller movement, binding replacement, disabled axes and supported step/buttons/events. | [bindings](../test/makecode-arcade-controller-bindings.test.mjs), [step](../test/makecode-arcade-controller-step.test.mjs). Stage transforms preserve Arcade coordinates. | G11 |
| S09 | Game update, intervals, parallel/forever callbacks and tested ordering/lifecycle subsets. | [update](../test/makecode-arcade-update.test.mjs), [interval](../test/makecode-arcade-interval.test.mjs), [forever](../test/makecode-arcade-forever.test.mjs). Full fiber/render/audio timing is not established. | G12 |
| S10 | Score/life/countdown APIs and supported life-zero/rearming callbacks. | [life zero](../test/makecode-arcade-life-zero.test.mjs). Not every multiplayer/game API has been implemented. | G11, G12 |
| S11 | Splash, questions, ask-for-number/string, console/logging and tested speech bubbles/dialog interaction. | [ask](../test/makecode-arcade-ask.test.mjs), [splash](../test/makecode-arcade-splash.test.mjs), [speech](../test/makecode-arcade-say-text.test.mjs), [console](../test/makecode-arcade-console.test.mjs). Options/layout variants have limits. | G13 |
| S12 | Explicit sprite-toString and fixed-point string output. | [sprite text](../test/makecode-arcade-sprite-text.test.mjs). Does not establish all implicit ToPrimitive conversions. | G05, G08 |
| S13 | Functional Arcade/PyBadge controller pane and 160×120 renderer mirror. | Real Pong, nested-array game and tile-data browser reports verify specific control/render paths. Hardware equivalence is separate. | G11, G23 |

## 7. Images, graphics and tilemaps

| ID | Implemented subset | Evidence / boundary | GUI work |
|---|---|---|---|
| I01 | Palette image literals, JRES assets, generated assets and exact supported palette SVG costumes. | [generated images](../test/makecode-arcade-generated-images.test.mjs), [pixel data](../test/makecode-pixel-image.test.mjs). Missing package art is not invented. | G14, G15 |
| I02 | Literal Image allocations, identity, aliases, independent clone copies and Image-valued parameters/results. | [literal images](../test/makecode-arcade-literal-images.test.mjs), [image parameters](../test/makecode-arcade-image-parameters.test.mjs), [shared images](../test/makecode-arcade-shared-images.test.mjs). | G14, G15 |
| I03 | Image creation/dimensions/pixel reads and writes; supported fill/replace/flip/rectangle/line operations. | [pixel drawing](../test/makecode-arcade-pixel-drawing.test.mjs), [mutation](../test/makecode-arcade-image-mutation.test.mjs). Zero-axis and ordinary sprite scaling have tested runtime/conversion coverage (T13). Viewport-aware sprite rendering is implemented (T14); rotation remains open. | G14, G16 |
| I04 | Opaque/transparent image blits, clipping/self-copy behavior and image pixel overlap. | [blits](../test/makecode-arcade-image-blit.test.mjs), image operator probes. | G16 |
| I05 | Editable shared scene background Images, background color and mutation propagation to renderers. | [backgrounds](../test/makecode-arcade-background-images.test.mjs). Background pixels are distinct from tile layers. | G15, G17 |
| I06 | Shared frame/costume resources and typed Image arrays, with tested allocation/alias rules. | frameImage reporter and image-array tests. Friendly sequence/frame authoring is not implied by converter support. The animation Code/controller browser subset is verified; a visual sequence editor remains open. | G14, G18 |
| I07 | Image arithmetic/comparison and typed reference conversion for tested PXT object semantics. | [image values](../test/makecode-arcade-image-values.test.mjs), dated plan. Resource display IDs must not become operands. | G05, G07 |
| I08 | Existing palette pixel editor: pencil/fill/eraser/pick, transparent color, resize, save/revert and explicit lossy conversion from other costumes. | pixel-art-editor.jsx and costume-tab.jsx. It exists; end-to-end animation/tile workflows still need UI gates. UI resizing currently clamps at 128; pixel decoder accepts some larger assets. | G14, G16, G18 |
| T01 | Literal and supported generated tilemaps with images, indices, exact color-2 wall mask and scale 4/8/16/32. | [tile helper](../overlay/scratch-gui/src/lib/bw-makecode/tilemap-values.js), tile tests. Runtime map data is currently authored in a JSON block field. | G09, G10 |
| T02 | Typed tile locations, aliases, properties, procedure arguments/results and retained locations using current initialized map scale. | Tile tests include fresh identity and scope isolation. | G06, G09 |
| T03 | Real tile replacement, wall mutation, image comparisons, supported placement and map clearing. | Original and executed exported PXT comparisons. Random placement still needs broader stochastic/timing coverage. | G09, G10 |
| T04 | Independent rendered tile layer, mutation rendering, correct ordering/deletion and background preservation on clear. | Built-browser right/A/B test covers placement/change/clear and exact measured stage colors. | G10, G17 |
| T05 | Camera shake/effects, advanced scene APIs and full physics parity remain **unsupported**. | Tilemap imports retain the full-physics/scene-lifecycle diagnostic while these gaps remain. The large shipped tilemap fixture compiles on export; that does not establish behavioral parity. | G09, G10, G19 |
| T06 | Tested tile-wall collision movement and cached directional contact queries, opaque/blank image hitboxes, fixed-point substeps, map boundaries, wall-ghost flags, bounce, DestroyOnWall and clipping recovery. Scales 4/8/16/32 and both axes are tested. | [terrain conversion/PXT regression](../test/makecode-arcade-terrain.test.mjs), [runtime/original PXT probes](../test/makecode-arcade-terrain-runtime.test.mjs), [import tests](../test/makecode-arcade-terrain-import.test.mjs). `isHittingTile` reads actual cached contacts; it is not a nearby-wall geometry query. Remaining movement, scene and scheduling limits are still tracked. | G08, G09, G11, G19 |
| T07 | Registered wall and tile-overlap callbacks, mutable typed Sprite/Location arguments, pixel-equal tile matching, shared per-cell Location identity, matching-handler snapshots, nested registrations and captured cells. Handlers can wait, mutate velocity/kind/flags/maps or destroy sprites before collision handling continues. | [executed original/exported PXT and conversion paths](../test/makecode-arcade-terrain-events.test.mjs), [runtime probes](../test/makecode-arcade-terrain-event-runtime.test.mjs), [import tests](../test/makecode-arcade-terrain-events-import.test.mjs). Explicit movement callbacks may overlap a frame callback, as original PXT permits; exact frame/fiber timing remains outside this subset. Named callback functions and dynamic kinds retain diagnostics. | G06, G09, G11, G19 |
| T08 | Camera center/follow/cancellation and all six camera properties, numeric selectors, map-bound clamping and pixel-floor world-to-stage transforms. RelativeToCamera HUDs ignore drawing offsets; tile layers and speech use them. AutoDestroy and tested opaque StayInScreen constraints use the viewport. | [original/executed exported PXT, Code/SB3/reimport and native dropdowns](../test/makecode-arcade-camera.test.mjs), [runtime/PXT rendering](../test/makecode-arcade-camera-runtime.test.mjs), [import tests](../test/makecode-arcade-camera-import.test.mjs). Original width-based non-square follow Y behavior is retained. World coordinates are not replaced by screen coordinates. Shake/effects, advanced scene APIs and remaining physics stay open. | G08, G09, G11, G19 |
| T09 | Scene push/pop with fresh/restored worlds, scene-bound camera/maps/backgrounds/Info/animations/timers, shared resource references, source-site callbacks and captured cells. Native per-player life/score/presence; scene-local update/interval/button/destroyed/overlap/forever/life-zero/countdown callbacks and global inline push/pop callbacks. | [original/executed exported PXT, Code/SB3/reimport](../test/makecode-arcade-scenes.test.mjs), [runtime/original and scheduling probes](../test/makecode-arcade-scene-runtime.test.mjs), [import tests](../test/makecode-arcade-scenes-import.test.mjs), [four all-path callback cases](../test/makecode-arcade-scene-registrations.test.mjs), [real keyboard/GUI lifecycle](../test/makecode-arcade-keyboard-edges.test.mjs). Named lifecycle callback identity/removal, used oldScene arguments, broader Scene objects, effects and exact overall scheduler/physics parity remain open. See regression/browser evidence for the verified authoring subset. | G06, G08, G09, G11, G19 |
| T10 | Default round-robin multi-sprite motion, fixed-point acceleration/velocity integration (100ms delta cap, speed cap 500), at most 4px substeps, spatial bucket overlap ordering and asynchronous per-pair dispatch locks. Opaque pixel queries use live shared images, including retained suspended/popped sprites; inactive sprites stay outside active simulation. | [runtime/original probes](../test/makecode-arcade-multi-physics-runtime.test.mjs), [executed conversion/PXT/SB3](../test/makecode-arcade-multi-physics.test.mjs), [controller browser](../scripts/verify-arcade-multi-physics-browser.mjs). Friction is implemented (T11); engine steps/speed are implemented (T12); ordinary scaling is implemented (T13); viewport-aware large-scale rendering is implemented (T14); rotation and full scheduling remain open. Original opposing 2px sprites can tunnel; preserve that original limitation. | G08, G11, G19 |
| T11 | Sprite `fx`/`fy` friction: fixed-point defaults/setters, negative clamp before conversion, deceleration toward zero, per-axis acceleration precedence and retained scene resources. Existing property setter/reporter dropdowns expose both properties. | [original/runtime probes](../test/makecode-arcade-friction-runtime.test.mjs), [executed conversion/PXT/SB3](../test/makecode-arcade-friction.test.mjs), [import/diagnostics](../test/makecode-arcade-friction-import.test.mjs), [controller browser](../scripts/verify-arcade-friction-browser.mjs). Numeric procedure returns and single evaluation of compound receivers are verified. PhysicsEngine references/settings are implemented (T12); ordinary scaling is implemented (T13); viewport-aware large-scale rendering is implemented (T14); rotation remains open. | G08, G11, G19 |
| T12 | Tested native Scene/PhysicsEngine references, independent engine membership, factory defaults and fixed-point settings. Existing/new/restored engines retain actual sprite membership. Scene aliases can address suspended scenes. Code/Blocks/export surfaces and typed graph are implemented. | [runtime/original probes](../test/makecode-arcade-engine-runtime.test.mjs), [reference transport/scope](../test/arcade-scene-engine-references.test.mjs), [conversion integration](../test/makecode-arcade-physics-engine.test.mjs), [controller browser runner](../scripts/verify-arcade-physics-engine-browser.mjs). Original/exported PXT, native Code, reimport and SB3 pass across the recorded runs. Standard GUI build and actual controller cap/swap/restore/reset/diagnostic/restart pass: [regression](../test-results/arcade-physics-engine-regression-current.json), [browser](../test-results/arcade-physics-engine-browser-current.json). Advanced engine methods and broader Scene APIs remain named gaps. | G08, G11, G19, G20 |
| T13 | Native sprite `sx`/`sy`/`scale`, uniform/core scale operations and anchor behavior pass runtime and executed conversion gates. Scale affects actual dimensions, rendering, hitboxes and pixel overlap. Rotation remains separate. | Original runtime probes, executed export/reimport/SB3 and Blocks metadata pass. Final standard GUI build and actual Code/Blocks/controller uniform/axis/anchor/zero/reset/restart workflow pass: [regression](../test-results/arcade-scaling-regression-current.json), [browser](../test-results/arcade-scaling-browser-current.json). Real Blocks anchor dropdown shadows preserve Code and executed PXT export. Controller fixture uses authored Image creation/fill and tests uniform/independent-axis/anchored/zero scale. | G08, G11, G14, G16, G19 |
| T14 | Viewport-aware sprite rasterization allocates at most 160×120 source palette pixels and preserves source Images, scale, hitboxes and original huge-dimension position/getter overflow. Movement, camera, RelativeToCamera, mutation and restored scenes refresh actual cropped skins. | [14 original full-screen cases](../test/makecode-arcade-viewport-scaling-runtime.test.mjs), [renderer/camera/lifecycle tests](../test/makecode-arcade-viewport-scaling-renderer.test.mjs), [regression](../test-results/arcade-viewport-regression-current.json), [actual huge-sprite controller](../test-results/arcade-viewport-browser-current.json). Standard GUI build, ordinary controller regression and all four scaling Code/export/SB3/dropdown cases pass. Rotation remains separate. | G08, G11, G14, G16, G19 |
| N01 | Legacy animation objects and modern image playback: creation, frame addition, attachment, action selection, image/action/interval getters, interval setter, shared Image-array playback and stop modes. Animation references propagate through globals, locals, procedure signatures/results and arrays. | [executed conversion regression](../test/makecode-arcade-animation.test.mjs), [runtime/PXT comparisons](../test/makecode-arcade-animation-runtime.test.mjs), [defaults/enums](../test/makecode-arcade-animation-defaults.test.mjs). Real PXT compilation/execution passes; legacy dependency is preserved. Modern 2–4 argument calls and exact stop enum names are supported. Movement/path animation, scene-stack animation state and direct legacy internal fields remain unsupported. | G06, G18, G24 |

### Terrain event editor handoff

Native commands register wall/tile handlers by token and capture name list;
matching hats run their bodies. `arcade_eventSprite` (`first`) supplies the Sprite
and `arcade_eventLocation` supplies the typed Location. Code exposes
`arcade register wall kind (…) as (…) capturing (…)`,
`arcade register tile kind (…) image (…) as (…) capturing (…)`,
`WHEN arcade wall handler "…" runs:` and
`WHEN arcade tile handler "…" runs:`. Import initializes callback parameters as
mutable local cells; a GUI must preserve those bindings and registration order.

The built-browser fixture verifies those commands/hats through the visible Code
editor and controller. G09 remains open for approachable direct block authoring:
help users pair registrations with handler bodies and pick event resources;
preserve captures instead of requiring users to understand internal cell IDs.
Remaining camera effects/scene/full-physics limits remain G19; map painting and asset bindings
remain G10.

### Animation editor handoff

The current block/Code/runtime bridge has these opcodes. Their conversion and
runtime subset has passing executed PXT evidence. Visual sequencing/editor
workflows still require G18's authoring and graphics gates:

| Opcode | Intended authoring control |
|---|---|
| `arcade_createAnimation` | Action and interval; returns an Animation reference. |
| `arcade_addAnimationFrame` | Animation reference and Image frame. |
| `arcade_attachAnimation` | Sprite instance and Animation reference. |
| `arcade_setAnimationAction` | Sprite instance and action value. |
| `arcade_animationProperty` | Image/action/interval getter on an Animation reference. |
| `arcade_setAnimationInterval` | Animation reference and interval. |
| `arcade_runImageAnimation` | Sprite instance, shared Image array, interval and loop flag. |
| `arcade_stopAnimation` | Sprite instance and All/Image/Movement stop mode. |

Legacy animation objects preserve aliases and frame Image identity. Modern image
playback uses an actual shared Image array. An Animation is a typed runtime
reference, not an asset name, sprite, number or copied frame list. GUI sequencing
must use this model and preserve aliases through procedures and save/restart.

## 8. Ordinary MakeCode, Calliope and Scratch/TurboWarp

| ID | Implemented subset | Boundary / evidence | GUI work |
|---|---|---|---|
| M01 | micro:bit/Calliope LED patterns, icons/arrows, numbers/text/clear, supported display controls and images-as-pattern values. | [micro:bit runs](../test/makecode-microbit-runs.test.mjs), [Calliope](../test/makecode-calliope.test.mjs). Runtime-selected image patterns and some options have diagnostics. | G21, G23 |
| M02 | Supported button/gesture/pin events, sensors, digital/analog I/O, servos and pull modes. | [pin bridge](../test/makecode-pin-bridge.test.mjs), [board tests](../test/makecode-boards.test.mjs). Hardware/simulator differences remain explicit. | G21, G23 |
| M03 | Supported radio group/power/send/receive forms and packet destructuring; scalar loops/arrays/bit operations. | Calliope/parser/base regressions. Not all package-specific radio or callback APIs are supported. | G21 |
| M04 | Supported tone/rest/sound-stop and game/score/forever/background forms. | microbit translator/exporter. Full audio timing and Arcade music are separate gaps. | G12, G22 |
| W01 | Scratch/TurboWarp SB3 inspection/import/runtime auditing, asset/opcode/extension/mode reports and conversion permutations. | [TurboWarp audit](generated/TURBOWARP-VM-COMPAT-AUDIT.md). Standard SB3 compatibility is not arbitrary external-extension compatibility. | G02, G04, G25 |
| W02 | Offline encoding extension compatibility and thread/runtime temporary-variable extension behavior. | [encoding](../test/turbowarp-encoding.test.mjs), [temp vars](../test/turbowarp-tempvars.test.mjs). These are specific supported extensions, not all TurboWarp APIs. | G27 |
| W03 | Unsupported external extensions, `procedures_return` and other opcode/runtime limits are retained in reports. | Audit snapshots can age; rerun the current corpus before claiming a gap closed. Missing TurboWarp features require the agreed cleanroom approach, not copying its implementation. | G25, G27 |

## 9. GUI gap backlog for parallel agents

The tasks below cover all three user-facing editors. They distinguish confirmed
missing pieces from workflows that need an evidence-based audit. Complete them
as feature slices, rather than adding controls whose runtime semantics are absent.

| ID | Editor / priority | Task and current evidence | Required acceptance check |
|---|---|---|---|
| G01 | Import / P1 | Audit discoverability and consistent file/share import handling for every supported container and extracted Python. | Import representative real files through UI; target/assets/diagnostics are visible and reopening offline works where applicable. |
| G02 | All / P0 | Make partial conversion results actionable: affected API/block/source location, missing asset/package and runtime vs compile failure. Existing CLI reports are the basis; Blocks → Code now counts indented unsupported comments and lists their actual messages. Inspect source locations, affected operations and remaining UI completeness. | Each retained diagnostic can be reached from the editor; no unsupported feature silently becomes zero/empty/default. |
| G03 | Code / P0 | Audit parser/decompiler coverage against every implemented native opcode; clarify generated locals/helpers and safe edits. | Edit nested/escaped/resource Code, convert to Blocks and back without changed meaning; errors identify the actual line. |
| G04 | All / P0 | Verify save/import/export/permutation flows preserve metadata and assets, not just text/block shape. | Save/reopen SB3, Code↔Blocks, MakeCode export/reimport; show actual differences and retained asset losses. |
| G05 | Blocks + Code / P1 | Audit accessible true/false/null/undefined/nonfinite literals, lazy expressions, native arithmetic and compound/update forms. | Author coercion/evaluation-order fixtures through both editors and match original PXT; no string/number drift. |
| G06 | Blocks + Code / P1 | Audit procedure return types, local/optional/default arguments, resource parameters, captures, namespace/enum presentation. | Author caller/helper/callback programs; invoke twice with distinct objects; Code/SB3/PXT preserve identity/defaults. |
| G07 | Blocks / P1 | Audit reference/named/nested array authoring, readable value displays and element typing; hide transport-chain mechanics only with genuine structured controls. | Author nested Image/Sprite/location arrays, mutate aliases, read missing values and roundtrip without JSON-string substitutes. |
| G08 | Blocks + graphics / P1 | Audit sprite template/instance selection, constructor vs spawn, kinds, flags, property groups, lifetimes and collection operations. | Create two instances, steer one, re-kind/destroy it, verify old array refs; edits and export keep correct identity. |
| G09 | Blocks + Code / P1 | Audit tile location/map/wall APIs and supported operation discovery. Wall contact query and tested collision movement exist; registered terrain event blocks, typed event-location reporters and scene-bound callbacks exist; audit discoverability and ordinary authoring alongside imported scripts. | Author the completed tile-data fixture in editors; verify dimensions/scale/walls/placement and retained terrain warning. |
| G10 | Graphics / P0 | **Dedicated visual tilemap editor is missing.** Replace the raw-JSON-only authoring workflow with grid, tileset selection, wall painting, map size/scale and asset bindings. | Draw a map and walls, alter a tile, run, save/SB3, export/import into MakeCode with identical pixels/indices/walls/scale. |
| G11 | Blocks + stage/controller / P1 | Controller-driven fast crossing/reset and sparse-pixel overlap queries are browser-verified (T10). Engine speed caps, replacement/restoration, reset and runtime diagnostics are browser-verified (T12). Ordinary uniform/axis/anchor/zero scaling and restart are browser-verified (T13). Audit controls, bindings, score/life/countdown and device selection across authoring modes and touch/keyboard input. | Build a game through UI and steer it with widgets/controller pane; verify axes/rebindings/buttons and stage transforms. |
| G12 | Blocks + Code / P1 | Audit timed update/interval/forever/parallel authoring and lifecycle visualization. | Real fibers/callbacks complete correctly; no frozen timers or test-only runtime. |
| G13 | Blocks + stage / P2 | Audit question/dialog/speech/log APIs, supported options and controller dismissal. | Render and dismiss through UI; preserve text/Unicode/waiting behavior through export. |
| G14 | Graphics / P1 | Audit asset target/frame/costume selection and palette editing of native Image resources. Existing palette editor is present; do not recreate it. | Paint existing imported art, save and compare pixel-exact Code/SB3/PXT export/reimport. |
| G15 | Graphics + Blocks / P1 | Audit shared vs cloned image selection, background image authoring and live mutation/edit synchronization. Runtime frameImage caches decoded assets; editor-driven invalidation requires investigation. | Two consumers share/clone art as intended; edit selected costume and verify restart/live preview behavior explicitly. |
| G16 | Graphics / P1 | Audit size limits, transparent art, resize/flip/drawing tools and lossy conversion workflow. Current editor resize cap 128 is a confirmed limit. | Preserve original palette pixels/scale/center, make larger supported assets editable, and never silently quantize/resize unsupported art. Viewport-aware extreme-scale sprite rendering is tested (T14). |
| G17 | Graphics + stage / P1 | Audit layer order, background/tile editing and disposal/reload. Recent finite-order fix is covered by controller B clear. | Change backgrounds after loading map, clear/reload maps/projects repeatedly without covering tiles or stale drawables. |
| G18 | Graphics + Blocks + Code / P0 | **Animation authoring and sequencing require explicit work.** Audit existing costume list, then add/select frames, interval/loop/action binding, playback preview and frame-to-block bindings. Runtime/converter animation subset has executed PXT tests, and visible Code → Blocks → controller playback/stop → Code is browser-verified; visual sequencing remains open. | Create an animation through GUI, change a frame, run it, pause/restart/stop, save/SB3, export into MakeCode and compare playback/data. |
| G19 | Stage + Blocks / P0 dependency | Build on tested wall-collision/contact and registered wall/tile callbacks: camera transforms and tested viewport behavior are implemented; scene push/pop and scene-bound callbacks/Info are implemented; default round-robin motion/substep overlap and retained live-pixel queries are tested (T10); friction properties/default motion are implemented (T11); typed PhysicsEngine references/configurable settings and actual membership swaps are tested (T12); ordinary scaling and scaled wall/overlap geometry are tested (T13); viewport-aware large-scale sprite rendering is tested (T14); finish rotation, camera effects and advanced scene APIs before advertising full tile-game authoring. Add approachable scene navigation, per-player Info selectors and callback authoring to the existing low-level token/capture blocks. Expose those controls only with real semantics. | Original-simulator collision/event/camera probes plus user-authored browser game; keep diagnostics until then. |
| G20 | Watchers/inspectors / P2 | Audit readable display of references, arrays, null/undefined and nonfinite values; avoid exposing scoped IDs as values. | Inspector remains understandable without changing equality or serialized values. |
| G21 | Blocks + Code / P1 | Audit micro:bit/Calliope mappings and editor palettes against supported API subsets, including German identifiers and radio packets. | Real public examples through UI, simulator and export; unsupported hardware/package forms stay visible. |
| G22 | Blocks + sound / P2 | Separate ordinary MakeCode tone support from missing Arcade music/effects/sequencing; inventory audio editor/runtime dependencies. | Runtime and original PXT match meaningful audio state/timing before new UI claims support. |
| G23 | Devices / P2 | Audit simulator/board/target capabilities, pins and hardware deployment choices. | Correct target/runtime selection; source translation, simulation and physical firmware deployment are clearly distinguished. |
| G24 | Export / P1 | Audit source-only vs firmware export and package/dependency preservation, especially legacy animation. | MakeCode opens the project with correct package/art; physical output uses a compatible synced board and real compile diagnostics. |
| G25 | All / P0 | Link corpus coverage and regression results to the UI worklist. Structural preservation must not become a green “fully supported” label. | Keep parse/import/compile/execution/render/editor evidence separate and reproducible. |
| G26 | Code + Blocks / P1 dependency | Numeric enums and safe qualified namespaces: provide editable presentation without leaking renamed synthetic internals unnecessarily. | Shadowing/private/exported bindings, initialization order and procedures retain source semantics across editors/export. |
| G27 | Blocks + Code / P2 | Audit supported TurboWarp compatibility-extension palettes and reporter/procedure mode diagnostics. | Authored offline examples run and roundtrip; unsupported external code is neither silently fetched nor called compatible. |

### Suggested agent assignments

- **Blocks/Code agent:** G02–G09, G11–G13, G20–G21, G24, G26–G27.
- **Graphics agent:** G10, G14–G18, with runtime owner coordination for asset
  identity/cache invalidation and animation/tile bindings.
- **Browser/regression agent:** G01, G04, G11, G17, G23, G25 and each feature's
  acceptance fixture. Coordinate builds; do not modify runtime to make tests pass.

Assign specific files before parallel edits. The Code/Blocks parser and Arcade
import/export files are shared bottlenecks; independent agents should not edit
those simultaneously without an explicit split.

## 10. Required verification and remaining limitations

A completed GUI feature needs all applicable gates:

1. Create it through the visible editor; no direct VM injection as the only
   authoring evidence.
2. Run its actual blocks and graphics in the built app and steer it through real
   UI controls where relevant.
3. Save/reopen SB3 and switch Code ↔ Blocks.
4. Export genuine PXT APIs/art/dependencies, compile with the original target,
   execute meaningful behavior, reimport and compare.
5. Reaudit known sources and conversion permutations; preserve earlier successes.

The original-simulator helper is [pxt-arcade-runtime.mjs](../test/helpers/pxt-arcade-runtime.mjs).
Its optional completion value waits for actual asynchronous exported startup;
it does not make timing, physics or fibers fake. Original dependency manifests
matter: default device-only compilation is insufficient for some legacy APIs.

Open underlying compatibility work includes remaining terrain physics/camera effects/advanced scene APIs, remaining namespace
forms and remaining animation modes/advanced scene APIs, general closures/higher-order functions, some expression
updates, native Math NaN coercion, dynamic kinds/maps, scaling/zero-size images,
precise physics/scheduling/audio/effects, external packages and binary artwork in
text-only permutations. GUI agents should record blocked tasks against these
capability dependencies rather than hide them with disabled/default behavior.

The `.sb3` → plain text path still loses binary artwork in the current corpus
report. Standard SB3 load/save, an asset-bearing Code workflow and a plain text
conversion are different operations. Do not equate their outcomes.

## 11. Update log

- 2026-10-02: created this consolidated inventory from source/tests and the
  completed compatibility slices. Recorded animation as in progress and namespace/numeric-enum subsets with
  passing original/exported-PXT evidence. Added explicit, assignable GUI backlog across Blocks, Code, graphics,
  stage/controllers, import/export and verification.

- 2026-10-02: animation export now preserves typed globals/locals/arrays and
  procedure signatures/results with legacy package dependencies. Recorded passing
  original/exported PXT execution, modern optional arguments and stop enums, and
  controller-driven browser authoring. Shipped-game compiler gate now passes.
  Fresh corpus: 89 translated / 94 partial / 1 parse failure; 309 named gaps;
  82 preserved MakeCode roundtrips, with no previously preserved path regressing.

- 2026-10-02: added T06 for tested tile-wall collisions and directional contact
  queries, including import/Code/Blocks/export and original-simulator evidence.
  G09/G19 now separate implemented wall movement/contact from missing terrain
  callbacks, cameras and full physics parity. Fresh named gaps: 308; partial
  imports remain 94 and all previously preserved roundtrip paths are retained.

- 2026-10-02: added T07 for real registered wall/tile callbacks and typed event
  locations, mutation/yield/capture semantics and original/exported PXT evidence.
  Visible Code/Blocks authoring and controller-driven wall/tile callbacks pass in
  the built GUI. G09/G19 retain camera/scene/full-physics and authoring discovery
  work. Fresh gap occurrences decrease 308 → 304; partial imports remain 94.
  All previously preserved roundtrip paths remain preserved.

- 2026-10-02: added T08 for camera center/follow/properties, original map clamps,
  pixel projection, camera-relative HUDs and viewport lifecycle constraints.
  Original/exported PXT, Code/SB3 and native dropdown tests pass; built-browser
  controller follow/center/reset verifies world positions and rendered sprite,
  HUD and tile pixels. The warning now names full physics and scene lifecycle;
  camera shake/effects remain explicit. Fresh gap occurrences: 304 → 300;
  partial apps remain 94; preserved roundtrip paths do not regress.


- 2026-10-02: added T09 for scene push/pop, scene-bound worlds/Info/animations/
  callbacks/timers, shared live resources and native player1–4 score/life/presence.
  Original/executed exported PXT, Code/SB3/reimport and registered-callback tests
  pass. Built-browser repeated push/pop verifies exact parent/child sprite pixels,
  paused/resumed updates, shared physical input, restored score/life and Code.
  Fixed missed short taps, A/B mapping, scene state publication and repeated-hat
  suppression. Blocks → Code now visibly retains named indented diagnostics.
  Fresh corpus remains 89 translated / 94 partial / 1 parse failure, 300 gap
  occurrences; all 170 previously preserved paths remain. Named lifecycle
  identity/removal, Scene references, effects and full physics stay open, along
  with dedicated tilemap painting, animation sequencing and simpler GUI authoring.

- 2026-10-02: added T10 for original-compared round-robin multi-sprite motion,
  substep overlap/handler ordering and default fixed-point integration. Retained
  sprite queries now read current shared pixels even in suspended/popped scenes.
  Four authored cases pass original/native/Code/exported PXT/reimport/SB3 paths
  across two runs; built-browser controller fast crossings/reset and transparent
  pixel queries pass. Corpus remains 89 translated / 94 partial / 1 failure,
  300 gap occurrences, all 170 previously preserved paths retained. Friction,
  scale/rotation, configurable engine settings and exact overall scheduling stay
  open. G10 tilemap painting and G18 visual animation sequencing remain open.

- 2026-10-02: added T11 per-axis Sprite friction and existing Blocks property
  menu exposure. Original fixed-point/clamp/acceleration/overflow/scene tests,
  Code/export/reimport/SB3 behavior and numeric return signatures pass. Actual
  built-controller repeated horizontal/vertical launch/stop/reset verifies art
  and Code roundtrip. Fixed a PROPERTY-field inference bug without weakening
  its test. Unsupported PhysicsEngine/Scene setting references now retain named
  diagnostics through aliases, arrays and procedures. Corpus remains 89/94/1,
  300 gap occurrences and all 170 preserved paths retained. Next runtime work
  requires genuine engine references/settings/replacement semantics. G10 and
  G18 dedicated graphics editors remain open.

### T12 browser asset handoff finding

Pasting `arcadeToPseudocode(source).code` into Code alone does not import its
literal-image assets. The initial engine fixture consequently displayed
placeholder costumes instead of its 6×6 palette art. G14/G15 must cover a
complete Code asset handoff and report missing bindings. The final engine
controller fixture uses authored `image.create`/`fill` operations; its exact
324-pixel assertions pass without injected assets. This verifies engine
controls, not closure of the literal-art handoff gap.

### T13 extreme-scale rendering boundary — closed for sprites by T14

Original-compared hitbox overflow probes cover large scalar scales without
allocating a scaled GUI bitmap. T13 rendering rasterized the whole scaled
image before viewport clipping. T14 replaces that path with bounded raster
windows and original full-screen pixel comparisons, then verifies large sprites
in the real GUI. T13 scalar probes alone did not establish GUI fidelity; the
additional T14 gates do. Rotation and other graphics authoring gaps remain open.

### T14 GUI handoff

No new scale syntax or duplicate editor was required. Existing Code/Blocks scale,
edge-property, camera and flag operations now run without whole-scaled-image
allocation. The controller fixture authors a four-pixel Image and scales it to
32768×32768 logical pixels, then pans it and changes camera/RelativeToCamera.
Actual renderer skin dimensions stay 640×480 SVG units (160×120 palette pixels).
G11 gains that verified subset; G10 visual tilemap painting, G18 animation
sequencing and G14/G15 Code-only literal-art handoff remain open. Large geometry
center reporters/setPosition retain original Fx.div overflow; use left/top to
place large art intentionally, as in the tested fixture.
