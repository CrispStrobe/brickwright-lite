# SpriteFlag.ShowPhysics

The Arcade extension supports `sprite.setFlag(SpriteFlag.ShowPhysics, true)` and the existing native flag block's **ShowPhysics** choice (mask 64). Its raster layout follows the selected Arcade 4.2.1 SDK's MIT-licensed [Sprite.drawDebug](https://github.com/microsoft/pxt-common-packages/blob/master/libs/game/sprite.ts). The selected original target identifies [commit 2d7d59b](https://github.com/microsoft/pxt-arcade/commit/2d7d59b5226e8a1a1e05e8042dd9f5248ed68fea); retain the bundled SDK's exact source and existing PXT notices when reviewing this profile.

Coordinates use the original font5 at the sprite's floor-rounded draw position, below its height with a two-pixel margin. Values use the original `>> 0` truncation. Nonzero velocity adds a `v` row; nonzero acceleration adds an `a` row. Subsequent rows move left by one font character and down by font height plus two. Font glyphs come from the existing licensed PXT image-print bridge, without invented approximations.

The overlay follows sprite visibility, camera-relative drawing, logical screen culling and the sprite's z/id ordering. It draws immediately after its owner, so a later sprite at the same z can cover the text. The actual renderer uses the existing managed overlay path. One reusable raster and write mask belong to each sprite that has drawn this flag; rendering does not create image handles on each frame. Overlay drawables and skins are removed when the overlay stops being live or its sprite is destroyed.

## Bounded evidence

`test/makecode-arcade-show-physics.test.mjs` compares all 19,200 presented original pixels with the native composed frame for stationary coordinates, velocity plus acceleration, acceleration alone, camera positioning, RelativeToCamera, Invisible, a later sprite at the same z and offscreen culling. It also checks raster reuse without image-handle growth and managed renderer drawable reuse, z updates, disable and destruction cleanup.

These are original/native raster and renderer API controls. They are not an executed hosted full-IDE authoring or physical display qualification. Matching producer and consumer fixed-menu vocabulary must be adopted before Code/Blocks/SB3 qualification; a menu label in runtime metadata alone is insufficient.

`game.debug` hitbox rectangles and a complete debugger interface remain separate work. This flag does not claim those features or qualify every writable raw sprite flag, unknown bit or nonfinite mask. Direct writes to `.flags` and their source/export semantics are owned by the separate flags implementation.


## Renderer owner correction

Source `5cc3f939c` corrects a genuine drawable-order defect. Debug raster caches
use synthetic source keys; GPU ordering now uses each layer's actual scene
sprite owner, matching CPU composition. The cache key, raster, skin and drawable
remain reusable. The overlay follows its owning sprite in the scene order.

The original renderer regression and a new paired-sprite render-boundary control
pass, along with nine clone and scene-order controls. Independent native
controls additionally cover same-z pairs, repeated resource reuse, rendering
reentry, selective visibility/destruction cleanup and real particle sources.
The pre-fix failure is retained. These renderer API checks do not qualify
installed GUI/GPU pixels; a matching hosted browser result remains required.
