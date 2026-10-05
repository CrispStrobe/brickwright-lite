# Arcade sprites in Brickwright Lite

MakeCode Arcade sprites are references to runtime objects. Scratch sprites are editor targets with scripts and costumes. A MakeCode variable can point to any sprite, multiple sprites can share one kind, and event callbacks receive the actual objects involved. Treating a MakeCode variable name as a Scratch target name loses that identity, especially for projectiles, `onCreated`, and `onOverlap`.

## Implemented foundation

The Arcade extension now exposes handle blocks in the GUI. `spawn Arcade sprite` returns a unique handle that can be stored in a Scratch variable. Blocks get and set position, velocity, acceleration, friction, size, z, lifespan, and kind; destroy a handle; count by kind; and test overlap. Creation and overlap hats can read the event's first and second handles. A VM frame advances velocity and acceleration in Arcade's 160×120 coordinate system. When a template Scratch sprite exists, spawning clones it and places the clone on the Scratch stage. Existing named-sprite and badge blocks remain available.

The `.sb3` stores these blocks normally. It also carries a versioned `bwMakeCode` field with the original MakeCode files, so native save/reload keeps a recoverable source snapshot. The GUI's “Run in MakeCode” action can use that snapshot to run the original Arcade program in the bundled PXT simulator after reopening the `.sb3`. That is the exact original program; edits to the translated Scratch blocks do not rewrite the snapshot.

The handle blocks also have Brickwright Code syntax and decompile back into it. For example:

```text
DEVICE ARCADE
GLOBAL hero
SPRITE Game:
WHEN flag clicked:
  hide
  set hero to arcade spawn template "hero-art" kind "Player" x 80 y 60 width 16 height 16
  arcade set vx of hero to 30
WHEN arcade kinds "Player" and "Enemy" overlap:
  arcade destroy arcade event second
```

The template is a Scratch sprite whose costume is cloned for each spawned handle. The `.sb3` stores the template art as ordinary Scratch costumes. Tests cover Code → Blocks → Code and real VM creation and overlap callbacks.

## Mutable sprite images

The Arcade image command supports `fill`, `replace`, `flipX` and `flipY` on a
sprite handle. Imported MakeCode calls use the same native Blocks and runtime:

```text
arcade image fill of hero color 7 replacement 0
arcade image replace of hero color 7 replacement 2
arcade image flipX of hero color 0 replacement 0
arcade image flipY of hero color 0 replacement 0
```

`replacement` is used by `replace`; flips ignore both color inputs. Color 0 is
transparent. Each literal starts with independent pixels. Sprites can attach
shared image references; changes update every attached renderer and overlap mask. Template costumes stay intact
for `.sb3` save/reload. Switching costume discards the private image and starts
from the selected authored artwork. Destroying a sprite or restarting releases
its private renderer skin. Export emits the corresponding MakeCode Image API
calls. Arbitrary image-array operations, standalone literal image values,
additional drawing APIs and noncanonical artwork still require support; unknown
operations remain explicit gaps.
Unreadable runtime artwork produces a diagnostic instead of inventing pixels.

## Pixel drawing and reading

The native Blocks palette now exposes pixel read/write, filled rectangles and
lines. These use the pinned PXT clipping and integer-coordinate algorithms:

```text
arcade set pixel of hero x 16 y 16 color 2
arcade draw fillRect of hero x 4 y 4 width 8 height 8 color 5
arcade draw drawLine of hero x 0 y 0 width 31 height 31 color 7
set sampled to arcade pixel of hero x (16) y (16)
```

For `drawLine`, the `width` and `height` fields are the end x/y coordinates.
For `fillRect`, they are the rectangle dimensions. Reads outside the image
return zero; writes are clipped. Color 0 erases pixels. Reads can be used in
arithmetic, conditions and procedure arguments. Drawing updates the sprite's
private renderer skin and collision mask. Export emits Image `setPixel`,
`getPixel`, `fillRect` and `drawLine` calls that compile in MakeCode Arcade.
Other drawing operations remain separate gaps.

## Shared image references

The image reporter returns an image handle, and the image setter attaches that
same resource to another sprite. Handles can be stored and aliased in variables:

```text
set saved to arcade image of hero
arcade set image of foe to saved
arcade image fill of hero color 7 replacement 0
```

Both sprites now display the edited pixels. Detaching or destroying `hero`
leaves `foe` and `saved` referring to the existing image. A literal image change
creates independent pixels even if its artwork equals another image.

Named frame resources retain edits when switching away and back. They are shared
across sprite templates and work in creation callbacks, including random frame
selection. The native reporter uses an array key, template, starting costume,
frame count and a rounded, wrapped frame index:

```text
arcade set image of hero to arcade frame image array "frames" index (0) template "hero-art" start 0 count 2
```

Import/export preserves supported frame selections as MakeCode `Image[]`
references. Runtime resources live until project restart, so saved references
remain valid after sprite destruction. Restart invalidates them and reruns the
project's normal setup. `.sb3` stores the reference blocks and authored artwork.
The renderer scales canonical SVG artwork to exactly three stage pixels per
Arcade pixel, including 1×1 images; shared mutations refresh every collision mask.

## Generated images and independent copies

Create and edit artwork at runtime in Code or with the corresponding native
Arcade Blocks reporters and commands:

```text
set picture to arcade new image width (16) height (16)
arcade mutate image fill (picture) color 7 replacement 0
arcade set image pixel (picture) x 0 y 0 color 2
arcade draw image fillRect (picture) x 4 y 4 width 8 height 8 color 5
set copied to arcade copy image (picture)
set sampled to arcade image pixel (copied) x (0) y (0)
set width to arcade image width of (picture)
arcade set image of hero to picture
```

A copy has independent pixels; assigning another variable to `picture` shares
its image. The `spawn image` reporter creates a sprite from the resource and an
existing hidden template target, and attaches it before creation callbacks:

```text
set hero to arcade spawn image (picture) template "hero-art" kind "Player" x 80 y 60
```

Import recognizes `image.create`, Image `clone`, dimensions, mutations and
pixel drawing through image variables. Procedure-local images are created afresh
on each call. Export emits the native MakeCode APIs and infers Image variable
types; supported projects compile in the pinned Arcade compiler. Native `.sb3`
reload reruns the resource creation blocks. Dimensions follow pinned PXT integer
conversion and its 0–2000 bounds. Zero-area resources have no visible or collision
pixels. Image arrays and standalone literal image values still need support.

## Image copying and overlap

Native image Blocks provide `drawImage`, `drawTransparentImage`, and a Boolean
image overlap block. `drawImage` clears the clipped source rectangle, then
copies its nonzero pixels. `drawTransparentImage` leaves destination pixels
under source color 0 untouched. Both accept a source Image handle and x/y
offsets. They edit the destination resource, so all sprites sharing that image
update their rendered pixels and collision masks.

```text
arcade blit image drawImage (picture) source (stamp) x (1) y (2)
arcade blit image drawTransparentImage (picture) source (stamp) x (-1) y (0)
set hit to arcade images overlap (picture) source (stamp) x (1) y (2)
IF arcade images overlap (picture) source (stamp) x (1) y (2):
  set score to 1
```

Overlap tests whether nonzero pixels intersect at the supplied source offset;
it does not change either image. These blocks work with generated images,
sprite images, aliases, clones and procedure Image arguments. Export uses the
native PXT methods and infers `Image` for both source and destination arguments.
Code and SB3 preserve the commands and Boolean reporter. Unresolved source
images or incorrect argument counts remain explicit import gaps.

The implementation uses the pinned MIT PXT image-copy algorithms, including
clipping, integer offset conversion and self-copy behavior. Self-copy follows
PXT's sequential pixel access; it is not an implicit clone. Drawing APIs beyond
the documented operations and literal-image resources remain separate
compatibility work. Image-returning procedures are supported as described below.

