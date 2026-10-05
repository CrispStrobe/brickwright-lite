# MakeCode Arcade compatibility plan

Snapshot: 2026-10-02. Scope: the pinned 184-source Arcade corpus and authored
Arcade games. This is a work plan, not a claim that a clean import runs like PXT.

## Baseline and interpretation

The current static audit reports **89 translated, 94 partial, and one parse
failure**. The partial rows contain **300 reported gap occurrences**.
Reason strings overlap: one missing semantic feature can produce several
property and callback reports in a game. See the dated sections below for the
vertical slices and behavior checks behind these totals.

The 2026-10-01 original-source compile baseline found 130 of 184 sources compilable with
the default pinned PXT packages. A bare `.ts` source may omit the package
manifest and generated art needed by the original project. Run
`compat-audit --compile` with recovered project files before deciding whether
PXT rejected the source itself. Its `pxt-compile-failed` stage retains the
diagnostic and is separate from a Brickwright translation failure. The one
parse failure is an incomplete source snippet; inspect its provenance before
changing the TypeScript parser.

The current conversion report has 82 of 183 parsable Arcade sources
preserved on MakeCode → Brickwright → MakeCode → Brickwright structural and
pixel-art roundtrip without a named gap. The `.sb3` → text permutation reports
binary artwork loss for every parsable source, even when its block structure
is preserved. These gates must
improve alongside the static audit; zero named gaps alone would be misleading.

## Work order

The category counts below are historical overlapping estimates from the initial
reason strings, not measurements of the current 94 partial projects.

| Priority | Capability | Projects mentioning it | Required work |
|---|---|---:|---|
| 1 | Sprite handles and events | about 100 | Replace the fixed-target fallback with one sprite identity model for all creation forms, aliases, reassignments, callback parameters, overlaps, destruction, properties and clones. |
| 2 | Tilemaps, camera and collisions | about 41 | Preserve tile assets and walls, scrolling coordinates, camera follow, tile overlap/hit events and projectile placement in tile scenes. |
| 3 | Artwork and rendering | about 41 | Preserve background changes, generated/package images, image mutation, animation frames, scale/rotation, pixel overlap and effects. |
| 4 | Language semantics | about 22 | Procedure returns, early return and break, closures, optional arguments, array values and nested expression evaluation. |
| 5 | Time, input and lifecycle | about 21 | Match PXT update ordering and frame time, controller motion, life and countdown callbacks, and simultaneous events. |
| 6 | Sound and music | about 14 | Implement melody, sound effects, background playback, timing and stop behavior in the VM and export. |
| 7 | External packages and missing assets | about 19 | Recover dependency manifests and art where licensed and available; classify files that need packages rather than inventing stubs. |
| 8 | Code/Blocks parsing | about 22 | Eliminate warnings for valid generated Code, preserve event and procedure bindings, and verify editor roundtrips. |

First repair the shared sprite model and its importer; isolated API mappings
will otherwise leave the same projects partial. Next implement world and image
semantics, then language control flow and audio. Revisit the corpus after each
vertical slice, not only at the end. Keep external-package work separate from
core Arcade behavior because source-only files often lack their manifest.

## Gate for each vertical slice

1. Pin a PXT source or authored fixture and confirm that the original compiles
   with its required packages. Read the official PXT implementation where
   behavior or event order is uncertain.
2. Add the feature to Code syntax, Blocks, `.sb3` serialization, the VM and
   MakeCode export as needed. Keep unsupported cases explicit.
3. Test creation, mutation, callbacks and reentrancy in the shipped VM. For
   visual or input features, run the built GUI in Playwright with the stage and
   controller pane; compare the same scenario with PXT where possible.
4. Save/reload `.sb3`, switch Code ↔ Blocks, export to MakeCode, compile, and
   reimport. Compare decoded image pixels and behavior, not just block counts.
5. Re-run the entire static and roundtrip audits. Record the rows made full,
   the rows still partial, and any new regression. Update this estimate after
   every ten slices.

## Estimate

The first sprite-identity slice added procedure arguments and calls through
multiple sprite handles, plus named-sprite movement inside overlap callbacks.
Two pinned sources now import cleanly, including the game that passes a Sprite
into `splashAndDash()` and the pizza overlap game. A constant background colour
survives the latter game's export. The full static audit changed from 46/137
translated/partial to 49/134, so one additional project became clean through
the same general importer path. These counts measure import only; the focused
fixtures also passed VM execution and PXT recompilation.

The next sprite-identity slice handles event registrations and helper
procedures inside a TypeScript namespace when flattening that namespace does
not change references. Two more pinned, PXT-compiling asteroid games now
import without named gaps and their exports compile in PXT. The audit moved
from 49/134 to 51/132 translated/partial. Namespaces with qualified references
or duplicate declarations stay on the explicit fallback path.

The creation-event path now carries scalar startup declarations, including
name prompts and screen coordinates, and string append assignments through
conditional branches. Four more pinned asteroid variants import cleanly and
recompile in PXT. A VM test checks the resulting joined text. The current
static count is 55 translated and 128 partial.

The next slice collects standalone and assigned sprite creation from loop and
callback bodies, so repeated assignments keep distinct handles. It also
supports a named player alongside interval-spawned asteroids. An `onCreated`
image change is now applied at the same costume index across every template
of that kind; the SVG records its exact pixel scale so exported art keeps its
dimensions. Six more pinned games moved to clean static import, including the
cloud game. Their original sources compile in PXT, and focused export checks
compile the translated projects. The audit is 61 translated / 122 partial.

The six newly clean projects now preserve all imported targets, opcodes, and
decoded pixel art through MakeCode → Brickwright → MakeCode → Brickwright.
Reimport recognizes generated interval bodies, parallel startup scripts,
top-level loops, event-handle assignments, and the exporter's string joins.
Generated template numbers may change when TypeScript event order changes, so
the artwork check compares the pixel multiset for those internal templates.
The separate `.sb3` → text → project permutation still reports art loss because
text decompilation cannot carry its binary asset payload; its structural
differences are empty for these six projects. This roundtrip result does not
establish runtime equivalence across all corpus games.

The next slice keeps sprite handles local to procedures. A procedure can now
create and position a sprite on each call, including after export and reimport;
renamed procedure parameters retain their binding. The pinned pizza procedure
imports without gaps, its export compiles in PXT, and its structural and art
roundtrip is preserved. The static audit moved to 62 translated / 121 partial.

An update callback can now create a projectile into a callback-local handle,
set its properties, and export a callback-local declaration that PXT accepts.
Callback locals use thread storage in the VM; Scratch replaces ordinary block
frames between commands, so procedure-frame storage alone lost the handle.
The pinned star game now runs its projectile with the requested kind, velocity,
and position. Its export compiles and reimports with no named gap. The static
audit moved to 63 translated / 120 partial. A separate runtime check also
covers a procedure that reassigns an existing local variable to a projectile.

Named sprite handles now remain live inside `game.onUpdate` callbacks. The
pinned chase game updates enemy velocity from its position relative to the
player; both that game and a four-sprite long-text game compile after export
and preserve their blocks and pixels on reimport. Parenthesizing computed
`randint` bounds preserves the random reporter through the text parser. The
handle path is selected for update conditions that compare sprite instances,
and for a custom-kind sprite; ordinary single-sprite updates retain their
fixed-target translation. The
static audit is now 65 translated / 118 partial, and 54 of the 183 parsable
sources pass the MakeCode roundtrip check.

Arcade sprite handles now support `left`, `right`, `top`, and `bottom` reads and
writes. An edge assignment moves the centre using the sprite's current image
dimensions, including after `setImage` changes the collision size. The pinned
trampoline game now imports without a named gap; its exported PXT code compiles
and its MakeCode roundtrip preserves blocks and pixels. The static audit is 66
translated / 117 partial, and 55 of 183 parsable sources pass that roundtrip.

The speech slice adds a nonblocking Arcade command for both `say` and
`sayText`, including handle/procedure/event receivers, persistent or timed
display, animation, colors and clearing. Pixel glyphs, wrapping, paging and
legacy scrolling reuse the pinned PXT speech algorithms; the bridge tracks
moving owners and disposes their renderer resources. The six pinned speech
examples preserve structural and pixel-art MakeCode roundtrips and their
exports compile. Playwright exercises the hat game's controller A button,
collision speech at its actual stage position, palette registration and expiry.
The check loads the current extension source into an existing GUI build because
the full build is deferred by the system load gate; it is not a fresh bundle
check. Generated handle script hosts now start hidden, removing their visible
placeholder costume. The audit moved to 69 translated / 114 partial, with
60 of 183 parsable sources preserving the MakeCode roundtrip.

The background-color slice replaces the imported palette-costume workaround
with a runtime command and reporter. Startup, procedures, controller handlers,
expressions and repeated color changes use the same API and export back to
`scene.setBackgroundColor` / `scene.backgroundColor`. `DEVICE ARCADE` projects
now store a black default Stage backdrop in SB3. Runtime color sits above the
Stage and below sprites/background images, preserving transparent image pixels.
Renderer resources are removed on load/restart. Playwright checks the real hat
game's A-button movement and speech, plus an added B-button color handler and
black after restart. It uses current extension source in the existing build;
a fresh build remains deferred by the system load gate. The audit stays at
69 translated / 114 partial: three color gaps were removed from projects with
other gaps. MakeCode roundtrips improve from 60 to 61 of 183.
Static translation and structural roundtrip counts do not certify visual
equivalence; continue the per-game PXT comparisons.

The sprite-flag slice adds a native flag command and a shared bitmask for
Invisible, Ghost, GhostThroughSprites/Tiles/Walls, StayInScreen, AutoDestroy
and BounceOnWall. Legacy flag commands write the same mask. Invisible changes
rendering but leaves overlaps enabled; Ghost combines three independent bits.
Projectile AutoDestroy remains set when another flag changes. Camera, tile
physics and diagnostic rendering are still separate gaps: this does not claim
support for RelativeToCamera, DestroyOnWall or ShowPhysics.

The handle importer now discovers sprites created inside controller callbacks,
keeps them local to each invocation and follows them through procedure calls.
Programs needing runtime flags or velocity no longer fall back just because
one update references one sprite. Other unsupported calls retain named gaps.
The real firework fixture compiles in original PXT and now imports its creation,
velocity and flags; at that point `particle.image.fill()` remained a gap. Boolean
assignments now evaluate expressions instead of storing text, and Arcade export
preserves Boolean assignment semantics without introducing a numeric ternary.
Native SB3 serialization retains flag fields. Playwright toggles the real hat
sprite off/on using the B controller and verifies its stage pixels, then checks
A-button movement and overlap speech. The static audit moves to 70 translated /
113 partial, with 492 gaps (down from 537); preserved MakeCode roundtrips are
62 of 183. The browser check uses current extension source in the existing GUI
build because the full build remains load-gated.

The mutable-image slice implements `sprite.image.fill`, `replace`, `flipX`
and `flipY` through Code, Blocks, runtime and Arcade export. Each directly
created sprite owns a pixel buffer and a temporary renderer skin; the authored
costume remains unchanged for save/reload. Transparency and flips update the
pixel collision mask. Costume changes, destruction and restart dispose skins.
A procedure using a sprite image parameter can now retain that handle even when
it has no call site, closing the firework helper's remaining gap. The real
A-button flip fixture also imports without gaps. Shared frame-image identity
across costume selections remains explicitly unsupported when combined with
mutation; drawing APIs and standalone mutable image variables need further work.

The static audit is now 73 translated / 110 partial / one parse failure, with
489 named gaps; MakeCode structural/pixel roundtrips preserve 64 of 183 parsable
sources. Code/project roundtrips preserve 72. Twenty-two regression tests passed,
including native SB3 save/reload, original PXT compilation and exported
compilation/reimport. A separate differential test compares all four image
operations with the pinned PXT simulator across all sixteen palette colors. Playwright
uses B-controller clicks to fill the real hat green, replace it red, then erase
it; the rendered colored pixels and collision mask both become zero. This run
uses the current extension source in the existing GUI build. A fresh GUI build
was attempted and deferred by the system load gate.

The next image slice adds `setPixel`, `getPixel`, `fillRect` and `drawLine`
through importer, Code, Blocks, VM and exporter. The drawing algorithms are
extracted reproducibly from the pinned MIT PXT simulator, with native image
storage, Scratch number conversion, renderer updates and collision masks.
Nine image regression tests pass, including pixel comparisons at clipped edges,
reversed lines, fractional coordinates, string numeric inputs, arithmetic on
pixel reads, native SB3 save/reload and PXT compilation/reimport. Playwright
uses the actual B controller to draw on the hat sprite and read color 2 back;
its collision mask contains exactly 88 opaque pixels. The browser uses current
extension source in the existing GUI build because the load gate remains high.
The static corpus remains 73 translated / 110 partial / one parse failure,
with 489 gaps. These APIs add game-authoring capability without changing the
remaining corpus eligibility.

