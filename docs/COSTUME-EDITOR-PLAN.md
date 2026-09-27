# Costume editor: editable source and Scratch rendering

Brickwright projects remain ordinary `.sb3` archives. `project.json` names the
SVG/PNG costume assets that Scratch, TurboWarp, and older Brickwright read and
render. Brickwright also stores editable source in
`brickwright/artwork/v1.json`. It is an additional ZIP entry; it never replaces
or changes the Scratch assets. An older reader can ignore it.

The source document is upstream of a rendered costume. A document owns ordered
vector, bitmap, or indexed-pixel layers, with stable IDs, names, visibility,
locks and opacity. A layer may initially refer to an existing Scratch asset.
New edits may store SVG paths or indexed pixels independently. The saved source
record includes the `md5ext` of its downstream render. Loading uses a source
record only if it still matches `project.json` and its asset exists; otherwise
the SVG/PNG is opened as a one-layer legacy document. Unknown future source
versions are preserved when the rendered costumes are unchanged. A malformed
source entry must never prevent an otherwise valid Scratch project from opening.

## Current implementation

- Save and load paths in the browser and native project importer read/write the
  source entry. They leave `project.json` and the Scratch costume assets intact.
  The browser save writes artwork and other Brickwright state in one ZIP pass.
- Existing costumes acquire a one-layer source document. Vector edits store an
  editable SVG layer. The palette pixel editor stores dimensions, scale and
  individual palette indices; on reopen it reads those pixels from the source.
  Duplicating a costume or sprite carries its source into the new copy.
- The pixel editor has grouped stroke undo/redo, continuous pencil strokes,
  line, rectangle and circle tools, a rectangular selection that can move or clear
  pixels on the active layer, mirrored drawing, ordered pixel layers with
  visibility, locking, renaming, reordering, deletion and opacity, larger colour targets,
  selection-aware horizontal and vertical flips and quarter turns, a pan tool
  and two-pointer/pinch navigation. Whole-canvas rotation preserves all layers;
  a selected transform affects only the active layer. It renders translucent layers
  into the Scratch SVG while retaining each layer's palette indices in editable
  source. It also exports a transparent PNG from the current layer stack. The
  drawing and interaction contract still needs a real iPad and trackpad pass.
- Archive tests cover round-trip preservation, stale source rejection and
  future-version pass-through. A browser gate checks layer visibility and
  persistence across SB3 save/reopen, plus mouse, keyboard, trackpad and touch
  interactions. The GUI build is the integration gate.

## Next delivery slices

1. **Source/render transaction.** Replace the current per-editor callbacks with
   a single operation that updates the source document, renders SVG/PNG,
   updates the Scratch costume, then commits one undo step. Keep a rollback
   snapshot if rendering or storage fails. Cover deletion, reorder, project
   replacement and LMS wrapping. Add a browser
   test that saves and reopens both source and render.
2. **Interaction foundation.** Share pointer classification and view transforms
   across vector, bitmap and pixel modes. Mouse: click/select, wheel scroll,
   explicit zoom shortcut, space-drag pan. Trackpad: two-finger pan and pinch
   around the pointer. Touch: Pencil or one finger edits; two fingers pan/zoom;
   entering navigation cancels any partial stroke. Touch controls and handles
   need large hit areas; on-screen modifiers replace keyboard-only shortcuts.
   Test on macOS mouse/trackpad and iPad finger/Pencil, including resize and
   fullscreen transitions.
3. **Vector core.** Complete pen/path creation and node operations (smooth,
   cusp, join, split, open/close); keep named groups and text editable. Improve
   gradient/stroke controls and precise transform handles. Use the source layer
   tree as the authority; render it deterministically to SVG. Test node edits
   survive save/reopen and match the Scratch stage preview.
4. **Raster core.** Render ordered raster layers with transparency and opacity;
   add marquee/lasso selections, move/transform/crop, brush size/opacity and
   eyedropper. Keep layer pixels separately in source and generate a flattened
   PNG for Scratch. A save/reopen test must prove that painting one layer does
   not destroy another.
5. **Pixel and animation.** Add palette editing, frames and
   onion-skin preview. Export frames as costumes or
   a sprite sheet without hiding animation-only data in Scratch's render asset.
6. **Parity gate.** Run the same task corpus on desktop mouse, trackpad, iPad
   touch and Pencil: trace/edit curves, compose vector over paint, draw a
   palette sprite, save/reopen, and export SVG and transparent PNG. Every task
   must keep its editable source, preserve the rendered costume, and remain
   usable without a hardware keyboard on iPad.

The source schema is versioned. Changes to its meaning require a new version
and migration; broadening the editor must not make older `.sb3` projects
unreadable or silently discard source data from a newer Brickwright.

## MakeCode Arcade pixel-art parity

The target is the [MakeCode asset-editor shortcut contract](https://github.com/Microsoft/pxt/blob/master/docs/asset-editor-shortcuts.md)
and its [image, palette and sprite-sheet model](https://arcade.makecode.com/developer/images),
in addition to Brickwright's editable layers and `.sb3` compatibility. Track
these as separate capabilities so a familiar-looking toolbar does not conceal
missing data or export behavior.

| Capability | Brickwright status | Next work |
| --- | --- | --- |
| Pen, eraser, fill, line, rectangle, circle, eyedropper, marquee, pan | Available in the palette pixel editor | Add brush sizes, filled shapes, marquee copy/paste and keyboard tool shortcuts |
| Flip and quarter-turn, with selection scope | Available, with touch buttons and undo | Test on iPad and expose arrow-key selection moves |
| Foreground/background colours, swap, colour replace and outline | Foreground colour only | Add secondary colour and index-preserving replace/outline operations |
| Palette presets and 15 editable colours | Default palette only | Introduce a versioned palette source with migration; render and Arcade export must use the same palette |
| Animation timeline, frame order, interval, onion skin | Not yet available | Preserve frames in editable source and export them as costumes or sprite sheets |
| Sprite-sheet and `img` import/export | Exact `img` literal paste/export and PNG export exist; pasted images become new layers | Add sprite-sheet slicing preview and sheet export |
| Tile and tilemap asset editing | Imported tilemaps are rendered as costumes | Add editable tile set/map source and Arcade-compatible export |

Palette and frame data need a source-format migration. Adding these fields to
the v1 document without changing its version would let older Brickwright
silently reinterpret edited colours or frames, even though Scratch itself
would still render the saved SVG or PNG correctly.
An Arcade `img` literal has only palette indices and transparent pixels, so
literal export is refused while a visible layer has partial opacity. This
prevents a flattened approximation from silently changing the artwork.
