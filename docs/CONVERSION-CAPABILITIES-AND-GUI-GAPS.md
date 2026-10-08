# Conversion capabilities and GUI closure ledger

Baseline reviewed 2026-10-07 against Lite main
[`168457065`](https://github.com/CrispStrobe/brickwright-lite/commit/16845706545b115b76dd04f391cdebb1c3204e4c).
The Arcade integration claim in [LANES.md](../LANES.md) owns this handoff.
The previous agent is paused; its preserved branch is an integration input,
not a second active owner. SPIKE G01, CPU and hardware ownership remain separate.

## Latest finite Arcade checkpoint — 2026-10-08

At `bffd43641903dc037010aac1dcfeb5c9830a469e`, the same184 pinned inputs
measure **93 translated /90 partial /1 malformed** in the import-only pass.
The clean pre-change source measured91/92/1; the earlier90/93/1 figures below
are historical. Two apps lost their sole refusal after statement-form projectile
creation was implemented. Both compile in original PXT and step without block
errors. With original compilation enabled, the audit records86 translated,
44 partial,53 original-compiler failures and1 malformed. Runtime smoke remains
127 stepped /3 without green-flag threads /0 block errors over24 frames.
Neither translation nor this smoke establishes complete gameplay equivalence.

`createProjectile`, `createProjectileFromSide` and `createProjectileFromSprite`
now execute even when source ignores their returned handle. Imported Blocks
consume the existing creation reporter in a collision-safe generated variable;
users can edit its ordinary native inputs. Callbacks and native sprite identity
are retained. No new shared compiler/runtime opcode or root dependency pin is
required. Existing Code/Blocks creation reporters remain the authoring route.
The actual native-file importer, To Blocks, real controller B and visible
projectile check pass, alongside the12 rotation phases. See the
[receipt](receipts/2026-10-08-arcade-discarded-projectiles.json) and refreshed
[case ranking](generated/ARCADE-COMPAT-AUDIT.md).

### Bulk sprite destruction — 2026-10-08

One-argument `sprites.destroyAllSpritesOfKind(SpriteKind.<member>)` imports
as a fresh kind array and an ordinary native loop destroying each handle.
Custom kinds, callbacks, surviving sprites created by callbacks, retained dead
references, repeat destruction and empty collections are tested against the
original pinned PXT simulator. Code/Blocks decompilation, native export and
reimport, and SB3 save/restart preserve the tested results. The affected
regression batch passes25 tests without skips.

GUI authoring uses the existing sprite-kind array reporter, array iteration
and sprite destruction commands. No new compiler/runtime opcode or graphics
resource is required. The mandatory rotation browser gate now includes a
native project import → Code → To Blocks → controller A/B destruction journey. Effects and
duration arguments, and dynamic kind queries, remain named unsupported inputs;
they are not discarded silently.

A browser attempt also exposed stale imported-artwork references when a second
project is pasted directly into Code after a native import. Pending GUI work:
reconcile or reset pending imported artwork when source replaces its templates;
keep the failing browser receipt and do not drop references silently. Native
project replacement is the qualification route for this destruction slice.

An import-only pass over the same184 inputs removes the bulk-destruction
refusal in `arcade-a63932786084c167.ts` and `arcade-f7486e7e2dc7d78a.ts`.
Both retain other refusals: totals remain93 translated /90 partial /1 malformed.
The rebuilt production GUI passes the native-import/controller journey:
two enemy creation/destruction cycles, two callbacks, and the surviving player.
Build errors:0; initial bytes4,360,502 within the unchanged4,467,136 budget.
See the [receipt](receipts/2026-10-08-arcade-destroy-kind.json).
This slice does not rerun or supersede the original-compilation/runtime census
above and does not establish whole-game equivalence.

### Code artwork ownership — 2026-10-08

Qualified candidate for the stale-import GUI gap above: after a successful Code →
Blocks conversion, the live project owns applied SVG uploads. Repeat conversions
read its current artwork through the same declaration slots; old replacement
or append uploads are not replayed. Appended costumes without explicit
`COSTUME` declarations become owned attachments while the authored slots match.
A new append preserves existing attachments before the new costume; From Blocks
turns them into ordinary explicit declarations. A fresh target does not inherit
another target's attachments. Unassigned and failed uploads remain available.
Changes to pending uploads during preparation reject the outdated conversion.

The36-test affected artwork/gate batch passes, including live edits to appended
assets, repeated conversion, append ordering and exact native PNG/SVG/document
retention. The production build reports zero errors and4,360,502 initial bytes,
within the unchanged4,467,136 budget. This GUI slice changes no conversion
capability classification and does not rerun the corpus audit.

The production browser now passes native import → Code → To Blocks → repeat
conversion with exact costume bytes, including an implicitly appended costume,
and fresh pasted code executes without stale-template upload warnings. Existing
rotation, projectile and destruction journeys still pass; page errors:0.
See the [receipt](receipts/2026-10-08-code-artwork-ownership.json).

### Statically bound callback helpers — 2026-10-08

Source `7c1a3859c` specializes higher-order helpers with callable parameter
annotations and statically known inline callbacks or global named functions.
This is general helper compilation: loops, conditionals, callback arguments and
results, early returns, forwarding and recursion remain ordinary native
procedures. Callback pauses retain their invocation frames. Global captures
retain live global bindings. Recursive sites reuse specialization records;
block/loop shadows are respected and ordinary arguments evaluate once in source
order. Unused generic helper definitions need no executable callback value.

The differential tests exposed and fixed an older numeric-loop bug: native
procedure-local `for` initializers bypassed value translation, turning numeric
counters into Scratch text and making addition concatenate. They now use the
normal declaration translator. Preserve the first failed comparisons in the
private archive; the corrected tests agree with original PXT.

30 affected callback/function/resource/namespace/roundtrip tests plus14 gate
checks pass without skips. The owned complete fixture covers repeated callback
calls, multiple callbacks, named functions, forwarding, recursion, yields,
returns, alias-free global capture and source-order argument evaluation. Blocks,
native export into original PXT, reimport and SB3 save/reload agree.

Three recovered tutorial projects lose `handler()` refusals; one now exposes
separate multiplayer, countdown and sound API gaps inside its callback bodies.
All ten recovered projects remain partial and original compilation unavailable
for named offline packages. All partial fragments step24 frames without block
errors;63 diagnostic occurrences remain (previously65). The same184 standalone
inputs remain **96 translated /87 partial /1 malformed**. No full-game claim.

GUI authoring uses ordinary native DEFINE/call/return blocks and their Code
words after specialization. The original higher-order helper abstraction is
not reconstructed in the editor. Stored/dynamic callable values, caller-local
closure captures, callbacks themselves accepting callable arguments, callable
type aliases and namespace-function values still require implementation.
Callback parameter escape and local shadowing receive explicit diagnostics.
Future GUI work must include callable value blocks, closure authoring and
reference-aware procedure rename qualification. Multi-file source navigation,
namespace preservation, multiplayer, custom palettes and resource editors
remain open. Production `gui.2f8fb86b.js` passes native file→Code→Blocks→real
controller B: initial trace123/total12/recursive20/chosen12, then callback
result50 and sprite x27. All prior journeys pass with zero page errors. Build
errors0, initial4,360,502 bytes within unchanged4,467,136 budget. See the [receipt](receipts/2026-10-08-arcade-static-callback-helpers.json).

### Declared helper resource types — 2026-10-08

Source `1fa9a3f34` seeds the existing lexical value graph from supported PXT
resource annotations on variables, parameters and named function returns.
`Image`, `Sprite`, tile locations, animations, scenes and physics engines retain
resource identity; primitive types and nested `T[]` / `Array<T>` constrain array
elements. Function and arrow callbacks retain their parameter annotations.
Unknown aliases, unions and callable annotations are not guessed or treated as
runtime casts. Known array shape remains usable with unknown element types.

This fixes the two array-reference failures exposed by supplemental tutorial
code: `Image[]` helper parameters no longer force a fallback into fixed-target
translation that discarded array values. All ten partial tutorial fragments now
step24 frames without block errors;65 named diagnostic occurrences remain
(previously73). All original tutorial compilation gates are still unavailable
for named offline packages. The old failures remain in the preceding receipt.

The unchanged184 inputs now measure **96 translated /87 partial /1 malformed**.
Three snippets lose their sole named refusal: `arcade-7913e54dbadcc8d6.ts`
(`lander.setImage`), `arcade-85a1c4bedb4c8217.ts` (`animatedSprite.setImage`),
and `arcade-f5582962d2213ba0.ts` (typed sprite parameter movement). All three
compile in original PXT and step24 frames without block errors. These are two
snippets with uninitialized sprite bindings and one function-only snippet;
this is translation/finite-smoke evidence, not a complete playable-game result.
No refreshed full184 original-compile tally is claimed.

44 resource/function/scope/roundtrip tests and35 parser/gate tests pass without
skips. An owned complete fixture agrees with original PXT on array aliasing,
iteration and removal through Blocks, native export/reimport and SB3 reload.
The declared resource helper remains compilable even when it has no call-site
resource samples. Production `gui.b14a3b9a.js` passes native import→Code→Blocks
and real controller B: shared array removal yields120, remaining length2, and
the typed helper creates/moves a sprite to x89.5. Prior journeys also pass;
page errors0, build errors0, initial4,360,502 bytes within unchanged budget.
Multi-file navigation, source-preserving namespaces, resource
editor work, passed/stored callback values, package augmentation, multiplayer
APIs and custom palette rendering remain open.
See the [receipt](receipts/2026-10-08-arcade-typed-helper-references.json).

### Declared project source and namespace scopes — 2026-10-08

Source `18abd6c75` imports local TypeScript declared in `pxt.json.files` plus
root `testFiles`; original PXT moves `main.ts` last, then `_onCodeStop.ts` last.
Unlisted code stays excluded. Independent file parsing names malformed files;
combined parsing allocates temporaries once. Reopened namespaces share exported
bindings while retaining each declaration's private variables, including nested
exported namespaces. Illegal private access, mixed export visibility and reads
before initialization remain named diagnostics.

The complete pinned PXT runtime and native BW runtime agree on file order1243,
private counter results6/39/8 and sprite creation. Code→Blocks, native Arcade
export into original PXT, reimport, and SB3 save/reload pass.15 affected tests,
5 existing namespace/file regressions and14 gate tests pass without skips.
Conditional files requiring a package graph, ambient declarations, assembly and
Python are still explicit boundaries. Code/Blocks can edit the lowered program;
there is no multi-file source navigator or namespace-preserving source editor.
Production GUI `gui.01abe779.js` passes native project file→Code→Blocks→real
controller B: initial order1243 and counters6/39/8, then callback43 moves the
sprite to x43. Prior rotation, projectile, destruction and artwork journeys
also pass, with zero page errors. Build errors0, initial4,360,502 bytes within
the unchanged4,467,136 budget. Graphics authoring is unchanged by this slice.

The same184 inputs still measure93 translated /90 partial /1 malformed.
All ten recovered tutorial projects remain partial and their original compilers
remain unavailable for named offline packages. Supplemental code diagnostics
retire, exposing73 diagnostic occurrences versus42 before loading these helpers.
Eight partial fragments step24 frames; two now raise array-reference block
errors in previously omitted helper code. Preserve these failures. Next work:
array-valued helper arguments/initializers, callbacks stored or passed as values,
package namespace augmentation, multiplayer APIs and dynamic sprite references.
Do not infer a full-game pass from the independent differential fixture.
See the [receipt](receipts/2026-10-08-arcade-multifile-source.json).

### Tutorial background input audit — 2026-10-08

The ten generic unreadable-background cases in the old184-source report are
saved tutorial snippets. Six reference gallery images supplied in the pinned
tutorials' `assetjson`; four reference extension-package images. The offline
`tutorial-to-project` CLI assembles all ten native projects without replacing
the original snippets or inventing artwork. Six background-art refusals retire
on these additional recovered inputs; the four package-image refusals remain.
Eight documents also supply supplemental custom TypeScript.

All ten recovered projects still have named translation gaps and unavailable
original compilation because their external packages are absent offline. Each
partial translated fragment steps24 frames with zero block errors; this does
not qualify original gameplay. The original184 input importer totals remain
93 translated /90 partial /1 malformed.15 affected tests and14 gate checks pass.

The supplemental-source implementation below supersedes that input-only gap.
Next implementation lanes: implement native custom-palette rendering across
Code/Blocks/Pixel/export, and review/pin required extension packages before
offline compiler adoption. Do not remove package dependencies to obtain a pass.
The CLI preserves them; the audit now records typed `NO_EXTENSION` errors as
unavailable with exact dependency names. See the
[receipt](receipts/2026-10-08-tutorial-project-inputs.json) and
[CLI instructions](MAKECODE.md#recover-complete-tutorial-inputs-offline).

Next: recover/pin the identified package inputs, implement palette rendering
and the newly exposed helper-code gaps below, and implement legacy tilemap calls as
real native resource operations; then address boolean dialogs, paint callbacks and effects.
Each family still needs its own Code/Blocks/resource-editor, runtime, original
export and actual user-control journeys. Keep unequal animation timing, action
binding, sheets and custom-palette qualification in the animation lane.

## Evidence rules

**Present** means inspected source contains the capability. A named test below
means an existing regression, not a fresh successful run at this head.
**Pending branch** means outside reviewed main and awaiting qualification.
Missing authoring controls and missing browser evidence are different gaps.
Integration updates below describe `lane/arcade-integration-20261007`; they do
not claim an installed release or a merged implementation.
Production app source `57f9b9d29` passes the 12-state controller journey,
19,200 original initial-stage pixels, and 31 existing MakeCode browser checks.

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
  explicit Lite pin adoption. The earlier integration adopted sb3-creator
  `8ba3508eab2ad99b9d9a6478c9a45a7200ca4fde` after upstream PR59 passed
  its enabled checks and merged; exact vendor identity and mirrors pass locally.
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
| C04 Rotation/sprite data | Integration: rotation/rotationDegrees/data property words, blocks and qualified upstream dialect adoption | Rotated geometry/raster, viewport-bounded scaled rendering and reference-preserving data import/export | Focused `-rotation`, `-rotation-viewport`, `-data-types` tests pass, including original PXT, VM, export/reimport and SB3 restart. Production Code→Blocks/controller/export/file-reimport passes 12 observed states; initial stage matches all 19,200 original PXT palette pixels. Huge rotated collision performance remains unqualified. Artwork quarter turns are a separate editor feature. |
| C05 Images/shared resources | Present: create/clone, dimensions/pixels, drawing/blit/mutation, sprite/background image refs | Shared identity, generated images, parameters and export present | `-image-values`, `-shared-images`, `-image-parameters`, `-generated-images`, `-image-blit`, `-image-mutation`, `-pixel-drawing`. Need source/render transaction and alias invalidation proof after editor changes. |
| C06 Literal/gallery artwork | Import returns assets alongside code; frame-image blocks reference templates | SVG costume assets, built-ins and image literal export present | `-literal-images`, `-generated-sources`, `-background-images`. Whole-file asset staging exists; verify it in browser and add an explicit Code-plus-assets path instead of silently substituting art. |
| C07 Pixel/palette/layers | Existing Costumes Pixel editor | Indexed tools, selections, layers/opacity/locking, custom/preset palettes, PNG/sheets and palette-aware export present | `makecode-pixel-image`, `pixel-layers`, `verify-pixel-source-roundtrip`, `verify-pixel-colour-slots`, `verify-pixel-crop`. Full-screen background authoring qualified locally at `ecba43152`: 160×120 preset, PNG logical resolution, layers, Code handoff, SB3 reopen and all19,200 original-export pixels. Controls/source allow160×160; larger editable images and arbitrary PNG variants remain unqualified. |
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
contains F4 rotation/data and is preserved by a merge into the integration
branch. Its original scaled rotation allocated the entire image; the integration
implements bounded viewport sampling and tests exact pixels against pinned PXT.
The associated sb3-creator branch `feat/arcade-rotation-data-properties` merged
as PR59 and is adopted at the exact pin above. Sprite.data now preserves
array/Image/Sprite identity and lazily creates an object for a falsy stored
value; arbitrary object member access remains a named conversion gap. These
source qualifications do not establish GUI or shipped-package completion.

Browser qualification found that a Code `DEVICE ARCADE` header does not
synchronize the visible device selector, which controls Game Console discovery.
Selecting Arcade through the actual dropdown exposes the controller pane.
Track header/selector synchronization and a discoverable source-to-stage route
as a C13/C18 gap repaired in this integration: successful project application now
publishes device hints and the header event after loading. Focused tests retain
the prior device on parse/load failure. Direct SB3 reopen synchronization still
needs its own visible qualification.

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

The current bounded U02 implementation preserves live costume/backdrop bytes,
centres, palette/layer documents and frame durations during in-app From Blocks
→ fresh Pixel edit → Code edit → To Blocks, including SB3 save/reopen. The
required browser gate is `scripts/verify-code-artwork-browser.mjs`; helper tests
also exercise PNG bytes, failed imports, external project replacement and edits
during asynchronous ZIP construction. The real browser fixture uses SVG.
This does not close portable plain-Code asset transport, sampled sounds,
animation-to-runtime binding, or the full original-MakeCode resource journey.

#### Next graphics slices, in dependency order

1. **Full-screen artwork:** the stacked background candidate now qualifies a
   visible160×120 preset, logical PNG resolution, corner painting, layers,
   resize/undo, Code handoff and SB3 save/reopen. Production `ecba43152` and
   harness `5a043f26c` match all19,200 actual Brickwright playback pixels against
   the actual downloaded export compiled/run in original PXT. Version4 artwork
   bounds retain source through the historical version3 reader. Default-palette
   Stage transparency matches white; custom palettes select their white slot
   and report quantization when none exists. Custom-palette original RGB parity,
   mixed native-Arcade/Scratch Stage composition and images beyond160×160 remain
   open. This local qualification is separate from hosted CI/merge status.
2. **Animation asset binding:** reuse the existing 64-frame timeline, durations,
   layers, sheets and frame-as-costumes export. Add stable asset/action pickers
   and bindings to native words/blocks. Existing runtime/export intervals are
   uniform; unequal durations require an explicit scheduler and equivalent
   exported code. Qualify controller trigger, stop/restart and identity after
   rename/reorder. Editable timeline persistence alone does not close U04.
3. **Tilemap painter:** reuse `bw-makecode/tilemap-values.js` and its existing
   indices/walls/images representation, bounds and tile scales. Add tile palette,
   paint/erase/fill, independent wall layer, dimensions/scale and a map picker for
   `arcade_setTilemap`. Preserve dynamic expressions when they are not literal
   editable resources. Qualify scrolling, collisions and exact exported layers.

### U03 — tilemap authoring

Create two tiles in the Pixel editor, paint a map/walls, choose tile size, place
a player/camera and steer into walls/overlap tiles. Undo/redo, rename a tile,
save/reopen, export/run in MakeCode and reimport both layers. Internal JSON
injection does not count as creating a map through the GUI.

#### Legacy tilemaps need a separate implementation

The pinned `color-coded-tilemap` package does not make `scene.setTileMap` an
alias for modern `tiles.setTilemap`. Preserve the mutable map Image reference,
scene-local legacy mode, default16px scale, and persistent numeric0–15 tileset
entries containing image references and type-wide wall flags. Setting a tile
before a map must work; changing maps retains that legacy tileset. Missing
images use their palette-index colour. Tile artwork clips/pads at the top-left
rather than stretching. Outside an enabled map is wall; a disabled map is not.
Legacy Tile references retain their originating map and numeric `tileSet`.
`onHitTile` is a wall-index collision event, not a modern overlap-tile event.

Reuse modern rendering/physics infrastructure behind mode-aware accessors,
without rewriting these semantics into per-cell wall snapshots. Deliver native
words/typed Blocks, numeric colour/map pickers, tileset image/wall/scale tools,
and export the original scene APIs with the `color-coded-tilemap` dependency.
Test operation order, map switches, retained references, map/image mutations,
defaults, clipping, wall collisions, real editor save/reopen and original PXT
export/run/reimport. Then rerun the affected corpus; unrelated extension and
empty-body refusals must remain named.

The latest locked-input inspection finds eight projects referencing legacy
maps (the exact standalone refusal ranking has seven), five referencing legacy
tile definitions (exact ranking four), and two wall-hit callback users. These
are affected-project observations, not promised reductions in partials.

Resource recovery is independent: all ten background-art refusals in this
corpus reference unavailable assets in bare TypeScript inputs. Recover complete
original project/JRES/extension assets with provenance; do not generate substitute
art or count those as ten unimplemented background APIs. Projectile statement
lowering, missing projectile images and source-handle typing are likewise
separate cases despite sharing an API family name.

### U04 — animation binding

Create three frames in the existing editor, set durations, duplicate/reorder,
bind to a sprite/action, trigger/stop/restart with buttons and save/reopen.
Export/reimport must preserve palette, frames, loop/action and supported timing.
If variable durations require a runtime sequence, implement it explicitly rather
than flattening timings. Include sheet and frames-as-costumes journeys.

#### Uniform animation resource candidate — full browser journey qualified locally

The candidate in [draft PR704](https://github.com/CrispStrobe/brickwright-lite/pull/704)
on `lane/arcade-animation-resources-20261007` implements:

- **Publish/Update/Remove** with a persistent UUID and display name; frame IDs,
  order, layers and palette remain editable. Duplication gets a fresh UUID.
- Artwork document4/bundle5 persistence with older-reader opaque preservation.
  Actual sprite deletion/Undo restores source onto recreated costume objects;
  asset mismatch and duplicate identity fail atomically.
- A named native Blocks resource menu, typed Image[] and interval reporters,
  and Code insertion at the current selection with a single undoable edit.
- Runtime resource snapshots shared across repeated reads. Revisions replace
  the snapshot; already-running animations retain their existing image objects.
  Start clears runtime handles, Stop preserves them, and actual project loading
  clears the previous project's authored registry.
- Explicit full-source export to shared original Arcade Image[] declarations,
  computed ID lookup, saved scalar values and named missing-resource diagnostics.
  Unequal durations are rejected rather than flattened.

Local production build and repeated publication-browser qualification pass at
source `abce5092194e493d59745adeed32798b19de1a35`: three painted3×2
frames with two layers and100ms timing, rejected unequal timing preserving the
prior resource, actual SB3 file chooser reopen, exact source/UUID and rendered
asset preservation, and zero page errors. Actual-VM sprite Undo and replacement
loading tests pass. Four original-PXT export tests pass against the explicitly
selected reviewed producer source, including literal/computed IDs, shared array
identity, image mutation/playback, missing IDs and generated-name collisions.
That historical producer-source override was qualification evidence; current
consumer adoption is recorded below.

Three publication-browser journeys now qualify **Add Extension → Arcade**,
scrolling to both native resource reporters, dragging each into the workspace,
selecting the published name, and observing the stored UUID in the actual VM
block fields. The library description now identifies the full game APIs.
The full production-browser gate passes six journeys on source
`89700204711ce470ebb7a77e511ec960fa1e8b6d`: real Code picker insertion,
Code→Blocks, native resource menu selection, B stop/A restart, Stop/green flag
restart, Pixel rename/reorder with stable UUID, original Arcade export and file
reimport with repeated controller stop/restart. Six playback samples contain
zero invalid frames after readiness. All19,200 actual Brickwright and original
PXT pixels match for the same authored frame; compilation makes no network
attempts and the page reports zero errors. The boundary is three3×2 layered
frames, uniform100ms timing and the default palette.

This journey exposed and repaired two actual runtime defects: template-free
image sprites had no drawable, and template-backed image animation restored a
blank costume between frames. Native drawables now have transform, visibility,
scene and destruction ownership; both paths retain their skin during animation.
The first native renderer/resource/scaling/scene batch passed24 tests; after the
skin-retention change, the affected renderer/resource batch passed10 without
skips. Failed attempts remain preserved. The earlier native renderer browser
attempt used a development build; the final passing journey explicitly used
`NODE_ENV=production`.

The native animation JRES codec now passes eight tests against the retained
original PXT encoder/decoder, package normalizer, emitter and asset-name validator.
Native hyphen/Unicode IDs and namespaces are supported with explicit printable
reference bounds; native display-name restrictions remain separate. This is the
format layer, not native asset-editor integration. Native gallery export now
includes unused published resources and generated factories; main code caches
used resources once. Native gallery import lowers tagged lookups to typed image
arrays with original alias and allocation behaviour. Focused tests execute the
actual original emitter/compiler/simulator and verify exact pixels, frame order,
intervals, alias refusal and generated-name collisions. The explicit production build and full six-journey browser gate pass at
`8bca7037c`, including actual downloaded native gallery frames/timing and
19,200 original-PXT screen pixels. Unused imported assets
are validated but are not yet persistent GUI resources. See the
[animation interchange contract](ARCADE-ANIMATION-INTERCHANGE.md) for rich-source
recovery, persistent resource reconstruction and original-editor acceptance.

**Adopted:** shared compiler [PR62](https://github.com/CrispStrobe/sb3-creator/pull/62)
merged at
[`33ce7380e388e20b7c3a30e8ea84d1b774c30248`](https://github.com/CrispStrobe/sb3-creator/commit/33ce7380e388e20b7c3a30e8ea84d1b774c30248)
and the app pins that exact producer. Consumer source
[`96e812a23`](https://github.com/CrispStrobe/brickwright-lite/commit/96e812a2355a193bfb92cfb4b6982d82299792ad)
includes both canonical words and literal resource menu shadows. Two highlight
tests, four explicit provider identity tests (zero skips), eight codec tests and
four vendored original-export tests pass. The complete browser journey is now
locally qualified at the source and boundary above. Its gate,
`scripts/verify-arcade-animation-resource-browser.mjs`, is registered in CI with
zero hosted timing readings and a provisional budget. Hosted exact-head checks
remain pending; native original-MakeCode asset editing remains unqualified.

Rich-source transport now emits a versioned companion beside native galleries.
Matching imports recover exact source documents/UUIDs through the file/project
conversion API; edited native frames/order/timing/palette keep their native data
and receive stale-source warnings. Malformed or duplicate metadata fails before
project replacement. Current SB3 artwork bundles also reach the CLI exporter,
including unused animation resources. Native galleries have no new128-asset
limit; that bound applies only to companion source records. This is source
transport, not an editable imported GUI library or live resource rebinding.
At `55da1b20e`, the production build and seven browser journeys pass, including
exact downloaded source recovery and an atomic malformed-file refusal. The
affected integration batch passes20 tests, final companion/project/overlay
batch17, and all seven CLI regressions; no skips in these batches.

At product source `9f6ace3da`, both ordinary production and React profiling
builds pass. Native animation decoding/companion validation stays deferred;
initial JavaScript4,466,111 bytes passes the unchanged4,467,136-byte limit.
The final animation and background browser gates each pass seven journeys.
See the [interchange qualification](ARCADE-ANIMATION-INTERCHANGE.md) for exact
scope and the emitted ownership receipt. Hosted final-head checks remain pending.

Pixel publication now supports one-frame resources and exact1–65,535ms timing
using document5/bundle6. Older bundle5 readers preserve the source unchanged;
legacy document validation remains unchanged. Focused tests include actual
original-PXT compilation/execution at both interval endpoints, companion
recovery, SB3 persistence and Undo. The imported editable library remains open; fresh-copy
resource lookup is the next qualified candidate below; see the [timeline bounds](ARCADE-ANIMATION-INTERCHANGE.md#native-timeline-bounds).

At product source `f945e7feb`, runtime endpoint tests pass6/6 and the verified
profiling production app passes nine browser journeys, including endpoint
Code-to-Blocks playback and visible pixels. Initial JavaScript4,466,357 bytes
passes the unchanged4,467,136 limit. CLI/current-bundle tests pass3/3; original
PXT still matches all19,200 screen pixels. Earlier stale-served-build failures
are retained in the evidence; no budgets or assertions were relaxed.

#### Fresh lookups — compiler adopted and full browser journey qualified locally

The adopted candidate adds `arcade animation fresh frames resource "<UUID>"`
and a native Blocks reporter beside the shared-frames and interval reporters.
Each evaluation allocates its own array, images, pixels and palettes from
unmodified authored data. Shared lookups retain their existing shared identity.
Code exposes **Insert fresh frames** as one selection-replacing, undoable edit.
The exporter emits original `assets.animation` factory calls for fresh lookups.

The focused consumer batch passes18/18 against the explicitly selected producer
candidate in [sb3-creator PR63](https://github.com/CrispStrobe/sb3-creator/pull/63),
including original-PXT execution of literal/computed UUIDs, independent arrays
and images, isolated mutation and unchanged shared lookup behaviour. Both UUID
forms also pass the complete Brickwright → Arcade → Brickwright → Arcade
permutation with imported artwork attached and exact returned pixel values.
Missing IDs and helper-name collisions pass original execution. Producer
qualification passes284/284 focused tests. Its Python/JavaScript mappings retain
all three distinct resource calls through conversion; the standalone Scratch
renderer shim still has neutral placeholders and is not qualified playback.
All enabled producer checks passed; PR63 merged at `983aa61f` with the reviewed
tree unchanged. Official consumer sync adopts that exact pin and four provider
identity tests pass. The adopted consumer batch passes29/29 without a producer
override. At product source `fbac95e16b`, the profiling production build passes
all emitted ownership gates with4,466,357 initial bytes against the unchanged
4,467,136 limit. The verified bundle passes all ten full browser journeys,
including actual fresh-frame Code insertion, Code-to-Blocks, independent arrays,
isolated mutation, unchanged shared playback and controller stop/restart.
All19,200 actual original-PXT/Brickwright screen pixels agree, compilation
attempts no network requests and the page reports zero errors. See the
[emitted receipt](receipts/2026-10-07-arcade-animation-fresh-lookups.json).
A separate four-journey publication gate drags all three native resource
reporters from Add Extension → Arcade, selects their actual dropdowns and
checks the published name and UUID in the VM.
Hosted final-head consumer qualification remains required.

The next product source `794cc9082` implements the explicit library-role and
Code retention foundation. Bundle7 persists the role independently of names;
old bundle6 readers retain opaque source. Actual VM save/reopen, Code projection,
name collision, source retention and malformed-role checks pass. The final
foundation batch passes45/45; the earlier batch with CLI regressions passes51/51.
At qualified product source `6f29dc3e3`, the profiling production app passes
all ownership gates at4,467,115 initial bytes against the unchanged4,467,136
limit. Thirteen actual browser journeys pass, including an explicit library
fixture edited in Pixel, SB3 reopen, Code/Blocks retention and fresh/shared
playback. Actual GUI and CLI exports retain exact edited native/rich source and
run in original PXT while omitting the library actor. Earlier budget and browser
harness failures remain preserved. The final focused batch passes46/46, including
delayed role-restoration ownership. This does not yet install native imported
resources; final-head hosted qualification remains required. See the [foundation contract](ARCADE-ANIMATION-INTERCHANGE.md#explicit-asset-library-foundation).

To close the imported-library gap next:

1. Add an explicit, versioned hidden asset-library target role; never infer the
   role from a name or insert carrier costumes onto gameplay actors or Stage.
2. Build and validate resource carriers inside the generated SB3 before loading
   it, with atomic failure and a generation guard against late imports.
3. Bind native factory lookups to fresh reporters. Preserve unused resources,
   recovered UUIDs and rich source; create validated source documents and new
   IDs when no valid companion exists. Stale source cannot overwrite native edits.
4. Preserve the role through Code/Blocks and SB3 save/reopen. Test rename,
   duplicate, deletion/Undo and exclusion from gameplay export.
5. Qualify actual original Assets edit/save/download, then Brickwright import,
   Pixel edit, controller playback and return export. Native format tests alone
   cannot close that editor journey.

**U04 remains open.** Unequal-duration scheduling, action binding, sheet and
frames-as-costumes journeys and
rich resource reconstruction from original MakeCode remain separate work.
Original export tests prove playback behaviour; they do not preserve the
editable timeline or UUID through MakeCode. Native image mutation affects the
runtime snapshot, not authored Pixel layers. Deletion/Undo restores source;
it does not promise a pristine copy of a previously mutated runtime snapshot
until restart. Custom-palette original RGB equivalence remains unqualified.
The locked corpus remains90 translated /93 partial /1 malformed.

Automatic native import follow-up: GUI file/share and CLI import now use the
same validated library installation transaction, including unused assets and
fresh UUID reporter bindings. The transaction/CLI test observes original-PXT
alias mutation9 versus independent lookup2 and preserves source through repeated
imports. All14 production browser journeys pass with zero page errors; the
automatic imported library survives Pixel editing, save/reopen, Code/Blocks and
controller playback. Emitted ownership passes at4,467,115 bytes with the
unchanged4,467,136 limit. See the
[receipt](receipts/2026-10-07-arcade-native-animation-library-import.json).
Library navigation, script/visibility protection and identity-safe
rename/delete/Undo/duplicate operations are implemented in the
[library safeguards follow-up](ARCADE-ANIMATION-INTERCHANGE.md#artwork-library-controls-and-lifecycle).
Blocks and Sounds explain the library role and route to artwork; gameplay
controls and queued Blockly model edits are disabled while the explicit role
is present. Copies get new resource UUIDs; Undo restores the original identity
onto the actual restored target, independently of editing selection. Invalid
library source refuses saving. Original Assets editing/download, costume
drag/share source transport, sprite-file transport and corpus-wide closure
remain open. See the
[transaction contract](ARCADE-ANIMATION-INTERCHANGE.md#automatic-native-resource-import-transaction).

Native export now allocates unique MakeCode-safe names for duplicate or
nonnative authored names, without changing UUID bindings or authored documents.
Companion version2 records that name projection and restores exact authored
names unless the native editor actually renamed the asset; version1 remains
readable. Original-PXT factory execution and repeated direct/embedded
roundtrips pass in the39-test focused batch. All17 production browser journeys
pass, including duplicated-library GUI/CLI original-PXT export and Code-file
reimport/To Blocks/playback. See
[native animation names](ARCADE-ANIMATION-INTERCHANGE.md#native-animation-names-and-authored-identity).
The Blocks and Code resource pickers now share distinct owner/costume labels
for duplicate names, adding a unique UUID suffix only when necessary. Their
values remain full UUIDs; live owner renames do not alter authored source or
bindings. Actual Code and Blocks selection of the copied UUID passes in the
18-journey production browser batch. Serialized VM validation failures now
retain every relevant SB3 path/message in the conversion status and unsupported
list. The actual compile method is tested with a real VM rejection and leaves
the prior project intact. Focused tests pass27/27; packaging/diagnostics pass11/11.
See [picker and diagnostic qualification](ARCADE-ANIMATION-INTERCHANGE.md#duplicate-resource-pickers-and-conversion-validation-details).
Hosted follow-up checks and original Assets editing/download/companion retention
remain open; these synthetic journeys do not reclassify the93 partial cases.

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

## Native MakeCode authoring closure map — 2026-10-07

Reviewed source checkpoint `d7a9f7364`, with the preserved corpus results in
[COMPATIBILITY-AUDIT.md](COMPATIBILITY-AUDIT.md). This review inspected source and
existing menus; it did not run new games or browser journeys. Existing reports
remain **90 translated / 93 partial / 1 malformed Arcade input**, with **283 named
gap occurrences** after the consumed-update fix. The compiler-valid runtime smoke
is **127 stepped / 3 event-only / 0 block errors**. These finite measurements do not
establish that users can author every supported feature.

The deliverable is a native Brickwright program: pseudocode, actual editable
Blocks, associated resource editors, runtime behaviour, and original MakeCode
export. Requiring a user to write TypeScript or manipulate internal JSON to reach
a capability leaves its native authoring gate open. TypeScript remains an
interchange/source route; it is not evidence for those missing controls.

### Pinned API inputs and census rules

The reproducible [public declaration inventory](generated/MAKECODE-PUBLIC-API-CENSUS.md)
now supplies the pinned source baseline. Generate its complete signature and
editor-metadata JSON with `node scripts/makecode-api-census.mjs --out census.json
--markdown census.md` after syncing the runtime. The scanner refuses a missing
or mismatched target manifest. Its records include internal and optional-package
candidates: resolve visibility, inheritance and dependencies before joining
public signatures to the seven evidence columns below. Counts are not coverage.


The local synced `VERSIONS.json` records Arcade **pxt-arcade@4.2.1 /
pxt-core@13.2.1**, micro:bit **pxt-microbit@9.1.1 / pxt-core@13.0.1**,
Calliope **3.0.30 / 6.0.23**, EV3 **1.4.41 / 9.3.19**, and Adafruit **1.6.8 /
6.2.6**. [sync-makecode-runtime.mjs](../scripts/sync-makecode-runtime.mjs) owns
these exact licensed package inputs. This is the closure target for this
checkpoint, not a claim about every later MakeCode release or external package.

A crucial census trap: the pinned Arcade target's
`apiInfo["libs/game"].apis.byQName` is empty, although `bundledpkgs.game` includes
the public game, Sprite, scene and tile APIs. Enumerating only `apiInfo` would
silently omit the core game surface. Combine bundled `.ts` and `.d.ts`
declarations, package manifests and transitive dependencies with API metadata.
Retain overloads, default arguments, enum members, block metadata and resource
field editors. Include public Code-only APIs, not just APIs with a MakeCode
block annotation. Mark private/internal implementation helpers separately; do
not count them as missing user-facing features or silently lose public members.

Each public declaration needs a durable record keyed by target/version/package,
qualified name and signature. Record these independent states:

1. Import: supported signatures, named refusals and required dependencies.
2. Native pseudocode: canonical word, operand types and roundtrip spelling.
3. Blocks: opcode, shape, visible palette route, argument/default/menu schema,
   Boolean/reporting sockets and dynamic menu behaviour.
4. Resources: asset picker/editor, rename/delete/undo, reference identity and
   persistence; use “not applicable” only when no resource exists.
5. Runtime: tested behaviour, timing and lifecycle; distinguish stage simulation,
   native guest, connected device and unmeasured physical behaviour.
6. Original MakeCode export: emitted public call/type, project manifest/assets,
   original compiler acceptance and behaviour comparison.
7. GUI: create from blank through visible controls, edit, switch editors,
   save/reopen, export/run/reimport, and the linked browser receipt.

#### Cross-surface acceptance for every public capability

The seven states above need concrete user journeys, not just symbol counts:

- **Native Code:** author defaults, optional operands, nested reporters and
  callback parameters directly. Invalid types/options identify the operand and
  preserve the loaded project. Code↔Blocks retains scope and evaluation order.
- **Blocks menus and sockets:** exercise every public enum/menu option. Literal
  menus serialize as fields; reporter-capable menus retain computed values.
  Check defaults, invalid selections, choices after resource rename/delete and
  historical-project migration. One schema gate does not cover every menu.
- **Events:** create handlers visibly, including button/player, sprite kinds
  and callback parameters. Verify captures, registration order, duplicate
  registration, scene changes, Stop/restart and input release. Trigger an
  event-only program and observe its effect before marking runtime complete.
- **Resources:** create/select/edit/rename/duplicate/delete through the editor.
  Preserve identities, palettes, dimensions, centers, layers, animation timing
  and package dependencies through undo, Code↔Blocks, save/reopen and original
  export/reimport. Missing resources remain named. Canceled/failed imports and
  concurrent edits preserve existing work. Verify future-source preservation
  by historical readers wherever that compatibility is promised.
- **Diagnostics:** distinguish missing assets/packages, unsupported signatures,
  malformed input, runtime errors and original compiler errors. Navigate to the
  affected source, block or resource when known. Never invent a location or
  count placeholder output as full support.
- **Evidence:** record target/version/package, exact source/dependency heads,
  user route, inputs, observations and limits. Cover Code-first, Blocks-first
  and resource-editor-first creation where applicable. Successful paths alone
  do not qualify failure preservation or every menu choice.

Unknown remains unknown. A census row is full only when every applicable gate
has evidence. The158 canonical Arcade/Arrays operations (163 forms with aliases)
are confirmed by `ARCADE_WORDS`; they are not 156 original APIs or a coverage
percentage. A shared opcode can expose several API properties; conversely one
public API can require several authoring/resource operations.

### Actionable Arcade family map

The following rows are concrete starting records, not an exhaustive declaration
census. “Present” below refers to inspected implementation; each listed missing
control or proof remains an open native authoring gate.

| Closure ID / pinned public APIs | Import and runtime status | Native Code and Blocks | Resource/editor and original export closure |
| --- | --- | --- | --- |
| N01 `Sprite` properties, `setScale`, `setScaleCore`, `data`; `sprites.create` | Supported subsets, rotation and reference data are implemented; arbitrary object-member operations refused | Existing property/scale words and menus. Prove typed reporter sockets, real dropdown edits, aliases and failed-input diagnostics | Select an Image/kind/reference through usable controls; edit art with shared identity; export typed data without losing arrays/Images/Sprites. Preserve the existing exact-pixel rotation proof. |
| N02 `scene.setTileMap`, `scene.setTile`, `scene.getTilesByType`, `tiles.setTilemap` | Legacy calls and unavailable map assets remain named real-corpus gaps; native map/location/wall runtime exists | Existing raw map/location words are insufficient for map creation | U03 painter: tile palette, terrain and wall layers, tile scale, tile references and map dimensions; rename/delete/undo/save/reopen; export the correct legacy or modern map representation. |
| N03 `animation.runImageAnimation`, `animation.createAnimation`, `animation.runMovementAnimation` | Frame/action animations implemented; movement path engine explicitly missing despite the stop-animation movement menu | Existing frame/action/interval words. Add actual movement/path words and matching blocks when the engine exists | Bind existing Pixel timeline frames to native Image arrays/actions; keep frame durations. Add path editing/presets, stop-type behaviour and original export/playback; the existing movement menu does not establish support. |
| N04 `Image.drawRect/drawCircle/fillCircle/fillTriangle`, `image.imageBlit` and screen drawing | Image pixels, fills, lines, flips, replacement and two blit forms exist; these do not cover every Image/screen operation | Extend the existing image operation family for each missing overload rather than hide it inside text/JSON | Validate clipping, transparency, source/destination aliasing and palette index; provide native shape choices and resource pickers. Export each shape through a valid public PXT call. |
| N05 `game.onPaint/onShade`, `scene.createRenderable`, `scene.addBackgroundLayer`, `scene.cameraShake` | Paint and shake appear as named corpus gaps; camera follow/centering is implemented | No corresponding dedicated paint/shade/renderable/layer/shake words in the reviewed dialect | Editable draw callbacks, z/priority and layer images; scheduling relative to physics/HUD, camera and scenes; rendered pixels and original export. Do not reinterpret “zero smoke errors” as paint support. |
| N06 `effects.starField`, `ParticleEffect.start`, Sprite destruction effects/duration | Screen particles and destruction effects remain named gaps | No native effect/particle authoring words in the reviewed dialect | Effect choice, duration and source-sprite controls; scene push/pop, destruction and restart lifecycle; compare seeded/measurable behaviour without substituting an empty implementation. |
| N07 `music.play`, `playTone`, `createSong`, `createSoundEffect`, `PlaybackMode` | Import explicitly refuses both `music.playTone` and `music.play`; exporter can emit tones/notes/rests from Scratch constructs. This is a directional coverage gap | No native Arcade music resource/playback words; generic Scratch sound blocks do not expose all PXT song/envelope/playback options | Song/track/note and sound-envelope authoring, volume/tempo/playback mode, stop/pause/scene lifecycle. Original compilation plus audible/timing observations; a tone export is not full music support. |
| N08 `game.ask`, `askForNumber`, `askForString`, `setDialogFrame/Cursor/TextColor/Font` | Splash/long text and one-argument number/text prompts exist; prompt options and `game.ask` value forms remain gaps | Existing text/question words; digit/length limits and dialog appearance need native operands/blocks | Prompt interaction, cancellation/focus, blocking order and selected font/frame assets; export options exactly. Avoid declaring all dialogs absent or complete. |
| N09 `info.onScore`, `highScore`, `changeCountdownBy`, `showScore/showLife/showCountdown`, HUD colours and life image | Score/life players1–4 and start/stop/countdown callbacks exist; broader Info surface is not covered by these words | Add missing predicates/reporters/events/HUD setters with player and value types; audit existing numeric player fields for valid range/feedback | Life icon and HUD colour editing, scene-local vs persistent scores, threshold callbacks and original export; persistent high score needs an explicit persistence contract. |
| N10 `ArcadePhysicsEngine` and `scene.Scene` public members; frame priorities | Resource creation/replacement, three engine settings and selected scene callbacks exist; this is not the full engine/scheduler API | Native scene/engine references exist, but arbitrary public engine methods and event-context priorities need a declaration-by-declaration audit | Resource inspector/picker and callback navigation; validate add/remove/move/overlap/draw where public, cancellation and frame ordering against PXT before exposing unsupported controls. |
| N11 `controller.player2/3/4`, button repeat configuration, `mp.*` | Single controller widgets and selected button/event bindings exist; Info's player states do not establish multiplayer controller/network support | No native `mp.*` family in the reviewed dialect. Audit player-specific controller signatures and repeat defaults separately | Distinct player bindings and held-input release; keyboard/touch mappings; explicit local vs network session model, disconnect/reconnect and export dependency. Hardware sensors/vibration are separately unmeasured. |
| N12 `settings.read/writeNumber/String/Buffer/JSON`, `settings.list/remove/exists` | No native settings family in the reviewed dialect | Add typed persistence words/blocks and clear missing-storage diagnostics | Persistence inspector/reset, key lifecycle and limits. Preserve restart/save/reopen semantics and original target package dependencies; do not confuse SB3 project storage with game settings. |
| N13 `assets.image/tile/tilemap/animation/song` and package exports | Literal/file imports carry separate assets; incomplete bare `.ts` snippets may omit them | Native resource references need discoverable asset-aware Code/Blocks routes | U02 transaction, then tile/animation/song authoring; names and aliases remain stable through palette edits, file/share import, save/reopen and original manifests. Code-only paste cannot silently create replacement artwork. |
| N14 Standard language, arrays, functions, namespaces and enums | Value/reference/type/lazy-expression machinery exists; some constructs/packages remain named gaps | Existing Arrays/Code words need the same real Blocks-schema checks as Arcade words | Nested resource arrays, recursive/local/captured lifetimes, rename, default/optional arguments and evaluated-once expressions; retain the documented complex-index PXT/JavaScript difference as a measured boundary. |
| N15 `color`/`palette` packages, `image.setPalette` and shader/render options | Editor palettes and indexed art exist; dynamic game palette/shader semantics are not qualified by those tools | Inventory actual public palette/shader functions and add native words/blocks for supported operations; no percentage claimed | Compare palette-index identity and visible colours across runtime palette changes, scene push/pop and export; custom editor presets alone cannot prove runtime palette APIs. |
| N16 Optional Arcade target packages: sensors, vibration, pins/serial/radio, network services and board APIs | Bundled target includes optional controller sensors, radio, settings/network and hardware packages; default-game translation is not their coverage | Give each public package its own API/native word/block/export rows and explicit simulator/device requirements | Respect manifest and selected-board capability; add appropriate widgets/device configuration and original target compilation. Connected hardware/network qualification remains unmeasured here, and native target owners retain engine implementation ownership. |


For N04 and N10, inspect the complete pinned public signatures before adding
controls: a similarly named internal image shim or engine method may not be a
stable user API. Record its actual exported declaration and package, and qualify
the public export route. Presence in a source file alone is not a completion gate.

### micro:bit and other MakeCode targets

Keep these lanes independent from Arcade. The fresh 215-input micro:bit static
audit is **205 translated / 10 partial**; original compilation **206 pass / 9
fail**, runtime smoke **205 stepped / 1 event-only / 0 block errors**. Other census
reports can use different package-complete inputs and classifications; do not
combine their totals or call these counts API coverage.

| Closure ID | Present source routes | Required native breadth and evidence |
| --- | --- | --- |
| M01 Display, input and events | `microbit-translate.js` handles LED images, buttons, acceleration, rotation, compass/light/temperature/sound and selected gesture/touch/sound events | Inventory every public `basic`, `led`, `input`, `images` signature/default; edit 5×5 art through real controls; drive actual sensor widgets and prove thresholds/event ordering. Full sensor/physical equivalence is unmeasured. |
| M02 Pins, buffers and buses | Digital/analog reads/writes and selected pin events are mapped | Pinned core includes `pins.i2cReadNumber/i2cWriteNumber`, SPI and serial APIs beyond the two handled serial writes. These lack corresponding explicit translator cases in the reviewed file. Census buffers/number formats, pulse durations, bus setup/transactions and serial receive/framing; provide native blocks/code and suitable simulator models before declaring support. |
| M03 Radio and music | Selected radio packet fields/send/receive and melody/tone controls are mapped; send-time packet metadata is explicitly refused | Audit all packet fields, callbacks, timing and channel/configuration; radio simulator peer behaviour versus actual device remains separate. Audit micro:bit V2 audio/microphone APIs independently from Arcade music. |
| M04 Bluetooth, datalogger and packages | Pinned target bundles Bluetooth and datalogger; recognising a namespace in the parser is not API implementation | Native forms and service/configuration/receive controls for supported BLE profiles; datalogger `createCV/logData/setColumns/getRows`, storage UI and exact export dependencies. Required connected-device evidence stays open until observed. |
| M05 Calliope, EV3 and Adafruit | Distinct pinned compiler/target routes exist | Build separate public declaration, native authoring and device/simulator ledgers. No fresh complete API/GUI census was performed here. Share controls/resources where semantics match; keep target-specific refusals, permissions and hardware limits explicit. |

### Implementation order and required artifacts

1. **Declaration and schema census (N01–N16/M01–M05):** check in a reproducible
   public-signature map and join it with the existing authoring vocabulary and
   runtime `getInfo()` schema. Fail on unclassified public declarations,
   unresolved opcode implementations, menu/slot type mismatches and missing
   export status/mapping records. An explicit named unsupported row remains a gap, not a pass.
2. **U02 assets and native operand editing:** complete the current resource
   handoff and Blocks menu/socket work first. Attach exact edited-block,
   save/reopen and original-PXT evidence, including failure-path preservation.
3. **U03/N02 and U04/N03:** deliver visual tilemap and animation binding, using
   existing Pixel tools. Qualify a user-authored level with walls and animated
   sprites before expanding effects/music.
4. **N04–N10:** implement image/drawing, projectiles, effect/audio/dialog/Info
   families in affected-project order, with native words/blocks and editors in
   the same slice. Package-backed input recovery must remain distinguishable
   from implementing a missing API.
5. **N11–N16 and M01–M05:** close remaining controller/network/storage/language
   and per-target families. Reuse shared typed resources without conflating
   target or physical evidence. Every hardware-dependent feature needs a useful
   simulated model or explicit device requirement, plus truthful qualification.
6. **U06 blank-project game acceptance:** maps, walls, animated player,
   projectiles, rotating hazards, score/life, two scenes and sound, created via
   native Code/Blocks/graphics; controller playback, undo/redo, save/reopen,
   original MakeCode export/run/reimport. Continue the API ledger after this
   finite game passes; one complete game cannot prove all public capabilities.

This map supplies concrete work and gate definitions. It does not give a date
for zero partials: the locked corpus and the public API/authoring census are
independent completion measures, and newly measured gaps must remain visible.

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
| G14 asset selection; G15 image aliases; G16 size/transparency/tools | C05–C07, U02; audit160×160 editing bounds and larger-source refusal |
| G17 layer/disposal; G18 animation binding; G19 scene/physics authoring | C08–C10, U03–U06; repeat clear/reload without stale drawables |
| G20 readable inspectors; G22 audio; G23 target selection; G24 export dependencies | C17–C18; separate source, simulation, firmware and physical evidence |
| G21 micro:bit/Calliope; G27 TurboWarp; G25 coverage linkage | C15, U01/U06; target-specific real examples and truthful diagnostics |

## Complete Code word inventory

The [generated authoring vocabulary](generated/ARCADE-AUTHORING-VOCABULARY.md)
lists all158 canonical Arcade/Arrays forms and163 forms including aliases,
with block identities, shapes and Code spellings at the adopted parser pin.
Use it when checking palette discoverability; vocabulary presence alone does
not establish any of the five qualification results above.

## Observed editor warnings requiring follow-up

Historical rotation qualification retained 996 Blockly definition overwrite
warnings and ignored nonexistent input warnings for `arrays_valueBinary.OP`
(17) and `arrays_specialValue.KIND` (4). These exposed real field/input schema
corruption; their original failures remain preserved.

The native schema gate now passes on production source `7b00d0b32`: seven real
menu edits (`-`, `/`, `*`, `null`, unary `-`, `>=`, controller `y`) reach both
workspace and serialized VM fields. Four execution phases preserve actual
sprite position `(80,60)` and operand results: edited workspace, Code↔Blocks,
SB3 save/reopen and historical five-slot migration through the File chooser.
A computed `"Y"` axis with the physically held Up widget produces `-3` and
returns to zero on release. This gate observes no page errors or schema/workspace
warnings. It does not establish that every other editor journey is warning-free.
A subsequent refresh failure-barrier change must receive final candidate CI.
Audio gesture and unavailable optional native-runtime resource warnings remain
separate boundaries, retained in private receipts.

Device consistency follow-up: the legacy **no chips** selection removes the
editor header and clears runtime hints immediately without applying a new
project. The integration preserves that existing route; its hints can differ
from the still-loaded project. C18 must qualify clear selection, failed apply
and direct SB3 reopen together before claiming a fully synchronized target UI.

### Current shared compiler adoption

The current vendor pin is sb3-creator
`33ce7380e388e20b7c3a30e8ea84d1b774c30248`, following shared compiler PR60–PR62.
It includes native Arrays dropdown fields, reporter-capable controller-axis
menus and named animation frame/interval resource reporters. Earlier PR59 qualification above is historical; it does not replace the
current native-schema browser gate or close every resource/event menu.

### U04 follow-up: original Assets editor exchange

Native `.mkcd` GUI/CLI export and `.mkcd`/`.pxt`/current PNG import replace the
previous unqualified source-only HEX exchange route. The live-original-editor
fixture covers real Assets selection, unedited PNG Save, used-animation rename,
timing and fill edits, PNG download, Brickwright file import/To Blocks and
visible game playback. Exact rich source and UUIDs survive the unedited return;
stale edited source is explicitly replaced while the untouched resource retains
its identity. See [the contract and finite boundaries](ARCADE-ANIMATION-INTERCHANGE.md#original-makecode-assets-editor-and-native-project-files).

Remaining U04 work includes unequal-duration scheduling, action binding, sheets,
frames-as-costumes, custom-palette equivalence, sprite/costume transport and
broader real-project Assets roundtrips. Native timing metadata edits do not
rewrite independent numeric playback arguments already present in source.
Original-editor reopening of compiled firmware's embedded source is still
unqualified; the earlier uncompressed HEX self-roundtrip cannot qualify it.
The corpus remains90 translated /93 partial /1 malformed; no case is upgraded
by this synthetic fixture alone.

### Built-in namespace augmentation — 2026-10-08

Source additions to `sprites`, `game` and nested built-in namespaces now retain
exact official PXT exports, including unqualified references inside the source
namespace. The implementation keeps library members separate from source
private scopes and source initialization. Unknown members and collisions remain
named diagnostics. The catalog identifies bindings; it is not evidence that all
catalog operations are implemented.

The complete differential fixture agrees with original PXT through Code→Blocks,
native Arcade export→original PXT, reimport and SB3 reload. Production browser
qualification imports the native file, converts to Blocks and uses controller B
to change observed192→197, score7→9 and sprite x31→36. The resulting ordinary
procedures are editable. Remaining GUI work: namespace-preserving source and
multi-file navigation, callable authoring, reference-aware procedure renaming,
and palette/resource features recorded above. This slice adds no graphics tools.

Same184 import-only remains96 translated /87 partial /1 malformed. Ten recovered
tutorial projects remain partial and original compilation remains unavailable
for their named offline packages; all ten partial fragments step24 frames with
zero block errors. Named diagnostics decrease63→53, without a complete-game
qualification claim. Next conversion work includes dynamic sprite references,
multiplayer operations, missing packages and callable values. Separately, the
original-assets PR's exact-head light-browser retry fails waiting for uploaded
background PNG dimensions; retain this merge blocker and its failed run rather
than weakening the gate. See the [receipt](receipts/2026-10-08-arcade-namespace-augmentation.json).

### Background authoring gate readiness — 2026-10-08

The PNG import browser journey now observes decoded upload pixels before opening
More. The asynchronous load commit closes old panels; waiting on dimensions in
an old panel could time out. The local pre-change journey passed, so this is a
source-supported readiness correction to a retained CI failure, not a locally
reproduced product-decoder failure. All7 corrected phases pass, including native
PNG import, editing, Code→Blocks, SB3 reopen and19,200 exact original-PXT pixels
with0 differences/page errors. No product capability or graphics-editor feature
was added. Hosted verification remains required to clear the older merge blocker.
See the [receipt](receipts/2026-10-08-arcade-background-readiness.json).

### Typed Array._pickRandom — 2026-10-08

The PXT array method now lowers to the existing native reference-array random
reporter, retaining the selected element's type and identity. Differential
coverage includes single receiver evaluation, primitive values, Image mutation,
Sprite movement, nested-array alias mutation, empty-array missing values and
membership checks for multiple choices. Code→Blocks, native export→original
PXT, reimport and SB3 reload pass. This qualifies selection semantics, not an
identical random sequence or statistical distribution between simulators.
Native global declarations now parenthesize their values consistently with
assignments; this fixes an ambiguous image-pixel reporter declaration exposed
by the new fixture. Initial failures are retained privately.

The existing Arrays & Vectors reporter provides Blocks and pseudocode authoring;
export writes equivalent Math.pickRandom syntax. No new graphics tools or
callable authoring were added. Ten recovered tutorial projects remain partial
and their original extension packages unavailable. Named diagnostics53→51;
all10 partial fragments step without block errors. Same184 remains96/87/1.
Dynamic sprite references from multiplayer calls still need the corresponding
multiplayer API implementation and type propagation. See the
[receipt](receipts/2026-10-08-arcade-array-pick-random.json).

Production `gui.57b25cc9.js` also passes the native-file→Code→Blocks→controller
journey: one receiver evaluation, pixel5, shared nested-array length2,40
membership checks, then B moves the selected sprite x41→45. Prior journeys pass
with0 page errors. Build errors0; initial4,360,502 bytes remains within the
unchanged4,467,136 limit.31 affected and38 regression/gate tests pass without skips.