Shared image identity requires an image resource model, rather than caching
mutations by costume index: image expressions must create resources, aliases
and arrays must retain the same references, sprites must attach those references,
and mutations must refresh every attached sprite. `setImage` must preserve an
existing image resource while literal image expressions create new ones. This
was the next image area at that point; the following slice implements the supported shared-frame paths.

The shared-image slice now provides explicit image handles and shared frame
resources. Sprite image aliases retain object identity, survive owner destruction,
and refresh every attached renderer and pixel-overlap mask. Frame selections
preserve edits across switches and different sprite templates; creation-callback
random frames now compile and reimport with the same sharing behavior. Equal
literal image expressions still create independent pixels. Sixteen image and
creation-event tests passed, including native SB3 reload and exported PXT
compilation. MakeCode structural/pixel roundtrips now preserve 65 of 183 sources;
static partial rows remain 110. At that point, `image.create`, arbitrary image arrays,
image procedures and additional drawing methods were still separate areas.

A fresh GUI build exposed Babel helper references escaping the embedded Arcade
factories. The GUI webpack rules now preserve those four self-contained factory
modules; a focused webpack bundle/instantiation test verifies this using the real
GUI rules. A full GUI build succeeded before that fix, while subsequent full
build attempts were load-gated. The browser check uses current extension source
in the built GUI. Its fixture loader now respects added costumes, and canonical
Arcade rendering uses the correct three-to-four pixel scale conversion, including
Scratch's minimum-size clamp for 1×1 images.
Playwright confirms 9,216 colored stage pixels per shared 32×32 image, exactly
nine for a detached 1×1 literal, and zero for both after a shared erase.

The generated-image slice adds `image.create`, independent Image clones,
width/height reporters, mutations and pixel drawing through image handles, and
sprite creation directly from those handles. Resources attach before creation
callbacks; local image declarations allocate fresh pixels on every procedure
call. Eight native Blocks opcodes, Code parsing/decompilation, import/export and
`.sb3` reload cover the same APIs. Pinned PXT bounds and integer conversion are
checked against its actual simulator implementation, and exports compile and
reimport. Twenty-one focused tests pass, including the webpack factory check.

The full GUI now builds successfully with the factory Babel fix. Playwright
uses that fresh bundle without source injection: A moves the player and triggers
speech; B attaches generated images, changes colors, and erases the original
while its clone remains unchanged. Each full 32×32 image occupies 9,216 stage
pixels. The capture waits for asynchronous SVG decoding rather than assuming
that two animation frames guarantee a loaded skin.

The rerun still has 73 translated / 110 partial / one parse failure, but named
gaps fall from 489 to 486 (291 distinct reasons). MakeCode structural/pixel
roundtrips still preserve 65 of 183 parsable sources. Code/project roundtrips
preserve 72; binary artwork through the text-only SB3 roundtrip remains an
explicit loss. At that point the next image areas were image-valued procedure
parameters, arbitrary image arrays, literal images as standalone values and
additional drawing APIs.

Image-valued procedure arguments now use binding inference scoped to each
function, rather than a global set of variable spellings. Inference follows
forwarded calls, recursion, local aliases, callback sprite images and direct
image expressions. Passing an image into sprite creation preserves its identity;
passing a clone gives independent pixels. Export derives `Image` annotations
from native image uses, alias assignments and forwarded custom-block calls.
Four new procedure tests cover runtime behavior, Code roundtrips, native SB3
reload, PXT compilation/reimport and numeric parameter shadowing. Ten existing
image/local tests also pass.

The GUI rebuild succeeds with these importer/exporter changes. Playwright uses
the built native extension and controller pane: B calls a forwarding image
procedure with a local alias, edits the attached resource, and erases it while
its clone remains unchanged. Corpus counts stay at 73 translated / 110 partial /
one parse failure, 486 named gaps, and 65 preserved MakeCode roundtrips. These
static metrics do not establish runtime event ordering.

Testing identified a separate ordering gap: creation callbacks run in Scratch
threads, so edits made by a callback procedure may complete after the sprite
creation caller resumes. PXT creation-callback completion must be implemented
before claiming synchronous reads immediately after creation. This is explicitly
recorded, and the callback test reads pixels after its own procedure call.
Arbitrary image arrays, standalone literal values and more drawing APIs remain
image work. The older frame regression assertions now check the shared frame
reporter and actual pixels; its VM test loads real costume assets.

The creation-order slice now suspends sprite creation until its matching
callbacks finish. Handlers execute sequentially in event-hat order using the
VM's existing Promise reporter support; nested procedures and nested sprite
creation keep independent snapshots. Waiting callbacks leave controller events
and other scripts active. Stop, restart and disposal cancel the pending waits.
The headless VM harness now advances Promise continuations between controlled
frames, and SB3 reload checks use the same stepping helper.

The ordering reference test runs the pinned PXT `sprites.create` implementation
itself. Native behavior matches its sequential handlers and immediate image
reads after creation. Projectile callbacks see zero initial velocity; requested
motion and source/edge placement follow callback completion and use the image's
resulting dimensions. Literal-art projectile creation callbacks now enter the
named-handle importer. PXT export compilation and SB3 reload remain verified.
Five focused ordering tests, six image/projectile tests and 24 related regression
tests pass. The full GUI compiles with this runtime change.

The static corpus remains 73 translated / 110 partial / one parse failure,
486 named gaps, and 65 preserved MakeCode roundtrips. Remaining event work
includes runtime registration and removal, captured procedure locals and exact
fiber/frame timing; waiting for callbacks does not establish timing parity.
Generated image projectile inputs and the other remaining image APIs are still
explicit scope for following slices.

The runtime-registration slice now emits creation-handler registration at the
original call site, including calls inside procedures and other callbacks.
Handlers capture live parameter/local bindings; repeated procedure calls retain
independent cells, image and sprite handles keep their identity, and nested
registrations inherit the outer bindings. Native Blocks and pseudocode expose
registration and captured-variable reads/writes. SB3 reload resets registrations,
and export emits lexical PXT callbacks at the original registration statement.
Computed kind expressions report an explicit unsupported element.

Fast creation callbacks now execute through the native VM sequencer before the
caller continues; callbacks that yield still use cancellable waits. This fixes
physics/overlap events occurring before ordinary caller setup. Nested projectile
creation snapshots its arguments, and export avoids resetting callback-adjusted
positions to the default center. These checks establish the tested ordering,
not universal PXT fiber timing parity.

All 55 focused checks pass (54 regression checks plus the computed-kind check),
including PXT export compilation, reimport, captured Image/Sprite arguments,
nested callbacks and native SB3 reload. The production GUI builds. Playwright
using the bundled extension verifies late registration (the earlier sprite
remains color 1; the later sprite becomes 7), handler order 12 and immediate
pixel reads, plus controller movement, speech and image-procedure rendering.
The 184-source audit remains 73 translated / 110 partial / one parse failure;
reported gaps fall to 484 across 290 distinct reasons. MakeCode roundtrips still
preserve 65 projects. Block/loop binding scope, scene-specific handler lifetime,
other callback captures, nondefault spawn-coordinate ordering and exact timing
remain event work; image APIs and generated-image projectiles remain separate
open areas.

The generated-image projectile slice now provides a native reporter in the
Arcade palette and Code syntax. All four PXT creation forms accept live Image
handles, including procedure arguments, sprite images and clones. Images attach
before callbacks, retain shared identity, and determine edge offsets after
callbacks finish. Export passes the Image to the matching PXT projectile API;
Code and SB3 reload preserve the operation. The Code parser also now bounds
image-projectile phrases before arithmetic, preventing `kind-source` from being
misread as subtraction.

The GUI builds and the 42-check image/projectile/export suite passes, including
original PXT compilation and exported-source reimport. Nine additional local,
source-placement and callback-order checks cover the existing projectile path.
Playwright with the bundled extension verifies controller B launching from the
source position, callbacks reading width 4 and color 7, requested velocity 12,
shared pixel edits and all 72 expected colored stage pixels. The new reporter
appears in the GUI palette. Creation registration/order, movement and speech
checks also pass. The corpus remains 73 translated / 110 partial / one parse
failure, 484 gaps across 290 distinct reasons, and 65 preserved MakeCode
roundtrips. This slice adds supported behavior but does not clear a corpus row.
Other image drawing APIs, arbitrary image arrays and image-returning procedures
remain image/language work; tile/camera physics and other event gaps remain open.

The image-copy slice now exposes opaque/transparent image copying and Boolean
image overlap across Blocks, Code, native runtime, import and PXT export.
Both Image inputs participate in procedure-type inference. The generated MIT
algorithm module now includes PXT image copying and overlap, with its source
hash and third-party notice updated. Native adapters retain shared resource
identity and refresh every affected sprite's pixels and collision mask.

Differential tests compare clipping, fractional offsets, transparency and
self-copy directly with the pinned PXT source. An end-to-end fixture verifies
shared destination images, procedure sources, Boolean assignments/conditions,
Code decompilation, native SB3 reload, PXT compilation and exported reimport.
The 17-check image regression suite passes; the image mutation/export regression
suite adds 41 checks. The GUI builds. Playwright with the bundled extension
verifies controller B drawing, image overlap true/false, both palette blocks,
44 opaque source pixels and exactly 18 red, 18 green and 360 yellow stage
pixels. Projectile creation, registration/order, movement and speech checks
remain passing in the same browser run.

The 184-source corpus remains 73 translated / 110 partial / one parse failure,
484 gaps across 290 distinct reasons, and 65 preserved MakeCode roundtrips.
These operations expand tested compatibility without clearing a partial corpus
row. Remaining image work includes literal resources, arbitrary image arrays,
other drawing APIs and Image-returning procedures. Function return support is a
separate language slice and remains one of the most common audit reasons.

The function-result slice now supplies native call-with-result, argument-list
and return-value Blocks plus Code syntax. Imported scalar/Image value calls
use independent invocation frames, early returns unwind only the current
procedure, and yielded/recursive calls resume with their own arguments.
Caller cancellation, stop/restart and disposal cancel pending children.
Creation handlers retain cells captured before their registering procedure
returns. Numeric argument transport preserves NaN/infinity and strings.

The implementation also fixes renamed procedure parameter declarations,
parameter reads/writes, procedure loop counters and bounded parsing of nested
argument chains. Complex command-call arguments are emitted directly as grouped
reporters, so yielding arguments do not share global temporary variables. Export emits native calls/returns and infers Image parameters,
return values and intermediate variables through compact Scratch variable
inputs. Possible undefined results remain explicit unsupported value calls;
command procedures can use bare returns. Parameter reads and writes share a
canonical Code representation, restoring a corpus roundtrip lost during this
slice rather than changing the comparison rules.

Ten focused function checks and 52 related regression checks pass, including
Code/SB3 reload, PXT compilation/reimport, nested/mutual recursion, concurrent
yielding calls, cancellation, returned-image clones and captured cells. The GUI
builds. Playwright with the bundled extension checks fib(6)=8, controller B
using a returned 6x4 image, all 216 expected green stage pixels and the three
function blocks in the palette; creation registration/order, movement and
speech remain verified. The newly translated corpus item is a function-only
source example: invoking it with zero and two repetitions produces only two
"hello" serial messages and continues the caller. It is not a complete game.

The audit now reports 74 translated / 109 partial / one parse failure, down
from 110 partial. Named gaps fall from 484 to 466 (283 distinct reasons).
Project/Code roundtrips preserve 73; MakeCode roundtrips remain at 65. The
function-only source still has an export artwork gap. Existing raw SB3-to-Code
artwork losses remain in the conversion report. Undefined values, Sprite-valued
returns, first-class functions, mixed return types, lexical block scope and exact
fiber timing remain language/runtime work, alongside the earlier image,
tile/camera, effects, sound and package gaps.

### Sprite-valued function results

Sprite-returning functions now work through import, Blocks/Code, native
execution, SB3 save/load and MakeCode compilation/reimport. This includes
returning local creations, direct sprite/projectile creation expressions,
forwarded calls, parameter identity, independent instances, property access
through calls and image replacement. Export propagates Sprite types through
parameters, local/global aliases and result bindings.

Fifty distinct function/image/export checks pass across the regression suite
and focused reruns. The GUI builds after moving the regenerable webpack cache
from the full volume to local `/tmp` storage, retaining a symlink. Playwright
with the bundled extension and the pinned hat/speech game checks controller B
creating and steering a returned 6x4 sprite to (140,95), alias identity and all
216 expected green rendered pixels. Controller movement and overlap speech
remain verified.

