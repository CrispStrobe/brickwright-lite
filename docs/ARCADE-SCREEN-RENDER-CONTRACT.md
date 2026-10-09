# Arcade screen and render callbacks: implementation contract

Status: initial S01 background/sprite foundation implemented at `3f6ad084c`.
Five original PXT full pixel planes and19 affected checks pass. Tilemaps,
renderables, HUD, speech and effects are still missing from this raster.
No screen snapshot or paint/shade support claim.
Prerequisite implementation: native Image.scroll and Image.copyFrom, with
original-PXT pixel comparisons and dedicated editable Blocks/Code words.

## Source observations

Reviewed the bundled original PXT Arcade target's `game/game.ts`,
`game/scene.ts` and `screen/targetoverrides.ts` sources. `onPaint` and `onShade`
create renderables with z=-20 and z=80. Tilemaps use z=-1, ordinary sprites
z=0 and HUD z=100. Scene rendering sorts all sprites/renderables by z and then
creation ID. Arbitrary sprite z can therefore place a sprite before paint or
after shade. Rendering is frame priority90, after update20 and pre-render55;
diagnostics150 and screen presentation200 follow it. The screen is a mutable
indexed Image rather than a snapshot of the scene background.

These observations come from the default Arcade game package. The alternate
`game---light` package registers different frame handlers; it needs a separate
profile if imported. Do not silently claim both scheduling models.

## Required architecture

1. Keep an authoritative160x120 indexed screen image with stable handle and
   pixel-buffer identity. `screen.clone()` copies its actual current pixels;
   it must include frame content and must not return backgroundImage().
   Calls outside the rendering pass read the current screen, not a recomposed
   future frame. Preserve the original global-screen lifecycle across scenes.
2. Render background colour/image, tilemap, sprites and callback renderables
   into that image. Reuse qualified native pixel/scale/rotation operations.
   Keep palette indices authoritative; RGB canvas readback loses index identity
   when palette colours coincide. Use one scene draw list sorted by z/id.
3. Invoke paint/shade callbacks synchronously at their draw-list positions.
   Preserve callback registration order, closure captures, scene suspension,
   scene replacement, handler additions during a frame and yielded execution.
   Define them through original execution tests rather than assuming update
   callback semantics or always drawing paint before every sprite.
4. Present completed indexed frames in the device view. Prevent duplicate
   native sprite/background rendering when the frame path is active. Keep
   collision, physics and sprite authoring tied to their native scene objects.
5. Include HUD, speech and effects in screen pixels with original ordering.
   Qualify camera offsets and RelativeToCamera, custom palettes, transparent
   pixels, tile padding, scaled/rotated sprites and out-of-bounds clipping.
   Unsupported screen dependencies must retain named diagnostics until covered.

## Authoring surfaces and acceptance

| Surface | Required capability | Acceptance evidence |
| --- | --- | --- |
| Runtime | Mutable screen handle and clone; screen image operations | Original PXT pixel planes at startup, before/during/after drawing and across scenes |
| Blocks | Screen image reporter; paint/shade events with editable bodies; renderable z inputs | User-authored callbacks survive editing, saved SB3 and execution |
| Pseudocode | Explicit screen reporter and render callback registrations | Shared producer vocabulary, decompile and exact callback semantics |
| MakeCode | screen calls and game.onPaint/onShade; typed renderable handles as implemented | Export compiles and executes in original Arcade; export/reimport permutations preserve observations |
| Graphics | Existing indexed artwork can be drawn into the screen; palette indices survive | Real asset chooser/editor flow, duplicate palette colour indices and saved project restart |
| Controller/device | Actual rendered frame updates after controller callbacks | Playwright native import, Code to Blocks, controller pane, frame pixels and screenshots |

## Ordered closure plan

- S01: background/sprite foundation implemented and compared against five
  original19200-pixel planes. Finish tilemaps and all supported scene content;
  do not
  expose snapshots until it passes original pixel comparisons.
- S02: screen Image handle and cloning, including image mutation/copying.
- S03: renderable identity, sorted callback execution and paint/shade events.
- S04: text/HUD/speech/effects composition and remaining screen Image methods.
- S05: recover the unchanged racing and painting corpus sources, run controller
  journeys, roundtrip Code/Blocks/MakeCode/SB3 and remeasure all184 input hashes.

Each slice needs runtime and authoring evidence. Import-only classification is
separate from runnable game compatibility. This contract is not implementation
or qualification evidence; the74 partial imports remain open.
