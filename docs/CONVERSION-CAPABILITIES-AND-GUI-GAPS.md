# Conversion capabilities and GUI closure ledger

Reviewed 2026-10-07 against Lite main
[`168457065`](https://github.com/CrispStrobe/brickwright-lite/commit/16845706545b115b76dd04f391cdebb1c3204e4c).
The Arcade integration claim in [LANES.md](../LANES.md) owns this handoff.
The previous agent is paused; its preserved branch is an integration input,
not a second active owner. SPIKE G01, CPU and hardware ownership remain separate.

## Evidence rules

**Present** means inspected source contains the capability. A named test below
means an existing regression, not a fresh successful run at this head.
**Pending branch** means outside reviewed main and awaiting qualification.
Missing authoring controls and missing browser evidence are different gaps.

Track five independent results per feature: import diagnostics, Blocks/Code
roundtrip, runtime behaviour, original MakeCode compilation/behaviour, and user
authoring/save/reopen. Record exact source and dependency pins. Translation or
compiler acceptance alone does not establish full compatibility.

## Existing ownership and routes

- Import/export: `overlay/scratch-gui/src/lib/bw-makecode/` contains
  `arcade-translate.js`, `export-arcade.js`, `arcade-runtime.js` and asset helpers.
  The translator returns code **and** costumes/sprites; `index.js` preserves them.
- Blocks/runtime: `overlay/scratch-vm/src/extensions/crispstrobe/arcade/index.js`
  defines actual blocks, menus and execution, with image/speech helper modules.
- Code words: `overlay/scratch-gui/src/lib/arcadeDialect.js` is bidirectional.
  Parser changes belonging to sb3-creator land upstream first, then receive an
  explicit Lite pin adoption. Reviewed main pins sb3-creator
  `85973b6a10fcd546b489e2bc441dc217a97436f4` in `vendor-pins.json`.
- File/share import UI: `overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx`
  stages imported costumes in `uploads`; **To blocks** applies them to parsed
  sprites. Whole-project import already carries assets. Pasting only `.code`
  from the translator omits its separate assets.
- Graphics: `overlay/scratch-gui/src/containers/costume-tab.jsx` switches Paint
  and Pixel editors. `components/tw-pseudocode/pixel-art-editor.jsx`,
  `lib/bw-pixel-layers.js` and `lib/bw-makecode/pixel-image.js` under the same
  GUI source root own indexed art UI/data. Inspect artwork archive modules too.
- Scratch Paint baseline is **2.2.518**, from `scripts/vendor.mjs` and
  `packages/scratch-gui/package.json`; its enhancements live in
  `overlay/scratch-paint/`. Do not duplicate existing tools or replace that
  editor. This baseline is separate from `vendor-pins.json` SHA dependencies.
- Device input: `overlay/scratch-gui/src/components/tw-pseudocode/arcade-device-pane.jsx`
  exposes d-pad, A/B and Start/Select. The Code pane has **Run as Arcade** and
  export actions. Native-target and installed-package execution remain separate
  qualification boundaries. Follow current tracked-file and mirror ownership.

## Capability matrix

Test suffixes beginning with `-` expand to
`test/makecode-arcade<suffix>.test.mjs`. Other tests are under `test/`,
verification scripts under `scripts/`. These pointers do not claim fresh passes.

| ID / capability | Blocks and Code | Graphics / runtime / export | Existing evidence; remaining GUI work |
| --- | --- | --- | --- |
| C01 Values and arrays | Present: Boolean/value operators, undefined/null, legacy named and shared reference arrays | Identity and typed array export present | `-reference-arrays`, `-named-arrays`, `-array-coercion`, `-value-arithmetic`, `bw-sb3-values`. Author nested Sprite/Image arrays, mutate, switch editors and reopen; distinguish preserved values from dead run-bound references. |
| C02 Sprites/projectiles | Present: handles, kinds, creation/destruction, source projectiles, aliases/collections/procedures | Image templates and native execution/export present | `-sprite-collections`, `-projectile-source`, `-local-projectiles`, `-created-order`, `-destroyed`. Need approachable image/kind/reference selection and authored lifecycle browser proof. |
| C03 Properties/flags/scaling | Present: property/flag blocks, axes/anchors/proportional inputs | Fixed-point geometry, viewport crop and export present | `-sprite-fixed-point`, `-flags`, `-scaling`, `-viewport-scaling-runtime`, `-viewport-scaling-renderer`. Prove actual menu use, fractional/zero/nonuniform scale, camera movement and save/export/reimport. |
| C04 Rotation/sprite data | Pending F4 adds rotation/rotationDegrees/data to property menu; main dialect lacks those words | Pending rotated bbox/raster/scaled overlaps and import/export mappings | Branch `makecode-arcade-rotation.test.mjs`. Qualify dialect adoption, data types, walls/anchors/large viewport and actual UI authoring. Artwork quarter turns are already a separate editor feature. |
| C05 Images/shared resources | Present: create/clone, dimensions/pixels, drawing/blit/mutation, sprite/background image refs | Shared identity, generated images, parameters and export present | `-image-values`, `-shared-images`, `-image-parameters`, `-generated-images`, `-image-blit`, `-image-mutation`, `-pixel-drawing`. Need source/render transaction and alias invalidation proof after editor changes. |
| C06 Literal/gallery artwork | Import returns assets alongside code; frame-image blocks reference templates | SVG costume assets, built-ins and image literal export present | `-literal-images`, `-generated-sources`, `-background-images`. Whole-file asset staging exists; verify it in browser and add an explicit Code-plus-assets path instead of silently substituting art. |
| C07 Pixel/palette/layers | Existing Costumes Pixel editor | Indexed tools, selections, layers/opacity/locking, custom/preset palettes, PNG/sheets and palette-aware export present | `makecode-pixel-image`, `pixel-layers`, `verify-pixel-source-roundtrip`, `verify-pixel-colour-slots`, `verify-pixel-crop`. Need authored game's exact pixel/palette/export proof. Current editor dimensions cap at128×128. |
| C08 Tilemaps/locations | Present map data, locations/images/walls, placement/type queries and terrain callbacks | Decoder preserves indices/walls/tile size; collision/export present | `-tile-data`, `-terrain`, `-terrain-events` and import/runtime variants. **Dedicated tilemap painter missing:** raw data blocks are not usable visual map authoring. Add tile/wall layers, map asset picker and scale-aware editing. |
| C09 Animations | Present handles/actions, frames/intervals, image-animation and stop blocks | Runtime/export present. Pixel editor already has timeline/durations/reorder/thumbnails/playback/onion skin, sheet routes and frames-as-costumes | `-animation`, `-animation-runtime`, `-animation-defaults`, `pixel-layers`. Need binding edited frames/durations to Animation/Image[] and actions, with actual game playback/export. Graphics preview alone is insufficient. |
| C10 Scenes/camera/physics | Present scene refs/push/pop, camera center/follow/property and physics resource creation/replacement/properties | Scene state, terrain, friction and export present | `-scenes`, `-scene-registrations`, `-camera`, `-physics-engine`, `-multi-physics`, `-friction`. Need resource selection/navigation and browser restoration proof. Broader engine methods/scheduling need separate measured census. |
| C11 Events/procedures/locals | Present update/interval/forever/button/lifecycle/overlap/terrain/scene/Info handlers, locals/returns/captures | Registration-site capture and typed procedure export present | `-locals`, `-function-returns`, `-lazy-values`, `-created-registration`, `-scene-registrations`, `-terrain-events`. Raw tokens/capture inputs need discoverable callback creation/navigation and validation. |
| C12 Info/text/dialogs | Present players1–4 score/life, countdown/game-over, speech/splash/long text/questions | Native speech/fonts and dialog export present | `-say-text`, `-sprite-text`, `-splash`, `-ask`, `-life-zero`. Prove expression editing, player selection, blocking interaction and restart. |
| C13 Controller | Present button hats/predicates, control bindings and device buttons | Keyboard-edge and binding execution present | `-controller-bindings`, `-controller-step`, `-keyboard-edges`, `-controls`, `-runs`. Drive authored games through real widgets/keyboard; cancel/focus/Stop/restart must release held inputs. |
| C14 Scratch→Arcade constructs | Existing broadcasts, costumes/backdrops, clones, lists, pen, stop and music authoring | Export maps these via helpers; sampled audio, mouse, some effects/instruments, clone-local lists and unsupported flags retain named limits | `makecode-export-arcade-constructs`, `makecode-export-arcade`; [export matrix](ARCADE-COMPAT-PLAN.md). Show actionable refusals/warnings with affected construct/location before export. |
| C16 Namespaces/enums and evaluation order | Present converter binding/type/lazy-value machinery, but user presentation needs audit | Preserve qualified/exported/private/shadowed bindings, numeric enums, initialization order, optional/default arguments and single evaluation through export | `makecode-namespace-bindings`, `-namespace-runtime`, `-optional-procedure`, `-lazy-values`. Author and rename scoped values without leaking generated internals or changing identity/order. |
| C17 Timing and audio | Update/interval/forever and sound controls exist | Full frame/fiber scheduling and richer Arcade music/effects remain independent gaps | `-update`, `-interval`, `-forever`, export construct tests. Audit waiting/parallel lifecycle and meaningful audio timing against PXT; do not infer full music parity from steady tones. |
| C18 Inspectors and export choices | Watchers, value display and export affordances require audit | Resource IDs must not replace operands; source/package export differs from native firmware output | Test understandable arrays/references/null/nonfinite display without changed equality/serialization. Preserve dependencies/artwork and exact board/runtime selection; physical qualification stays separate. |
| C15 Other targets/TurboWarp | Target routes and diagnostics exist; not an Arcade parity claim | micro:bit, EV3, native targets and TurboWarp have different APIs and qualification | [MakeCode guide](MAKECODE.md), [census](generated/MAKECODE-CENSUS.md), target-specific tests. Keep target counts separate; clean-room TurboWarp additions need their own provenance and behaviour evidence. |

## Pending work and stale statements

The paused checkpoint
[`9fba4739d`](https://github.com/CrispStrobe/brickwright-lite/commit/9fba4739d3549780e01cd9dc111b73fc9d826f54)
contains F4 rotation/data. Preserve its history/failures; it is not reviewed main
or proof of GUI/shipped-package completion. Review associated sb3-creator branch
`feat/arcade-rotation-data-properties` before qualified exact-pin adoption.

- “No animation editor” is false for artwork: the Pixel editor has one. Runtime
  binding and timing preservation are the remaining user journey.
- [COSTUME-EDITOR-PLAN.md](COSTUME-EDITOR-PLAN.md) calls frames-as-costumes future
  work, but main already has `exportFramesAsCostumes()` and its visible button.
  Browser persistence and game integration still need evidence.
- Whole-file import stages literal assets; Code-only paste is a separate case.
- Historical real-app partial counts and test-derived242/244 compiler results
  are different measurements; neither establishes today's complete census.

## Ordered closure lanes and acceptance checks

### U01 — baseline and truthful diagnostics

After integration run the locked real-app census against exact pins. Separate
intentional unsupported tests from real programs. List every named gap,
affected app, diagnostic, runtime/export failure and roundtrip permutation.
Preserve original failures and compare identical inputs. User diagnostics should
identify construct, reason and location where available. Refusal is never full.

### U02 — asset-aware Code/graphics handoff

Use real controls to import literal images, backdrop and shared Image; switch
Code→Blocks→Code, edit a pixel/palette colour, save SB3, reopen, export Arcade,
run in MakeCode and reimport. Assert identity and exact palette pixels. Repeat
file/share import and an explicit Code-plus-assets path. Plain text alone must
name absent assets. Reuse artwork source/archive models and atomic rendering.

### U03 — tilemap authoring

Create two tiles in the Pixel editor, paint a map/walls, choose tile size, place
a player/camera and steer into walls/overlap tiles. Undo/redo, rename a tile,
save/reopen, export/run in MakeCode and reimport both layers. Internal JSON
injection does not count as creating a map through the GUI.

### U04 — animation binding

Create three frames in the existing editor, set durations, duplicate/reorder,
bind to a sprite/action, trigger/stop/restart with buttons and save/reopen.
Export/reimport must preserve palette, frames, loop/action and supported timing.
If variable durations require a runtime sequence, implement it explicitly rather
than flattening timings. Include sheet and frames-as-costumes journeys.

### U05 — rotation/data/resources/callbacks

After F4 integration select radians/degrees/data through real block menus and
roundtrip Code without coercion. Compare asymmetric scaled art, collision,
camera and aliasing against PXT. Author scene/physics references and captured
callbacks through usable controls; rename, switch scenes, Stop/restart and
save/export/reimport. Internal block construction alone is insufficient.

### U06 — complete authored game

Build entirely in Lite: editable map/walls, animated player, rotating hazard,
projectile, score/life, two scenes and sound. Drive actual controller widgets in
Playwright, assert pixels/state, save/reopen, export/run in MakeCode, reimport
and repeat. Include touch viewport; qualify native packages/devices separately.
Rerun the real-app census and report exactly which partials became full.

Prioritize families by affected real apps and shared dependencies. Close each
with minimal regression, implementation, original comparison, roundtrips and
browser authoring proof. Assign disjoint files under the integration claim and
refresh remote ownership before each implementation slice.

## Historical GUI checklist cross-reference

The earlier handoff used G01–G27. Preserve those identifiers in existing issues;
U01–U06 above are delivery groups, not renumbered versions of those issues.
This cross-reference prevents details from disappearing during reconciliation.

| Earlier IDs | Current family / delivery |
| --- | --- |
| G01 import discovery; G02 actionable diagnostics; G03 dialect audit; G04 permutations | C06, U01–U02; parser/source-location and offline reopen checks |
| G05 values; G06 procedures/captures; G07 arrays; G26 namespaces/enums | C01, C11, C16, U05 |
| G08 sprite identity; G09 terrain APIs; G10 tilemap painter | C02–C04, C08, U03/U05 |
| G11 controller; G12 timing; G13 text/dialogs | C12–C13, C17, U06 |
| G14 asset selection; G15 image aliases; G16 size/transparency/tools | C05–C07, U02; retain128×128 editor limit audit |
| G17 layer/disposal; G18 animation binding; G19 scene/physics authoring | C08–C10, U03–U06; repeat clear/reload without stale drawables |
| G20 readable inspectors; G22 audio; G23 target selection; G24 export dependencies | C17–C18; separate source, simulation, firmware and physical evidence |
| G21 micro:bit/Calliope; G27 TurboWarp; G25 coverage linkage | C15, U01/U06; target-specific real examples and truthful diagnostics |