A corpus rerun exposed five extra opcode losses from accepting inferred handles
whose creation was not translated. Handle recognition now requires supported
creations or Sprite-result bindings; these regressions are fixed. Corpus totals
remain 74 translated / 109 partial / one parse failure, with 466 named gaps
(283 distinct). MakeCode roundtrips retain 65 preserved / 78 loss / 40 partial;
project/Code roundtrips retain 73 preserved. This slice does not clear another
complete corpus row. Remaining work includes sprite creation routing,
undefined values, first-class/mixed-type functions, full lexical block scope,
exact fiber timing, tiles/camera, effects, sound and packages. Direct spawn
reporters with custom coordinates still need expression-safe export positioning.

### Literal projectile routing and native controller bindings

All three projectile creation APIs now participate in the named-handle path
for decodable literal art, without requiring generated images or creation
callbacks. Six pinned corpus sources no longer report creation gaps. Function
and callback locals retain instance handles; nested uncaptured instance
`onDestroyed` registrations retain their handlers. Global declaration aliases
also preserve instance identity. PXT's projectile-kind zero default and numeric
builtin kinds are handled explicitly; unknown numeric/dynamic kinds remain
reported gaps. Background-image projects retain the established artwork route.

The handle path now has a native `arcade_controlSprite` command and a Blocks
palette entry, Code parser/decompiler and MakeCode exporter. Registration occurs
at the original statement position and binds the actual instance. Multiple
controlled sprites, dynamic speeds, zero axes, rebinding, null registration and
release work through native velocity/acceleration. Digital diagonal input follows
the quantized vector in pinned PXT `game/controller.ts`; no generated position
loop substitutes for the controller binding. Legacy fixed-target controller
translation, analog pressure, multiplayer controllers and exact frame timing
remain separate work.

The GUI builds; 86 distinct automated checks pass across controller/function/
export tests and related import/projectile regressions. The new verification CLI
runs all six newly translated private-corpus sources through native execution,
Code, SB3 reload, MakeCode compilation and reimport with action assertions:

```sh
node --import ./scripts/lib/register-gui-scope.mjs scripts/verify-arcade-projectile-corpus.mjs --browser
```

It accepts `--corpus-dir` and `--out`. After a complete native run,
`--browser-only` reuses its report to check the two real controller-driven games
against the production GUI, without recompiling all six again. Source apps stay
in the private corpus. Evidence is in
`test-results/arcade-projectile-corpus-current.json`.

Playwright presses the actual controller pane with simultaneous touch input:
the paddle moves from x=80 to x=90 while y remains 110 with vy=0; the player in
the food/enemy game moves from (80,60) to (87.0703125,67.0703125) at velocity
70.703125 per axis. Both render real art and timed projectiles; the controller
block is present in the palette and no page errors occur.

Corpus totals improve from 74 translated / 109 partial to **80 translated /
103 partial / one parse failure**. Named gaps fall from 466 to **446** (275
distinct). MakeCode roundtrips improve from 65 to **71 preserved**, with 77 loss
and 35 partial; project/Code roundtrips improve from 73 to **79 preserved**.
No previously preserved MakeCode row regresses. Raw SB3-to-text artwork losses
remain 183. Missing art, background/handle integration, arrays and sprite-kind
expressions, destruction closure capture, flags/terrain, general callback
routing and the earlier language, effects and sound gaps remain explicit.

### Shared background Images and native forever callbacks

Background Images now work alongside native sprite handles, retaining mutable
Image identity and aliasing. Setting, clearing, lazy 160×120 creation, literal
art, cloning, procedure returns and sprite/background shared mutation work in
Blocks, Code, the native VM, `.sb3`, MakeCode export and reimport. Hidden artwork
templates do not become live sprites. Rendering uses the Arcade top-left origin
and transparent pixels over the solid background color. Native `forever`
callbacks preserve their own locals and can spawn independent projectiles.

The 184-source audit is now **82 translated / 101 partial / one parse failure**,
with **443 named gaps / 272 distinct gaps**. MakeCode roundtrips are **73
preserved / 75 loss / 35 partial**; project/Code roundtrips are **81 preserved /
99 partial / 3 loss**. No previously preserved MakeCode roundtrip regressed.
Raw SB3-to-text artwork losses remain 183. These are structural metrics, not a
claim that every translated game has behavioral parity.

Newly cleared sources are a basketball game and a background drawing snippet.
The focused background tests verify mutable resources, clearing and lazy
creation, literal backgrounds and forever loops across native execution, Code,
SB3 reload, actual PXT compilation and reimport. The older real-game fixture
checks now assert native timed instances, original artwork, Arcade coordinates
and velocity instead of the superseded fixed-target clone representation.

The repeatable private-corpus check is:

```sh
node --import ./scripts/lib/register-gui-scope.mjs scripts/verify-arcade-background-corpus.mjs
```

All 77 automated checks pass across the background, importer, controller and
export suites, including PXT compilation of more than 40 exported examples.
The production GUI rebuild passes. Playwright drives the controller pane and
checks rendered pixels for shared background mutation, clearing, literal
replacement, transparency, layering beneath sprites, palette blocks and
restart. Clearing also uncovered a one-pixel solid-fill edge seam; extending
the solid background beyond stage bounds removes that seam. No page errors
occur. Evidence is saved in
`test-results/arcade-background-browser-current.json` and
`test-results/arcade-background-corpus-current.json`.

General Image variables/literal assignments, arbitrary arrays, kind expressions,
destruction closure capture, general callback routing, language parity,
flags/terrain, tiles/camera, effects, sound/packages and exact fiber timing
remain explicit work. Continue through each area with behavior and roundtrip
gates rather than reclassifying unsupported features.

### Literal Image values, procedure results and fresh allocation

Literal Image values and decoded builtin gallery images can now initialize
Image variables, pass through aliases and procedures, and feed native sprite
creation and shared backgrounds. Procedures returning literals retain Image
result types through MakeCode export/reimport. Image-only programs use the same
native resource path. A literal expression allocates a fresh Image on each
evaluation; shared variables retain identity. Repeated background literal
installation therefore restores the original pixels instead of reusing the
previously mutated object. Hidden costumes retain literal pixels; existing
shared-frame and clone Image blocks carry the runtime operations.

The named-handle routing decision now uses scoped Image inference before
checking statement shapes. Canonical exported shared-frame references support
ordinary Image values without displacing the existing sprite frame-array art
route. Literal resource templates use the established hidden template naming
so import/export preserves artwork rather than reporting an artificial rename.
Untagged strings and arbitrary tagged templates are not treated as Images.
Builtin gallery constants retain shared identity across reads and direct sprite
creation; their clones remain independent. This follows the pinned PXT
compiler output, where repeated builtin reads use the same global Image.
Generated Image-resource template numbers can change during export; artwork
comparison checks exact pixel multisets within the resource-template family,
as it already does for generated sprite templates. Named artwork retains its
owner identity.

All **45 tests** pass across literal/generated Image, background and real-game
import suites. Tests exercise native execution, Code, SB3 reload, actual PXT
compilation and reimport. The newly supported private-corpus duck-image snippet
retains exact horizontally flipped pixels through every path. Its repeatable
CLI is:

```sh
node --import ./scripts/lib/register-gui-scope.mjs scripts/verify-arcade-literal-image-corpus.mjs
```

The GUI rebuild passes. Playwright uses the controller pane to call a
literal-returning procedure, mutates its Image, assigns it to a sprite and
checks all 216 rendered green pixels and the function Blocks palette. No page
errors occur. Evidence is in
`test-results/arcade-literal-image-corpus-current.json` and
`test-results/arcade-literal-image-browser-current.json`.

The affected real food/enemy game also passes native execution, Code, SB3,
PXT compilation and reimport. Playwright presses two controller directions,
moving the player from (80,60) to (87.0703125,67.0703125), checks rendered art
and timed projectiles, and finds no page errors. Evidence is in
`test-results/arcade-literal-image-game-current.json`. The projectile verifier
now accepts `--ids` to select known pinned cases and validates browser report
identity; both native projectile creation primitives contribute to its action
counter. To reproduce this game check:

```sh
node --import ./scripts/lib/register-gui-scope.mjs scripts/verify-arcade-projectile-corpus.mjs --ids ed684a4cfd3026bf --out test-results/arcade-literal-image-game-current.json --browser
```

Corpus totals are now **83 translated / 100 partial / one parse failure**,
with **440 named gaps / 269 distinct gaps**. MakeCode roundtrips are **74
preserved / 73 loss / 36 partial**; project/Code roundtrips are **82 preserved /
98 partial / 3 loss**. No previously preserved MakeCode row regresses. Raw
SB3-to-text artwork losses remain 183. Counts are structural; runtime parity
still requires behavior checks.

Next areas remain general sprite/Image arrays and values, callback capture,
sprite-kind expressions, terrain/tile/camera physics, language semantics,
effects, sound/packages and exact fiber timing. Missing source assets still
require provenance/dependency recovery rather than substituted artwork.

One iteration means a vertical feature slice through importer, editor, VM,
exporter and focused tests; it is not one parser special case. Estimate **45–75
iterations** to reach zero *eligible* static partial rows after source and
dependency triage: 4–6 for baseline/provenance, 12–18 for sprite identity and
events, 8–14 for tile/camera/physics, 7–12 for language and images, 5–9 for
sound/effects/packages, and 9–16 for export and regression closure. The ranges
overlap in implementation and are planning estimates, not additive promises.

At one to three focused engineering days per iteration, this is roughly
**6–12 months for one experienced full-time engineer**. Behavioral parity of
the pinned games, including graphics, timing, input and sound, is a larger gate:
allow **another 6–12 months**. The raw count of 137 cannot honestly reach zero
until files that fail PXT compilation or lack original dependencies are
classified with provenance. New PXT versions and arbitrary external packages
need their own scope; no finite corpus proves universal compatibility.

### Reference-valued arrays in Arrays & Tensors

The existing Arrays extension now offers reference-valued arrays. Sprite and
Image arrays retain identity through aliases, procedure parameters and returns,
indexing, assignment, insertion and removal. They use the same reference objects
in the native VM, editable Blocks, Code and SB3. Export infers Sprite[] and
Image[] parameter, global and result types and emits normal MakeCode arrays.

Supported operations include creation, zero-based indexing, length, length
assignment, push, unshift, insertAt, set, removeAt, pop, shift, removeElement,
reverse, indexOf (including its starting index) and Math.pickRandom. The
removeElement value block reports whether an element was removed, following
PXT; the command form discards that result. Numeric values retain their type,
and numeric-looking strings remain strings, so strict indexOf/removeElement
matching agrees with the source. Array and Image aliases retain identity;
removing an element leaves any existing sprite or Image reference valid.

For-of lowers to an indexed loop with one evaluation of its array expression.
Generated loop variables are unique across nested loops and avoid source names.
Random selection has a dedicated value block, so a procedure producing its
array runs once. The importer prefers the expanded native handle path before
its older creation-event fallback, and keeps canonical exported costume-frame
arrays on their established artwork path.

All **63 focused tests** pass across reference arrays, existing array table
operations, literal/generated/background Images and the Arcade import suite.
They exercise Code/SB3 reload, native reference behavior, actual PXT compilation
and MakeCode reimport. The real private-corpus asteroid app repeatedly creates
sprites using the original randomly selected gallery images at valid positions
through every path. Its source stays private; checks are saved in
`test-results/arcade-reference-array-corpus-current.json`.

A full GUI rebuild and Playwright check exercise the controller pane: B assigns
one array-held Image to both array-held sprites, then mutates the Image on the
next press. Both share the same resource and the stage renders 216 green pixels,
then 216 red pixels in the checked sprite region. All nine array value/mutation
blocks are present in the palette. The report is
`test-results/arcade-reference-arrays-browser-current.json`.

Current MakeCode roundtrips are **75 preserved / 75 loss / 33 partial**;
project/Code roundtrips are **84 preserved / 97 partial / 2 loss**. No previously
preserved conversion path regresses. Raw SB3-to-text artwork losses remain 183.
The static translated count rises from 83 to 84, partial falls from 100 to 99,
and named gaps fall from 440 to 426. These are structural gates, not a claim of
runtime parity for all 184 apps.

Remaining array/language work includes nested array element typing, full
boolean/undefined value semantics, map/filter/slice/concat/sort and other
higher-order APIs, expression updates and evaluation order for complex compound
assignments, and per-iteration closure capture. Empty reads/removals report an
explicit undefined-value diagnostic; undefined must become a real runtime value
before their behavior can be claimed compatible. Scalar-array-only apps keep
the established importer path while the reference path grows. Terrain, sprite
kind expressions, physics, effects, sound/packages and exact fiber scheduling
remain separate vertical slices.