## Function results and early returns

Arcade now has native call-with-result, argument-list and return-value Blocks.
Imported value calls become reporters; ordinary custom-block calls can still
ignore the result. A return leaves its own procedure, including nested control
blocks, and the calling script continues. Arguments and local values belong to
each invocation. Reads and writes to a parameter use that invocation's cell,
including parameters renamed to avoid reserved words.

```text
DEFINE makePicture (color):
  arcade set local surface to arcade new image width (6) height (4)
  arcade mutate image fill (arcade local surface) color arcade local color replacement 0
  arcade return value (arcade local surface)

WHEN flag clicked:
  set picture to arcade call function "makePicture %s" arguments (arcade function argument (7) rest ("[]"))
```

The call block names the custom block's full signature; `%s` marks each
string/number argument. Argument-list reporters can be chained for any arity,
ending in `"[]"`. Import builds this chain automatically. Balanced Code tokens
keep nested calls and arithmetic intact. Command-call arguments also use
grouped reporters directly, retaining their values when another argument yields.
Export resolves the known procedure
and emits an ordinary TypeScript call and `return` statement. Unknown dynamic
procedure names or dynamic argument lists remain explicit export gaps.

Scalar values and returned Images survive Code, native SB3, PXT compilation and
reimport. Image-return type inference follows local assignments, parameter
writes, aliases, forwarded calls and Scratch's compact variable inputs. A
returned Image retains its resource identity; returning a clone provides an
independent resource. Captured parameter/local cells remain available to a
creation handler registered before the procedure returns.

Fast nonrecursive calls use the native sequencer immediately. Recursive calls
and functions that yield wait for their native execution thread, retaining
independent frames. Other scripts continue. Cancelling the caller, stop-all,
restart or disposal cancels pending child calls. Numeric argument encoding also
preserves NaN and infinities. This establishes the tested result/lifetime
behavior; exact PXT fiber and frame timing remains open.

Value calls with a bare return or possible fallthrough report an `undefined
value support` import gap rather than substituting zero as supported behavior.
The analysis is conservative. First-class functions,
mixed return types and full block-scoped bindings need further compatibility
work. Existing command calls may use a bare early return because its value is
discarded.

## Literal projectile creation routing

Decodable literal images use the native handle path for
`sprites.createProjectile`, `sprites.createProjectileFromSide` and
`sprites.createProjectileFromSprite`, including interval/button callbacks and
procedure locals. Source position, edge placement, velocity, independent
instances, kind changes, image mutation and lifespan stay on the actual sprite.
Local destruction registrations without closure captures retain their callbacks.
PXT's zero/default projectile kind and numeric builtin kinds keep their identity;
unknown numeric kinds and dynamic kind expressions still report gaps.

The six corpus sources verified by `scripts/verify-arcade-projectile-corpus.mjs`
exercise real gameplay actions through Code, SB3 and MakeCode compilation/reimport.
The optional browser mode steers the original paddle and food/enemy games through
the controller pane and checks rendered sprites and timed projectiles. Their
sources remain in the private corpus; only result metrics are written locally.

## Native controller bindings

Handle-based imports retain `controller.moveSprite(sprite, vx, vy)` as a native
binding on the actual sprite instance. Blocks expose **move Arcade sprite with
buttons**; Code uses:

```text
arcade control sprite (player) vx (100) vy (0)
```

Export restores the MakeCode call. Multiple sprites can be controlled together,
with dynamic speeds and later rebinding. Reassigning a variable does not move its
existing binding to another sprite. Null sprites are ignored at registration.

Digital button behavior follows the pinned PXT `game/controller.ts`: zero axes
retain ordinary physics, both active axes use the quantized diagonal vector,
release clears the velocity controlled by the previous input, and disabling a
previously controlled axis clears that velocity. Velocity and acceleration still
run through the native frame physics. This removes the handle path's generated
position loop and its zero-speed/default-speed bug. Existing fixed-target
imports retain their older movement translation; analog pressure, additional
player controllers and exact PXT frame timing remain separate work.

## Sprite procedure results

Functions can return newly created sprites, local sprite handles or sprite
parameters. Forwarding functions retain the same handle, while repeated creation
calls produce independent instances. Direct sprite/projectile creation expressions
can be returned without an intermediate global variable.

```typescript
function createPlayer(color: number) {
    let art = image.create(6, 4)
    art.fill(color)
    return sprites.create(art, SpriteKind.Player)
}
let player = createPlayer(7)
player.setPosition(30, 40)
```

The existing call/argument/return blocks carry the result in Blocks and Code.
Sprite property reads and writes, including `identity(player).x`, operate on
that handle. Export infers Sprite parameters, results and global aliases through
local assignments and forwarded calls. Tests cover native execution, Code,
SB3 reload, MakeCode compilation and reimport, independent instances and image
replacement. Custom-position spawn expressions without an assigned handle still
report an export gap; the direct creation returns above use MakeCode's default
creation position before subsequent positioning.

## Image procedure arguments

An ordinary custom block argument can carry an image handle in Code and Blocks:

```text
DEFINE paint (surface) (color):
  arcade mutate image fill (surface) color color replacement 0
```

Calling `paint picture 7` edits `picture` itself. A copied image remains
independent. Image arguments can be forwarded to another procedure, aliased in
local variables, used recursively, and passed into sprite creation. Import
infers image bindings in each function scope, so a numeric parameter with the
same name as a global image remains a separate binding. Export follows native
image uses, aliases and forwarded calls to annotate supported arguments as
`Image`; ordinary Scratch arguments retain `any` when their type is unknown.

Creation callbacks use Scratch event threads, and the creation reporter waits
for them before returning the handle. Matching handlers run sequentially, so
immediate image reads see completed callback edits. Nested procedure calls and
nested sprite creation retain their own event snapshots. A callback that yields
suspends its caller while other scripts and controller events remain active.
Stop, restart and project disposal cancel outstanding creation waits.

Projectiles run creation handlers while their velocity is zero, then apply
requested velocity, source or edge placement and automatic destruction. Edge
placement uses image dimensions after the callback, matching pinned PXT.
The importer supports literal-art and live-image projectiles with creation
callbacks. Fast callbacks execute through the
VM sequencer in the same turn, with caller context restored after nested calls.
Callbacks that yield retain Promise waiting. Exact fiber/frame timing remains
separate compatibility work.

## Projectiles from live images

The `Arcade projectile image` reporter accepts an Image handle, a hidden sprite
template, kind, velocity, mode and optional source sprite. It attaches the same
image resource before creation handlers run. Image edits therefore update every
sprite sharing that resource; cloning the image creates independent pixels.
The modes preserve the PXT APIs: `side`, `sprite`, `kind` and `kind-source`.
Requested velocity and source/edge placement apply after creation callbacks,
using the resulting image dimensions. Invalid image handles return an empty
sprite handle without creating a sprite.

```text
set picture to arcade new image width (4) height (2)
arcade mutate image fill (picture) color 7 replacement 0
set shot to arcade projectile image (picture) template "ProjectileArt" kind "Projectile" vx 50 vy 0 mode sprite source hero
```

`ProjectileArt` must be a sprite target; imported projects create that hidden
template automatically. The GUI exposes the native reporter in the Arcade
palette. Procedure Image arguments, sprite `.image` references, aliases and
clones can supply the image. Code decompilation and SB3 preserve the reporter;
MakeCode export emits the corresponding projectile API with the Image value.
The parser recognizes the complete projectile phrase before arithmetic, so
`kind-source` is a mode rather than a subtraction expression.

## Runtime creation registration and captures

