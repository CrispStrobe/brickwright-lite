# Conversion capabilities and GUI closure ledger

Baseline reviewed 2026-10-07 against Lite main
[`168457065`](https://github.com/CrispStrobe/brickwright-lite/commit/16845706545b115b76dd04f391cdebb1c3204e4c).
The Arcade integration claim in [LANES.md](../LANES.md) owns this handoff.
The previous agent is paused; its preserved branch is an integration input,
not a second active owner. SPIKE G01, CPU and hardware ownership remain separate.

## Arcade extensions: seven segment displays — 2026-10-10

The first MakeCode extension now converts: `sevenseg` (seven segment digits and
counters), which the pinned Arcade target bundles.

- `scripts/generate-arcade-sevenseg.mjs` transpiles the pinned `sevenseg.ts`
  unchanged into `sevenseg-pxt.js`. Its `SevenSegDigit` and `DigitCounter` classes
  draw with the native image engine onto real native sprites (the host supplies
  `image.create`, `sprites.create` and buffer literals), so digits collide, layer
  and render like any sprite.
- Nine words (sb3-creator `2f9a8985`, 250 ops): create a digit or counter, set the
  character, color, radix and scale, add a digit, and read or write `x`, `y`,
  `value`, `count` (plus `width`, `height`). Digits and counters are references of
  a new value kind; the translator tracks them through its type graph, and the
  exporter declares them as `SevenSegDigit` / `DigitCounter` and adds the
  `sevenseg` dependency.

Evidence: an authored program using every word draws the same full screen raster
as the original and reports the same values (including an ignored out-of-range
count); it round-trips through Code and Blocks, SB3 and an original export that
runs in PXT. A wrong default style fails the raster comparison. The corpus program
using sevenseg now translates without a gap (137 of 184 inputs).

## Arcade core translator gaps — 2026-10-10

Gaps closed without any third-party extension:

- **Terrain physics.** Every tile-map program carried the qualification "full
  terrain collision physics and scene lifecycle are not yet supported". It is
  removed on measured evidence: `test/makecode-arcade-terrain-trajectories.test.mjs`
  runs eleven authored scenarios (gravity landing on a floor and a ledge, a
  diagonal into a corner, a 400 px/s mover, slow and fast `BounceOnWall`, 16 px
  tiles, a wall removed at run time, a sprite larger than a tile, `DestroyOnWall`
  and a tile map replaced mid-run) in the pinned original and natively, and
  compares x, y, vx, vy and the live sprite count on every frame. The original runs
  under a fake clock (`fakeClock` in `test/helpers/pxt-arcade-runtime.mjs`); its frame
  times still vary, so the native run replays each recorded frame's delta time.
  All entries are identical. Removing velocity zeroing on contact fails eight
  scenarios; dropping the bounce remainder fails the fast bounce. The existing
  contact, terrain event, scene and camera tests keep their oracle comparisons.
- **Namespace tile constants.** `namespace myTiles { export const tile0 = img... }`
  referenced from `tiles.createTilemap(...)` now resolves in the tile map.
- **Immediately invoked functions** lower to a generated top-level function unless
  they capture enclosing locals or `this`.
- **Statement-level `forEach`, `filter(...).forEach` and `map`** (a discarded
  `map` runs its callback for its side effects) lower to loops; `filter` evaluates
  every predicate before the loop body runs, as in the original.
- **Ragged image literals** pad short rows to the widest row, as the original does.
- **Numeric `for` counters.** A counter the loop body reads used to start as the
  text `"0"`, so `x + i` joined text on the first iteration; it now starts as a
  number.

Translation-only census of the private corpus: 136 of 184 inputs translate with no
gap (was 130), 47 partial, 1 parse error. Of the partials, most use extensions
(corgio, darts, bundles, carnival, scroller, characterAnimations, sevenseg, story
sprites, settings blocks and project-specific ones), and several reference art,
tile maps or functions from companion files that a single-file input does not
contain. Others are invalid in the original too: `sprite.onOverlap(...)` does not
exist in the pinned target, one input reads an undeclared variable and one is
truncated. The remaining core gap in the corpus is `music.createSong` (the song
sequencer); its three inputs also use extensions.

## Native Arcade game over — 2026-10-10

`game.gameOver(win)` and the legacy `game.over(win, effect?)` used to import as
Scratch's `stop all`: the game simply stopped. They now run PXT's game over:

- `scripts/generate-arcade-gameover.mjs` transpiles the pinned `game/textDialogs.ts`
  (`BaseDialog`, `GameOverDialog`, frame, cursor and trophy images) and the
  `GameOverConfig` class of `game/game.ts` into `gameover-pxt.js`. Messages,
  default effects (`confetti` on a win, `melt` on a loss), default sounds
  (`powerUp`, `wawawawaa`) and the configuration rules are PXT's own.
- The native sequence follows `game.ts`: scores and the session best are judged,
  every scene is popped, a fresh scene shows the last displayed frame as its
  background, the sound and effect start, after 400 ms the dialog is drawn as a
  HUD renderable, after 500 ms its cursor appears, and the next button press
  restarts the program. Waits use the Arcade clock.
- Image screen effects (`dissolve`, `melt`, `slash`, `splatter`) now run: the
  particles generator lowers their `runInParallel` loop with the same fiber
  lowering as music (`scripts/lib/pxt-fiber-lowering.mjs`), and they share music's
  fiber scheduler, redrawing the background image after each step.
- Seven words (sb3-creator `4ce65254`, 241 ops): game over, legacy game over,
  `setGameOverEffect`, `setGameOverMessage`, `setGameOverPlayable` (and
  `setGameOverSound`), `setGameOverScoringType`, `ImageEffect.startScreenEffect`.

Evidence: a lost game's screen equals the original's outside the score HUD; a won
game's dialog rows equal the original's and its win sound queues the original's
instruction bytes; a press before the cursor is ignored and one after it restarts
the program; editing through Code and Blocks, SB3 and original export round-trip
(the original runs the export).

Limits:

- The background snapshot comes from the native raster, which does not contain the
  score/life HUD (the device pane draws it), so the HUD is missing from the
  game-over background.
- The best score is kept for the session only; PXT stores it in settings.
- `game.onGameOver` handlers and multiplayer winner messages are not imported.

## PXT parseInt and frame delta time — 2026-10-10

- `parseInt(text, radix?)` runs PXT's own implementation from the pinned
  `base/pxt-helpers.ts` (`scripts/generate-arcade-helpers.mjs` → `helpers-pxt.js`),
  which differs from JavaScript's. Values for plain, hexadecimal with whitespace
  and sign, partial, binary, invalid-radix and non-numeric text equal the
  original runtime's.
- `game.eventContext().deltaTime` (and `control.eventContext()`) reads the native
  frame time in seconds.
- Three words (sb3-creator `fa1bbec9`, 234 ops); export writes a literal text
  argument as a string so the original compiles it.

Corpus (translation-only): 129 fully translated. `isNaN` is not yet imported.

## Native Arcade music — 2026-10-10

PXT's own mixer code now plays Arcade music:

- `scripts/generate-arcade-music.mjs` transpiles the pinned `mixer/music.ts`,
  `melody.ts`, `playable.ts`, `legacy.ts` and `soundEffect.ts` into
  `music-pxt.js`. PXT runs these on fibers, so generation turns every function that
  pauses (or calls one that does) into a generator, its calls into `yield*`, and
  each `control.runInParallel` callback into a generator. A pausing call anywhere
  else stops generation. Functions marked `shim=music::…` call the host.
- `music.js` runs those generators as fibers on the Arcade clock (`control.millis`).
  An until-done block waits for its fiber; background modes return at once. Stopping
  the project ends paused calls. Queued 12-byte play instructions go to a WebAudio
  synthesizer (triangle, sawtooth, sine, square and noise voices with linear
  frequency and volume ramps) and to an observation log.
- Twenty words (sb3-creator `e10b1bfa`, 231 ops) cover `music.play` with each
  playback mode, `Melody.play/playUntilDone/loop`, `playSound(UntilDone)`,
  `playSoundEffect`, `playTone`, `ringTone`, `rest`, volume, tempo and
  `stopAllSounds`, and reporters for named melodies, `music.sounds`, the melody,
  string and tone playables, `createSoundEffect` and `beat`. `Note.*` imports as
  its frequency.
- On the Arcade runtime path `music.stopAllSounds` now stops the mixer instead of
  Scratch's sounds.

Evidence: every play-instruction buffer queued by a melody, tone, sound effect,
volume change and string melody equals the original mixer's byte for byte; string
melody notes start 248 ms apart in both. Until-done blocking, background play,
stop, editing through Code and Blocks, SB3 and original export (the exported
program queues the same buffers as the source) are tested.

Translation-only, the corpus now has 128 fully translated inputs (118 after
particles; screen painting and music together). Of the 17 inputs using music,
only `music.createSong` (3 inputs) remains a music gap.

Limits:

- Note start times follow 30 fps frames, and a script waiting on an until-done
  call resumes on the next frame, so a sequence drifts by up to one frame per
  blocking call. The original simulator schedules continuously.
- The synthesizer approximates PXT's voices; instruction bytes, not audio samples,
  are compared with the original.
- `music.createSong` needs PXT's native song sequencer and is not imported.

## Native screen painting — 2026-10-10

Tested source `f4d0dd718`. Screen drawing follows PXT's render order:

- `game.onPaint` and `game.onShade` handlers are renderables at z -20 and 80,
  run during each frame into the screen image, so paint is drawn under sprites
  and shade over them. Their pixels become ordered overlays.
- The screen image is the render target. After a frame it holds the composed
  frame, so `screen.getPixel` and `screen.clone()` read what was displayed, and
  drawing outside paint and shade is replaced by the next frame. The original
  simulator shows the same: a pixel written before a frame reads 4, after a
  frame reads the background 9, and a clone holds sprite and background.
- `Image.print` runs the pinned `text.ts` (`font5`, `font8`) with `font12` from
  `font12.jres`, generated by `scripts/generate-arcade-text.mjs`.
- Paint, shade, `screen` and image text import, run, decompile and export, using
  sb3-creator `0e3c1348` (six words; 211 ops).

Evidence: all 19200 displayed pixels of a paint, sprite and shade program equal
the original screen; glyph pixels equal the original in all three fonts; screen
reads match the original values.

Limits: the composed frame read by `screen` does not yet include the HUD, legacy
speech or screen effects. Custom fonts (`image.Font` objects) are not imported.

## Native particle effects — 2026-10-10

Tested source `1396e85031fd8de68f7f5efd0de1a1b0cc5c38a2`. The PXT particle
system now runs natively:

- `scripts/generate-arcade-particles.mjs` transpiles the pinned `particles.ts`,
  `particlefactories.ts`, `particleeffects.ts`, `effects.ts`, `mathUtil.ts` and
  `fixed.ts` into `particles-pxt.js`. The native host supplies the scene, the
  shared sprite ID counter, the global clock, the `onUpdate` and 250 ms prune
  handlers (registered after earlier handlers), one transparent indexed layer
  per source, and visible overlays ordered with sprites by z then ID.
- `Sprite.destroy(effect, duration)` ghosts and dissolves the sprite and starts
  the effect. The sprite stays drawn until its lifespan ends in `_destroyCore`,
  but it leaves `allOfKind`, controllers, following and animations immediately.
  The original simulator shows the same behaviour: handler order `rd`, Ghost
  set, not counted by kind at 0 ms, in the scene at 250 ms and gone at 750 ms.
- `startEffect`, start/end screen effects and `clearParticles` import, run,
  decompile and export, using sb3-creator `2b93a53d` (five words; 205 ops).

Evidence:

- Seven focused particle tests, including a Code → Blocks → SB3 → original
  MakeCode export run.
- Real development and production bundles.
- The indexed frame and tile planes still match original PXT.

Translation-only, 9 unchanged corpus inputs move from partial to translated
(109 → 118) and 5 more lose one gap. The compile-and-run audit before this change
measured 101 translated, 29 partial, 53 where original PXT fails to compile, and
1 parse failure.

Limits:

- Particle pixels are not compared frame for frame with the original. The
  browser oracle is real-time, and the native random sequence differs.
- `game.setGameOverEffect` and image screen effects (`dissolve.startScreenEffect`)
  remain gaps.
- Speech on a sprite being destroyed with an effect is not yet special-cased.

## Fresh-agent entry and refreshed hosted state — 2026-10-10

The sprite-layer light-browser failure is fixed (template clones now follow z)
and the whole stack landed on main through PR775. See
[the methodology and handoff](ARCADE-AGENT-HANDOFF.md) for ownership, commands,
evidence rules and next lanes.

## Native legacy scrolling frame clock — 2026-10-10

Source `7b158d559d92041a3d6893c29b2851dc6e5b8747` passes45 distinct checks:
42 regressions and three scrolling checks, zero failures/skips. The shared
batch passed44; the final batch passed3, repeating and strengthening two cases
and adding the international font. Original PXT executed each authored fixture
in Chromium; record every scene frame delta at diagnostic priority150 after
rendering and replay it through actual native VM ARCADE_FRAME events.

The initial half-second comparison passed, but delayed update-callback creation
and every-frame image comparison exposed two failures. Native construction
zeroed the delta used by the initial hold. Preserve the owning scene's current
frame delta before callbacks, pass it into construction and refresh it after
creation callback continuation. Keep the credited PXT scroll/hold algorithm;
no hardcoded scrolling compensation or conversion vocabulary changes.

The final three traces replay921 frames, comparing915 native/original bubble
images (1303328 indexed pixels) and41 complete stage planes (787200 pixels).
Persistent Latin and international text reach scrolling and return to their
initial image; timed text uses original duration-dependent speed. The replay
covers the6x8 small font and12x12 international font selected by PXT's
retained fonts. Camera, native callback/ownership, global
scene-clock, hitbox authoring and fresh development/production extension bundle
regressions pass. Original failed image assertions and harness namespace
collisions are retained privately alongside final original traces.

Existing legacy say, game update callbacks, Code and Blocks words are reused.
Full shipped GUI/controller qualification, scrolling through suspension/modal
changes, yielding/scene-changing construction, broader hitbox cache timing and
complex callback reentry remain open. Legacy coverage stays gated. No producer
change or corpus reranking:109 translated /74 partial /1 malformed remains the
latest measured importer corpus.

## Native legacy speech hitbox placement — 2026-10-10

Implementation `f6b48a499dce678c91cef052fcde424c90a6413a` passes38 checks:
nine new hitbox/authoring checks and29 native ownership, camera and fresh
GUI extension bundle regressions; zero failures/skips. The first eight-case
comparison passed only the unscaled owner and failed seven placements. Those
original failed logs are retained privately.

The native constructor now receives the existing native collision hitbox top
in floored pixels. It accounts for transparent artwork rows, fractional and
anisotropic scale, rotated bounding boxes and blank artwork's degenerate box.
Capture the offset before creation callbacks yield or alter the owner's scale,
as original PXT does. This replaces the mask-row guess based on display width;
it does not change the credited renderer algorithm or conversion vocabulary.

Eight initial full19200-pixel planes match original execution: unscaled,
double scale, anisotropic fractional scale, fractional downscale, quarter-turn,
oblique rotation, blank artwork and a yielding scale-changing creation handler.
An additional scaled/rotated authored game preserves a ninth original plane
through Code regeneration, saved SB3 reload and MakeCode export/reimport.
The actual original exported application also matches all19200 pixels.

GUI graphics/Blocks/Code words reuse existing sprite scaling, rotation and
legacy say support. Full shipped GUI/controller qualification, native scrolling,
broader live-image hitbox cache timing and complex callback reentry remain open.
Legacy speech coverage remains gated. No producer change or corpus reranking;
latest measured corpus remains109 translated /74 partial /1 malformed.

## Hosted Arcade gate repair — 2026-10-10

Run37991150295 at `1186bdc937b9ced6efa4a41fb4a1fea64da7467f`
passed corpus, heavy browser and FPGA surface checks, but build and light
browser failed. The build failure expected an Enemy image to remain undefined
until mutation; decoded artwork has been owned from spawn since earlier frame
work. The browser stopped at multiplayer `restored`, expecting numeric1 while
the actual value was Boolean true. Correct that and the same obsolete Boolean
expectations in later player/button/tile/collision steps using exact true values.
The image check now verifies original pixels and independent Player/Enemy image
objects before the controller mutation.

Repair `5c7b0435f7c3bf4175d4fb62c09f3bcb31c03c88`:19 affected checks pass,
zero failures/skips, including original PXT comparisons and Code, saved SB3,
MakeCode export/reimport, identity, scenes and controller paths. Browser script
syntax and whitespace checks pass. This changes assertions only. The full
hosted GUI journey remains unqualified until its fresh check succeeds; the
failed report and original logs are preserved privately. Native legacy speech
scrolling/hitbox/reentry and screen composition gaps remain open. No corpus
reranking or runtime/producer change is claimed.

## Native legacy speech bubbles — 2026-10-09

Implementation `d51cf93c7bcfd0bc62b9c9035d686651208939d8` replaces runtime lightweight bubbles with
ordinary native image/sprite allocation and scene IDs. Negative-kind creation
callbacks see the blank original image before Ghost/camera flags and glyph
updates; callbacks may pause and create additional sprites. A credited PXT
constructor adaptation resumes after those handlers, preserving captured
geometry/timing and updated owner position. The facade delegates image buffers,
coordinates, flags and destruction to the native sprite; shared image aliases
remain writable. Original generated PXT code and font data are unchanged.

47 checks pass without skips:18 new checks with18 complete original19200-pixel
planes (345600 native/original comparisons), plus29 camera, clock, speech,
authoring and fresh development/production bundle regressions. Original IDs,
x/y/z/dimensions/flags and callback observations match. Cases include z/id ties,
invisible owners, duplicate persistent say, replacement, empty/null/undefined
clear, expiry, yielding creation/destruction, mutable creation image aliases,
scene restoration and long suspended-scene expiry. Code/Blocks, saved-SB3
replay, MakeCode export/reimport and executed original export frames also pass.

Original owner destruction leaves the independent legacy bubble alive, even
with an elapsed speech deadline. The implementation now preserves that observed
behaviour; the earlier acceptance-contract assumption of bubble cleanup was
incorrect. Reset discards old native ownership without invoking old project
callbacks. Promise continuations restore their caller's shared BlockUtility;
a destruction-handler pause had exposed stale caller context before the fix.
Encoded undefined duration also exposed duplicate recreation; decoding at the
runtime boundary fixes it and supports null/undefined text clearing. Initial
namespace, duplicate and caller-context failures remain retained privately.

### GUI and remaining qualification

Existing legacy speech Blocks and pseudocode feed these native sprites; no new
producer vocabulary or pin is needed. Native image presentation replaces the
separate full-screen legacy SVG, and the ordinary native compositor includes
the real bubble at its z/id. Full shipped GUI/controller pixels remain pending.
The frame coverage marker still lists legacySpeech as remaining until native
scroll/clock, complex callback reentry/scene-change and GUI qualification pass.
HUD, effects, render callbacks and global screen snapshots remain open.

Importer and corpus inputs were unchanged by this slice. The latest measured
corpus remains109 translated /74 partial /1 malformed, without reranking.
See the [receipt](receipts/2026-10-09-arcade-native-legacy-bubble.json) and revised
[acceptance contract](ARCADE-SCREEN-RENDER-CONTRACT.md#legacy-bubble-integration).
All enabled exact-head hosted checks remain required before merge.

## Fixed negative sprite kinds — 2026-10-09

Implementation 183f5376da8dd1c137d58771a156036072143f5a preserves fixed negative numeric kinds in native
creation, kind changes, registrations, collection queries and MakeCode export.
Negative kinds retain scene/physics/callback ownership; allOfKind and count
queries return empty/zero. Destroy-all uses that empty snapshot and leaves the
sprite alive. Named-kind membership updates when setKind moves a sprite into
or out of a negative kind. Negative-kind overlap callbacks remain enabled.

Original PXT execution and original exported programs cover -1, -7 and -1.5,
yielding creation/destruction handlers, independent mutable closure captures,
function-local projectiles and overlap destruction. Three complete original
19200-pixel planes (57600 native/original pixel comparisons) verify that these
sprites still draw; exported original frames are identical. Code decompilation,
Blocks project creation, MakeCode reimport and saved-SB3 replay preserve the
lifecycle observations. Existing named-kind and fresh development/production
extension-bundle checks pass.38 distinct checks pass without failures or skips
(32-check shared batch;15-check final batch repeats nine strengthened new checks
and adds six destruction regressions). See the
[receipt](receipts/2026-10-09-arcade-negative-kind.json) for exact batch counts.

### Authoring and remaining interfaces

Existing Arcade Blocks use editable text inputs for KIND. Enter `-1` (or another
fixed negative number) in create, kind-change and callback blocks. Pseudocode
uses the same text identity: `arcade set kind of actor to "-1"` and
`arcade count kind "-1"`. No new producer vocabulary or pin is required.
MakeCode exports numeric `-1`, rather than an invented SpriteKind member.

This closes the negative-kind prerequisite for legacy bubble callbacks. Native
bubble allocation, IDs, yielding constructor continuation, lifecycle and legacy
frame composition remain open. Sprite.kind() numeric reporters and runtime kind
expressions also remain gaps; dynamic and unsupported positive numeric creation
kinds retain diagnostics. No full shipped GUI claim or corpus reranking:
the latest measurement remains109 translated /74 partial /1 malformed.

## Legacy speech camera coordinates — 2026-10-09

Implementation b89ab32796ef0bd41a4aea3e0267849231a05e10 preserves native world coordinates and the
camera's logical and draw offsets for the retained original legacy renderer.
The owner bridge maps RelativeToCamera and destroyed flags rather than erasing
all flags. Bubble drawing subtracts draw offsets only for world sprites;
original viewport clipping and below-owner placement remain unchanged.

Nine new checks pass: eight complete original19200-pixel bubble planes
(153600 native/original pixel comparisons), original bubble x/y/z values and
camera-flag changes, plus editable Code/Blocks/MakeCode export/reimport with
original exported-frame equivalence. Cases cover centre, both horizontal edges,
top-edge placement, offscreen owners, camera-relative owners and a live flag
change. Existing speech, suspended-scene clock, modern frame and both fresh
extension bundles are covered by the qualification batch:41 passed,0 failed,
0 skipped (nine new checks and32 regressions).

Original execution corrected the earlier legacy integration assumption:
`sprites.allOfKind(-1)` returns an empty array. A negative-kind creation callback
receives the bubble, so native integration must preserve that callback without
admitting the bubble into the negative-kind collection. The initial harness
incorrectly indexed that empty array; its original failure is retained privately.

This is bridge qualification, not native legacy sprite ownership. Native IDs,
yielding creation/destruction callbacks, z/id frame composition and complete GUI
presentation remain open. LegacySpeech remains in the frame's remaining list.
No importer, authoring vocabulary or producer pin changed; the latest measured
corpus remains109 translated /74 partial /1 malformed, without reranking.
See the [receipt](receipts/2026-10-09-arcade-legacy-speech-camera.json) and corrected
[legacy integration contract](ARCADE-SCREEN-RENDER-CONTRACT.md#legacy-bubble-integration).
Full shipped GUI and all enabled hosted checks remain required before merge.

## Speech deadlines across suspended scenes — 2026-10-09

Implementation `e85bc17e9f42d66987c0b71ecb172b655217f4de` changes speech creation,
raster animation time and expiry from the owning scene's elapsed time to the
existing global simulated clock. This follows original PXT control.millis and
game.runtime, which continue across scene pushes while the parent frame clock
is suspended. Scene-local physics and update clocks retain their own ownership.

32 affected checks pass without skips, including four new clock checks and
28 speech/authoring/indexed-frame/fresh-bundle regressions. Three new complete
original19200-pixel comparisons (57600 pixels) verify modern and legacy parent
expiry after a long child pause, and retained modern speech after a short pause.
Native controls also verify that a later-created child receives deadline1500
at global time1000 despite local time0, then expires while it is suspended.
The parent frame clock is explicitly checked to remain suspended.

This closes the long suspended-scene deadline gap recorded in the modern speech
checkpoint. Legacy expiry comparison occurs after its bubble has expired; it
is not active legacy-bubble frame support. Animated full-frame clock alignment,
modal/wall-time alignment, native legacy bubble identity/collections/callbacks,
HUD/effects/render callbacks and unified GUI presentation remain open.

No authoring vocabulary or importer changed. Existing speech Blocks/pseudocode,
Code/export tests and project ownership are exercised by the regression batch.
The latest measured corpus remains109 translated /74 partial /1 malformed;
no new classification measurement is claimed. See the
[receipt](receipts/2026-10-09-arcade-speech-global-clock.json) and the concrete
[legacy bubble acceptance contract](ARCADE-SCREEN-RENDER-CONTRACT.md#legacy-bubble-integration).
Full shipped GUI and all enabled hosted checks remain required before merge.

## Indexed modern speech and zero-colour writes — 2026-10-09

Implementation `c84f811cb7c0ae2e23fcc773366bb266497939b4` reuses the original
speech/font engines to compose modern sayText immediately before its owning
sprite at the same z/id draw position. An explicit write mask distinguishes
untouched pixels from colour-zero writes, preserving zero-colour speech boxes
against coloured backgrounds. Speech raster generation remains independent of
RGB presentation and reuses existing scene, replacement and expiry ownership.

12 new checks pass:11 complete original19200-pixel planes (211200 comparisons)
and masked zero-write/clipping checks. Cases cover requested colours, zero box
colour, multiline/Unicode text, equal-z later occlusion, lower-z occlusion,
invisible owners, replacement, clearing, single-scene expiry and immediate
parent scene restoration. 34 speech/authoring/frame/tile regression checks pass;
initial bundle checks rejected a stale installed speech.js after formatting.
The actual overlay was refreshed and both fresh development/production bundle
checks pass. Raw freshness failure remains retained; the freshness gate was not
weakened.

Frame coverage is background, tilemap, sprites and modernSpeech. Legacy say
creates a separate PXT sprite, requiring native bubble identity, ordering and
lifecycle before that layer can be qualified. Render callbacks, HUD and effects
also remain open. Long suspended-scene speech expiry and clock-aligned animated
full-frame comparisons still need qualification. No public screen snapshots or
paint/shade conversion were introduced.

Existing sayText Blocks/pseudocode and graphics assets feed this raster; no new
vocabulary or graphics-editor feature was added. The current separate SVG
speech presentation skips zero pixels and has different draw placement; adopting
the completed frame pipeline must close those GUI zero-box/ordering gaps and
pass actual controller-pane/rendered-pixel checks. Do not credit this internal
raster with that GUI closure.

Importer/producer are unchanged. Latest measured corpus remains109 translated
/74 partial /1 malformed without reranking this runtime-only slice. See the
[receipt](receipts/2026-10-09-arcade-indexed-modern-speech.json) and
[screen implementation contract](ARCADE-SCREEN-RENDER-CONTRACT.md).

## Indexed tile layers and renderable identity — 2026-10-09

Implementation `79ee6b89fc0814f9ddca4c3e53cf7b6a1e4cfd15` adds modern and legacy
tile rasters to the internal scene frame. Tile renderables allocate from the
scene's original creation-ID sequence, at z=-1; replacing or clearing map data
retains identity. Scene restoration retains the parent's renderable identity.
Tiles and sprites now compose in one sorted z/id list, including ties created
in either order and sprites below the tile layer.

The renderer and indexed compositor share tile raster generation: original
inclusive bounds, camera bit shifts and transparent tile blits. Cached padded
legacy artwork and live map aliases retain their existing original semantics.
Original PXT tile drawing and identity are credited in THIRD-PARTY-NOTICES.md.

13 new checks pass, comparing13 complete original19200-pixel planes (249600
pixels) and original tile/sprite IDs. Cases include both modern/legacy creation
orders, z below/above tiles, modern camera offset and padded art, replacement,
clear, parent scene restoration, live map mutation and cached legacy tile art.
19 affected frame/bundle/camera/legacy/tile-data regression checks also pass,
all without skips. The controller-pane legacy tile journey now checks the
indexed frame pixel; full hosted GUI execution remains pending.

Frame coverage is now background, tilemap and sprites. Callback renderables,
HUD, speech and effects remain explicit missing layers. Screen snapshots and
paint/shade conversion remain unavailable. This adds no new authoring vocabulary
or graphics UI; existing tile authoring feeds the internal raster. Existing stage
presentation still needs adoption of the completed frame pipeline.

The importer is unchanged. Modern-map tests retain the exact existing terrain
qualification diagnostic; drawing qualification does not close that broader
terrain boundary. The initial harness wrongly expected no diagnostic and its
raw failure is retained. Latest measured corpus remains109 translated /74 partial
/1 malformed, without reranking unchanged importer inputs. See the
[receipt](receipts/2026-10-09-arcade-indexed-tiles.json) and
[remaining screen contract](ARCADE-SCREEN-RENDER-CONTRACT.md).

## Indexed scene frame foundation — 2026-10-09

Implementation `3f6ad084c84e64bfce0820ea23cd280143301322` adds an internal indexed
scene compositor after native frame updates. It fills the background colour,
blits the transparent background image and draws qualified sprite rasters sorted
by z and original creation ID. Existing camera-relative positioning, viewport
clipping and scale/rotation raster helpers feed it. The scene raster keeps its
image and pixel-buffer identity across updates, and suspends/restores with scenes.
Missing sprite artwork is explicitly recorded. Original PXT ordering is credited.

19 affected checks pass without skips: five complete original-PXT19200-pixel
planes (96000 compared pixels), indexed clipping/duplicate-colour identity,
scene lifecycle and refusal checks, both fresh extension bundles and ten
scroll/copy roundtrip/controller regression checks. Original comparisons cover
odd dimensions, clipping, equal and reversed z, fractional scaling, invisibility,
camera offsets and RelativeToCamera. The renderer/controller journey now checks
the internal indexed pixel and its explicit coverage marker; full hosted GUI
execution remains pending.

Coverage is explicitly `background` and `sprites`; remaining layers are
`tilemap`, `renderables`, `hud`, `speech` and `effects`. This is the first part of
S01, not completion of the [screen contract](ARCADE-SCREEN-RENDER-CONTRACT.md).
No public screen reporter or paint/shade conversion was introduced, and existing
screen diagnostics remain. There is no new authoring vocabulary or graphics GUI
capability in this foundation. Existing stage presentation remains in use until
complete frame presentation is qualified.

Importer and producer pin are unchanged from the copying checkpoint. The latest
measured corpus remains109 translated /74 partial /1 malformed across184 unchanged
hashes; it was not reclassified for this runtime-only slice. Retained harness
failures were an invalid extension lookup and a duplicate bundle-test variable;
actual opcode dispatch and a distinct variable resolve them. See the
[receipt](receipts/2026-10-09-arcade-indexed-frame.json).

## In-place image copying and screen prerequisites — 2026-10-09

Implementation `9523aa4c62922158a5e96f7fb8ff5ce8e025d9cb` adopts producer
`eca752b7011656b9e73917bc6f816ffed24ad4b9`. Native `arcade_copyImageFrom` has dedicated
source and destination Blocks inputs. Pseudocode is
`arcade copy pixels into image art from sourceArt`; MakeCode exports
`art.copyFrom(sourceArt)`. The operation copies transparent pixels, preserves
aliases, pixel-buffer identity and destination palette, and leaves mismatched
image dimensions unchanged. Typed sprite/image procedure arguments are supported.

Five final copying checks pass without skips, including16 dimension/self-copy
comparisons with original PXT, source evaluation once, alias/clone independence,
Code/Blocks/MakeCode export/reimport, saved SB3 restart, inactive scenes and real
controller keys. The earlier24-check batch passed four initial copying checks
and20 unchanged scroll/mutation/bundle/dialect/pin checks. Producer328 checks
pass. Full rendered native-file/controller-pane pixel checks are prepared and
pending hosted execution; no fresh full browser success is claimed.

All184 corpus hashes remain unchanged at109 translated /74 partial /1 malformed,
with zero changed diagnostics. Initial integration failed before the producer
vocabulary was synchronized; raw failure is retained, and parser synchronization
resolved it without weakening refusals.

Screen cloning and drawing require an authoritative indexed frame image and
original z/id callback ordering, including arbitrary sprite z. The
[screen implementation contract](ARCADE-SCREEN-RENDER-CONTRACT.md) records runtime,
Blocks, pseudocode, graphics and controller acceptance criteria and five ordered
slices. It is proposed work, not a screen API implementation claim. See the
[copying receipt](receipts/2026-10-09-arcade-image-copyfrom.json).

## Mutable image scrolling — 2026-10-09

Implementation `d490487dea0308a05aea1fe209ee55883401317d` adopts producer
`bacacdbed51fa5fa98fbca77550dbc71041f24f9`. Dedicated `arcade_scrollImage`
Blocks inputs expose the image and signed x/y offsets. Pseudocode is
`arcade scroll image art x 1 y -1`; MakeCode exports `art.scroll(1, -1)`.
Typed image aliases and sprite image properties, including typed procedure
parameters, import through the same native operation. Images remain editable
through existing graphics assets; this operation mutates their runtime pixels.

The native image engine preserves dimensions, palette and pixel-buffer identity,
uses signed 32-bit offsets, clips shifted pixels and clears uncovered pixels.
Shared sprite images refresh through the existing renderer and scene ownership.
Original Microsoft PXT semantics are credited in THIRD-PARTY-NOTICES.md.

Final five scrolling checks pass without skips, including 198 pixel/coercion
comparisons against unchanged original PXT routines, argument evaluation once
and in order, alias/clone behaviour, original/exported execution, Code/Blocks,
saved SB3 restart, inactive scenes, refusal diagnostics and actual controller
key steering. The earlier 19-check batch passed four initial scrolling checks
and 15 mutation, fresh development/production bundle, dialect and pin regression
checks. Producer dialect/Boolean checks pass327 without skips. The full native
file/controller-pane browser journey, including rendered yellow pixel checks,
is prepared but has not yet passed hosted execution.

All184 corpus input hashes remain unchanged:109 translated,74 partial and one
malformed input, with zero changed diagnostic rows. The racing fragment
`arcade-318e958c14146483.ts` first calls unsupported `screen.clone()`, preventing
typed recovery of its road image. Screen snapshots, render-phase drawing and
legacy callbacks remain explicit dependencies; no partial diagnostic is hidden.

Retained failed harness attempts cover original internal-function registration,
missing project storage and an incorrect keyboard mapping for controller B.
Corrections load real assets and use the actual B key; they do not substitute
product implementations. Full enabled hosted checks remain required before
merge. See the [qualification receipt](receipts/2026-10-09-arcade-image-scroll.json).

## Native info consumers and typed browser observations — 2026-10-09

At `616937a47`,44 affected truth-value, native overlap and real imported-game
checks pass without skips. The native info API owns life/score state; consumers
now assert its actual reporter words, opcodes and player-state values instead
of requiring synthetic `lives` variables. The original-PXT overlap oracle still
requires life20 after exactly one destruction event, and truth-log comparisons
still require identical original/imported/exported behaviour.

Hosted browser run37954363495 stopped at the literal-array readiness check.
Its unmodified artifact records calls0, order0, empty result, arraysReady=true,
no block errors and no diagnostics. The observer converted every value with
`Number`, making the Boolean expectation impossible. The repair preserves the
actual value type and repeated Game prefixes. This unblocks typed observations
for the prepared arrays, camera, follow, layers and numeric-sign journeys;
full hosted execution remains required before claiming those journeys pass.

The original build failures are retained: six outdated native-info assertions
and a pin-policy failure from a non-pin merge SHA in a receipt. Merge history
now lives in narrative documentation; tested pin identities remain in the
receipt. The full pin walk refuses this sparse checkout because tracked paths
are absent, so it remains a required hosted check. No gate was weakened, no
product runtime semantics changed, and no corpus count reduction is claimed.
Producer PR81 full CI37955703631 passes every enabled exact-head check; its
publishing step is disabled on the feature branch. Lite full checks are pending.

## Producer model evidence merge history — 2026-10-09

The verified model-evidence correction in producer PR79 merged into its feature
parent at `4757ab8ac0cd0877a7f1cf6b27bd5c2db33e445b`, with the reviewed and merge trees equal.
This is merge-history evidence, rather than a consumer pin adoption. The dated
sprite-follow receipt retains its tested producer pins; the complete merge
identity belongs here in the narrative record.

## Original Arcade numeric sign — 2026-10-09

Source `f6efa058b` adopts producer `5a6782d9` and adds a native reporter:

```text
arcade sign of (value)
```

The Blocks palette exposes **Arcade sign of** with a numeric reporter input.
MakeCode `Math.sign(value)` imports and exports directly, evaluating the operand
once. This follows the bundled original PXT helper: zero, including negative
zero, yields positive zero; positive numbers yield1; all other numbers, including
NaN and negative infinity, yield-1. This differs from JavaScript `Math.sign`.
The initial mismatch was preserved and the runtime was corrected against the
actual PXT source and simulator.

Sixteen affected native/dialect/pin/truncation/bundle checks and326 producer
checks pass without skips. Code/Blocks decompile, saved SB3 restart, executed
original MakeCode export and reimport retain values and one evaluation.
A controller fixture uses the reporter to move a sprite x80→76. The shipped
native-file→Code→Blocks→controller browser journey is prepared and pending.
Wrong arity and shadowed Math bindings retain named refusals.

All184 original corpus hashes remain unchanged. The racing fragment's
`Math.sign() as a value` diagnostic is removed; ten other diagnostics remain
because its art, screen drawing and legacy callbacks need separate work.
Counts stay109 translated /74 partial /1 malformed. The shared vocabulary now
contains198 canonical forms and203 forms including aliases. This adds no audio,
particle, screen-drawing or historical instance-overlap support.

## Sprite property and layer qualification — 2026-10-09

At `261f82e4c`, seven affected tests pass without skips. Independent imports
using typed sprite `z`, `lifespan`, `ax` and `ay` match actual original PXT
values. Layer assignments retain one operand evaluation and negative layers
through Code/Blocks, saved SB3, live-VM project export, executed original PXT
export and MakeCode reimport. Five existing native renderer checks cover layer
ordering alongside image ownership, scenes, palette bounds and template skins.
Baseline qualification showed these programs already used native properties;
the proposed extra routing condition was removed. This slice adds verification,
not a new conversion capability. Original184 corpus hashes and109/74/1 counts
remain unchanged, with no changed diagnostic rows.

The shipped browser journey now imports an authored overlapping-sprite game
through the native file chooser, enters Blocks, and uses controller A/B to move
a red sprite behind and in front of a yellow sprite. It checks actual rendered
centre pixels at each phase. This new journey remains pending hosted execution.
Initial test export failures are retained: the harness first passed serialized
JSON where a project object was required, then supplied raw asset bytes where
the exporter requires decoded SVG text. Final qualification exports the actual
live VM object and actual decoded SVG assets. No product diagnostics were hidden.

## Native sprite following — 2026-10-09

Source `3c4493c1e` (initial implementation `f1230bd8e`) implements follow/unfollow as native Blocks commands and Code:

```text
arcade sprite enemy follow hero speed 25 turn rate 400
arcade sprite enemy stop following
```

MakeCode `sprite.follow(target, speed?, turnRate?)` imports with100/400 defaults;
`unfollow()` imports and exports directly. Operand evaluation remains once and
in source order. Follow steering runs after controller input and before physics,
using original elapsed-frame timing and Fx8 velocity setters. It retains
momentum, snaps within two pixels on both axes, replaces bindings, stops on
null/zero speed, cleans up destroyed targets and belongs to the active scene.
Self-follow preserves a previous binding; cancellation with no binding retains
velocity. Snapping uses collision-aware x/y movement in original setter order,
including cooperative wall callbacks. An original-PXT wall regression keeps a
solid follower outside the wall that contains its ghost target. These cases are compared with the actual original PXT follow method.

Thirteen original-follow/scene/interchange checks and eight fresh development /
production bundle/pin/dialect checks pass. Code/Blocks/decompile, saved SB3 and
executed original MakeCode export/reimport remain editable. Producer `e41906fe`
passes325 dialect/Boolean checks; the inventory has197 canonical forms /202
including aliases. Runtime helper tests do not replace original physics/renderer
qualification; their shared Fx8 boundaries are explicitly recorded in the test.

All184 original input hashes are unchanged. Import-only counts improve
**108/75/1 →109 translated /74 partial /1 malformed**, with one changed refusal
row. The unchanged recovered tutorial has four native sprites: the enemy follows
the hero and independently moving food continues moving. Export compiles in
original PXT and reimports without diagnostics. This is headless steering,
not complete rendered gameplay or modal-dialog timing evidence.

The prepared shipped native-file/Code-to-Blocks journey uses A to move the
follow target and B to stop the enemy, checking movement and zero velocity.
Its fresh full-app result and full producer CI remain required before merge.
See the [receipt](receipts/2026-10-09-arcade-sprite-follow.json).

## Producer model provenance gate — 2026-10-09

The full camera-shake producer run passed its quantity comparison suite but
failed stale `EXPECTED.md` model stamps in
[run37942017622](https://github.com/CrispStrobe/sb3-creator/actions/runs/37942017622/job/113858532220).
Producer `4df2b00f` regenerates31 stamps through the existing solver/claim tools
against exact `bw-board@a112631` and `bw-circuit-ui@557c471` sources. The diff
changes only the recorded model revision; numerical values, tolerances and
coverage counts remain unchanged. No compiler/runtime source changes.

Ten quantity/provenance checks and the stamp-freshness check pass. The actual
claim census compares1313 of2861 claims with zero disagreement and declines1548
with stated reasons; this is45.9% numerical coverage, not full circuit
qualification. Lite adoption `ffeb88c80` passes six pin/dialect checks. Its
Arcade importer/runtime bytes and the108/75/1 census are unchanged.

A fresh full producer run and all enabled exact-head consumer checks remain
required before merge. The raw initial failure, exact-source local measurement
logs, claim decline reasons and generated patch are preserved privately. See the
[receipt](receipts/2026-10-09-arcade-producer-model-evidence.json).
Next runtime candidate is native sprite following, including its acceleration,
velocity/timing, replacement/cancellation and editor/export authoring; effects
and audio remain separate unimplemented lanes.

## Literal array values in native programs — 2026-10-09

Source `38cf4623d` selects the existing native reference-array runtime whenever
an Arcade array literal occurs. Literal function arguments and return values
retain identity and element evaluation, including unused arguments and empty
arrays. This closes a routing omission; no new array opcode or producer pin is
needed. Blocks and Code use the existing `new array reference from` and
`array value … rest …` reporters and native function calls.

Twenty-five array checks plus the new native-controller fixture pass: scalar
strings/numbers, argument evaluation order, fresh returned arrays, mutated
aliases, image/sprite references, coercion, Code/Blocks/decompile, saved SB3,
export/reimport and original executed PXT. The preserved baseline includes two
real array-refusal regressions and one initial oracle harness error (PXT removed
an unused constant global); the corrected oracle compares a computed value.

All184 original input hashes are unchanged. Import-only counts improve
**107/76/1 →108 translated /75 partial /1 malformed**, with one changed refusal
row. The recovered tutorial's helper body is empty in its original source;
executed original/export, reimport and Code/SB3 restart verify its argument
handling, not a playable game. A fresh native-file/controller-pane browser
journey is prepared; full shipped qualification remains required.
See the [receipt](receipts/2026-10-09-arcade-literal-array-values.json).

The preceding display-repair source `c7c1ae4aa` now passes the full build and
both browser shards in [run37939577542](https://github.com/CrispStrobe/brickwright-lite/actions/runs/37939577542),
including the previous canvas/question and narrow graphics gate failures.
The focused gate was still running at this checkpoint; nothing is merged on
that partial check set. Camera-shake and array-feature branches need their own
fresh hosted qualification.

## Native camera shake and Info routing — 2026-10-09

Camera shake is an authorable native command in Blocks and Code:

```text
arcade shake camera by 4 pixels for 500 ms
```

`scene.cameraShake` imports with original4-pixel/500-ms defaults and exports
back to MakeCode. Source `9fcc3b1a9` implements replacement, cancellation,
final-quarter damping and integer draw offsets. Controlled time/randomness
comparisons execute the original bundled PXT camera class. World coordinates,
logical camera properties and camera-relative HUD remain unchanged; actual
world drawable positions move and return after expiry. Development/production
GUI-rule extension bundles both pass. Code/Blocks, saved SB3 and original
executed MakeCode export pass. Producer `88aa7123` passes323 dialect/Boolean
checks and exposes195 canonical forms /200 including aliases.

The real recovered callback exposed a separate Info routing defect: native
sprite imports could still decrement a Scratch variable initially zero.
Source `a2a096f78` routes native imports through the existing scene-local
life/score commands and reporters. Twenty-one camera/scene checks and ten
Info/life-zero/scene/pin checks pass. The recovered overlap callback, with two
actors supplied through native authoring primitives, destroys the enemy,
reduces life3→2, shakes for500ms and expires. Export compiles in original PXT
and reimports without diagnostics. This is headless callback evidence, not a
complete rendered game.

All184 original input hashes are unchanged. Import-only counts improve
**106/77/1 →107 translated /76 partial /1 malformed**, with one changed refusal
row (`scene.cameraShake`). A shipped native-file/controller-pane browser
journey is prepared; its fresh hosted result remains required. Real wall-time
behavior across suspended tabs/modal pauses is not qualified by the controlled
active-frame clock tests. Other effects, screen painting and external packages
remain named gaps. See the [receipt](receipts/2026-10-09-arcade-camera-shake.json).

## Device display lifecycle and hosted qualification — 2026-10-09

PR752 source `c68661e2c` passed the full build and heavyweight browser shard in
[run37918731553](https://github.com/CrispStrobe/brickwright-lite/actions/runs/37918731553).
Its light shard observed all four direct controllers with independent input,
pointer release and retained velocity after detachment. The native truncation
journey observed two argument evaluations and sprite coordinates35/40.
The full light gate **failed**: a zero-size renderer canvas crashed the Arcade
device display during the question journey; the narrow graphics journey also
hit an overlapping panel toggle. These observations do not qualify the full
question flow or all Arcade apps.

Source `c0c707f7f` clears the device screen while the stage backing canvas has
zero width/height or is detached, then resumes drawing restored frames. A real
Chromium canvas check verifies unavailable and restored pixels without hiding
errors; five affected contract/pin checks pass. The graphics journey uses the
visible panel toggle to make room for touch editing and reopen the stage for Run.
Full shipped layout and question/controller qualification remain hosted gates.

Producer `8afc288e` fixes the hosted checkout that still selected the old circuit
model despite the adopted fixture. Two existing checkout integrity checks pass;
all sibling-dependent hosted gates remain required. Lite adopts that revision;
Arcade dialect/runtime definitions and the106/77/1 import-only census are unchanged.
See the [receipt](receipts/2026-10-09-arcade-device-frame-lifecycle.json).

## Native number truncation — 2026-10-09

Implementation `6f312b838` adds a native reporter and Code word:

```text
set whole to arcade truncate (-3.75)
```

Blocks expose **Arcade truncate [number] toward zero**. MakeCode import/export
uses `Math.trunc`; it preserves negative fractions, signed zero, NaN/infinities
and numbers larger than32 bits. Original PXT comparisons verify the operation
and one-time argument evaluation. Code/Blocks/decompile, export/reimport and
saved SB3 restart pass. Actual GUI-rule development and production extension
bundles retain these numeric results. The existing hosted controller journey
now includes truncating fractional sprite coordinates through a real A button.
**Fresh full-app browser result remains pending.**

20 affected Lite checks pass at the implementation source and again at adoption
`3c58a272b`; seven final pin/word/SPIKE/mirror checks pass at `fbc9c5265`.
Runtime and importer bytes are unchanged after the implementation qualification.
Producer `ef312b0a` passes322 combined dialect/Boolean value-position checks.
The producer's previous hosted suite exposed the stale Boolean count for the
multiplayer pressed-query predicate and an aged circuit-model fixture. The
census assertion is corrected, and the fixture adopts Lite's existing model
revision `557c471`; its full hosted sibling-dependent corpus remains required.
No circuit quantity expectations or freshness bounds are relaxed.

All184 corpus input hashes remain unchanged. Import-only counts move
**105/78/1 →106 translated /77 partial /1 malformed**, with one changed refusal
row (`Math.trunc`). The newly translated Sprite Walker starts in the headless
VM and its real source button callback reports `X=-3 Y=40` after an explicit
native fractional-position setup. Export compiles in original PXT and reimports
without diagnostics. Missing renderer/audio messages remain in private evidence;
this does not qualify rendered gameplay or all translated apps.

See the [receipt](receipts/2026-10-09-arcade-truncate-number.json). Arbitrary
external packages, remaining partial imports and fresh GUI qualification stay
open in the capability matrix below.

## Question readiness and visible browser navigation — 2026-10-09

Source `7c05309b9` fixes the production question guard defect found in PR748.
At500 ms the runtime re-emitted the same mutated dialog object. The pure stage
container compared the object identity and skipped rendering, leaving Yes/No
disabled. Each dialog notification now publishes a fresh snapshot; callbacks
still close over the authoritative queue. The new regression fails before the
fix and verifies changed identity, retained prior elapsed state and correct
settlement through the old dismissal callback afterward.

The hosted callback/sprite gates also exposed a normal absent-stage interval
while replacing projects. Their waits now require a present replacement stage
before reading its ID; callback trace and completion assertions are retained.
The palette graphics journey opens the right pane and returns visibly to Blocks
before clicking Run, preserving the persisted startup-block assertion.

23 affected checks pass, including original PXT question comparisons,
Code/Blocks/export/SB3, production/development extension bundles, four-controller
bindings and palette authoring. The three changed browser scripts pass syntax
checks. PR748's actual production build succeeded; both browser jobs failed on
the issues above, and their raw logs remain archived. **Fresh full-app browser
results are pending.** No merge or GUI closure is inferred from local tests.
Import-only census remains the preceding measured **105 translated /78 partial /
1 malformed**; this follow-up does not change the importer or producer.
See the [receipt](receipts/2026-10-09-arcade-dialog-readiness.json).

## Direct controller sprite bindings — 2026-10-09

Source `173e4a645` and producer `e3d0e890` add
`controller.player1` through `controller.player4` sprite movement and stopping.
Blocks have a fixed 1–4 controller dropdown, sprite input and movement speeds.
Code uses the same native commands:

```text
arcade controller 2 move sprite hero vx 100 vy 0
arcade controller 2 stop controlling sprite hero
```

Return export emits the original fixed-controller methods without introducing
multiplayer player state or requiring the multiplayer package. Original PXT
comparisons cover independent input, default speeds, normalized diagonals,
button release and stopping while retaining current velocity. Existing scene
binding controls remain tested. Invalid selectors, wrong arity and shadowed
controller bindings keep diagnostics.

21 affected Lite checks and 236 producer checks pass, including Code/Blocks,
MakeCode export/reimport, saved SB3 restart, SPIKE pin regression and real
GUI-rule development/production extension bundles. The unchanged184 hash-verified
import-only corpus moves **104/79/1 →105 translated /78 partial /1 malformed**.
The sole changed app's native player-two movement agrees with original PXT;
its return export compiles/runs and reimports without diagnostics. This is a
headless controller-state proof, with missing renderer/audio messages retained.
It does not qualify complete gameplay or rendered GUI use.

The existing hosted rotation gate now includes native file import →Code →Blocks
and actual controller-pane selection/steering for all four players, isolation,
pointer release and removing a moving binding. **Fresh browser result pending.**
Parent PR748's light rotation and pixel-color gates failed while the job was
still running; inspect the durable raw logs before claiming GUI closure.

Controller aliases/dynamic controller values, connection events, analog pressure,
repeat configuration and network sessions remain separate gaps. See the
[receipt](receipts/2026-10-09-arcade-direct-controllers.json).

## Compiled Arcade engine dependencies — 2026-10-09

Source `e4aa00d77` fixes the hosted image decoder `ReferenceError: e is not
defined`. The real GUI Babel rules reproduced it in both development and
production bundles: serializing a compiled function copied its body without
compiler-created helpers outside it. Native image, speech, generated PXT,
rotation and menu modules now cross the adapter as actual dependencies with
their compiled closures intact. Dependency injection is explicit; legacy
extensions retain their Scratch shim and shared VM value identity.

67 affected checks pass with zero failures/skips. The bundle gate now reads
actual custom palette metadata, keeps duplicate RGB indices distinct, rejects
contradictory indices, and executes image drawing, rotation, speech and resource
menus after production minification. It refuses stale installed engine sources.
Original PXT differential controls and adapter/value identity checks also pass.
Callback and sprite browser gates now create report directories and wait for
newly loaded project targets.

The current source extension passes a real renderer/controller speech probe in
the older `9e6630b` reference GUI:2223 visible speech pixels, player movement,
palette colors and bubble expiry. This diagnostic loads original module bodies
and has an independent value heap; it does not qualify a fresh integrated GUI
or shared arrays across extensions. Fresh production browser jobs remain required.

The unchanged184 hash-verified import-only inputs remain **104 translated /
79 partial /1 malformed**, with zero changed diagnostic rows. Keep the
original-app renderer caveat below. See the
[receipt](receipts/2026-10-09-arcade-bundle-factories.json).

Next: run the fresh integrated image-bounds, speech, callback, sprite, tile,
palette and question browser journeys; diagnose remaining timeouts against
that built artifact. Merge only after all enabled checks pass at the reviewed
head, then resume effects/paint/source-asset/music gaps. The compiler defect
is reproduced and fixed locally; the parent browser failures remain evidence
until the new hosted journeys succeed.

## Boolean questions and fresh component GUI checkpoint — 2026-10-09

Tested source `09f242210` adds `game.ask(title, subtitle)` as an asynchronous
boolean in runtime, normal Blocks, Code and original Arcade export. The Code
word is `arcade ask yes "Play?" subtitle "Choose A/B"`. The native block has a
boolean shape. Ordinary assignments, branches and discarded calls retain their
execution order; callers wait for an answer. Each question waits 500 ms and
requires release before A/B confirmation, following the
[original PXT implementation](https://github.com/microsoft/pxt-common-packages/blob/master/libs/game/ask.ts).
Controller callbacks and scene updates pause while the question is active.
Queues, Stop/restart and stale callbacks are covered by runtime checks.

49 affected checks pass with zero failures/skips; the producer passes234 dialect
checks. Both original PXT answers match exported programs; Code and saved SB3
reexecution pass. Fresh EN/DE React dialog/CSS browser checks cover disabled
controls, focus, labels and both choices without page errors. The real Blocks
palette component check is now wired into the existing graphics browser gate.
Fresh full production question/controller execution remains pending hosted CI.
Native dialog pixels and full scheduler equivalence remain unqualified.

Both sole-gap corpus apps also reach their original life-zero question and
resume after Yes, restoring life to3 and5. The smaller input has zero block
errors in this finite headless probe. The larger reports five unreadable frame
artwork errors in a harness with storage but no renderer; qualify its artwork
with a real renderer before assigning a product defect. Neither probe establishes
full game compatibility.

The unchanged184 hash-verified corpus measures **104 translated /79 partial /
1 malformed** at the import-only boundary, from102/81/1. Four diagnostic rows
change; two lose their sole gap. This count does not establish full runtime
compatibility. See the [receipt](receipts/2026-10-09-arcade-boolean-question.json).

### Immediate remaining GUI and bundle work

The parent hosted heavy-browser job observed a bundled image decoder
`ReferenceError: e is not defined` in image bounds and speech checks, plus
callback, sprite-registration and tile-data failures. The callback gate also
failed to write its report because its output directory was absent. Preserve
these failures and qualify the built artifact before merging the stack. Source
unit checks cannot establish that serialized factories survive bundling and
minification. The compiled closure failure and report creation are addressed in the newer
checkpoint above. Fresh integrated browser reruns must still qualify the change
and reveal any independent authored-setup or runtime defects.

After bundle qualification, continue the corpus diagnostic groups: unreadable
background image sources (10 rows), unreadable tilemap sources (7), destruction
effect/duration rendering (7), music play/sound semantics (5/4), star-field screen
effects (4), and paint callbacks (3). These are diagnostic counts, with overlap;
existing background and tilemap APIs already have support for readable inputs.
Keep number-prompt optional arguments and exact dialog layout as separate gaps.

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
| C01 Values and arrays | Present: Boolean/value operators, undefined/null, native number truncation, legacy named and shared reference arrays | Identity and typed array export present | `-reference-arrays`, `-named-arrays`, `-array-coercion`, `-value-arithmetic`, `bw-sb3-values`. Author nested Sprite/Image arrays, mutate, switch editors and reopen; distinguish preserved values from dead run-bound references. |
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
| N02 `scene.setTileMap`, `scene.setTile`, `scene.getTilesByType`, `tiles.setTilemap` | Legacy map-image/tile-definition APIs now use live scene state; legacy Tile values/list/placement now work; callbacks and unavailable map assets remain named gaps | Existing raw map/location words are insufficient for map creation | U03 painter: tile palette, terrain and wall layers, tile scale, tile references and map dimensions; rename/delete/undo/save/reopen; export the correct legacy or modern map representation. |
| N03 `animation.runImageAnimation`, `animation.createAnimation`, `animation.runMovementAnimation` | Frame/action animations implemented; movement path engine explicitly missing despite the stop-animation movement menu | Existing frame/action/interval words. Add actual movement/path words and matching blocks when the engine exists | Bind existing Pixel timeline frames to native Image arrays/actions; keep frame durations. Add path editing/presets, stop-type behaviour and original export/playback; the existing movement menu does not establish support. |
| N04 `Image.drawRect/drawCircle/fillCircle/fillTriangle`, `image.imageBlit` and screen drawing | Image pixels, fills, lines, flips, replacement and two blit forms exist; these do not cover every Image/screen operation | Extend the existing image operation family for each missing overload rather than hide it inside text/JSON | Validate clipping, transparency, source/destination aliasing and palette index; provide native shape choices and resource pickers. Export each shape through a valid public PXT call. |
| N05 `game.onPaint/onShade`, `scene.createRenderable`, `scene.addBackgroundLayer`, `scene.cameraShake` | Paint and shake appear as named corpus gaps; camera follow/centering is implemented | No corresponding dedicated paint/shade/renderable/layer/shake words in the reviewed dialect | Editable draw callbacks, z/priority and layer images; scheduling relative to physics/HUD, camera and scenes; rendered pixels and original export. Do not reinterpret “zero smoke errors” as paint support. |
| N06 `effects.starField`, `ParticleEffect.start`, Sprite destruction effects/duration | Implemented 2026-10-10: generated PXT particle runtime; destroy/start/screen/clear effects through Code, Blocks and export (see the section above) | `game.setGameOverEffect`, image screen effects and particle pixel equivalence remain | Effect choice, duration and source-sprite controls; scene push/pop, destruction and restart lifecycle; compare seeded/measurable behaviour without substituting an empty implementation. |
| N07 `music.play`, `playTone`, `createSong`, `createSoundEffect`, `PlaybackMode` | Import explicitly refuses both `music.playTone` and `music.play`; exporter can emit tones/notes/rests from Scratch constructs. This is a directional coverage gap | No native Arcade music resource/playback words; generic Scratch sound blocks do not expose all PXT song/envelope/playback options | Song/track/note and sound-envelope authoring, volume/tempo/playback mode, stop/pause/scene lifecycle. Original compilation plus audible/timing observations; a tone export is not full music support. |
| N08 `game.ask`, `askForNumber`, `askForString`, `setDialogFrame/Cursor/TextColor/Font` | Splash/long text and one-argument number/text prompts exist; prompt options and `game.ask` value forms remain gaps | Existing text/question words; digit/length limits and dialog appearance need native operands/blocks | Prompt interaction, cancellation/focus, blocking order and selected font/frame assets; export options exactly. Avoid declaring all dialogs absent or complete. |
| N09 `info.onScore`, `highScore`, `changeCountdownBy`, `showScore/showLife/showCountdown`, HUD colours and life image | Score/life players1–4 and start/stop/countdown callbacks exist; broader Info surface is not covered by these words | Add missing predicates/reporters/events/HUD setters with player and value types; audit existing numeric player fields for valid range/feedback | Life icon and HUD colour editing, scene-local vs persistent scores, threshold callbacks and original export; persistent high score needs an explicit persistence contract. |
| N10 `ArcadePhysicsEngine` and `scene.Scene` public members; frame priorities | Resource creation/replacement, three engine settings and selected scene callbacks exist; this is not the full engine/scheduler API | Native scene/engine references exist, but arbitrary public engine methods and event-context priorities need a declaration-by-declaration audit | Resource inspector/picker and callback navigation; validate add/remove/move/overlap/draw where public, cancellation and frame ordering against PXT before exposing unsupported controls. |
| N11 `controller.player2/3/4`, button repeat configuration, `mp.*` | The local controller pane selects Player1–4 for independent movement; legacy keyboard/button events use player one. Native mp button callbacks and queries now support all four local players; network connectivity remains unqualified | Player values, sprite association and `mp.moveWithButtons` have native Blocks/pseudocode/export support; a local Player1–4 pane selector routes movement independently. Direct fixed-controller movement/stopping now have native dropdown Blocks, pseudocode and return export; the four-player browser journey is pending. Controller values/aliases, connection/score/life events, analog pressure and repeat configuration remain open | Distinct player bindings and held-input release; keyboard/touch mappings; explicit local vs network session model, disconnect/reconnect and export dependency. Hardware sensors/vibration are separately unmeasured. |
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

### Multiplayer player foundation — 2026-10-08

New capability: scene-local four-player identities, selector/number/index lookup,
copied player arrays, exact sprite association and reverse lookup, safe player
property queries and direct index/number reads. Typed `mp.Player` annotations,
forwarded procedure arguments/results and nested player arrays preserve their
types. Native export emits the bundled multiplayer dependency. Six bidirectional
producer dialect words and matching runtime/Blocks operations are adopted from
sb3-creator source `da69beb1f894f63b259dfe728084dfe3327e7eb0` ([PR64](https://github.com/CrispStrobe/sb3-creator/pull/64)).

Original PXT and BW agree through Code→Blocks, native export→original PXT,
reimport and SB3 reload. Coverage includes missing/null sprite distinctions,
first matching owner, array copies and alias identity, scene push/pop with old
player references, invalid/fractional/null/NaN/infinite indexes, and player
properties. References are isolated by runtime, kind and project generation.
Safe property reads return0 for missing players; member reads retain an error.
Initial stale-overlay, exporter-field and null-index failures remain preserved.

GUI authoring: the Arcade palette exposes lookup, all players, sprite get/set,
reverse lookup and property query blocks. Code supports equivalent pseudocode;
no source-only surrogate call is needed. The property selector is currently
numeric1(index)/2(number); friendlier enum labels remain a GUI improvement.
Member-read export requires a fixed index/number selector, with an explicit
unsupported diagnostic for a dynamic member selector. Safe queries allow a
dynamic numeric property. No new graphics-editor tools were added.

At the player-foundation checkpoint, movement and rebinding were still open;
the following movement slice supplies those operations. Remaining: multiplayer
button/connection/score/life events; player state/data; presence icons/indicators
and network notifications. Sprite-association qualification does not cover
those effects. The controller-pane journey uses a normal B callback that looks
up player three's sprite; it is not controller-three input qualification.
Same184 remains96/87/1. Recovered tutorial diagnostics51→31; all10 projects are
still partial with original extension packages unavailable. All10 partial
fragments step24 frames without errors; full-game equivalence is not measured.
See the [receipt](receipts/2026-10-08-arcade-multiplayer-players.json).

Final qualification: clean source `de2c15909`;106 affected/regression/gate tests
and1 producer roundtrip pass without skips. Production `gui.db7109fe.js` imports
the native project, converts Code→Blocks and uses B to retrieve player three
and move its sprite x60.5→65.5. All prior journeys pass; page/build errors0.
Initial4,360,511 bytes is9 bytes larger and below the unchanged4,467,136 limit.


### Multiplayer movement and controller selection — 2026-10-08

Implemented: `mp.moveWithButtons` with optional speed defaults, zero-axis
preservation, deferred sprite assignment and rebinding. Controller bindings are
scene-local and independent for players1–4. Multiple controllers can bind the
same sprite; update order and release behavior retain the pinned PXT semantics.
Detachment retains velocity, while release clears axes previously driven by
that binding. Runtime coverage includes actual player-four scene push/pop.

Authoring: the Arcade palette and bidirectional dialect expose
`arcade move player (player) with buttons vx (60) vy (0)`. Code→Blocks, native
export→original PXT, reimport and SB3 reopening are covered. Producer source
`0b621e2a2d4dd60d681821b30eed65ffb240a90a` supplies the movement word
([PR65](https://github.com/CrispStrobe/sb3-creator/pull/65)). The visible controller
pane now selects Player1–4 and releases held buttons on selection change.
Player-one keyboard/button behavior remains covered by regressions.

Still open: direct fixed controller-instance APIs and per-player button events;
connection/score/life events, state/data, analog pressure, repeat settings,
presence indicators and networking. Friendly Player/property enum pickers,
multifile source navigation, callable authoring and the graphics/palette gaps
listed above still need their own qualification. The new selector represents
local inputs; it does not claim connected remote controllers.

Recovered tutorial diagnostics31→27, retiring four movement refusals. All10
projects remain partial and original compilation is unavailable for their
missing offline packages. Partial fragments step without errors. The unchanged
184-source import baseline remains96 translated /87 partial /1 malformed.
See the [movement receipt](receipts/2026-10-08-arcade-multiplayer-movement.json).


### Multiplayer button callbacks — 2026-10-08

Implemented `mp.onButtonEvent`, `mp.isButtonPressed` and all six
`mp.MultiplayerButton` constants. Callback arguments retain typed Player
identity, property/sprite access and captured local cells. Scene-local callback
slots preserve replacement and direct controller-one override behavior in the
qualified fixtures. Four bidirectional dialect words and Blocks operations come
from producer `638851ab1ab6845c0752a0cc96f053ef2c8745ef`
([PR66](https://github.com/CrispStrobe/sb3-creator/pull/66)).

Runtime inputs now queue player2–4 edges independently, including both edges of
a tap shorter than a frame. Repeat state is independent per player/button;
default500ms/30ms boundaries and integer millisecond frame updates follow the
pinned controller source. Runtime scene push/pop checks retain player identity
and callback ownership. Original PXT differential fixtures cover press/release,
short player-four taps, captures, slot replacement, queries and sprite updates
through Code→Blocks, native export/reimport and SB3 reopening. Repeat boundary
checks are runtime tests against the pinned source, not a wall-clock timing
comparison between simulators.

GUI: player selection controls these callbacks. The palette exposes registration,
handler hat, event-player reporter and pressed query; Code supports their native
words. Registration and handler tokens still need manual matching. A friendly
callback form and button enum labels0–5 remain authoring gaps. No graphics tools
changed. Direct controller-instance APIs, connection/score/life events, player
state/data, custom repeat settings, analog pressure, presence/network effects,
queued callback replacement races and long-handler timing remain open or need
separate qualification.

The same184 importer remains96 translated /87 partial /1 malformed. Ten
recovered tutorial projects remain partial with27 diagnostics and original
packages unavailable; all10 partial fragments step without errors. This slice
does not claim complete-game equivalence. See the
[button receipt](receipts/2026-10-08-arcade-multiplayer-buttons.json).


### Numeric player state and runtime key allocation — 2026-10-08

Implemented `mp.getPlayerState`, `mp.setPlayerState`,
`mp.changePlayerStateBy`, `MultiplayerState.create` and built-in score/life keys.
Custom numeric values retain fractions; built-in writes share the existing Info
integer values. Key allocation is project-global, starts at2 after the built-in
keys, survives scenes and resets with project/player identity. Custom state
lookup retains strict equality, including NaN, null and undefined boundaries.
Older Player custom state remains attached to that identity; its Info access
uses the active scene, as observed in original PXT.

Four native dialect/Blocks operations come from producer
`107af3ba50dc41646d055306f9cbf3955b41911f`
([PR67](https://github.com/CrispStrobe/sb3-creator/pull/67)). Source can extend
`namespace MultiplayerState` with exported keys using qualified or unqualified
create calls. The namespace binding catalog is now generated from the pinned
device and multiplayer API metadata; it does not claim all catalogued APIs are
implemented. Native export preserves runtime allocation and the multiplayer
package dependency. Code/Blocks, original-PXT native export, reimport and SB3
reopening cover these state semantics.

GUI authoring: palette blocks create a key, read a player state and set/change
it. Pseudocode uses identical operations. State-key variables are editable using
the existing variable controls. Friendly score/life/custom-key labels, a named
key manager, namespace-preserving source editing and original MakeCode Blocks
decompilation still need qualification. Per-player Info HUD rendering/layout
needs implementation and visual comparison; state values alone do not supply
that display. No graphics-editor tools changed in this slice.

Still open: arbitrary player.data objects and direct Player state methods,
connection/score/life events, custom repeat settings, analog pressure and
presence/network effects. A proper data implementation needs shared object
identity, property reads/writes, aliasing, missing/falsy initialization, scene
ownership and save/reopen semantics; serializing independent JSON snapshots
would not establish those capabilities. Preserve the queued callback replacement
and long-handler timing gaps from the preceding slice.

The original184 import baseline remains96 translated /87 partial /1 malformed.
Ten recovered tutorial projects remain partial with27 diagnostics; missing
packages prevent original compilation, while partial fragments step without
errors. Largest remaining baseline families include unreadable backgrounds,
legacy/asset tilemaps, destruction effects and music. Track artwork recovery,
rendering and editor support together when taking those lanes. See the
[state receipt](receipts/2026-10-08-arcade-multiplayer-state.json).

### Legacy color-coded tilemap foundations — 2026-10-08

`scene.setTileMap(image, scale?)` and `scene.setTile(index, image, wall?)` now
use live scene-owned map-image and tile-definition state. Defaults are16 pixels
and a non-wall tile. Standard TileScale.Four/Eight/Sixteen/ThirtyTwo values are
available as native numeric expressions. Location.tileSet reads the current
numeric index through the existing location reporter.

Map image aliases share edits; replacing the map detaches the old map image but
retains definitions. A null map disables the layer without discarding definitions.
Each scene owns its map and definitions. Exact-size tile images remain live;
nonmatching images are cropped/padded into a cached square, matching the pinned
color-coded package. Default color tiles allocate at the frame draw, preserving
an unset obstacle result before allocation. Native wall collision uses the live
indices and definition wall flags. Export declares color-coded-tilemap and emits
the original APIs, retaining image references rather than fixed map snapshots.

Two native commands are available in Blocks and pseudocode:

```text
arcade set color-coded map image (mapImage) scale (4)
arcade set color tile (1) image (tileImage) wall (false)
set colorIndex to (arcade tile tileSet of (location))
```

The generic image-reference words and existing image assets can supply these
inputs. A dedicated color-index map painter, tile-definition palette, dimensions,
scale/wall controls, named resources, undo/rename/delete/save/reopen and graphics
editor roundtrip qualification remain U03 GUI work. Do not describe a raw image
input as completion of that painter. Legacy Tile objects and their place/get/list
methods, numeric random placement, onHitTile and tileHitFrom remain diagnostics.
Mixing legacy maps with modern map replacement, image lookup or per-location
mutation is conservatively diagnosed; it needs distinct inherited-map data and
wall semantics before admission. Invalid/dynamic scale behavior beyond the four
standard sizes is not qualified. Custom palette and missing package artwork
remain separate gaps.

Qualification:71 regressions, one producer roundtrip and the canonical SPIKE
artifact test pass without skips. Eight affected regressions pass again after
the Blocks dropdown declaration fix. The first production browser failure
exposed that tile-location properties were declared as text inputs while native
blocks stored dropdown fields; the final declaration supplies a real menu.
The harness also compared numeric observations against Boolean expectations;
its expected readings now use numeric1. Both failures are retained. Original PXT, Code/Blocks, native export and
reimport, SB3, scene restoration, aliasing, tile-cache and wall-contact paths are
covered. The same184 import-only corpus advances96/87/1→98/85/1. The two promoted
sources compile/run in original PXT and exported PXT; map dimensions, origin
index, wall and pixel agree and native fragments step24 frames without block
errors. One intentionally empty forever callback retains its warning. These
finite checks are not complete-game equivalence. Earlier tutorial package
availability was not requalified by this slice.

The producer is952d7019 ([PR68](https://github.com/CrispStrobe/sb3-creator/pull/68)).
Namespace binding metadata now includes the pinned color-coded package (115
namespace/enum lists); binding names do not claim implementation of all APIs.
The preceding PR726 failed its stale compiler-pin assertion and browser setup;
this slice reruns the unchanged SPIKE artifact assertions at the new exact pin.
The hosted APT-lock/browser-install failure is retained and requires new hosted
qualification. No green hosted integration claim follows from local tests.

See [receipt](receipts/2026-10-08-arcade-legacy-tilemap.json).

Production `gui.d9e1420e.js` passes native file→Code→Blocks→visible A-button input: exact-size tile pixel7→8, padded cached pixel5 and sprite x2→3. Tile-index and center dropdown properties survive GUI loading; scene restoration and map aliases are observed. All preceding journeys pass with0 page errors. Build errors0; initial4,360,511 bytes stays under unchanged4,467,136 limit; boot checks pass. Pixel readings here observe the runtime tile-view buffer, not a complete original-versus-native screen comparison.

### Legacy Tile values — 2026-10-08

Implemented scene.getTile/getTilesByType/setTileAt/place/placeOnRandomTile and
Tile.place, plus x/y/tileSet reporters. Six native dialect words cover Blocks
and pseudocode authoring, runtime execution and export with color-coded-tilemap.
The generated authoring vocabulary lists their exact syntax. A distinct
legacy-tile reference kind and LegacyTile type graph retain creating-map
ownership through arrays, indexing, for-of, random selection and forwarded
procedures. Export declares tiles.Tile and tiles.Tile[] rather than replacing
these values with modern Location values. Lists scan columns first and allocate
fresh identities. Numeric edits resolve a retained Tile's center against the
current map's scale; edits update the live map image. Sprite placement preserves
receiver/argument evaluation order. Disabled-map tileSet reads throw as in PXT.

GUI: all six blocks are exposed, including a real x/y/tileSet property dropdown;
the production Code→Blocks→controller journey edits index1→9 and places a2x2
sprite at x11. U03 still needs a dedicated map painter, color-index picker,
definition palette, wall/scale controls and rename/delete/undo/save/reopen
qualification. Raw numeric/index and image inputs do not complete that editor.

Qualification:39 affected/regression tests,18 CI contract tests and1 producer
roundtrip pass without skips; unchanged canonical SPIKE artifact assertions are
included. Native decompile, MakeCode export/reimport and SB3 are covered. The
same184 import-only baseline advances98/85/1→100/83/1. The two promoted car/flower
examples compile/run in original and exported PXT and step240 native frames;
sprite counts, summed positions, dimensions and artwork pixel sums agree, with
no block errors or creator warnings. Production file→Code→Blocks imports run
both original examples; the visible right button steers the flower game's
player. Finite observations are not complete-game or full-screen equivalence.

Production gui.8dc99749.js builds with0 errors and passes all preceding browser
journeys and boot gates. Initial4,360,525 bytes (+14) remains below unchanged
4,467,136. Producer a8609c0f is [PR69](https://github.com/CrispStrobe/sb3-creator/pull/69).
Hosted predecessor PR727 failed; stale opcode count and missing browser
prerequisites are repaired, but independent GUI busy/device-hint/retarget
failures and exact-head hosted integration remain open. Original failures and
private evidence are retained. Next: onHitTile/tileHitFrom, then corpus-ranked
artwork/tilemap gaps; mixed map semantics, palette/effects/music and U03 remain
explicit. [Receipt](receipts/2026-10-08-arcade-legacy-tile-values.json).

### Legacy color-index wall callbacks — 2026-10-08

`scene.onHitTile`, `scene.tileHitFrom` and `Sprite.tileHitFrom` now have native
conversion, runtime and MakeCode export support. Three dialect words expose
registration, callback hats and the hit-index reporter in Blocks and pseudocode:

```text
arcade register color wall kind "Player" index (2) as "wallCallback" capturing []
WHEN arcade color wall handler "wallCallback" runs:
    set hit to (arcade sprite (arcade event first) wall hit index (2))
```

The callback sprite is the normal Arcade event-sprite handle; the converter
binds the authored callback parameter to it. The reporter's Blocks menu names
left/top/right/bottom and accepts numeric reporters. Callback captures remain
live. Registrations belong to their scene and restore after popScene. Matching
legacy handlers are selected before they run; newly registered handlers wait
for a later collision. Modern wall handlers are selected afterward and observe
sprite-kind changes. Obstacle color indices are snapshots and survive map edits.
Missing sprites report0; existing sprites without an obstacle report-1.

Qualification covers22 affected/regression tests, a final2-test rerun after the
menu change, and1 producer roundtrip, without skips. It covers original PXT,
native decompile, MakeCode export/reimport and SB3. Production gui.6891b0d9.js
passes file→Code→Blocks→visible A, including callback order ABCABC, captured
count25, index2 after a map edit, parent/child scene isolation and kind-change
order ABFABLF. Previous browser journeys and boot checks pass, with0 build/page
errors and unchanged4,360,525 initial bytes.

The same184 import-only baseline advances100/83/1→102 translated/81 partial/
1 malformed. Two newly translated originals run through the visible controller:
a wall collision resets the first player's position to50,50 and the second
advances to level2. Original/exported PXT with an explicit observer/input-driving
suffix agree on finite collision observables. Unchanged originals also step240
native frames without block errors or creator warnings. These observations do
not establish complete-game or full-screen equivalence.

**Open timing gap:** when a callback moves with nonzero velocity during pause,
the current original-wall-clock versus forced-native-frame probe reports final
x15 versus11.16796875. Callback order and index snapshots match. A trial ownership
lock matched x but changed obstacle clearing; it was removed. The passing
fixture holds velocity at0 during its pause. No timing freeze or workaround is
shipped. Next qualify comparable clocks and shared callback/physics scheduling,
then fix any demonstrated semantic defect. The map painter/color-index picker,
mixed map semantics, artwork packages, palettes, effects and music also remain
open. [Qualification receipt](receipts/2026-10-08-arcade-legacy-tile-collisions.json).

GUI handoff: registration, callback and hit-index blocks are available, and
pseudocode uses the same native operations. U03 still needs map painting,
color-index selection, tile definitions/walls/scale and resource lifecycle
(rename/delete/undo/save/reopen). Do not close U03 from numeric input support.
Timing qualification is a runtime gap, separate from those editor tasks.
Producer [PR70](https://github.com/CrispStrobe/sb3-creator/pull/70) supplies the
three dialect words; Lite adoption is stacked and awaits exact-head hosted CI.

### Completed callback scheduling — 2026-10-08

The VM now reports `ARCADE_FRAME_END` after executing its threads. Arcade drains
completed function, creation and terrain callback waits at that point. This
lets the next inline handler resume before the following physics tick. Motion
continues during a yielding handler; the change adds no scene ownership lock.
No new dialect opcode or editor control is needed.

The original PXT and native wall-clock regression both verify that movement
continues during pause70, then the next legacy handler, modern wall handler and
caller observe the preceding handler's final position. Disabling the new
notification makes the regression fail: next-handler x8.61328125 versus previous
handler x9.890625. Thirty unique regressions pass, covering legacy collisions,
creation callbacks, yielding function results and scene registrations; the final
fixture has a separate one-test rerun. No test skips. Production gui.cf6a1da8.js
passes file import→Code→Blocks→green flag→visible A repeat with no page/block errors; boot
checks pass. The first direct-Code browser driver omitted imported image assets;
its failed runs are retained. The corrected driver imports the native project
through the file chooser, carrying code and costumes together. Initial JavaScript is4,360,555 bytes under unchanged4,467,136.

This closes the extra physics tick between completed callbacks. Absolute timing
compatibility remains open. With normal wall-clock schedulers, the original
fixture reproduced original x15/native12.4453125 in three trials before this
change. Afterward, a simplified pause20 case ends at original15/native13.72265625,
with no extra movement between the final callback observations. A pause0 case
matches x15 but reads original obstacle-1/native2. Real long-pause positions vary
with scheduling, so those probes are retained rather than treated as equality
gates. The runtime still advances33ms per VM tick although the default VM
interval is about16.7ms. PXT EventContext initializes its previous timestamp
immediately before its first frame, producing a near-zero initial delta; startup
phase and frame-polled waits also need qualification.

Next: establish one controlled monotonic timeline for VM waits and Arcade scene
frames, including initial zero delta, ordinary60Hz/compatibility30Hz operation,
yielding frame callbacks, pause0/20/70 and push/pop/restart. Compare event traces
and obstacle lifetimes against the pinned original scheduler before changing
shared physics timing. Do not introduce timing freezes or close this lane from
import counts. The last import-only corpus remains102 translated/81 partial/
1 malformed; it was not rerun for this runtime-only change. U03 painter and
resource lifecycle, ranked artwork/maps, palettes, effects and music remain open.
[Receipt](receipts/2026-10-08-arcade-callback-scheduling.json).

### Elapsed Arcade frame clock — 2026-10-08

Arcade now advances by elapsed VM millisecond time rather than a fixed33ms for
every tick. This removes the clock-rate mismatch at the default60Hz VM cadence.
The first VM tick seeds the baseline with0ms, and green flag/scheduler restart
reset it. Backward timestamps produce0ms, then rebase. Explicit offline frame
durations remain available; test helpers now state their deliberate33ms physics
step instead of relying on the production clock. Ordinary helper frames do not
fast-forward wait timers; controlled tests inject the VM clock as well.

Elapsed time during a pending registered scene callback is carried into the
next frame rather than discarded. Physics retains the original100ms per-move
clamp. A registered child-scene callback waiting70ms remains pending at80ms,
completes at100ms and reports scene elapsed120ms on the next frame. General
nested registration without a scene-stack selector remains an explicit
`game.onUpdate()` conversion gap; its reproducer is retained.

Qualification:60 affected tests pass without failures/skips. Thirty, sixty
and irregular ticks spanning1000ms match original PXT physics exactly:
x109.3359375,108.59375 and109.80859375, respectively, from x80/vx30. These small
differences between schedules are the original fixed-point rounding, not a
reason to replace the oracle with idealized floating-point motion. The comparison
uses the same explicit physics time schedule in each engine; it does not claim
complete original event-loop equivalence. Existing prompt, image, flag, speech,
collision and scene-registration behavior passes. An old prompt assertion was
updated for the reporter parentheses already emitted by the unchanged importer;
answer suspension and delivery remain checked.

Production gui.0f84bfdb.js passes native file→Code→Blocks→flag→visible A callback
repeat, plus a separate visible-right hold checking game time against VM wall
time and sprite motion. No page/block/build errors; boot checks pass. Initial
JavaScript4,360,790 bytes remains below unchanged4,467,136.

Remaining: first scene-worker phase versus first VM tick, push/pop, legacy
update hats versus sequential registered callbacks, nested registrations outside
the scene-stack path, and original whole-loop pause0/20/70/obstacle ordering.
The clock follows the VM's existing millisecond source; this does not certify
all system-clock adjustments or background scheduler behavior. Next unify the
registration paths and qualify these traces against the original scheduler.
U03 painter/resource lifecycle and ranked artwork, palette/effect/music gaps
remain open. No importer/corpus promotion is claimed: last184 import-only
102 translated/81 partial/1 malformed, not rerun here.
[Receipt](receipts/2026-10-08-arcade-frame-clock.json).

### Unified frame callback registration — 2026-10-08

`game.onUpdate` and `game.onUpdateInterval` now use scene-owned runtime
registrations without requiring `game.pushScene()` elsewhere in the program.
Registration occurs at the authored call site, including inside procedures.
Repeated installation creates distinct captured cells; callbacks from one
installation share live cells. Interval expressions are evaluated at registration.
A yielding update completes before its next inline successor runs.

Captured assignments now export their Arcade value type, preserving booleans
instead of coercing them to Scratch numeric values. Shadowed `game` bindings,
invalid arity and non-inline callbacks remain diagnosed.

Qualification: 22 affected tests pass without failures/skips. Original and
exported MakeCode simulators agree on order `IAaB`, sum25 and one completed
installation. Native execution, decompilation, MakeCode reimport and SB3 reload
retain those observations; repeat input produces `IAaBAaB`, sum54 and two
installations. The registered100ms interval ignores a later assignment of1ms.
Production `gui.13e19d9b.js` passes native file→Code→Blocks→flag→visible A repeat;
no page/block/build errors. Initial JavaScript 4,360,790 bytes remains below the
unchanged4,467,136 limit; boot checks pass.

GUI handoff: existing registration, named callback, local/captured value and
assignment blocks/pseudocode words support these programs. No new producer pin
or opcode was needed. Dedicated callback authoring guidance and the remaining
editor/map-painter/resource work still need their separate GUI qualification.

The same184 immutable apps still report102 translated/81 partial/1 malformed,
with no changed diagnostic rows. These are import-only results. Other callback
families still depend on scene-stack selection for their native registration
path; first scene-worker phase, push/pop, legacy authored hats and whole-loop
pause/obstacle ordering remain open. This section supersedes the prior nested
frame-registration gap; it does not establish full event-loop compatibility.
Exact-head hosted CI and stacked integration remain pending.
[Receipt](receipts/2026-10-08-arcade-update-registration.json).

### Unified controller callback registration — 2026-10-08

`controller.A/B/up/down/left/right.onEvent` now registers at its authored call
site without requiring a scene-stack program. Nested procedures retain live
captured cells; registering the same button/event replaces its earlier handler.
Pressed, Released and Repeated retain their original event values, including
dynamic event expressions passed through procedures. Released callbacks observe
mutations made by the matching pressed callback. Invalid callbacks and shadowed
controller/event namespace bindings remain diagnosed.

Qualification:27 distinct affected tests pass after10 focused final reruns;
no skips. The initial regression run had26 passes and one failure: a firework
test sent A before execution reached registration. It now sends real keyboard
input after setup and verifies no launch beforehand; the original failure is
retained. Background, flags, controller bindings, scenes and frame callbacks
remain covered. Original/exported PXT and native/decompile/reimport/SB3 agree
on trace `P7R8P10R11`, two presses/releases, three installations and a held-right
repeat. Native short taps deliver both edges with no intervening frame. Exact
wall-clock repeat counts and whole-loop startup timing are not claimed.

GUI: existing native button registration, event menu, named callback and
local/captured-value blocks/pseudocode cover this path. Production `gui.0cc1f4bb.js`
passes native file→Code→Blocks→flag→visible A/B/A, plus held-right repeat, with
no page/block/build errors. Initial JavaScript 4,360,790 bytes is below the
unchanged4,467,136 budget; boot checks pass. No new opcode/producer pin is needed.
Dedicated callback authoring guidance and graphics/resource editor work remain
separate GUI tasks.

The same184 immutable apps remain102 translated/81 partial/1 malformed with
zero changed diagnostic rows; this is an import-only measure. Forever,
life/countdown and sprite overlap/destruction registration paths still need
unification. Initial phase, push/pop, legacy authored hats and whole-loop
pause/obstacle ordering remain open, as do U03 painter/resource lifecycle and
ranked artwork/palette/effect/music gaps. Exact-head hosted CI and stacked
integration remain pending.
[Receipt](receipts/2026-10-08-arcade-button-registration.json).

### Unified life-zero and countdown registration — 2026-10-08

`info.onLifeZero`, player1–4 life-zero callbacks and `info.onCountdownEnd` now
register at their authored call sites without a scene-stack selector. Repeated
registration replaces the matching handler and retains live shared captures.
Programs containing these callbacks use native player life/score state and its
hasLife/hasScore queries. Assigning zero or negative life invokes the appropriate
handler without an artificial positive-life prerequisite; revival rearms it.
Countdown handlers can continue play and run again after a new countdown.

Original and exported PXT agree with native/decompile/reimport/SB3 on trace
`L9M10T10`, revived life2/player2 life3 and one callback of each kind. Visible A
input and original PXT input agree on `L9M10T10L10M11T11` with two of each callback.
Existing registration, callback, player-state and local/captured-value blocks
and pseudocode words cover this path; no producer pin/opcode change is needed.
Dedicated callback authoring guidance and graphics/resource editor work remain
separate GUI tasks.

Qualification:88 distinct affected tests pass after focused reruns, no skips:
61 Arcade tests,14 gate-inventory checks and13 source-policy/legacy Tile checks.
The broad suite's old fixed-target assumptions were replaced with native VM
coordinate, neighbour-write, velocity, geometry, trigonometry and20-case compound
operator observations. Timed-spawn checks now distinguish the immediate first
spawn from the newest periodic spawn. Initial failures remain in private evidence.
Four callback browser journeys are now wired into hosted CI; the inventory
recognizes Node module preloads while still rejecting mere mentions/preload-only
commands. A legacy Tile test now resolves shared value state through the audited
VM source helper.

Production `gui.b9f5aa3d.js` passes native file→Code→Blocks→flag→visible A revival and
countdown repeat, plus all three preceding callback journeys on that bundle.
No page/block/build errors; boot checks pass. Initial JavaScript 4,360,790 bytes
is below the unchanged4,467,136 budget.

The same184 immutable apps still report102 translated/81 partial/1 malformed,
with zero changed diagnostic rows: an import-only measure. Forever and sprite
overlap/destruction registration, first phase, push/pop and whole-loop pause/
obstacle timing remain open. Legacy authored hats and variable-based info paths
outside these callback-bearing/native scene programs remain separate boundaries.
U03 painter/resource lifecycle and ranked artwork/palette/effect/music gaps are
still tracked. The preceding controller head's hosted build had44 unit failures
and heavy browser camera/pixel/physics/speech failures. This slice repairs some
local contracts; it does not claim overall hosted integration is green. Next
finish that gate cleanup alongside the remaining callback families. Exact-head
CI and stacked integration remain pending.
[Receipt](receipts/2026-10-08-arcade-info-registration.json).


### Hosted integration contract repair — 2026-10-08

Test source `7aef65c5f12761a946eb7c11e672aa292351538b` qualifies54 distinct checks after focused reruns, with0 skips. The Code test harness supplies the actual artwork capture helper and tests deferred load/refresh and explicit failures. Native button tests observe long-text display/dismissal and sound-stop dispatch after registration. Controlled interval tests check immediate startup calls,100/200ms boundaries and captured dynamic periods; exported intervals compile in PXT. All1,080 truth-value cells still parse, with separate native/fixed value execution probes retained. Camera/terrain selectors and costume wiring contracts accept the current representation.

This is test-only work: no new production build or corpus pass was run, and the last import-only102/81/1 is unchanged. Original and intermediate failures remain in private evidence. Scene push/pop callbacks, untranslated arrays, F5 export/value diagnostics, module reachability and camera/pixel/physics/speech browser gates remain open pending fresh checks. No full compatibility or overall CI success is claimed. [Receipt](receipts/2026-10-08-arcade-ci-repair.json).


### Scene-owned forever closures — 2026-10-08

Source `94882c6a57d9f32462ec2579efc56fe2d9e35e45` routes `forever`, `game.forever` and `basic.forever` through native registrations at their execution sites, independently of scene-stack calls. Nested calls preserve live captured locals and yielding order. Invalid callback arguments and shadowed API bindings stay explicit diagnostics. Existing scene-local runtime registries suspend new iterations while another scene is active; the pending-frame regression requires elapsed time to survive a callback pause.

All61 affected checks pass after reruns,0 skips. Original and exported PXT agree with native/decompile/reimport/SB3 on finite trace `S12E13S14E15`. Production `gui.4e20cd56.js` passes native file import→Code→Blocks→Run→visible A→From blocks plus all four prior callback journeys,0 page/block/build errors. Initial payload remains4,360,790 bytes under the unchanged limit. Same184 import-only102/81/1,0 changed diagnostic rows. Initial failures remain privately archived.

The native Blocks command is `arcade register forever as TOKEN capturing CAPTURES`, paired with `when arcade forever handler TOKEN runs`; Code decompilation retains the pair. Captures are shared cells of the enclosing function. Dedicated guidance for creating callback pairs and editing captures remains a GUI task. Sprite callback unification, common startup/scene/obstacle timing and the remaining hosted export/browser gates are still open. [Receipt](receipts/2026-10-08-arcade-scene-continuation.json).


### Scene-owned sprite overlap and destruction closures — 2026-10-08

Source `d606023f2455a0e0a213da65a34d76a31ed91445` routes `sprites.onOverlap` and `sprites.onDestroyed` through native registrations at their execution sites, independently of scene-stack calls. Nested handlers preserve shared captured locals, both event sprite arguments, and sequential destruction handlers across pauses. Invalid callbacks and shadowed API/kind bindings remain explicit diagnostics. Destruction before registration and skipped conditional registrations do not invoke callbacks. Existing authored legacy hats remain available.

All57 affected checks pass after focused reruns,0 skips. Original/exported PXT and native/decompile/reimport/SB3 agree on finite repeated-input trace `O12D13:20d14B14X16O16D17:20d18B18X20`, four destruction callback invocations and one remaining player. Production `gui.3c9f1746.js` passes native file→Code→Blocks→Run→visible A→From blocks and all five preceding callback journeys,0 page/block/build errors. Initial payload remains4,360,790 bytes. Same184 import-only102/81/1; one existing destruction refusal now explicitly names its unrendered effect/duration. No compatibility promotion or full-game equivalence is claimed.

Native Blocks use `arcade register overlap kind … with kind … as TOKEN capturing CAPTURES` and `arcade register destroyed kind … as TOKEN capturing CAPTURES`, paired with their overlap/destroyed-kind handler hats. Code decompilation retains the pairs and maps event sprites to callback locals. Dedicated callback-pair/capture guidance remains a GUI task. Instance destruction captures, nested parallel calls, common startup/scene/obstacle timing, effects and remaining hosted export/browser gates remain open. [Receipt](receipts/2026-10-08-arcade-sprite-registration.json).


### Instance destruction callback captures — 2026-10-08

Source `a0500049b29809f2a2f69b41e47ed7eb9a78ccb0` imports typed `Sprite.onDestroyed` calls using the common live-capture registration machinery. Registration replaces the previous instance callback and stays bound to the actual sprite when its variable changes. Number and boolean captures survive the enclosing procedure; yielding instance handlers complete before kind handlers and the caller resumes. Invalid callback signatures remain explicit diagnostics. Existing authored destruction words remain readable.

Original/exported PXT and native/decompile/reimport/SB3 agree on repeated-input trace `I12i13KXI14i15KY`. Producer dialect checks pass230/230. Browser gate inventory checks pass21/21. Same184 import-only102/81/1,0 changed diagnostic rows. Initial schema-sync and premature-observation test failures are preserved privately. All23 distinct affected Arcade checks pass after a focused rerun,0 skips.

Code and Blocks now expose `arcade register instance destruction of ID as TOKEN capturing CAPTURES` and `when arcade instance destruction handler TOKEN runs`. The visible file→Code→Blocks→Run→controller A→From blocks test is wired to the hosted heavy shard. Subsequent exact-head hosted GUI execution at `ec2747905274da4bc74dd94cc58321268e60b642` passed this journey; the overall hosted build and heavy browser job still failed other checks. See the hosted integration repair entry below. Dedicated callback-pair/capture guidance remains open. Nested parallel call timing/captures are next, alongside scene/startup timing, corpus gaps and hosted integration failures. [Receipt](receipts/2026-10-08-arcade-instance-registration.json).


### Parallel execution at call sites — 2026-10-08

Source `9697810a2529b1b6aaaa31e7dc9699d5dad828ee` imports `control.runInParallel` as a one-shot launch at its execution site. Each call queues an independent VM thread and the caller continues without awaiting it. Nested inline callbacks retain live number/boolean cells after the enclosing procedure returns; repeated calls have separate invocation cells. Unexecuted branches launch nothing. Invalid signatures and shadowed `control` bindings remain diagnostics.

All38 affected checks pass,0 skips:16 Arcade,1 canonical SPIKE artifact and21 browser gate inventory checks. Producer dialect232/232 passes. Original/exported PXT and native/decompile/reimport/SB3 agree on repeated-input trace `L12SP12Q13E13N13L14P14Q15E15N15`. Concurrent launches across scene push/pop agree on total26; native stop/restart cancels old queued work and launches one fresh fiber. The SPIKE gate now names the new producer pin and passes its unchanged artifact behavior assertions, resolving the observed parent build refusal.

Code and Blocks expose `arcade run parallel as TOKEN capturing CAPTURES` and `when arcade parallel handler TOKEN runs`; export reconstructs `control.runInParallel(function () { … })`. The visible file→Code→Blocks→Run→A→From blocks test is wired to the hosted heavy shard. Eight GUI journeys are prepared, including instance destruction. The local cold production build was interrupted when shared-host swap was exhausted; no fresh bundle or visible GUI result is claimed. Subsequent hosted execution at `ec2747905274da4bc74dd94cc58321268e60b642` passed both new GUI journeys, while the overall build and heavy browser job failed other checks. Callback-pair/capture guidance and function-valued callbacks remain GUI/conversion tasks.

Same184 import-only102/81/1,0 changed diagnostic rows. The original slices still contain10 unreadable backgrounds. The earlier complete tutorial-project audit already recovered six gallery backgrounds on separately preserved full inputs; four still require external package image namespaces. Keep these input sets separate and continue the remaining package-resource work. Custom palettes also remain open. Next groups include7 tilemap-resource refusals and7 destruction effect/duration refusals. Recover actual assets with provenance; do not substitute blank art or count unavailable inputs as implemented features. Scene/startup timing and overall hosted integration remain open. [Receipt](receipts/2026-10-08-arcade-parallel-registration.json).


## Hosted integration repair — 2026-10-08

The parent source at `ec2747905274da4bc74dd94cc58321268e60b642` passed all eight
callback GUI journeys, including instance destruction and parallel captures,
using the hosted production build. This does not mean overall CI passed:
[the exact run](https://github.com/CrispStrobe/brickwright-lite/actions/runs/37831089850)
failed ten unit checks and four older heavy-browser checks.

The follow-up repairs stale native-opcode, typed-array, overlap-registration,
life-state and array-length expectations. The background forever roundtrip now
retains extension timers, awaits each assertion and cleans up after each path.
The tutorial CLI uses a literal module import recognized by the reachability
gate. A populated typed sprite array must mutate a real native sprite.

Camera From Blocks now waits for conversion completion and reads the entire
CodeMirror document: the visible DOM can omit callback bodies below the large
tilemap line. Bounce and speech-expiry browser checks supply explicit elapsed
frame durations. Their fresh hosted GUI rerun remains required. The fast-crossing
controller observation remains unresolved; the original PXT comparison at the
controlled test cadence is recorded separately, without changing that browser
assertion.

Local qualification passed208 distinct checks with no skips, including original
and exported PXT execution of the crossing fixture, native Code/SB3 roundtrips
and a populated typed sprite array. The first contact-geometry assumption and
an unpaced original-simulator timeout remain preserved in private evidence.
No importer/runtime capability or corpus classification is added by these gate
repairs. The last original184 census remains102 translated /81 partial /
1 malformed. Remaining work includes external package assets, custom palettes,
seven tilemap-resource refusals, seven destruction effect/duration refusals,
scene/startup timing, function-valued callbacks, and GUI guidance for callback
pairs and captures. [Receipt](receipts/2026-10-08-arcade-hosted-integration.json).


## Overlap callback frame cadence — 2026-10-08

The original simulator and native runtime agree on twelve controls: six
physics frame sequences with each of two target widths. Callback fibers run
after motion, so the explicit overlap query can
report contact or separation depending on where that frame ends. The browser
journey must compare its callback with final geometry and visible occlusion,
while retaining the stop, reset, event and sparse pixel-mask assertions.

For the 2 pixel target:

| Frame duration | Frames advanced | Final mover x | Event observed | Touching in callback |
| --- | --- | --- | --- | --- |
| 4 ms | 4 | 68 | yes | yes |
| 8 ms | 2 | 68 | yes | yes |
| 16 ms | 1 | 68 | yes | yes |
| 33 ms | 1 | 76 | yes | no |
| 50 ms | 1 | 85 | no | no |
| 100 ms | 1 | 110 | no | no |

These are finite original-PXT comparisons, not a claim that all crossings are
detected: the last two sequences miss the pair in both implementations. The
originally failing browser assumption required separation even on a short
frame. The 8 pixel controller target is observed at all six tested cadences;
frame-end x and contact query still match the original. The narrow target
remains in the deterministic controls. The full roundtrip uses the wider target
and compares event delivery, stopped motion and consistent callback geometry
rather than requiring identical geometry across independently timed runs.

All 13 surrounding physics checks pass without skips. The revised visible
Code→Blocks→Run→controller launch/reset twice→sparse masks→From Blocks journey
passes with zero page/runtime errors in the existing `gui.3c9f1746.js` reference
bundle. This is not a new production build: fresh exact-head hosted GUI checks
remain required. No runtime scheduler, physics algorithm or importer behavior
changes in this repair. The first incorrect cadence assertion and failed
narrow-target GUI and exported-PXT timeouts remain preserved privately.
[Receipt](receipts/2026-10-08-arcade-overlap-cadence.json).


## Controller reset lifecycle — 2026-10-09

[PR740's hosted heavy browser job](https://github.com/CrispStrobe/brickwright-lite/actions/runs/37851310198/job/113580725332)
passed, including the repaired camera, image-bounds and speech checks. The
[PR741 build](https://github.com/CrispStrobe/brickwright-lite/actions/runs/37852453546/job/113568513617)
recorded 6,474 passed unit checks, one camera gate-audit failure and 21 skips.
Its heavy browser job separately timed out waiting for the controller reset.
Neither parent has overall green CI.

A deterministic original-PXT control shows that an overlap callback already
queued before a position reset still runs afterward. An authored arm guard
suppresses its late effect: one unguarded effect versus zero guarded effects,
with the native runtime matching both. This confirms the mechanism that could
explain the hosted timeout; it does not recover that failed run's exact timing.
The authored controller fixture now disarms on completion/reset and counts
resets. The visible journey waits for that counter and checks that the cleared
flag, disarmed state, stopped position, unchanged pass count and pixels remain
correct after three actual frames.

The camera audit keeps its baseline and all behavior assertions: the explanatory
comment now precedes the completion wait, keeping its whole-document assertion
adjacent. Local qualification passes 25 distinct checks without skips. The
revised visible controller/Code/Blocks/pixel-mask/decompile journey passes in
the existing reference production bundle with zero page/runtime errors. Fresh
exact-head hosted checks remain required. Original failed logs are retained
privately. No runtime/converter capability or corpus count changes in this
batch. [Receipt](receipts/2026-10-09-arcade-reset-qualification.json).


## Indexed custom artwork palettes — 2026-10-09

Custom indexed SVG now preserves its 15 opaque RGB entries and each run's
color index. Readers validate the palette, index/fill agreement and declared
grid. Duplicate RGB colors retain distinct indices, including opaque black
versus transparent index zero. Default artwork retains its historical bytes.
The graphics editor's actual load method adopts an embedded palette without
raster conversion. Native template decoding carries that palette into mutable
images and renderer output. Export discovers the palette from sprite or Stage
artwork, writes it to `pxt.json`, and remaps other palettes explicitly. Saved
SB3 artwork survives export into a project accepted by the original Arcade
compiler. All 54 affected local checks pass, with no skips.

This is artwork palette support. Project-wide startup/import and dynamic palette
changes still need background, tilemap, speech and scene-layer runtime wiring.
The importer custom-palette diagnostic remains. Code/Blocks palette authoring
and a project-wide GUI selector remain open; per-artwork palette editing exists.
There is no fresh production build or visible browser qualification for this
slice. Preserve those gates before integration. No fresh corpus census ran;
the last original 184 import-only result remains 102 translated, 81 partial and
1 malformed. Producer vocabulary and pin remain unchanged.

Next sequence: implement project-wide palette state and rerendering without
changing indices; connect static `pxt.json` import and faithful export; add
Code/Blocks authoring and GUI controls; compare original/exported PXT colors
against native output; then qualify a fresh controller/graphics browser journey
and remeasure the unchanged corpus.
[Receipt](receipts/2026-10-09-arcade-palette-indices.json).


## Global Arcade palette state — 2026-10-09

Project palette state now recolors native solid backgrounds (including index
zero), mutable background images, sprites, tilemaps and speech without changing
pixel indices or collision masks. It persists globally across scene push/pop,
refreshes restored layers, survives Stop and resets on project restart. Runtime
instances keep independent palettes. Invalid updates reject before changing
state or renderer resources.

Code and Blocks share the new `arcade_setPalette` command:

```text
DEVICE ARCADE
WHEN flag clicked:
  arcade set palette hex "000000ffffffff2121ff93c4ff8135fff609249ca378dc52003fad87f2ff8e2ec4a4839f5c406ce5cdc491463d000000"
```

The input is exactly 96 hexadecimal digits (16 RGB entries). Text expressions
are allowed. Text whitespace is rejected, matching MakeCode's `Buffer.fromHex`;
formatted MakeCode `hex` literals are normalized when imported. Static
`pxt.json` palettes become a startup command, and imported indexed costumes
carry their initial palette for graphics editing. Palette-aware programs use
native rendering. Runtime `image.setPalette` accepts imported hex literals and
`Buffer.fromHex` expressions; export preserves authored call timing through
`image.setPalette(Buffer.fromHex(...))`. Indexed art retains its indices under
that global command instead of being remapped to asset colors. Malformed
palettes, unsupported Buffer construction and exceptional fixed Scratch
rendering paths retain named diagnostics.

Original/exported PXT comparisons cover duplicate RGB entries, mutable image
indices, final palette and complete screen colors, text expressions, skipped
branches and palette persistence after a child scene changes it. Native renderer
controls cover background/image/sprite/tile/speech layers, restored scene layers,
restart, peer isolation and atomic rejection. Code decompile/reimport and saved
SB3 preserve palette state. The vocabulary has 190 canonical forms; producer
dialect and unchanged consumer SPIKE artifact checks are separate gates.

At that checkpoint, remaining GUI work included a project-wide palette picker and preview, graphics-editor
project palette mode, and clear distinction between asset colors and the global
palette command. Editing a per-artwork palette does not change an existing
project-wide command. Hex Code/Blocks authoring exists, but friendly palette
authoring and a fresh production/controller/graphics browser journey remain
unqualified. Additional Buffer-building APIs and palette-extension operations
remain open; this slice does not establish palette behavior for unsupported
effects or dialogs. Hosted exact-head checks remain required before integration.

At source `7f40190489bd5ef8c974f7399666dc46c7a3e5d5`, 62 affected checks pass
with zero failures/skips. Producer dialect qualification passes 233 checks
without skips at `de2ac6ce`.

Fresh import-only remeasurement of the same 184 hash-verified original inputs
remains 102 translated, 81 partial and 1 malformed, with no changed diagnostic
rows. This count does not establish runtime or full roundtrip compatibility.
[Receipt](receipts/2026-10-09-arcade-project-palette.json).


### Project palette graphics authoring — 2026-10-09

The graphics palette panel now has sixteen project color controls, presets,
artwork-color copying, reset, a preview and explicit Apply. Index zero controls
opaque Arcade screen background; artwork index zero remains transparent.
Project preview recolors the canvas and brush swatches without changing image
indices or the artwork palette. Closing the panel restores artwork colors.
Artwork saving, PNG and spritesheet export retain the artwork palette.

Apply persists a normal `arcade_setPalette` startup block and updates the live
Arcade palette without starting the game. Existing constant startup commands
are updated in place. Later commands are preserved and identified in the panel.
Multiple startup palettes, expressions, stale project edits and failed extension
loads reject rather than replacing authored code. Code decompile, saved SB3,
Arcade export and original PXT execution are qualified separately from layout.
Scratch costumes retain their artwork colors; fixed Scratch rendering/export
limitations remain diagnostic and are not repaired by this picker.

A fresh isolated React-component browser check covers EN/DE controls, preview,
saved real Blocks, concurrent-edit rejection and button text fitting. It uses
recorded live primitive calls; it is not full application/runtime evidence.
The existing controller journey passes in the prior qualified reference bundle.
The production graphics browser gate now exercises palette controls and restart,
but its fresh hosted result remains required. Inherited hosted build/focused
mirror failures, controller setup race and browser dependency-install failure
are preserved. See [the source and qualification receipt](receipts/2026-10-09-arcade-project-palette-gui.json).

Remaining: fresh full-app palette/controller/graphics and exact-head hosted
qualification; fixed Scratch rendering/export interoperability; additional
Buffer-building and palette-extension APIs; effects/dialog behavior outside
existing controls. The original 184-input census remains the previous measured
102 translated, 81 partial, 1 malformed; this GUI change does not establish a
new census or zero remaining gaps.


### Indexed template clone palette lifecycle — 2026-10-09

Global palette changes now load readable indexed artwork for existing Arcade
template clones and recolor them without changing source costumes, geometry or
indices. Clones created after a startup palette immediately render in its colors.
Costume changes retain that palette; repeated updates reuse skins and destruction
and restart dispose them. Unreadable vector art remains unmodified. Runtime-only
palette sources use the Arcade runtime; the rendering diagnostic now recognizes
its `arcade create template` command.

The prior simple-template export failure was a headless evidence error: a
callback looked up original creator assets by changed VM asset IDs, triggering
placeholder artwork and its size diagnostic. Export with the current VM costume
asset bytes has no unsupported entries. This corrects that interpretation while
preserving the original failure. Genuinely authored template/image size mismatch
still remains diagnostic. Template palette adoption was independently missing
and is implemented here; ordinary Scratch artwork retains its artwork colors.

At source `cdb3a75d7777bf96f514e9ba6b407618aa6ff938`, 52 affected checks
pass with no failures/skips. Controls include real renderer skin attachment and
cleanup, Code/SB3 roundtrips and original/exported PXT screen/palette equality.
Fresh import-only remeasurement of all 184 hash-verified original inputs remains
102 translated / 81 partial / 1 malformed, with zero changed diagnostic rows.
The richer full audit adds existing Code-to-Blocks empty-body warnings on four
rows; it is a different qualification boundary, not a new translator regression.

Visible controller checks for recoloring an existing clone and creating another
under the active palette are added to the production browser gate. Fresh hosted
execution is pending; prior reference bundle results cannot qualify this source.
Broader Buffer/palette-extension/effect/dialog support and the original partials
remain open. See [the receipt](receipts/2026-10-09-arcade-template-palette.json).