### Nested arrays, array conditions and index typing

A shared value-type graph now joins alias, procedure and array-element
constraints in both import and export. It infers nested Sprite/Image rows,
three-dimensional Image collections and rows inserted into empty arrays.
Removed rows keep their identity and remain usable through existing aliases.
Self-containing arrays remain finite graphs and export as usable any[] types;
there is no arbitrary nesting limit in the runtime or a growing sequence of
recursive type tags in the importer.

Code parsing now splits array arguments at balanced top-level groups, so a
nested constructor's `rest` phrase cannot consume the enclosing constructor.
Array item conditions use a dedicated Boolean block with JavaScript truthiness:
zero, empty text, false and a missing item are false; nonempty text, true and an
array reference are true. Boolean literals in array constructors become real
Boolean values. Testing a missing row therefore works without materializing an
unsupported undefined value. Ordinary undefined reads still report their gap.

Export also infers numeric array index parameters/locals and nested row local
types. The pinned PXT compiler requires a numeric index rather than an `any`
local when indexing a typed array; these are actual declarations, not compiler
error suppression. Image/sprite/array locals initialize to null and numeric
locals to zero. Boolean array conditions stay Boolean Blocks rather than
passing through a numeric equality and an unsupported conditional expression.

All **68 focused tests** pass through native execution, Code and SB3 reloads,
PXT compilation and MakeCode reimport. A fresh GUI build passes. Playwright
checks nested Sprite/Image rows using the controller pane, verifies shared row
aliases and Image changes, and finds the ten array blocks in the palette.
Evidence: `test-results/arcade-nested-arrays-browser-current.json`.

The newly translated private tile-matching app initializes its 11×11 numeric
board (121 cells), paints a 160×120 Image and moves its cursor with directional
controls through all conversion paths. Playwright presses the controller pane,
moves the cursor to cell (1,1), checks 1,809 rendered tile-colored pixels and
finds no runtime/page errors. This verifies startup, board drawing and
**directional controls**, not the complete game. Its A-button refill path still
needs general undefined-value and short-circuit semantics. The report keeps
that limit visible: `test-results/arcade-nested-array-corpus-current.json`.

```sh
node --import ./scripts/lib/register-gui-scope.mjs scripts/verify-arcade-nested-array-corpus.mjs --browser
node --import ./scripts/lib/register-gui-scope.mjs scripts/verify-arcade-speech.mjs --nested-arrays
```

Current totals: **85 translated / 98 partial / one parse failure**, with **425
named gaps / 257 distinct reasons**. MakeCode roundtrips: **76 preserved / 75
loss / 32 partial**. Project/Code roundtrips: **85 preserved / 96 partial / 2
loss**. No previously preserved conversion path regresses. Raw SB3-to-text
artwork losses remain 183. These counts remain structural, separate from the
behavioral gates above.

Next: general undefined/null/Boolean values and short-circuit evaluation, then
higher-order array APIs, complex compound-expression evaluation order and
closure capture. The tile game's A-button path provides a concrete behavior
case for the value/evaluation work. Terrain, kind expressions, physics,
effects, sound/packages and exact fiber scheduling remain separate areas.

### Missing values, lazy conditions and the tile-game refill

Arrays now return a real missing value for empty pop/shift/removeAt/random
selection and missing indexes. It remains distinct from null, zero and ordinary
text through assignment, array value chains, procedure arguments, explicit
returns and fallthrough. The Arrays palette adds **undefined/null value**,
**truthiness of value** and **compare value** blocks. Strict equality preserves
primitive distinctions; loose null/undefined equality is supported. Missing
values are carried with a typed tag rather than a reserved text string.

The SB3 serializer keeps standard scalar variable fields schema-valid and
stores missing/null values in an optional `bwSpecialValues` sidecar. Reload
restores their types before execution. A test saves and reloads them without
restarting the program, including an ordinary string containing `undefined`.
The exporter writes normal TypeScript undefined/null and adds an explicit
undefined return for procedures which can fall through, satisfying PXT's return
checks without replacing the result with zero.

Compound if/while/for predicates use editable branches and invocation-local
condition cells. The right operand runs only when required, loop guards are
re-evaluated after each iteration, and negation preserves the branch order.
This includes numeric/arithmetic expression truthiness after MakeCode reimport.
Startup scripts with invocation locals export inside a normal procedure so
those cells do not become shared file globals. Array nesting and procedure
local declarations select the runtime translator on reimport.

A source variable named score is separate from `info.score()`. Native Arcade
score commands/reporters now use explicit Code spellings and export the normal
info APIs. Source variables colliding with PXT's image/images namespaces are
renamed on export.

All **71 focused tests** pass. The original private tile app's A-button path
now passes native execution, Code roundtrip, SB3 reload and PXT compilation/
reimport. A deterministic two-tile group at the upper-left edge exercises both
short-circuit traversal and undefined reads during collapse. The check verifies
20 points, all 121 numeric cells restored, and every unmatched tile unchanged.
The same checker presses the actual browser controller pane on a fresh build.
Evidence: `test-results/arcade-nested-array-corpus-current.json` and
`test-results/arcade-missing-values-regression-current.json`.

Current structural totals remain **85 translated / 98 partial / one parse
failure**. Named gaps decrease to **419 / 252 distinct**. MakeCode roundtrips:
**76 preserved / 72 loss / 35 partial**; Project/Code: **85 preserved / 96
partial / 2 loss**. No previously preserved path regresses. Some former loss
rows are now partial because logical expressions used as values explicitly
name their missing operand-preserving evaluation. Raw SB3-to-text artwork loss
remains 183.

Remaining value work: `a && b` / `a || fallback` used as values, conditional
expressions, complete Boolean variable typing, undefined/NaN arithmetic and
string coercion, and general absent optional parameters. Value logical
expressions remain named unsupported features; the supported lazy lowering is
for Boolean contexts. Do not read this slice as complete JavaScript value
semantics. Higher-order array methods, compound-expression evaluation order,
closure capture, terrain, sprite kind expressions, physics, effects,
sound/packages and exact fiber scheduling remain separate areas.


## 2026-10-01 — operand-preserving lazy values

Logical `&&`/`||` and conditional expressions now lower before type inference
into ordinary branches and invocation-local cells. They preserve selected
operand values and Sprite/Image/array aliases. The lowering saves earlier reads,
call arguments, array elements and receiver/index evaluations before subsequent
lifted statements; compound assignments also save the old left value before
RHS side effects. Lazy `for` initializers/updates and loop guards are covered.

Primitive type propagation and export preserve numeric-looking text, Boolean
values, null and missing values across procedure calls and variable/local stores.
Mixed resource/primitive selections export as `any`; typed resource selections
retain their normal PXT types. Wrong-type array indexOf searches widen the array
annotation without aliasing its elements to the searched argument.

The real private Pong app exposed overlap predicates used as values becoming
variable reads. These now produce actual Boolean reporter blocks. Paused
functions returning null exposed Scratch's promise completion sentinel collision;
completion is now tracked separately from the payload on the owning stack frame.
The simultaneous A/B callback regression exercises separate local cells and
paused returns across native, Code, PXT compilation/reimport and SB3 reload.

Current static totals: **86 translated / 97 partial / one parse failure**,
**418 named gaps / 251 distinct reasons**. MakeCode structural/art roundtrips:
**77 preserved / 73 loss / 33 partial**; Project/Code: **86 preserved / 95
partial / 2 loss**. No previously preserved conversion path regresses. Raw
SB3-to-text binary artwork loss remains 183. The additional loss row records four `operator_and` blocks becoming branch
blocks after reimport (`arcade-6138239a39722137.ts`); the structural gate still
reports this change. No unsupported diagnostic is suppressed.

Evidence: `test-results/arcade-lazy-values-regression-current.json`,
`test-results/arcade-lazy-value-corpus-current.json`, and the current 184-app
static and conversion reports. Pong checks cover startup, controller bounds,
both real paddle collisions, scoring and reset across all conversion paths.

Next value gaps: undefined/NaN arithmetic and string coercion, value-position
assignment/update expressions, general optional parameters and higher-order
array callbacks. Closure capture, break/continue, terrain, sprite kinds,
physics/effects/sound/packages and exact fiber scheduling remain separate work.
These results do not establish complete Arcade compatibility.


All **77 focused tests** pass, and a fresh GUI build succeeds. Playwright uses
Pong's actual controller-pane buttons to check steering, left/right limits,
both paddle bounces and scoring; rendered art contains 3,348 white pixels,
with no block or browser errors. The native and conversion checks also assert
selected paddle identity and reset position/velocity. These are bounded game
checks rather than a claim that every game state matches the PXT simulator.

The existing private tile-game regression also passes all conversion paths and
Playwright controls: score 20, 121 refilled numeric cells, every unmatched cell
preserved, and 66,771 coloured stage pixels with no errors. Its screenshot gate
now waits for the A-button callback to finish; score is incremented before the
board redraw, so stopping at the score change could capture a partial frame.


## 2026-10-01 — primitive arithmetic, numeric storage and optional arguments

The Arrays palette now has binary and unary value operations. Native Arcade
uses JavaScript primitive semantics for `+ - * / %`, numeric unary `+/-`, and
value comparisons, including relational operators. Missing values are decoded
at the boundary: undefined arithmetic produces NaN, null converts to zero,
Boolean addition converts to numbers, and text addition preserves concatenation.
Remainder retains the dividend's sign. NaN comparisons no longer pass through
Scratch's numeric/string comparison rules or negated less-than approximations.

Native variable/local/parameter stores and array compound assignments preserve
actual types. Increments perform numeric conversion before addition, including
text-valued counters. Returned numeric literals are genuine numeric reporters,
while variables and procedure results are not blindly coerced through Scratch's
`0 + value`. Finite numeric literals and predicates keep compatible core blocks.

Array argument chains and procedure calls retain NaN, infinities and negative
zero through typed JSON tags. Scalar SB3 values use the existing optional
`bwSpecialValues` sidecar with schema-valid standard fields. A save/reload test
checks nonfinite scalars and negative zero without restarting the program.
Ordinary text `"NaN"` remains text.

Exports use ordinary typed operator procedures to satisfy PXT's mixed-value
checking. Import recovers their operations only after validating their full
pure body and every use; a matching name alone cannot grant intrinsic behavior.
Addition result types flow through aliases, procedure parameters/returns and
array elements, keeping numeric indexes numeric and mixed values dynamic.
Primitive procedure return annotations also follow this graph.

Omitted optional parameters now receive undefined. Default parameter expressions
run only for missing or explicit undefined values, preserving null, zero and
numeric-looking text. Required missing arguments remain named diagnostics.
Native life-zero callbacks keep positive-to-zero detection and rearming; exported
pure `pauseUntil` predicates import as wait-until blocks. Min/max reporter grammar
now recognizes its argument separator before Boolean `and`, including nested
parenthesized operands.

Verification includes primitive coercion, signed remainder, NaN/Infinity,
negative zero, paused returns, stores/increments, optional/default arguments,
numeric indexes through procedure returns, and life-zero rearming across native,
Code, SB3 and PXT compilation/reimport. The shared Micro:bit/Calliope/parser tests
are included alongside the Arcade/Arrays regressions.

Current corpus: **88 translated / 95 partial / one parse failure**, **411 named
gaps / 247 distinct reasons**. MakeCode roundtrips: **80 preserved / 70 loss /
33 partial**. Project/Code: **87 preserved / 94 partial / 2 loss**. Previously
preserved paths remain preserved. Raw SB3-to-text binary artwork loss remains 183.
The reports keep structural and runtime gates separate.

Real Pong passes controls/bounds, both paddle collisions, scoring/reset and all
conversion paths. The real tile game passes movement, two-tile boundary removal,
20 points, 121 refilled cells, unchanged unmatched cells, PXT reimport and browser
controls. Its visual gate independently composes the expected board from current
cells and tile pixels, waits for the complete image and freezes in the same
browser evaluation before the next update can clear it.

Evidence: `test-results/arcade-value-arithmetic-regression-current.json`,
`test-results/arcade-lazy-value-corpus-current.json`, and
`test-results/arcade-nested-array-corpus-current.json`.



Next: array/resource ToPrimitive and mixed resource comparisons; higher-order
array callbacks; Math/string API coercion; compound receiver/index evaluation
without lazy expressions; value-position assignments/updates; general closure
capture and break/continue. Callback argument/default behavior and exact PXT
fiber/render timing require separate checks. Terrain, dynamic sprite kinds,
physics/effects/sound/packages and binary artwork in text remain open. This slice
implements primitive operator semantics, not all JavaScript or Arcade APIs.