Imported `sprites.onCreated` calls become explicit registration commands in
startup or procedure order. Sprites created before registration do not run that
handler. Existing implicit `WHEN arcade kind ... created` hats remain available
for authored projects; they are active from project start.

```text
DEFINE install (color):
  arcade set local offset to 10
  arcade register creation kind "Enemy" as "paint" capturing "color offset"
  arcade set local offset to 20

WHEN arcade creation handler "paint" runs:
  arcade image fill of arcade event first color arcade captured color replacement 0
  arcade set x of arcade event first to arcade captured offset
  arcade set captured offset to arcade captured offset + 1
```

In Blocks these are a registration command, a token-specific callback hat,
and captured-value read/write blocks. Each registration keeps references to the
listed bindings. A later assignment is visible to the callback, callback writes
update the same bindings, and repeated procedure calls retain independent frames.
Image and sprite references keep their identity. Nested registrations can retain
an outer callback's sprite after it returns. Restart or project reload clears
registrations and reruns setup.

Export embeds each callback at its registration command as a normal MakeCode
closure. It avoids a redundant default-center setter after creation, which would
overwrite a callback's position changes. Code roundtrips and native `.sb3` retain
the registration, capture names and callback bodies; runtime bindings are rebuilt
by executing the program. Computed kind expressions, block/loop binding scopes,
scene-specific handler lifetime, other callback types and nondefault spawn
coordinate ordering remain separate compatibility areas.

## Background colors

`DEVICE ARCADE` starts with a black backdrop. Change its palette color in Code
or use the matching Arcade command and reporter in Blocks:

```text
DEVICE ARCADE
GLOBAL color = 2
SPRITE Game:
WHEN flag clicked:
  hide
  arcade set background color to color
WHEN space key pressed:
  arcade set background color to arcade background color + 1
```

Colors use Arcade's 16-color palette. Changes apply immediately, behind sprite
and background-image artwork. The current color reporter preserves the value
passed to the setter; screen pixels use its low four bits, matching PXT.
Export emits `scene.setBackgroundColor(...)` and `scene.backgroundColor()`.

## Sprite flags

The Arcade palette has a flag dropdown. Code uses:

```text
arcade set flag Invisible of hero to enabled
arcade set flag Ghost of hero to 1
arcade set flag GhostThroughSprites of hero to 0
arcade keep hero in screen 1
```

Supported flags are `Invisible`, `Ghost`, `GhostThroughSprites`,
`GhostThroughTiles`, `GhostThroughWalls`, `StayInScreen`, `AutoDestroy`, and
`BounceOnWall`. Existing keep/bounce/auto-destroy/ghost commands use the same
bitmask. `Ghost` sets or clears all three ghost bits. An invisible sprite
continues to participate in overlaps. Flags accept literals, variables and
Boolean expressions and export to the corresponding MakeCode Sprite APIs.
Tile collision and camera features still require their own implementations.
`ShowPhysics`, `RelativeToCamera` and `DestroyOnWall` remain explicit gaps.

Controller handlers can create local sprite handles, keep each invocation's
sprite separate, and pass those handles to helper procedures. Boolean Code
assignments such as `set hidden to not (hidden = 0)` evaluate their expression.

## Sprite speech

The Arcade palette has a sprite speech command with a handle, text, duration
in milliseconds, animation condition, two palette colors and a rendering mode.
It starts the bubble and immediately continues to the next command:

```text
arcade say hero text "Ready!" for 500 ms animated 0 text color 15 box color 1 mode "text"
arcade say hero text "Still here" for -1 ms animated (score > 3) text color 2 box color 9 mode "text"
arcade say hero text "" for -1 ms animated 0 text color 15 box color 1 mode "text"
```

A negative duration keeps the bubble until it is replaced or cleared. Empty
text clears it. Use `"self"` for a script's own fixed sprite target, or a handle
variable, procedure parameter, or `arcade event first` for a runtime sprite.
Each sprite owns its bubble; destroying that sprite removes the bubble.
Mode `"text"` exports as `sayText` and uses PXT's wrapped, optionally animated
text and page timing. Mode `"legacy"` exports as `say` and uses its horizontally
scrolling single-line bubble. Both use PXT's pixel fonts and palette colors.
Code/Blocks, `.sb3`, and MakeCode export/reimport retain these settings.

## Authoring and exporting an Arcade game

Use an Arcade project, create a sprite target for each image template, and put game scripts on a separate `Game` target. A spawn block returns a sprite handle; keep that handle in a global variable to change its position, velocity, kind, flags, or lifetime later. Creation and overlap hats receive the actual sprite handles involved. `score` and `lives` stage variables map to Arcade's `info` API. Space and Z key hats map to Arcade A and B buttons.

The MakeCode Arcade export now emits real `sprites.create(img\`…\`, kind)` calls from template costumes, with handle variables and callbacks. The exported TypeScript is checked with the pinned PXT Arcade compiler. A source-bearing Arcade `.hex` can be imported back into Brickwright; a focused test checks code, art, and motion on that path. A larger authored game is also compiled, translated back to Brickwright Code, and stepped in the headless VM to check two distinct handles.

A fixed `arcade set costume of hero to 1` exports as `hero.setImage(img\`…\`)` using that template's second costume. A computed frame index exports as an `Image[]` lookup with Brickwright's rounded, wrapping index rule. Importing these MakeCode calls reconstructs the images as costumes in frame order. The VM updates the sprite's width, height, and opaque-pixel mask from Brickwright's centered four-unit pixel SVG when the costume changes. Overlap reporters and hats require two opaque pixels to coincide when both costumes have a decoded mask; screen clamping and auto destruction use the new bounds. A costume without a decodable mask still uses bounds overlap. Tests compile both costume forms with PXT, reimport and reexport them, and check the selected costume and dimensions in both the headless VM and built GUI. Ambiguous handle templates and resized artwork outside this pixel SVG format remain reported gaps.

`arcade bounce hero on wall 1` is available in Code and Blocks. It maps to MakeCode's `setBounceOnWall(true)` and the named-handle importer recognizes both that method and `setFlag(SpriteFlag.BounceOnWall, true)`. In a game without a tilemap, the VM keeps the sprite inside the 160×120 screen and reverses the velocity component pointing through an edge. A false value disables this behavior. Default movement now uses round-robin substeps and opaque image hitboxes as described below; full physics parity remains open.

`arcade ghost hero through sprites 1` maps to `setFlag(SpriteFlag.GhostThroughSprites, true)`. While enabled, neither the overlap reporter nor overlap hats report a collision involving that handle; setting it to zero restores collisions. This covers the sprite-overlap part of PXT's flag contract. Tile and wall ghost flags are separately implemented for the tested tilemap collision subset.

The GUI refuses “Run in MakeCode” and `.hex` export if translation reports an unsupported block or an image warning. Export also compiles the generated source with the bundled PXT Arcade compiler before offering the file. These are intentional errors: a placeholder, omitted behavior, or invalid TypeScript must not be presented as a complete Arcade game. The CLI can still produce partial TypeScript together with its `unsupported` and `warnings` lists for diagnosis.

`game.onUpdateInterval(milliseconds, callback)` now imports as `WHEN arcade every … ms:` in Code and as an Arcade event hat in Blocks. Each hat tracks its own period on the VM's 30 Hz Arcade clock, including in projects without sprites. Export emits the original PXT event call; tests exercise two simultaneous periods and compile the exported code. Periods must be positive numeric constants. The VM can check due callbacks only once per frame, so callbacks requested faster than a frame run at frame rate and other periods are rounded to frame boundaries.

`game.onUpdate(callback)` imports as `WHEN arcade updates:` and exports back to the same PXT event. The VM starts these callbacks once per Arcade frame, after sprite physics and due interval callbacks, including when no sprites exist. A test checks that an interval callback due on a frame is seen by that frame's update callback. The VM still uses a fixed 30 Hz frame, so exact timing can differ from PXT under variable frame duration.