All **139 focused tests** pass, including the shared parser, Micro:bit and
Calliope regressions. A fresh GUI build succeeds. Pong and the tile game pass
controller-pane checks on that build with no block/browser errors. The tile
image matches the complete expected board before capture (69,201 coloured
stage pixels in the recorded run). The private optional-parameter example
`arcade-784124ace9bd6367.ts` also passes native, Code, SB3 and PXT
compilation/reimport: eight log lines in ordered groups of three and five,
with no missing-argument warning. Verify it with
`scripts/verify-arcade-optional-corpus.mjs`.

## Compound targets and statement updates (2026-10-01)

Array and sprite stores with calls now snapshot their receiver and index
before the right operand runs. Compound stores also snapshot the old value.
This handles ordinary expressions as well as lazy expressions: a right-side
procedure may mutate the element or select another object, but the store
still targets the object selected on the left, with each target call made once.
Numeric built-ins retain their existing path when their arguments have no
mutating calls. All generated cells remain editable invocation locals.

Statement prefix/postfix increments and decrements support array elements and
sprite properties. Numeric conversion precedes arithmetic, preserving text
`"5"` becoming 6, missing values becoming NaN and negative zero semantics.
Postfix update parsing respects line terminators, including multiline comments;
a next-line prefix update cannot attach to the previous statement.

Real Pong testing caught a startup receiver lookup bug: a temporary sprite
handle was stored locally but read as a global. Temporary resource lookups now
use their invocation cells before ordinary handle aliases. The roundtrip
fixture includes a function-valued sprite property assignment at startup.

On the final build, real Pong passes controller movement/bounds, both paddle
collisions, scoring and reset. The tile game passes directional and A-button
controls, two-tile boundary removal, 20 points, all 121 refilled cells, unchanged
unmatched cells and a complete expected board image. Both pass native, Code,
SB3, PXT compilation/reimport and Playwright with no block/browser errors.

All **143 focused tests** pass across native execution, Code, SB3 and PXT
compilation/reimport; the final GUI build succeeds. The 184-source audit stays
at **88 translated / 95 partial / one parse failure**, with no previously
translated or preserved path regressed. MakeCode roundtrips remain **80
preserved / 70 loss / 33 partial**; Project/Code remains **87 preserved / 94
partial / 2 loss**. Raw SB3-to-text artwork loss remains 183.

Named diagnostics now total **415 / 251 distinct reasons**. Four additional
reports come from temporary property receivers in three already-partial legacy
translation paths; these are retained rather than counting them as supported.
This slice improves runtime semantics without completing another corpus app.

Next: reconcile array/resource primitive conversion with PXT runtime objects,
then higher-order array callbacks and Math/string coercion. Assignments and
updates used as expression values, general closures, break/continue, exact
fiber/render timing, terrain, dynamic kinds, physics/effects/audio/packages and
binary artwork in text remain open. PXT's `RefCollection` is a runtime object,
so native JavaScript array stringification is not a validated implementation
of MakeCode coercion. Resource arithmetic remains explicitly unsupported.

Evidence: `test-results/arcade-compound-target-regression-current.json`,
`test-results/arcade-lazy-value-corpus-current.json`, and
`test-results/arcade-nested-array-corpus-current.json`.

## Array operators and typed references (2026-10-01)

Array arithmetic, unary numeric conversion and mixed comparison now agree with
executed code from the pinned PXT compiler/core simulator. PXT's `RefCollection`
uses ordinary object conversion: text is `"[object Object]"`, numeric conversion
is NaN even for an empty array, and loose equality with that text succeeds.
Aliases compare equal, separate arrays remain distinct, and nested/self-containing
arrays do not recurse during primitive conversion.

Native arrays carry scoped typed reference values instead of untyped text IDs.
JSON argument/return chains restore canonical aliases. Reference lookup rejects
ordinary ID-shaped text and references from another runtime/project. Search and
removal compare reference identity, preserve negative/infinite start-index
behavior and skip sparse holes. The actual PXT removal shim reports numeric
`1`/`0`; BW now retains those flags, including under strict comparison.

Uninitialized typed arrays remain undefined until assigned. Testing also exposed
type annotations consuming the next declaration without a semicolon. Annotation
parsing now stops at a complete type, preserves multiline type suffixes and
handles nested generic closing tokens. The shared Micro:bit/Calliope parser
regressions remain part of the gate.

SB3 standard scalar fields remain schema-valid strings. The optional
`bwSpecialValues` sidecar retains typed reference metadata; live array contents
are recreated by the program at restart. This is not a live-heap checkpoint.

The new synchronous PXT harness executes actual compiled JavaScript and the
pinned simulator shims, including ordinary procedure calls. It rejects async
operations rather than substituting behavior. The same authored fixtures run
through native BW, Code, SB3, Arcade export/compilation/reimport. Browser game
checks cover controls and rendering separately; this harness does not establish
hardware coercion or Arcade fiber timing equivalence.

The static corpus remains **88 translated / 95 partial / one parse failure**,
with **415 named gaps / 251 distinct reasons**. MakeCode roundtrips remain
**80 preserved / 70 loss / 33 partial**; Project/Code remains **87 preserved /
94 partial / 2 loss**, and raw SB3-to-text artwork loss remains 183. No previously
translated app or preserved path regressed. This implements authored language
semantics without completing another corpus app.

All **147 focused tests** pass and a fresh GUI build succeeds. On that build,
Pong passes controller motion/bounds, both paddle collisions, scoring and reset.
The tile game passes directional/A-button controls, two-tile boundary removal,
20 points, all 121 numeric refilled cells, unchanged unmatched cells and the
complete independently composed board image. Both pass native, Code, SB3 and
PXT compilation/reimport, with no block/browser errors in Playwright.

Next: image/sprite primitive conversion and mixed resource comparisons, then
higher-order array callbacks and Math/string API coercion. Assignment/update
expression values, general closures, break/continue, exact frame/fiber behavior,
terrain/dynamic kinds, physics/effects/audio/packages and binary artwork in text
remain open. Image/sprite arithmetic still produces a named diagnostic.

Evidence: `test/makecode-arcade-array-coercion.test.mjs`,
`test/helpers/pxt-core-runtime.mjs`, and
`test-results/arcade-array-coercion-regression-current.json`.

## Image operators and typed references (2026-10-01)

Images now retain resource identity through arithmetic/comparison reporters,
arrays, procedure arguments/returns, Code and SB3 metadata. Like PXT's
`RefCollection`, the pinned simulator's `RefImage` uses ordinary object
conversion: string conversion yields `"[object Object]"`, numeric conversion
yields NaN, aliases compare equal and clones remain distinct. IDs are carried
in scoped reference metadata. Ordinary ID text, foreign-runtime references,
wrong resource kinds and expired project references cannot access image data.
All image operations, including shared sprite/background artwork and cached
frame images, use that typed lookup.

The differential fixture executes compiled PXT JavaScript with the target's
original native Image ABI and 4-bit simulator image implementation. It compares
conversion, strict/loose ordering/equality, array search, procedure aliases and
independent clone pixels across native BW, Code, SB3 restart and Arcade
export/compilation/reimport. This synchronous oracle does not establish exact
fiber timing or hardware equivalence. The SB3 sidecar preserves reference
metadata, not a live image heap; program restart recreates the images.

The corpus remains **88 translated / 95 partial / one parse failure**, with
**415 named gaps / 251 distinct reasons**. MakeCode roundtrips remain
**80 preserved / 70 loss / 33 partial**; Project/Code remains **87 preserved /
94 partial / 2 loss**, and raw SB3-to-text artwork loss remains 183. No
previously translated app or preserved path regressed. Image value semantics
are implemented, but this slice does not complete another corpus app.

All **169 focused tests** pass and a fresh GUI build succeeds. Pong passes
controller movement/bounds, both paddle bounces, scoring and reset. The tile
game passes directional/A-button controls, boundary removal/refill, all 121
numeric cells and the complete independently composed board image. Both pass
native, Code, SB3 and PXT compilation/reimport. The initial concurrent tile
browser run timed out waiting for score 20; a diagnostic rerun passed unchanged
score and pixel gates. No root cause is established, so this does not close the
remaining scheduling gap.

Next: sprite conversion using PXT's custom `toString()` and mixed resource
comparisons, then higher-order array callbacks and Math/string API coercion.
Assignment/update expression values, general closures, break/continue, exact
frame/fiber behavior, terrain/dynamic kinds, physics/effects/audio/packages and
binary artwork in text remain open.

Evidence: `test/makecode-arcade-image-values.test.mjs`,
`test/helpers/pxt-core-runtime.mjs`, and
`test-results/arcade-image-values-regression-current.json`.

## Explicit sprite text and complete simulator probes (2026-10-01)

The Arcade palette and Code add `arcade text of sprite (hero)`, mapped to
`hero.toString()` on import/export. It reports PXT's numeric scene ID, position
and velocity. Aliases/procedure returns keep that text, and destroyed sprites
retain their object records and native position/velocity reads and writes until
project reset. Those records are reconstructed on SB3 restart, not heap-saved.

The new Playwright oracle executes the complete pinned Arcade simulator and
board, including original class dispatch and fiber scheduling. Authored explicit
text fixtures execute both their original PXT source and BW's exported source.
Integer positions and post-destruction nonzero velocities agree through native
BW, Code, SB3 and compilation/reimport. Nonzero velocities use a destroyed
sprite so live physics cannot change a conversion snapshot between scheduler
turns. This does not prove general sprite/fixed-point/physics equivalence.

The original compiler/simulator distinguishes `anySprite + 2` (ordinary object
conversion), `anySprite + ""` (custom class string conversion), and
`anySprite + anyText` (ordinary conversion even for empty text). That distinction
is pinned by an oracle fixture; general sprite arithmetic retains its named
unsupported diagnostic. It needs typed sprite values and compiler-sensitive
conversion rather than a universal custom `toString` on resource tags.

String reporter/procedure results now propagate into exported global types.
Native Boolean aliases retain Boolean values through assignment and procedure
returns; numeric core block inputs retain the appropriate numeric conversion.
Real Pong compilation caught an unintended Boolean-to-number assignment during
this work, which the final original-simulator alias fixture now guards against.
Numeric literal constraints also prevent known mixed values from being falsely
annotated as homogeneous arrays. Existing export tests now assert the current
native arithmetic, Boolean and local-resource block forms, preserving their
runtime/artwork/compiler checks.

Final focused value gate: **40/40 pass**. Final export gate: **33/34 pass**.
The remaining compiler failure is the older `arcade-tilemap.hex` fixture's
legacy named-array/for-of path: unsupported creation commands leave scalar
placeholders read as arrays. The failure remains in the gate and report; this
slice does not implement terrain or legacy named-array exports. A fresh GUI
build succeeds. Pong passes native, Code, SB3, PXT compilation/reimport and
Playwright controller bounds, both paddle collisions, score and reset.

Static corpus: **88 translated / 95 partial / one parse failure**, **415 named
gaps / 251 distinct reasons**. MakeCode roundtrips remain **80 preserved / 70
loss / 33 partial**; Project/Code **87 preserved / 94 partial / 2 loss**, with
raw SB3-to-text artwork loss 183. No previously translated app or preserved
structural conversion path regressed. These structural counts do not prove
full executable compatibility.

Complete-simulator position probes record two further differences:

- One-pixel sprite creation: PXT `(79.5,59.5)` versus BW `(80,60)`.
- Moving to `(12.123,23.456)`: PXT `(12.125,23.45703125)` versus BW's requested
  decimals. Original fixed-point movement/setter semantics need implementation.

Next: fix odd-sized creation centers and fixed-point setters/storage, then
finish typed sprite references/compiler-sensitive conversion and the legacy
named-array export/for-of failure. Higher-order callbacks, Math/string coercion,
assignment/update expression values, closures/break/continue, exact scheduling,
terrain/dynamic kinds, effects/audio/packages and binary artwork remain open.

Evidence: `test/makecode-arcade-sprite-text.test.mjs`,
`test/helpers/pxt-arcade-runtime.mjs`,
`test-results/arcade-sprite-text-regression-current.json`, and
`test-results/arcade-sprite-values-gaps-current.json`. Reproduce the measured
position gaps with `scripts/verify-arcade-sprite-values.mjs` using the GUI scope
loader. The latest gate report explicitly retains the legacy export failure.

### Sprite construction and fixed-point state (2026-10-01)

Closed the two measured numerical mismatches from the sprite-text slice:
odd-sized sprite centering and fractional `setPosition`. Added constructor
reporters and an atomic position command in Blocks/Code; imports and exports
preserve the difference between direct property assignment and displacement
conversion. Sprite edges, velocity and acceleration now have actual signed
24.8 storage, retained after destruction. Positioned creation also preserves
constructor/callback/placement ordering in BW and exported PXT.

The new full-simulator regression covers both original source and execution of
BW's exported source, plus Code, SB3 and source reimport. Existing odd-size tests
now expect Arcade's 79.5 center rather than 80 (28.5/58.5 stage units after the
example's 10/20 pixel shifts). Existing compiler and runtime assertions remain.
See `test-results/arcade-sprite-fixed-point-regression-current.json` for the
final build, test and real-game evidence.

The 184-app structural audit remains **88 translated, 95 partial, 1 parse
failure**, with **415 named gaps / 251 distinct reasons**. Structural roundtrip
tallies remain 80 MakeCode paths and 87 Project/Code paths preserved. No previously
translated application or preserved structural path regressed. These counts do
not measure executable compatibility, so the numerical fixes do not reduce the
partial count.

Next: implement legacy named-array export and its type/alias propagation to
close the retained `arcade-tilemap.hex` compiler gate failure. Continue exact
physics/terrain probes separately; do not declare full game compatibility from
structural success or from fixed-point setters alone.


### Named arrays, shared references and value conversion (2026-10-01)

Implemented named-array creation, push/set/insert/remove/delete and reads in
Arcade export, with actual array globals and argument evaluation exactly once.
The Arrays extension now exposes `reference to named array`, `parse array input`
and `JSON text of value` in Blocks/Code. References retain nested array identity
and old aliases after named-array replacement/deletion. Missing indexed values
use the runtime's explicit undefined value instead of leaving a reporter pending.

Legacy parsing and JSON conversion have executable PXT helpers, including
heterogeneous arrays, undefined/null/nonfinite numbers, escaped controls and
Unicode. Reimport recognizes their verified complete bodies, rather than trusting
helper names. Mixed array receivers get real PXT array typing. Code parsing now
preserves escaped string literals and balanced nested mutation arguments.
Authored minimum/maximum export preserves Scratch numeric conversion (NaN/text
convert to zero). This does not close native JavaScript Math.min/max NaN import
semantics generally.

Final focused named-array/numeric gate: **4/4 pass**, including original PXT
simulator execution, exported/reimported execution, second export, Code and SB3.
A serial rerun of named-array and sprite fixed-point tests passes **5/5** after
resolving the two browser infrastructure failures and correcting a test's
string-versus-number expectation in the initial 111-test run (108 passed).
Expanded JSON roundtrip coverage also passed separately. The final GUI build
passes; GUI mirrors, installed VM overlay and built helper/reporters agree.
The last full export gate remains **33/34**, run before the final numeric helper
change; the focused numeric test executes that helper in PXT.

Pong and the nested-array tile game pass Playwright controller checks, actual
paddle collisions/scoring and board image/button/refill checks respectively,
without reported browser errors. Both pass Code/SB3/PXT compile and reimport.
Final source checks repeat the affected game conversion paths after the numeric
helper change; see the named-array regression report for results.

The remaining `arcade-tilemap.hex` compiler failure is now traced to unsupported
`sprite`/`tile` collection producers (`sprites.allOfKind`, `tiles.getTilesByType`)
and their for-of lowering; named-array creation is implemented. These collections
must contain real live object/location references, not empty-array substitutes.
Next implement sprite collection identity/lifecycle, then tile location arrays
and terrain operations across runtime, Blocks, Code and PXT conversion.

Final 184-app structural audit: **88 translated / 95 partial / 1 parse failure**.
MakeCode roundtrips: **80 preserved / 69 loss / 34 partial**; Project/Code:
**87 preserved / 94 partial / 2 loss**. No previously translated app or preserved
conversion path regressed. Structural preservation does not prove executable
compatibility; this slice does not reduce the 95 partial imports.
Dynamic named-array names/JSON constructors, remaining legacy matrix/range
operations, arbitrary object collections, terrain, callbacks/type flow and exact
scheduling remain open. Evidence:
`test-results/arcade-named-array-regression-current.json`.


### Actual sprite collections (2026-10-01)

Implemented `sprites.allOfKind` as a fresh shared-heap array of existing sprite
handles, with a GUI reporter and Code spelling. Import/export type constraints
retain Sprite[] element types through aliases, parameters, return values,
indexing and for-of mutation. Named arrays and native arrays now use the shared
value layer's project-scoped heap, so Arcade can create collections without
copying heap logic or exposing transport strings as an array. Restart/load/dispose
expire references; independent runtime references cannot resolve each other's
arrays.

The original-simulator oracle caught an ordering mismatch: re-kind must append
to the new kind's collection, rather than sort by original creation order.
Implemented kind insertion tracking with no reordering for a no-op setKind.
Microsoft's SpriteSet source describes fresh filtered snapshots, append and
splice removal:
https://github.com/microsoft/pxt-common-packages/blob/master/libs/game/spriteset.ts
The pinned full simulator remains the executable oracle for this implementation.

New tests **3/3 pass**, including the heap lifecycle/security boundary,
unsupported dynamic query diagnostics, and actual collection execution through
Code, SB3, exported PXT, reimport and a second executed PXT export. Related array
regression gate **23/23 pass**. Its initial run found one stale opcode assertion
in the discarded-pop test; updated it to the native mutation command and the
Game-prefixed variable lookup, retaining the runtime count assertion.
GUI build and mirrored/installed/built sources pass. The real nested-array tile
game passes Playwright directional controls, A-button removal/refill and complete
board rendering with no browser errors after the heap migration.

Corpus remains **88 translated / 95 partial / 1 parse failure**, now **414 named
gaps** (one fewer). No previously translated app or preserved structural path
regressed. Roundtrip tallies remain 80 MakeCode and 87 Project/Code paths preserved.
These are structural counts, not proof of full executable compatibility.
The shipped-project compiler aggregate was rerun and retains exactly
`arcade-tilemap.hex: Property 'length' does not exist on type 'number'`; the other
33 tests in that file were skipped by the name filter. Terrain/tile collection
lowering remains open. Next: actual tile-location references and tile collections,
followed by their terrain commands; keep unsupported package/terrain diagnostics.
Evidence: `test-results/arcade-sprite-collection-regression-current.json`.


### Tile data, location collections and rendered tile layers (2026-10-02)

Three agents split runtime, conversion and regression work, with root integrating
shared value types, builds, browser verification and corpus reports.
Implemented real project-scoped `tiles.Location` values and fresh location arrays,
including column-major ordering, identity, aliases, properties, procedure
parameters/returns and current-map scale on retained locations. Added real tile
index and wall mutations, image comparisons and placement. Literal and generated
maps preserve their tile images, indices, exact wall mask (color 2), and scale
4/8/16/32. Editable Blocks/Code data survives SB3 and MakeCode export/reimport.
Malformed/dynamic data stays named unsupported. Null/empty map clearing removes
map data and rendering while retaining the initialized map's scale for locations.

Map factory art is embedded as tile data rather than exported as phantom sprites;
the executed original/exported fixture asserts exactly one actual Player sprite.
The tile layer is separate from editable scene.backgroundImage. Its renderer
supports tile mutation and clearing. Browser testing caught a layer-group error:
using Infinity with Scratch's draw-order API could move the tile drawable into
the sprite group, breaking disposal. Finite ordering among the owned background
layers fixes the underlying ordering and deletion without changing the renderer.

The full pinned PXT simulator supplies expected values. Exported startup can run
in parallel fibers and yield at loop pauses, so the oracle now optionally waits
for a named computed completion value before reading results. Constant markers
were optimized away by PXT; authored markers perform an actual final location
query. Neither runtime scheduling nor physics is mocked or frozen to pass.

Final focused gate **5/5 pass**, covering original/source PXT, twice executed
export, BW reimport, Code/SB3, typed location procedures, generated JRES/wall/scale,
clear-map behavior and reference isolation. Related gate **52/52 pass**.
Final GUI build succeeds and source mirrors, installed overlay and built tokens
agree. Playwright right/A/B buttons place the actor at (40,24), change one tile
and clear the tile layer. The stage has exactly 9 red and 45 blue map pixels
before clearing, none afterward, with 172791 background pixels retained and no
reported browser/block errors. The controller viewport mirrors the same renderer.

Static audit remains **88 translated / 95 partial / 1 parse failure**; named gaps
**414 → 413**. Structural MakeCode roundtrips: **80 preserved / 68 loss / 35
partial**; Project/Code: **87 preserved / 94 partial / 2 loss**. No previously
translated source or preserved path regressed. One previously lossy path now has
only partial diagnostics; no new path is claimed fully preserved. Structural
counts remain separate from executable compatibility.

The shipped-project compiler aggregate still fails for `arcade-tilemap.hex`, now
with `Element implicitly has an 'any' type because type 'Number' has no index
signature.` The other 33 tests were skipped by its name filter. That complex
source still reaches legacy lowering because namespace/animation requirements
block the native route. This was not repaired by substituting empty collections.

Next, in order:

1. Implement safe qualified namespace/animation bindings so the shipped tilemap
   source can use real typed sprite/tile collections throughout.
2. Implement wall collision resolution, wall/tile events and terrain-aware
   projectile placement against original simulator probes.
3. Implement camera transforms/follow/scrolling in physics and rendering.
4. Add a dedicated tilemap editor; current authored tile data uses the editable
   JSON field in the block. Continue dynamic map values and remaining packages.

Every tilemap import still names the physics/camera limitation. This slice is
real tile data and rendering support, not full terrain/game compatibility.
Evidence: `test-results/arcade-tile-data-regression-current.json` and
`test-results/arcade-tile-data-browser-current.json`.

## Animation objects, namespace bindings and editor execution (2026-10-02)

Completed safe qualified namespace lowering and numeric enum constants, then
integrated actual Animation reference values into native import, Code/Blocks,
VM execution and export. Export propagates `animation.Animation` through globals,
locals, arrays and procedure signatures/results, initializes resource storage as
null, and retains the real legacy `animation` dependency. Modern playback accepts
2–4 arguments with original defaults and exact `AnimationTypes` names; shared
frame arrays, timer/registration ordering, stop modes and legal null/undefined
legacy getter inputs are tested against the pinned original simulator.

The executed original PXT → BW → Code → exported PXT → BW → SB3 checks pass.
The aggregate compiler gate for every lite game and imported shipped Arcade game
now passes, including `arcade-tilemap.hex`. This establishes compilable exports
for that gate; retained terrain/camera/effects/music diagnostics still describe
missing behavior.

Built-browser authoring now has a reproducible animation proof:
`scripts/verify-arcade-animation-browser.mjs`. It enters a program in the visible
Code editor, compiles through To blocks, clicks the actual green flag and uses
controller A/B/Right for frame playback, stop and movement, then reads back Code.
Both frame colors occur; the actual renderer paints 144 pixels for the 4×4 frame;
controller B stops playback, Right changes x from 80 to 90, and no runtime/page
errors occur. This does not complete visual frame sequencing or tilemap authoring.

Fresh 184-source audit: **89 translated / 94 partial / 1 parse failure**, **309
named gaps** (previously 413). MakeCode structural roundtrips: **82 preserved /
60 loss / 41 partial**; Project/Code: **88 preserved / 93 partial / 2 loss**.
No previously preserved path regresses. Some former losses are now explicit partial
results; counts still do not establish universal runtime fidelity. Fixed the
new namespace diagnostic regression on an ordinary redeclared-variable program
by leaving programs without scoped declarations on their existing translator path.

Evidence: `test-results/arcade-animation-namespace-regression-current.json`,
`test-results/arcade-animation-browser-current.json`; the assignable GUI backlog
is `docs/CONVERSION-CAPABILITIES-AND-GUI-GAPS.md`.

Next: implement terrain collision resolution and wall/tile events against original
simulator probes, then camera transforms. Coordinate the dedicated tilemap editor
with that runtime work. Keep visual animation sequencing, movement paths and
scene lifecycle on the GUI/runtime worklist.

## Tile-wall movement and cached contact queries (2026-10-02)

Implemented `Sprite.isHittingTile` end to end: original CollisionDirection values
0/1/2/3, typed sprite receiver, editable Code/Blocks boolean reporter and genuine
PXT export. Native tile-wall movement uses opaque bounding hitboxes (including
the original degenerate blank-image behavior), fixed-point substeps, wall bounds,
bounce, wall destruction and wall-ghost exclusions. Tested both axes and scales
4/8/16/32. Cached contacts persist while stopped and clear on subsequent movement,
including movement after removing a map.