`controller.dx(step)` and `controller.dy(step)` are Arcade reporters in Code and Blocks. They read the controller pane or held arrow keys, return zero when opposite directions are held, and multiply the signed step by the VM's 1/30-second frame duration. A missing step defaults to 100, as in PXT. Export restores the PXT calls. Analog stick pressure and variable frame durations are not represented by the current controller pane and VM clock.

This is not yet a full Arcade authoring environment. The latest pinned audit of 184 Arcade sources reports 70 translated, 113 partial, and one parse failure. The missing APIs below remain work required for a full game to run the same way in both editors. The `.hex` test checks its source container and Brickwright reimport; it does not by itself prove every MakeCode editor operation or simulator behavior.

`game.askForNumber(question)` and `game.askForString(question)` have Arcade reporters in Code and Blocks. They wait through Scratch's answer queue and export back to the matching PXT APIs. The number reporter converts the reply to a number. Optional digit and text length limits remain reported gaps because the current reporters do not enforce them.

`game.splash(title, subtitle)` and `game.showLongText(text, layout)` now have dedicated Arcade commands. They pause the calling script, queue concurrent dialogs, and resume on Continue or a controller button. The GUI renders the dialog above the editor even when the stage pane is collapsed. All six `DialogLayout` positions are retained on import and export; the Brickwright dialog uses the browser viewport for placement rather than the 160×120 Arcade screen. The built GUI browser check confirms that neither command lets the following block run before dismissal. The Arcade exporter now keeps a sprite target's name as its MakeCode variable name when that identifier is safe, rather than appending `Sprite` on every export. This preserves both target identity and the image pixels on reimport; API-name collisions are reported. In a six-project prompt sample, MakeCode → Brickwright → MakeCode → Brickwright structural roundtrips improved from zero to five preserved. The remaining project still loses sprite behavior and artwork.

## Required for full imported-game fidelity

The MakeCode TypeScript translator now has guarded paths for two source shapes. One creates unnamed sprites and configures them in `sprites.onCreated`; a pinned asteroid example carries its PXT built-in images as costumes and chooses one for each clone. The other uses named sprite variables with creation and overlap callbacks; a pinned fire game retains distinct player and fire handles, moves the player from controls, and destroys the fire handle involved in an overlap. Those paths also translate screen bounds and a start/stop countdown. `info.onCountdownEnd` becomes a native event hat, so its callback runs at zero; without a handler the game ends. Other source shapes continue through the fixed-target translator with named gap reports.

The named-handle path accepts both `let hero = sprites.create(…)` and a separate declaration followed by an assignment. Built-in sprite art is read from a generated table of all 507 static images in the pinned PXT Arcade device galleries. Every entry decodes as an image; the table removed eight missing-art reports across five corpus projects. Their other unsupported APIs still prevent full translation.

Top-level projectile assignments with decodable art also use handles. The runtime spawns the projectile at PXT's incoming edge, integrates its velocity, and destroys it after it leaves the screen. Event-only overlap snippets retain both callback handles; `sprites.destroy` can destroy the indicated sprite. Sprite destruction effects and durations remain named gaps.

`sprites.onDestroyed(kind, callback)` imports as `WHEN arcade kind … destroyed:`. Explicit destruction, lifespan expiry, and automatic offscreen destruction all emit this event once. The callback's `arcade event first` handle reads a snapshot of the destroyed sprite's properties, matching PXT's callback access after the sprite leaves the live set. Code and Blocks reexport it as `sprites.onDestroyed`.

`sprite.onDestroyed(callback)` now registers a token on the sprite handle at the call site, with a matching event hat for the callback body. Reassigning the source variable leaves the callback on the original sprite; a later registration on that sprite replaces the earlier one. Instance callbacks run before kind callbacks, matching PXT. The exporter inserts the callback body at the original registration statement and compiles the result with PXT. The guarded named-handle importer covers this source shape; more complex function and control-flow shapes remain reported gaps.

Arcade functions have `arcade set local … to …` and `arcade local …` blocks. Their values live in each Scratch procedure call frame, so nested and recursive calls retain separate copies. Function-local `sprites.createProjectile`, `sprites.createProjectileFromSide`, and `sprites.createProjectileFromSprite` calls with decodable artwork use a native projectile reporter. It evaluates velocity at creation, chooses the incoming screen edge or the source handle's position, enables automatic destruction, and retains a separate handle per call. A function-local instance `onDestroyed` callback can register on that handle. Export restores the original projectile API call and the registration inside the function; tests compile that output with PXT. Tilemap and camera placement, a source sprite that has no Arcade handle, and callback capture of function locals remain reported gaps. The obstacle corpus example imports its projectile and destruction callback, but its `player.onOverlap` call is rejected by the pinned PXT compiler: `Sprite` has no such method. Compiled audits classify that source as `pxt-compile-failed` rather than counting its call as an Arcade compatibility target.

The named-handle importer now follows sprite arguments through user functions and
functions that forward those arguments. A single function can act on different
sprites on consecutive calls; the VM test checks the resulting positions and
the export recompiles in PXT. A named sprite can also be repositioned inside
a kind-overlap callback. Background colors use runtime commands in startup,
procedures and event handlers, and export back to `scene.setBackgroundColor`.

The creation-event importer also accepts helper procedures and simple globals
inside TypeScript namespaces whose names have no qualified references or
collisions. Event sprite parameters flow into those helpers as handles. Two
pinned asteroid games now keep their `onCreated` callback and interval spawns;
their Blocks exports compile in PXT.
Startup declarations in this path now include text prompts and computed screen
coordinates. String `+=` uses a text join, including inside an `if` branch;
the VM test checks the resulting text and four more pinned asteroid variants
export to compilable PXT TypeScript.

Standalone `sprites.create` calls inside a startup loop or interval callback
now spawn a new handle on every execution. Named sprite variables assigned in
loops keep each spawned object distinct, and the guarded path can combine
timed asteroid spawns with a named, controller-driven player. For an
`onCreated` callback that sets a literal image, each template of the matching
kind receives that image at the same costume index. Export restores the image
change as `sprite.setImage`. Pixel SVGs now record their four-unit grid scale,
so a regular or uniform image retains its exact Arcade dimensions on export.

Arcade handle state resets when a new project loads or the green flag restarts it. This prevents sprites from one imported project appearing in the next. The browser import check exercises a real side projectile through the GUI and verifies its automatic destruction.

Most other MakeCode sprites still map to fixed Scratch targets. The translator must emit handles for **every** `sprites.create` and projectile creation, assign returned handles to variables, and resolve all sprite properties and methods through them. Generated templates must carry every sprite image and animation frame. `onDestroyed` callbacks and `onOverlap` callbacks outside the guarded path still need event-handle translation. The Code syntax is ready for more of that work.

The handle runtime then needs parity for the rest of the Arcade sprite contract: flags (`Ghost`, `DestroyOnWall`, `RelativeToCamera`, etc.), camera and tile collisions, pixel overlap for scaled or rotated images and other art formats, image animations, scale/rotation/effects, following, lifespan and destruction events, overlap ordering, projectile source behavior, and z-order. These must be checked against pinned PXT examples and the official PXT implementation. Current canonical pixel-image overlap, screen-edge bounce, and the fixed 30 Hz step are a foundation, **not full Arcade physics**. The generated Arcade audit names examples where the translation still refuses sprite APIs.

The acceptance gate is corpus based: import each pinned Arcade project, save and reload `.sb3`, switch Code ⇄ Blocks, run input-driven scenarios in both Brickwright and PXT, and compare object counts, positions, kinds, images, collision callbacks, and game state over time. A green-flag headless step alone does not establish parity.