Original-simulator probes exposed and fixed half-pixel rounding in teleport
clipping recovery and blank hitbox handling. Earlier tile placement remains exact:
a one-pixel actor placed deep in the wall stays at x=12 as in PXT, rather than
being incorrectly relocated to x=8. Existing controller tests now use exact
24.8 position deltas measured in the original simulator (9.99609375 straight,
7.06640625 diagonal), rather than unquantized floating-point expectations.

The conversion test waits for actual wall contact before comparing original PXT,
BW, Code, SB3 and executed exported PXT. It does not assert wall-clock/frame
scheduler equivalence. All 14 related tile/controller/fixed-point tests pass.
Runtime probes cover nine cases plus map-removal cache invalidation; import tests
cover typed aliases, procedure parameters/results and collection receivers.

Fresh 184-source audit retains **89 translated / 94 partial / 1 parse failure**;
named gaps decrease **309 → 308**. MakeCode structural permutations retain **82
preserved / 60 loss / 41 partial**. No previously preserved path regresses.
Terrain events, camera transforms, friction, scaling/rotation, scene lifecycle,
interleaved sprite overlap substeps and full scheduling parity remain open. The
general terrain/camera diagnostic stays visible. GUI tasks G09/G19 and capability
T06 in `docs/CONVERSION-CAPABILITIES-AND-GUI-GAPS.md` track the distinction.

### Next slice: real wall/tile callbacks

- Implement scene-scoped `scene.onHitWall(kind, handler(sprite, location))`.
  Store the contacted obstacle before invoking handlers. Provide the actual
  typed tile location derived from obstacle coordinates/current map scale.
- Preserve handler order, kind filtering, captures and actual Sprite/Location
  identity. A handler can change velocity, destroy the sprite, modify flags or
  alter map data; collision response must observe those changes.
- Implement `scene.onOverlapTile(kind, image, handler(sprite, location))` using
  each overlapped cell, per-pass cell deduplication and original tile-image
  pixel equality; resource ID equality is insufficient.
- Add native event hats/location reporters, Code/Blocks parsing/decompilation,
  runtime payload/lifecycle handling and genuine PXT export as one slice.
- Compare original simulator callback order, mutations, yields and disposal.
  Keep the named event diagnostics until those semantics and GUI gates pass.

Evidence: `test-results/arcade-terrain-regression-current.json`,
`test-results/arcade-terrain-browser-current.json` and
`scripts/verify-arcade-terrain-browser.mjs`.


## Registered wall and tile callbacks (2026-10-02)

Implemented scene.onHitWall and scene.onOverlapTile as real registrations with
matching native hats, typed Sprite/Location arguments, mutable callback locals
and inherited captured cells. Export emits genuine PXT callbacks at the
registration site. Code/Blocks and SB3 paths preserve handlers and their values.

Wall handlers see the stored obstacle/contact before default collision response.
Handler snapshots preserve registration order and matching kind even if a prior
handler changes kind or destroys the sprite. Velocity, flags and map edits affect
subsequent response. Tile matching compares image pixels, including clones, and
matching handlers share one actual Location for each cell.

Waiting handlers suspend their collision operation through real VM threads and
resume in order. Original-PXT probes confirmed that explicit movement callbacks
may overlap a frame callback; globally serializing those operations would be
incorrect. Tests therefore compare deterministic completion/order and actual
concurrency, rather than timestamp-dependent counts. Stop/dispose cancels pending
continuations and prevents later frames from starting new handlers until restart.

Runtime event probes pass 6/6; existing terrain probes pass 10/10; strengthened
stop/reentry probe passes. Import/Arcade regressions pass 46/46. The final
shipped-game MakeCode compiler gate passes (one aggregate test; 33 unrelated
tests skipped). Original and
executed exported PXT agree through import, Code, SB3 and reimport paths. A new
nested Location-array capture fixture also passes with an unrelated same-name
numeric local, including transitive inheritance without a direct parent read.
The combined execution run initially passed 17/18: the original simulator timed
out before initializing the nested fixture during severe resource contention.
That unchanged fixture passed on a focused rerun.

The final GUI build and browser workflow pass: author in visible Code, convert
to Blocks, green flag, controller Right reaches the wall and runs A/B handlers
with a wait and velocity mutation; controller A runs C/D tile handlers against
pixel-equal images and verifies shared Location identity; B resets. Code recovered
from Blocks retains the registrations, hats and Location reporters. The sprite
renders 36 expected display pixels and no browser/runtime errors occur.

Fresh corpus: **89 translated / 94 partial / 1 parse failure**, with gap
occurrences **308 → 304**. MakeCode structural permutations remain **82 preserved
/ 60 loss / 41 partial**; Project/Code remains **88 preserved / 93 partial / 2
loss**. No previously preserved path regresses. The specific callback-ordering
diagnostic is removed; general terrain/camera and unsupported-form diagnostics
remain.

Next: camera position/follow and stage transforms against original simulator
probes, then scene lifecycle and multi-sprite movement ordering. GUI work needs
a dedicated tilemap editor (G10), discoverable event authoring (G09), and visual
animation sequencing (G18). Full Arcade compatibility is still open.

Evidence: `test-results/arcade-terrain-events-regression-current.json`,
`test-results/arcade-terrain-events-browser-current.json`,
`test/makecode-arcade-terrain-events.test.mjs`,
`test/makecode-arcade-terrain-event-runtime.test.mjs`, and
`scripts/verify-arcade-terrain-events-browser.mjs`.


## Camera positioning, following and stage transforms (2026-10-02)

Implemented scene.centerCameraAt, scene.cameraFollowSprite (including null
cancellation), and all six scene.cameraProperty selectors. Native Blocks/Code
commands and reporters preserve numeric selectors, typed Sprite/null bindings,
argument evaluation, procedure forwarding and genuine PXT export. Unknown
selectors return undefined. Shadowed enum names, invalid arities and invalid
receivers remain diagnostics rather than invented resources.

Camera offsets floor and clamp to tilemap bounds; following null retains the
viewport, and centering cancels following. The original width-based non-square
follow Y quirk is preserved. Actual world coordinates stay intact while sprite,
tilemap and speech drawing use camera offsets. RelativeToCamera HUDs stay fixed
on screen. AutoDestroy and tested opaque StayInScreen constraints use the
viewport. Original explicit HUD placement still undergoes large-move wall
clipping; that behavior was confirmed rather than bypassed.

Code parsing and export now accept RelativeToCamera. The existing implemented
DestroyOnWall flag also no longer triggers an obsolete Code-parser warning.
Native camera property dropdown shadows survive Code decompilation, reparsing
and executed PXT export. The general warning now correctly names remaining full
terrain physics and scene lifecycle, rather than saying scrolling is absent.
Camera shake/effects and full scene stacks remain unsupported.

Gates: camera runtime 3/3 (actual original tilemap, sprite and HUD pixel rendering
and placement); related terrain 8 passed/2 skipped; import/Arcade regressions
48/48; executed original/exported PXT conversion and native dropdowns 2/2. The
final shipped-game compiler aggregate passes (one selected test/33 skips).
GUI build passes. Built-browser visible Code → Blocks → controller follow/center/
reset → Code verifies exact sprite/HUD/tile pixels and world coordinates, with
no browser/runtime errors.

Fresh 184-source audit: **89 translated / 94 partial / 1 parse failure**; gap
occurrences **304 → 300**. MakeCode structural permutations remain **82 preserved
/ 60 loss / 41 partial**, Project/Code **88 preserved / 93 partial / 2 loss**.
All previously preserved paths remain preserved.

Next runtime work: scene push/pop lifecycle and scene-scoped sprites, camera,
tilemaps, animation, callbacks and timers; then round-robin multi-sprite physics
ordering. GUI work remains dedicated tilemap painting (G10), visual animation
sequencing (G18), and approachable event/resource discovery (G09/G19).

Evidence: `test-results/arcade-camera-regression-current.json`,
`test-results/arcade-camera-browser-current.json`,
`test/makecode-arcade-camera.test.mjs`,
`test/makecode-arcade-camera-runtime.test.mjs`, and
`scripts/verify-arcade-camera-browser.mjs`. Capability T08 and the remaining GUI
gaps are recorded in `docs/CONVERSION-CAPABILITIES-AND-GUI-GAPS.md`.


## 2026-10-02 — Scene stacks and source-site callback registrations

Implemented native `game.pushScene/popScene` with fresh/restored sprite worlds,
backgrounds, tilemaps, cameras, Info, animations, timers and callback registries.
Parent frame updates pause; retained resources remain usable and shared image
edits become visible on resume. Popped sprites remain referenced. Base-scene
pop and cross-scene destruction follow the pinned original simulator, including
its retained physics-member behavior.

Inline update, interval, button, kind-destruction, overlap, forever, life-zero,
countdown and push/pop callbacks register where their code executes. Captured
cells and typed Sprite arguments survive Code, SB3 and genuine PXT export.
Global lifecycle handlers run after the active world changes; repeated inline
registrations preserve distinct callbacks. Player1–4 life/score/presence are
native scene state, with original lazy initialization and deferred life-zero
replacement behavior.

GUI verification exposed real integration defects and fixed them: button keys
now match the pane; actual keyboard transitions retain short taps and dispatch
independently of waiting frames; all registered hats explicitly disable Scratch
edge caching; pane input preserves scene and shared-button object identity.
Blocks → Code also counts indented unsupported comments and presents the actual
named messages. CodeMirror's full document is checked rather than its virtual
viewport text.

Gates: related import 69/69; scene runtime and all-path integration 8/8;
creation/terrain conversion 7/7; four callback integration cases pass across
selected runs; real keyboard and repeated lifecycle 3/3; registered-hat metadata
1 selected pass / 3 skips; shipped-game compiler 1 selected pass / 33 skips. Standard
GUI build passes. Production minification was cancelled and is not verified.
Browser Code → Blocks → green flag → repeated A/B/Right scene transitions → Code
passes with no errors: parent 144 pixels, child 36, hidden opposite world, restored
score 11 / life 7 and child score 33 / life 4; lifecycle counts 2 then 4. The retained
physics/advanced-scene warning remains visible in the expanded conversion report.

Fresh 184-source audit remains **89 translated / 94 partial / 1 parse failure**,
**300 reported gap occurrences**. MakeCode permutations remain **82 preserved /
60 loss / 41 partial**; Project/Code **88 preserved / 93 partial / 2 loss**. All 170
previously preserved paths are retained. These structural results do not establish
full game compatibility or make partial zero.

Next runtime slice: original round-robin multi-sprite movement and overlap
ordering, including simultaneous fast movement and collision callbacks. Keep
named lifecycle callback identity/removal, used oldScene/Scene objects, camera
effects, remaining animation modes and exact global scheduling explicit. GUI
work proceeds through G10 tilemap painting, G18 animation sequencing and G09/G19
approachable scene/callback authoring; use capability T09 in the handoff.

Evidence: `test-results/arcade-scenes-regression-current.json`,
`test-results/arcade-scenes-browser-current.json`,
`test/makecode-arcade-scenes.test.mjs`,
`test/makecode-arcade-scene-registrations.test.mjs`,
`test/makecode-arcade-keyboard-edges.test.mjs`, and
`scripts/verify-arcade-scenes-browser.mjs`.

## 2026-10-02 — Round-robin multi-sprite motion and live overlap queries

Implemented shared motion snapshots, original default fixed-point integration
(100ms delta cap, speed cap 500), round-robin movement in substeps of at most
4px, spatial bucket traversal and overlap dispatch during movement. Registered
handlers and legacy overlap hats retain pair locks and original argument/order
semantics. Fractional opaque hitboxes and sparse pixel masks gate collisions.
Retained suspended/popped Sprite queries now use shared resource identities and
current image pixels, while inactive sprites remain outside active simulation.

Gates: original-compared runtime 7/7; related direct 18 pass / 7 skips; first
three executed all-path fixtures 3/3; retained-query fixture 1 selected pass /
3 skips; terrain-events/scenes integration 3/3; shipped-game compiler 1 selected
pass / 33 skips. Standard GUI build and overlay mirror checks pass. Four authored
fixtures compare original PXT, native execution, Code, executed exported PXT,
reimport and SB3 reload/restart. Visible Code → Blocks → green flag → controller
A/B/Up/Down → Code passes without errors, checking fast crossings, reset, sparse
pixel overlap and actual rendered pixels. No new graphics editor was delivered.

Fresh audit remains **89 translated / 94 partial / 1 parse failure**, **300 gap
occurrences**. MakeCode permutations remain **82 preserved / 60 loss / 41 partial**;
Project/Code **88 preserved / 93 partial / 2 loss**. All 170 previously preserved
paths remain. These structural counts do not establish full game compatibility.

Original opposing 2px sprites can tunnel when relative movement exceeds their
width; preserve that behavior. Original headless deltas below 2ms can integrate
zero displacement due to integer half-delta; fixtures yield real time instead
of substituting clocks. Next area: friction and additional motion/geometry,
including configurable speed/step settings and scaling/rotation hitboxes. Keep
advanced scenes/effects and overall scheduling explicit. GUI work remains G10
tilemap painting, G18 animation sequencing and G08/G19 approachable authoring.

Evidence: [regression](../test-results/arcade-multi-physics-regression-current.json),
[browser](../test-results/arcade-multi-physics-browser-current.json),
[runtime probes](../test/makecode-arcade-multi-physics-runtime.test.mjs),
[executed conversion cases](../test/makecode-arcade-multi-physics.test.mjs).
Capability T10 records the GUI handoff.

## 2026-10-02 — Per-axis friction and honest engine-setting diagnostics

Implemented Sprite `fx`/`fy`: zero defaults, negative clamp before fixed-point
conversion, independent axis deceleration without overshoot and acceleration
precedence. Pinned Fx.add/compare use ordinary addition/subtraction before the
speed constraint; integration now preserves that order, including large signed
values and original friction overflow. Position storage remains separate from
friction. Retained scene sprites preserve properties without being advanced
by an inactive engine. Existing Blocks property menus expose both axes.

Import/Code/Blocks/export support includes aliases, computed receiver compound
updates and numeric procedure results. An executed roundtrip found a real
exporter inference bug: PROPERTY was read as an input instead of a field. Fixed
it and kept the numeric-signature assertion. Both authored fixtures match
original PXT, native behavior, Code, executed exported PXT, reimport and SB3
reload. Engine reads/calls through direct and scoped aliases/arrays/procedures
now retain named unsupported diagnostics instead of becoming unrelated variables.

Gates: friction runtime 3/3, related original physics 2 selected passes / 5 skips,
pure import/diagnostics 4/4. Three integration cases are verified across runs:
motion and Blocks menu pass the initial run; the corrected values case passes
its final selected run (1 pass / 2 skips). Shipped-game compiler gate passes
(1 selected pass / 33 skips). Final standard GUI build and mirror checks pass.
Visible Code → Blocks → green flag → repeated A/B/Up/Down → Code passes with
no errors. Friction stops the horizontal sprite at x64.23046875 and the vertical
sprite at y65.76953125 in this build, then resets x40/y90. Both retain 36 exact
rendered color pixels. These GUI coordinates are measured evidence, not timing
oracles for variable-duration original frames.

Fresh corpus/permutations remain **89 translated / 94 partial / 1 parse failure**,
**300 gap occurrences**, MakeCode **82 preserved / 60 loss / 41 partial**,
Project/Code **88 preserved / 93 partial / 2 loss**. All 170 previously preserved
paths remain. No new graphics editor was delivered.

Next runtime area: typed PhysicsEngine/Scene references and configurable
maxSpeed/minStep/maxStep. Full constructor/replacement support must preserve
engine identity and actual sprite membership; flattening it to scalar settings
is insufficient. Scaling/rotation geometry and overall scheduling remain open.
GUI priorities remain G10 visual tilemaps and G18 animation sequencing; T11
records friction authoring and its verified controller subset.

Low disk space required moving an older 269,117,440-byte build archive to CIFS
storage. Source/destination SHA-256 matched before removal; its original path
is now a verified symlink. Active dependencies and compiler artifacts remain
local. Evidence: `test-results/friction-cold-storage-move-current.json`.

Evidence: [regression](../test-results/arcade-friction-regression-current.json),
[browser](../test-results/arcade-friction-browser-current.json),
[runtime/original probes](../test/makecode-arcade-friction-runtime.test.mjs),
[executed roundtrips](../test/makecode-arcade-friction.test.mjs),
[import/diagnostics](../test/makecode-arcade-friction-import.test.mjs).

## 2026-10-02 — Real Scene/PhysicsEngine references and membership

Implemented with two agents: scoped native references, aliases/arrays/procedures,
independent sprite membership, engine construction/replacement/restoration,
retained Scene engine assignment and fixed-point maxSpeed/minStep/maxStep.
Omitted constructor arguments use 500/2/4; explicit undefined matches pinned
PXT zero values. Settings retain original rounding and constrain/substep rules.
Actual stalled halving emits a named diagnostic visible in the controller pane;
finite zero-motion configurations remain distinct. Advanced engine methods and
broader Scene APIs retain named unsupported diagnostics.

Original-derived runtime cases pass across final selected runs (4 direct plus
1 original-compared); scope transport 2/2, import 6/6, related import 32/32.
All three integration cases pass across runs: values and menu in the full run,
membership in the corrected selected run. Original PXT, native Code, executed
exported PXT, reimport and SB3 behavior agree. Export uses real derived-type
assertions and semicolon-safe setters. Shipped-game compiler gate passes
(1 selected / 33 skips); final standard GUI build and mirrors pass. Host-memory
crashes were rerun unchanged after recovery; vendored-tree sync probes were not run.

Visible Code → Blocks → green flag → repeated A/B/Up/Down → Right diagnostic →
restart → Code passes with no runtime/browser errors. Each 6×6 sprite retains
324 exact palette pixels. Engine replacement freezes old members while new
members move; restoration reverses that behavior. The first literal-image
fixture exposed a Code-only asset handoff gap and placeholder costumes. That
gap remains tracked under G14/G15; the final controller fixture authors actual
Image values through create/fill rather than injecting assets.

Fresh corpus remains **89 translated / 94 partial / 1 parse failure**, **300 gap
occurrences**. MakeCode permutations remain **82 preserved / 60 loss / 41 partial**;
Project/Code **88 preserved / 93 partial / 2 loss**. All 170 previously preserved
paths remain. Plain SB3-to-text still loses binary art in 183 projects.

Next: scaling/rotation geometry and advanced engine/Scene methods, using original
behavior probes before conversion and GUI gates. Graphics priorities remain G10
visual tilemap painting and G18 animation sequencing; full compatibility is open.

Evidence: [regression](../test-results/arcade-physics-engine-regression-current.json),
[browser](../test-results/arcade-physics-engine-browser-current.json),
[runtime](../test/makecode-arcade-engine-runtime.test.mjs),
[executed roundtrips](../test/makecode-arcade-physics-engine.test.mjs),
[GUI handoff T12](CONVERSION-CAPABILITIES-AND-GUI-GAPS.md).

## 2026-10-02 — Ordinary sprite scaling through runtime and authoring

Implemented with two agents: native sx/sy/scale, genuine setScale/changeScale
and optional/proportional setScaleCore, fixed-point dimensions and center/anchor
preservation through sequential terrain movements. Scale changes reset source
hitboxes; wall contacts and source-pixel overlap reflect actual scale. Rendering
uses original integer raster sampling and handles canonical imported costumes
and costume replacement. Image identity and source pixels remain intact.

Original probes cover negative/zero/fractional scale, anchors, independent axes,
proportional adjustment, image replacement, both overlap argument orders and
scaled transparent terrain contacts. Large-scale scalar hitbox probes found and
fixed edge overflow order: original Fx.mul wraps min/max products separately
before shifting. Extreme-scale GUI rendering remains open because the current
renderer allocates full scaled dimensions before viewport clipping.

Gates: direct runtime 3 selected passes/2 skips; original runtime 2/3 skips;
original overflow 1/5 skips; final geometry/terrain 6/10 skips, including a fresh
original scaled-terrain comparison. Import 4/4 and related import 10/10 pass.
All three initial integration cases pass in the final full run, across original
PXT/native/Code/executed exported PXT/reimport/SB3. A fourth real anchor-dropdown
case passes its selected run (1 pass/3 skips), including Code reparse and executed
PXT export. The compiler caught a numeric Boolean argument; genuine Boolean
export fixes it. The fixture completion flag now depends on actual final state.

Historical sprite handle tests pass 9/9 after replacing old linear/instant-bounce
expectations with original motion comparisons and registering actual legacy
scripts for callback dispatch. No pre-scaling snapshot was available, so this is
not claimed as a reproduced before/after baseline. Related friction/engine
checks pass 5 selected/3 skips. Shipped compiler gate passes 1 selected/33 skips.
Final standard GUI build and mirrors pass; vendored sync probes were not run.

Actual visible Code → Blocks → green flag → two controller cycles → restart →
Code passes without errors. Uniform scale 2 yields 576 palette pixels;
independent sx2/sy1 yields 288; scale1.5 yields 324; scale1 yields 144; a zero-width
axis yields 0. TopLeft retains left/top through center34/34; BottomRight change
retains right/bottom through center31/31. These are ordinary-scale GUI checks.

Fresh corpus remains **89 translated / 94 partial / 1 parse failure**, **300 gap
occurrences**, MakeCode **82 preserved / 60 loss / 41 partial**, Project/Code
**88 preserved / 93 partial / 2 loss**. All 170 previously preserved paths remain;
plain SB3-to-text still loses binary art in 183 projects. Corpus setScale calls
belong to the external seven-segment package, so core Sprite scaling does not
resolve their package gaps. No graphics editor was added.

Next: viewport-aware scaling render and rotation geometry, then advanced
engine/Scene APIs. Keep G10 visual tilemaps, G18 animation sequencing and G14/G15
Code asset handoff explicit. Full compatibility remains open.

Evidence: [regression](../test-results/arcade-scaling-regression-current.json),
[browser](../test-results/arcade-scaling-browser-current.json),
[runtime/original](../test/makecode-arcade-scaling-runtime.test.mjs),
[executed conversion and dropdowns](../test/makecode-arcade-scaling.test.mjs),
[capability T13](CONVERSION-CAPABILITIES-AND-GUI-GAPS.md).

## 2026-10-02 — Viewport-aware scaling rendering

Closed T13's whole-scaled-image allocation gap with two agents. A sprite raster
is bounded to 160×120 pixels and samples the original integer destination using
clipped offsets. Source Images, logical dimensions, scale and collision geometry
remain intact. Skins use cropped viewport coordinates rather than enormous
original centers; movement/camera/RelativeToCamera/mutation/scene restore refresh
only necessary crops. Hidden/zero-area sprites allocate no palette pixels.

Original oracle passes fourteen cases ×19200 pixels (**268800 comparisons**),
covering fractional edges, transparency/cell boundaries, independent axes,
camera/RelativeToCamera, extreme step1/step0 and hidden/zero dimensions. The
oracle found an actual huge-dimension Fx.div overflow in center getters; native
x/y and setPosition now preserve it. Explicit edge placement tests image pixels
separately from that original positioning quirk. No synthetic clocks or huge
reference bitmaps were substituted for original screen rendering.

Native renderer/lifecycle gates pass3/3, moderate scaling 3 selected/3 skipped,
and the full scaling Code/original/exported-PXT/reimport/SB3/actual-dropdown
suite passes 4/4. Final standard GUI build and mirrors pass; vendored sync probes
were not run. Visible Code→Blocks→controller tests verify a 32768×32768 sprite,
with an actual 640×480 SVG skin, exact palette histogram under pan/camera/relative
changes, two cycles, reset/restart and Code decompile. Ordinary scale controller
checks also pass on this build, with no runtime/browser errors.

Static conversion reports remain 89 translated / 94 partial / 1 parse failure,
300 gap occurrences, all 170 preserved paths, MakeCode 82/60/41 and Project/Code
88/93/2. This runtime-only slice changes no parser/exporter diagnostics, so no
new static corpus audit or partial-count improvement is claimed. Plain SB3-to-
text still loses binary art in 183 projects. No graphics editor was added.

Root disk pressure required moving 704798611 bytes of completed cold JSONL/Dart/test
outputs to CIFS storage. No open handles were reported by fuser. Hashes and file
identity/size/mtime were checked before atomic original-path symlink replacement;
all content remains available. Active dependencies/compiler/browser artifacts
remain local. Evidence is in the regression report and cold-storage manifest.

Next: rotation rasterization and geometry, then advanced engine/Scene APIs.
Keep G10 tilemap painting, G18 animation sequencing, G14/G15 Code asset handoff
and source Image/editor size limits explicit. Full compatibility remains open.

Evidence: [regression](../test-results/arcade-viewport-regression-current.json),
[browser](../test-results/arcade-viewport-browser-current.json),
[original pixels](../test/makecode-arcade-viewport-scaling-runtime.test.mjs),
[native renderer](../test/makecode-arcade-viewport-scaling-renderer.test.mjs),
[capability T14](CONVERSION-CAPABILITIES-AND-GUI-GAPS.md).