## Shared background Images

The Image blocks now include `set Arcade background image` and the
`Arcade background image` reporter. Setting an Image preserves its identity:
mutations through an alias, a sprite using the same Image, or an Image-returning
procedure update the background. Clones stay independent. The getter lazily
creates a transparent 160×120 Image after clearing; setting the empty handle
clears the image and reveals the background color. Images are drawn at Arcade
(0,0), beneath sprites and above the solid background color.

```text
DEVICE ARCADE
GLOBAL surface
SPRITE Game:
WHEN flag clicked:
  hide
  set surface to arcade new image width 160 height 120
  arcade set background image (surface)
```

Literal background art is kept in hidden costume templates, independently of
live sprite instances. Code and `.sb3` preserve those assets; MakeCode export
emits `scene.setBackgroundImage(...)` and `scene.backgroundImage()`. Native
handle projects also accept `forever(function () { ... })`, with an independent
loop and callback locals. Exact PXT fiber scheduling remains an open gap.

The background corpus verification CLI exercises the real basketball game and
a background drawing snippet through native execution, Code, `.sb3`, MakeCode
compilation and reimport:

```sh
node --import ./scripts/lib/register-gui-scope.mjs scripts/verify-arcade-background-corpus.mjs
```

Use `--corpus-dir` and `--out` for other local corpus/report locations. Reports
contain results; source apps remain in the private corpus.

## Literal Image values

Imported ``let picture = img`…` `` declarations now retain an Image resource.
Aliases share that resource; mutations through a sprite, procedure parameter or
background affect the same pixels. A procedure returning a literal creates a
fresh resource on every call. Clones remain independent. Background literals
also allocate freshly each time their statement executes. Builtin gallery constants
retain shared identity across repeated reads and direct sprite creation.

Hidden costume templates preserve the original pixel data. Code uses the
existing shared frame Image reporter followed by `arcade copy image` for fresh
literal allocation. These are ordinary editable Blocks and SB3 resources.
MakeCode export emits typed Image variables, procedures and clone operations;
reimport retains both pixels and reference behavior. Image-only programs and
cloning decoded builtin gallery images are supported by the same path.

Verification:

```sh
node --test --import ./scripts/lib/register-gui-scope.mjs test/makecode-arcade-literal-images.test.mjs
node --import ./scripts/lib/register-gui-scope.mjs scripts/verify-arcade-literal-image-corpus.mjs
node --import ./scripts/lib/register-gui-scope.mjs scripts/verify-arcade-speech.mjs --literal-images
```

## Arrays of sprites and Images

**Arrays & Tensors** now contains array value blocks. Variables and procedure
arguments can hold an array reference; aliases share changes. Indexes start at
zero. The blocks construct arrays, get or replace an item, read/change length,
insert/reverse/remove items, select a random item and search with indexOf.
The removal value block reports whether it found the requested value.

For example, with existing sprite handles `hero`, `enemy` and `another`:

```text
set actors to new array reference from (array value (hero) rest (array value (enemy) rest ("[]")))
mutate array reference (actors) op "push" index (0) value (another)
arcade set x of (item (0) of array reference (actors)) to 40
```

MakeCode arrays remain ordinary arrays on export:

```typescript
let actors = [hero, enemy]
let alias = actors
alias.push(another)
for (let actor of actors) {
    actor.x += 10
}
```

Image arrays preserve the Image objects, so changing an array-held Image updates
any sprite/background using it. Removing an item does not destroy that object.
Sprite[]/Image[] globals, parameters and procedure return types are inferred
for export. Numeric elements and numeric-looking strings remain distinct.

Higher-order methods and full Boolean/coercion semantics still need work.
Missing reads/removals return undefined, preserving its identity through
variables, arrays and procedures. Full per-iteration capture and evaluation order
for complex compound array expressions remain part of the language work.

Reproduce the behavior checks with:

```sh
node --test --import ./scripts/lib/register-gui-scope.mjs test/makecode-arcade-reference-arrays.test.mjs
node --import ./scripts/lib/register-gui-scope.mjs scripts/verify-arcade-reference-array-corpus.mjs
node --import ./scripts/lib/register-gui-scope.mjs scripts/verify-arcade-speech.mjs --reference-arrays
```

## Nested arrays and row aliases

Nested Sprite/Image arrays now retain row identity through indexing,
procedures, for-of loops, removal and replacement. The exporter infers types
such as Sprite[][] and Image[][][] as well as numeric index locals required by
PXT. Replacing an Image in a row leaves sprites using the previous Image
unchanged; mutating the replacement updates sprites using that replacement.
Removing a row leaves existing row aliases usable.

```typescript
let rows = [[hero, enemy]]
let row = rows[0]
for (let actor of row) {
    actor.x += 10
}
row.push(another)
```

The **truthiness of item** Boolean block tests an array item directly. A missing
item, zero, false or empty text is false; an array reference or nonempty text
is true. This supports row initialization such as `if (!rows[i]) rows[i] = []`
without materializing undefined. Boolean array literals are preserved as
Boolean values. Missing values, null and ordinary text remain distinct; compound
if/while/for guards and value expressions now short circuit through editable
branches. `a && b`, `a || fallback` and `condition ? yes : no` preserve the
selected operand, including primitive types and Sprite/Image/array identity.

Verification includes nested Sprite rows, three-dimensional Images, empty rows
inserted by a procedure and self-containing arrays. GUI/controller checks use
`verify-arcade-speech.mjs --nested-arrays`; a real numeric-board game is checked
by `verify-arcade-nested-array-corpus.mjs --browser`. That real-game check covers
startup, drawing, directional movement and A-button removal/refill at a boundary.

## Missing values and conditions

The Arrays palette includes **undefined/null value**, **truthiness of value**
and **compare value** reporters. Code uses these spellings:

```text
set missing to undefined value
IF compare value (missing) op "===" with (undefined value) THEN:
  set result to 1
IF truthiness of value ("0") THEN:
  change result by 1
```

Unlike Scratch truthiness, nonempty strings such as `"0"` and `"false"` are
true. Undefined and null survive SB3 saves using an optional special-value
sidecar. Normal TypeScript literals/comparisons are emitted on Arcade export.
This supports missing slots and procedure returns. Native primitive arithmetic
and value comparisons preserve missing values and NaN; Math/string API coercion
and array/resource conversion remain separate work.


## Lazy value expressions

MakeCode logical and conditional expressions import as ordinary editable
branches with invocation-local value cells. Skipped operands are not evaluated.
Earlier arguments, receiver/index expressions and compound-assignment values
are saved before a later operand's lifted statements execute. Loop guards are
recomputed each iteration; `for` initializers and updates can contain selections.
Boolean predicates, including Sprite overlaps and key presses, can also be
used as values. Export reconstructs normal TypeScript branches and typed values;
SB3 saves retain the editable blocks and image resources.

For example, `let chosen = first || second; chosen.x = 25` preserves the
identity of the selected Sprite rather than converting the selection to a
Boolean. `let label = 0 || "0"` retains text, and `false && expensive()` skips
the call. Concurrent callbacks own separate local cells, including when a
called procedure pauses and returns null.

Verification: `test/makecode-arcade-lazy-values.test.mjs` and
`scripts/verify-arcade-lazy-value-corpus.mjs --browser`. The private Pong app
exercises controller movement/bounds, both paddle collisions, selected paddle
identity, scoring and ball reset. Value-position assignment/update expressions
remain explicitly unsupported; general coercion, loop break/continue, arbitrary
closures and exact PXT fiber timing require separate work.


## Primitive value operations and optional arguments

The Arrays palette adds **value arithmetic** and **numeric unary conversion**
reporters. They retain text versus numbers and implement signed remainder,
missing/null conversion and nonfinite results. Code spellings are:

```text
set result to calculate value (undefined value) op "+" with ((0 + 2))
set label to calculate value ("5") op "+" with ((0 + 2))
set numeric to convert value ("5") op "+"
IF compare value (result) op ">=" with ((0 + 1)) THEN:
  arcade log "not reached for NaN"
```

The first result is NaN, the second is text `"52"`, and numeric is the number 5.
NaN comparisons are false, and negative remainder keeps its sign. Unary minus
preserves negative zero. These values survive scalar SB3 saves, array argument
chains and procedure calls; ordinary text `"NaN"` stays distinct.

Optional arguments carry undefined. A default such as `value = 7` applies to
missing or explicit undefined arguments; null, zero and `"0"` retain their values.
Exports use normal typed TypeScript procedures and branch-based default
initialization, and compile/reimport checks verify their behavior. Higher-order
callbacks and sprite coercion remain unsupported areas; sprite arithmetic
produces a named gap. Image conversion is described below.

Compound stores now retain their original array or sprite receiver, index and
old value before a user call on the right runs. For example,
`receiver()[index()] += change()` calls each target function once, reads the
old element before `change()`, and writes back to that original element even
if `change()` selects another array. The importer emits editable invocation
locals and an ordinary store; aliases still identify the same resource.

Statement increments and decrements also support array elements and sprite
properties, including function-based targets. They perform numeric conversion
first, so incrementing text `"5"` stores 6 and incrementing a missing slot
stores NaN. Prefix updates on a new line are separate statements. Using an
assignment or update as an expression value remains a reported gap.

Array value arithmetic and comparison follow the pinned PXT simulator's
`RefCollection` behavior. An array is a runtime object, so `array + 2` gives
`"[object Object]2"`, numeric conversion gives NaN even for an empty array, and
loose comparison with `"[object Object]"` succeeds. Different arrays remain
different under equality; aliases passed through procedures keep their identity.
Nested and self-containing arrays use the same finite object conversion.
The pinned PXT `removeElement` shim returns numeric `1`/`0` flags; these stay
numeric when stored or strictly compared, while still working as predicates.
An array declaration without an initializer remains undefined until assigned.

Arrays now carry typed reference tags with a runtime/project scope. Display
IDs such as `array-reference:1` remain available for debugging, but ordinary
text cannot access a live array. The IDs live in reference metadata; normal
text conversion gives `"[object Object]"`. JSON argument chains restore canonical aliases;
search/removal compares reference identities and skips sparse holes as PXT does.
SB3 scalar fields remain standard strings, with typed values in the optional
`bwSpecialValues` sidecar. Runtime array contents are rebuilt by the program
on restart; the reference sidecar is not a save of the live heap.

The coercion fixture runs actual PXT-compiled JavaScript with the pinned core
simulator shims, then compares native BW results through Code, SB3 and Arcade
export/compilation/reimport. That synchronous language harness rejects async
shims; game scheduling and rendering are checked separately in Playwright.

Image values now use scoped typed references as well. `image + 2` gives
`"[object Object]2"`, numeric conversion gives NaN, and aliases compare equal
while independent clones stay distinct. Image references remain images through
array elements and procedure arguments/returns. Image IDs are metadata rather
than text operands; ordinary ID text, foreign references and expired project
references cannot access image resources. Every drawing, cloning, background,
sprite attachment and frame-image lookup uses the typed reference boundary.

The image fixture runs the actual pinned PXT compiler and simulator, using the
shipped native Image declarations and 4-bit image implementation. It compares
operators and alias mutation through native BW, Code, SB3 restart and Arcade
export/compilation/reimport. SB3 retains reference metadata; image pixels are
recreated by the program at restart, rather than saved as a live heap. Sprite
coercion needs separate handling: PXT sprites define a custom `toString()`
containing their ID, position and velocity.


The Arcade palette now includes **sprite as text**, with Code spelling:

```text
set label to arcade text of sprite (hero)
```

MakeCode import/export maps this reporter to `hero.toString()`. The result is
PXT's numeric scene ID, position and velocity, such as `0(12,23)->(4,5)`.
Aliases and procedure returns preserve that result. A retained destroyed sprite
can still report its current properties until the project restarts; clearing
a sprite's rendering does not erase its object value. Native position/velocity
reads and writes also retain that object after destruction. Runtime sprite records are retained
until project reset, as the existing image/array resource tables are. SB3
restart reconstructs those records from the program rather than saving a heap.

The string type now propagates through reporter assignments, aliases and
procedure returns when exporting global declarations. The authored fixture
executes both the original source and BW's export in the full pinned Arcade
simulator, including original class dispatch and fiber scheduling.

General sprite arithmetic and implicit text conversion remain a named gap.
PXT's compiler distinguishes `sprite + ""` (custom class string conversion)
from `anySprite + anyText` (ordinary object conversion), even when `anyText`
contains an empty string. A separate original-simulator fixture records this
difference. The explicit reporter does not establish general sprite coercion,
fixed-point physics equivalence, arbitrary scene renderable IDs or heap saves.


The complete simulator probes expose remaining runtime differences: a new
one-pixel sprite starts at `(79.5, 59.5)` in PXT and `(80, 60)` in BW; a move to
`(12.123, 23.456)` yields `(12.125, 23.45703125)` in PXT and keeps the requested
decimals in BW. These are measured gaps, not supported equivalence cases. Run
`node --import ./scripts/lib/register-gui-scope.mjs scripts/verify-arcade-sprite-values.mjs`
to reproduce `test-results/arcade-sprite-values-gaps-current.json`. Sprite text
validation currently uses explicit integer positions; nonzero velocities are
checked on destroyed sprites so the original scheduler cannot move them
between value reads. Exact physics and implicit conversion remain unfinished.

### Constructor centering and fixed-point positioning (2026-10-01)

Arcade constructor and positioned creation are separate Blocks and Code operations:

```text
set hero to (arcade create template "heroArt" kind "Player" width 1 height 1)
arcade set position of (hero) x (12.123) y (23.456)
set caption to arcade text of sprite (hero)
```

The constructor block runs creation callbacks at Arcade's default center. A 1×1
image starts at `(79.5,59.5)`: Arcade floors its initial left/top edges before
adding half the image size. `arcade create image (…) template "…" kind "…"`
uses the actual image dimensions at runtime. Imported `sprites.create` calls
use these constructor blocks, and exports use `sprites.create` again.

`arcade set position` is one command with two evaluated coordinate inputs. It
converts the displacement to signed 24.8 fixed point, matching `setPosition`.
Individual `arcade set x/y/left/right/top/bottom` operations convert the new
edge instead. For the 1×1 sprite, `setPosition(12.123,23.456)` stores
`(12.125,23.45703125)`; directly assigning `x=12.123` stores `12.12109375`.
Velocity and acceleration also use signed 24.8 storage, including overflow.
These are object storage rules, shared by rendering and subsequent writes.

The existing positioned spawn block remains available. It now runs the
constructor and its creation callbacks, then applies its explicit position,
matching the emitted `sprites.create` followed by `setPosition`. For callbacks
that should keep their own chosen position, use the constructor block. Export
reports a positioned spawn expression without an assigned handle as unsupported,
because its placement cannot be emitted as a following command there.

`test/makecode-arcade-sprite-fixed-point.test.mjs` compares constructor callbacks,
odd/even image sizes, dynamic images, atomic coordinate evaluation, direct edge
writes, negative/repeated positioning, image resizing, destroyed object writes,
acceleration and overflow against the complete original simulator. It checks
Code and SB3 roundtrips, export/reimport, and execution of the exported PXT source.

This does not establish full physics compatibility: frame integration, terrain
collision resolution, scaling, zero-size images and timing still need separate
original-simulator probes. The two earlier default-centering/fractional-position
measurements in `arcade-sprite-values-gaps-current.json` now agree.


### Sprite collections

The Arcade reporter **array of Arcade sprites of kind [KIND]** returns a fresh
array reference, usable with Arrays & Tensors blocks. It contains the existing
sprite handles in their current kind insertion order. Moving or destroying a
sprite reached through an array operates on that same sprite. Removing an array
entry changes that snapshot; it does not destroy the sprite.

Code example (after creating Enemy sprites):

```text
set actors to (arcade sprite array kind "Enemy")
IF (length of array reference (actors)) > (0) THEN:
  set first to (item (0) of array reference (actors))
  arcade set position of (first) x (40) y (60)
```

MakeCode imports/exports this reporter as `sprites.allOfKind(SpriteKind.Enemy)`.
Aliases share the snapshot; repeated queries create independent snapshots.
Changing kind removes a sprite from future queries of the old kind and appends
it to the new kind. Destroyed sprites are excluded from new queries; old arrays
retain their references and the retained sprite properties. Project restart
expires old array references.

Fixed SpriteKind members, including declared custom kinds, are supported.
Dynamic numeric/variable kind queries remain explicit unsupported diagnostics.
This feature uses the existing sprite handle representation; general implicit
sprite-to-primitive conversion and terrain collections are still separate gaps.


### Tile locations and collections

Arcade now has Blocks/Code reporters for tile locations and arrays of locations
matching an image. Locations retain identity through variables, procedure
parameters and arrays. New queries return new locations in column-major order.
Their center coordinates use the currently initialized map's tile size, including
retained locations after map replacement or clearing.

Commands edit tile images/walls, place sprites at tile centers, and load or clear
map data. Map data is an editable JSON block field containing `columns`, `rows`,
`tileSize`, `indices`, `walls` and pixel `images`. A dedicated visual tilemap editor
is still needed. Supported generated MakeCode tilemap resources preserve walls
and scale, rather than becoming only a background costume.

Tile layers render over the scene background and below sprites. Clearing a map
removes its drawable and preserves the independent background image. Location
references are scoped to the running project and are recreated on restart.

Tested tile-wall collision movement and registered wall/tile events are now implemented. Camera center/follow/scrolling and properties are implemented; camera effects, advanced scene lifecycle, remaining physics parity and dynamic map values retain explicit compatibility gaps. Existing large games can still use the
legacy fallback when namespace or animation features are missing. See the
latest tile regression report for measured behavior and conversion coverage.


### Registered wall and tile callbacks

Register a handler token, then put its body under the matching hat. The first
event sprite and event location are actual typed resources, usable in variables,
arrays and procedures. For example, with a sprite stored in `hero`:

```text
arcade register wall kind ("Player") as ("wall") capturing ("")
WHEN arcade wall handler "wall" runs:
  arcade set vx of arcade event first to -40
  set column to arcade tile column of (arcade event location)
```

Tile registrations use `arcade register tile kind ("Player") image (picture)
as ("tile") capturing ("")` and `WHEN arcade tile handler "tile" runs:`.
The image selects tiles by their pixels; a clone matches the same tile image.

Handlers run in registration order and may wait. Collision response observes
their velocity, flags, kind, destruction and map changes. Explicit movement calls
wait for their own handlers, while other scripts and a frame callback can run
concurrently, as in MakeCode. This does not establish exact scheduler timing
parity. Registrations reset when the project restarts.

Export emits real `scene.onHitWall` and `scene.onOverlapTile` calls. See
`test/makecode-arcade-terrain-events.test.mjs` for executed original and exported
PXT comparisons, including nested captured Location arrays. Dedicated tilemap
editing and full scene/physics parity remain open.


### Camera and scrolling

```text
arcade camera follow sprite (hero)
set cameraLeft to arcade camera property (2)
arcade center camera x (200) y (100)
arcade camera follow sprite (null value)
```

The property selector dropdown supplies X=0, Y=1, Left=2, Right=3, Top=4 and
Bottom=5. Numeric reporters can also select a property. Unknown selectors return
undefined, as in MakeCode. Centering cancels following; following null retains
the last viewport. Offsets are floored and clamped to an initialized tilemap's
bounds. The pinned MakeCode non-square sprite follow Y behavior is preserved.

Camera movement changes drawing offsets and keeps the sprite's world position.
Tile layers scroll with world sprites. `RelativeToCamera` sprites keep screen
coordinates, making a HUD possible. AutoDestroy and tested StayInScreen bounds
use the viewport. Code/Blocks, SB3 and MakeCode export preserve these operations.
Camera shake, advanced scene APIs and full multi-sprite physics parity remain open.


### Scene stacks and scene-scoped callbacks

```text
arcade push scene
arcade set life player (1) to (4)
arcade set score player (2) to (20)
arcade register button ("b") event (2049) as ("back") capturing ("")
WHEN arcade button handler "back" runs:
  arcade pop scene
```

Push starts a fresh active world. Pop resumes its parent: sprites, background,
tilemap, camera, Info, animations, callbacks and timers are restored. Parent
frame updates pause while the child is active. Physical controller input and
resource heaps remain shared. A retained image can be edited while its scene is
hidden; its sprite renders the edit on return. Popped sprite references remain
usable. Popping the base scene creates a fresh world rather than doing nothing.

Inline update, interval, button, kind-destruction, sprite-overlap, forever,
life-zero and countdown registrations belong to the active scene where the
registration command executes. Matching token hats define the callback body.
Sprite callbacks expose typed `arcade event first`/`arcade event second` values.
Button event selectors are Pressed=2049, Released=2048 and Repeated=2054.

Scene push/pop lifecycle registrations are global and run after the active world
changes. Their supported inline callbacks retain captured cells. Repeated
registration creates another callback, even at the same source site. Button,
life-zero and countdown registration follow the original replacement rules.

Player selectors 1–4 support life/score reads, writes, changes and presence
queries. These are native scene state, not project variables pretending to be
Info. Export emits genuine `game`, `sprites`, `controller`, and `info` APIs;
Code and SB3 retain the registrations and typed captures.

Named lifecycle callback identity/removal, access to the lifecycle `oldScene`
argument, broader Scene objects, effects and exact overall scheduler/physics
parity remain explicit gaps. See `test/makecode-arcade-scenes.test.mjs` for
original-runtime comparisons through Code, SB3, exported PXT and reimport.

## Multi-sprite movement and overlap semantics

Default motion snapshots all active sprites before movement and advances them
round-robin in substeps of at most 4px. Velocity and acceleration use tested
original fixed-point integration, a 100ms frame-delta cap and a speed cap of 500.
Wall callbacks can affect another sprite before its next substep. Overlaps use
opaque hitboxes and actual nontransparent pixels; camera-relative and sprite-ghost
flags exclude them. Matching callbacks preserve original pair/argument/handler
order and asynchronous pair locks. A callback may run after the sprites have
separated, so an overlap event need not imply a true endpoint overlap query.

Sprite overlap reporters can query retained sprites from suspended or popped
scenes. They read current shared Image pixels, including hidden fill/replacement
edits. Retained objects do not automatically rejoin the active physics world.

Original opposing 2px sprites can miss overlaps with relative substeps up to
8px; this implementation preserves that original limitation. Scaling
and rotation hitboxes, configurable engine speed/step settings, full scene hooks
and exact global scheduling still require work. Dedicated tilemap painting and
visual animation sequencing remain GUI gaps.

Evidence: [runtime/original comparison](../test/makecode-arcade-multi-physics-runtime.test.mjs),
[Code/export/reimport/SB3 execution](../test/makecode-arcade-multi-physics.test.mjs),
and [built controller workflow](../test-results/arcade-multi-physics-browser-current.json).

## Per-axis friction

Use the existing sprite-property setter/reporter blocks with `fx` or `fy`.
MakeCode import and export use the actual Sprite properties. For example:

```text
arcade set fx of (hero) to (200)
arcade set fy of (hero) to (100)
arcade set vx of (hero) to (100)
set horizontalFriction to (arcade property fx of (hero))
```

New sprites default to zero friction. Setters clamp negative input before
fixed-point conversion. Friction decelerates positive and negative velocities
toward zero without overshooting. Nonzero acceleration takes precedence on its
axis; the other axis can still decelerate. Fixed-point overflow and frame-delta
rounding follow the pinned original runtime. Retained sprites keep their friction
through scene suspension and pop; inactive sprites are not advanced.

The existing property dropdown exposes `fx` and `fy`; no separate motion editor
is required. Engine max speed and substep settings are implemented in the tested subset
below. Scaling/rotation hitboxes and exact overall scheduling remain open.

Verification: [original/runtime](../test/makecode-arcade-friction-runtime.test.mjs),
[executed Code/PXT/SB3 roundtrips](../test/makecode-arcade-friction.test.mjs),
[visible controller workflow](../test-results/arcade-friction-browser-current.json).
PhysicsEngine setting access and engine replacement now use real references
and membership semantics, as described below.

## Scene and PhysicsEngine references

Scene and PhysicsEngine values are native references. Aliases, arrays and
procedure arguments retain the same object; replacing a scene's engine does
not copy settings or enroll the old engine's sprites. Existing sprites can
remain visible while stationary, and newly created sprites join the replacement
engine. Restoring an old engine restores its own membership. Retained Scene
references can change a suspended scene's engine without changing the active
scene.

Use these Code forms and their matching Blocks:

```text
set view to (arcade current scene)
set saved to (arcade physics engine of scene (view))
set replacement to (arcade create physics engine max speed (120) min step (2) max step (4))
arcade set physics engine property maxSpeed of (saved) to (40)
set speedLimit to (arcade physics engine property maxSpeed of (saved))
arcade set physics engine of scene (view) to (replacement)
arcade set physics engine of scene (view) to (saved)
```

Property menus expose `maxSpeed`, `minStep` and `maxStep`. Setters store original
fixed-point values; getters round with the original fixed-point integer rule.
Omitted constructor arguments default to 500, 2 and 4. Explicitly supplied
`undefined` arguments become zero in the pinned PXT target, and the native
factory preserves that behavior. Export uses actual Scene/ArcadePhysicsEngine
types and a genuine TypeScript `as ArcadePhysicsEngine` assertion when reading
the base-typed Scene field. Reimport erases the assertion without copying the
reference or changing runtime identity.

A step configuration that actually stalls the original halving loop produces
a named native runtime diagnostic with exact effective step values. The
controller pane displays that diagnostic; restarting/loading a project clears
its previous report. Settings are preserved rather than silently clamped.
Zero step settings that cause finite zero-motion behavior in the original
remain distinct from a stalled halving loop.

Advanced engine operations (`addSprite`, `removeSprite`, `move`, `overlaps`,
`draw`) and broader Scene APIs remain named unsupported features. General
scene lifecycle and full geometry/scheduler parity are still incomplete.
Original/runtime, import, executed export/reimport and SB3 gates pass for this
subset across the recorded runs. The standard GUI build and actual Code/Blocks/
controller workflow pass, including 324 exact color pixels per 6×6 sprite.
See [regression](../test-results/arcade-physics-engine-regression-current.json)
and [browser](../test-results/arcade-physics-engine-browser-current.json).
The browser fixture creates/fills Image values through Code. Pasting translated
Code alone does not carry literal-image assets; that GUI asset handoff remains
a separate tracked gap.

## Sprite scaling

Sprite `sx` and `sy` set independent horizontal and vertical scales; `scale`
reads the larger axis and sets both. Existing property Blocks expose all three.
Scale storage uses original signed 24.8 conversion after a negative clamp.
Scale changes preserve the center by default and update actual dimensions,
source-image hitboxes, wall contacts and pixel overlap; source Image pixels and
aliases are retained. Zero axes produce zero-size rendering and no pixel overlap.

Matching Code and native Blocks include:

```text
arcade set sx of (actor) to (2)
arcade set sy of (actor) to (1)
arcade set scale of (actor) to (2) anchor (3)
arcade change scale of (actor) by (0.5) anchor (12)
arcade scale core of (actor) x (undefined value) y (1) anchor (0) proportional true
```

Anchor values match MakeCode: middle 0, top 1, left 2, right 4, bottom 8;
corner anchors combine those bits. The Blocks menu provides named anchors.
Core scaling permits omitted/null axes and proportional adjustment of the other
axis. Center/anchor movements follow actual sequential terrain movement and can
invoke wall/tile callbacks. Export uses real Sprite methods, numeric scale
properties and a genuine Boolean proportional argument.

Rendering rasterizes scaled source images with the original integer sampling.
Canonical imported palette costumes are decoded for real scaled rendering;
changing their costume retains scale. Scaled overlap selects the destination
by scale area and tests actual source pixels in both argument orders. Hitbox
edge products preserve original fixed-point overflow before shifting.
Rotation/rotationDegrees remain explicit unsupported features. Dedicated
visual tilemap painting and animation sequencing remain separate GUI gaps.

Large-scale overflow probes verify scalar hitbox geometry without rendering.
Viewport-aware rendering now bounds each sprite raster to 160×120 pixels;
see the additional verified workflow below. Ordinary scaling passes original/native/Code/executed export/reimport/SB3
gates. Actual Blocks anchor menu shadows preserve values through Code and
executed export. Final standard GUI build and controller workflow pass with
144 pixels at scale 1, 576 at scale 2, 288 for independent axes, 324 at scale
1.5 and zero for a zero-width axis, across two control cycles and restart.
See [regression](../test-results/arcade-scaling-regression-current.json) and
[browser](../test-results/arcade-scaling-browser-current.json).

## Viewport rendering for large scaled sprites

A sprite retains its actual logical size, scale and source Image. Rendering
samples only its visible intersection with the 160×120 viewport using the
original full-destination 16.16 step and clipping offsets. A crop is not resized
as a fresh image. The renderer positions the cropped skin in viewport space;
large world centers never need to be subtracted in GPU coordinates. Ordinary
movement reuses unchanged skins; changed crop windows, camera transforms,
RelativeToCamera, shared-image mutation and scene restoration update them.
Hidden or zero-area sprites allocate zero palette pixels.

A two-pixel-wide Image at scale 16384 has width 32768. MakeCode's fixed-point
center getter divides with an overflowing shifted numerator at this size;
x/y and setPosition retain that original behavior. Rendering uses actual edges
and dimensions. To intentionally center this art, use its left/top properties:

```text
arcade set scale of (actor) to (16384) anchor (0)
arcade set left of (actor) to (-16304)
arcade set top of (actor) to (-16324)
arcade center camera x (80) y (60)
```

Verified against original MakeCode: fourteen full-screen cases, including
fractional edges, independent axes, transparency, camera offsets, relative
sprites, extreme integer sampling steps and hidden/zero dimensions. The real
Code→Blocks/controller test pans a 32768×32768 sprite, toggles camera-relative
behavior and restarts with exact palette counts; its actual skin stays 640×480
SVG units. Ordinary scaling GUI and all four Code/export/reimport/SB3/dropdown
cases pass after this change. This does not establish rotation support.

Evidence: [regression](../test-results/arcade-viewport-regression-current.json),
[controller](../test-results/arcade-viewport-browser-current.json),
[original pixels](../test/makecode-arcade-viewport-scaling-runtime.test.mjs).
