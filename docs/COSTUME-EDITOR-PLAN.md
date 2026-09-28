# Costume editor: editable source and Scratch rendering

Brickwright projects remain ordinary `.sb3` archives. `project.json` names the
SVG/PNG costume assets that Scratch, TurboWarp, and older Brickwright read and
render. Brickwright also stores editable source in
`brickwright/artwork/v1.json`. This stable ZIP entry has versioned payloads
and documents; it never replaces
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
  adjustable square brushes, line, outline and filled rectangle and circle tools,
  index-preserving colour replacement and outline, rectangular and lasso
  selections, and a connected colour wand with adjustable tolerance. Selections
  can move or clear pixels on the active layer, copy/cut/paste into a movable new layer, arrow-key
  nudging, mirrored drawing, ordered pixel layers with
  visibility, locking, renaming, reordering, deletion and opacity, larger colour targets,
  selection-aware horizontal and vertical flips and quarter turns, a pan tool
  and two-pointer/pinch navigation. Whole-canvas rotation preserves all layers;
  a selected transform affects only the active layer. It renders translucent visible layers
  into the Scratch SVG while retaining every layer's palette indices in editable
  source. It also exports a transparent PNG from the current layer stack. The
  drawing and interaction contract still needs a real iPad and trackpad pass.
- Pixel art can use the default Arcade palette, edit its 15 colours, or import
  a 15/16-colour `.hex`, `.txt` or GIMP `.gpl` palette. Indexed
  pixels remain unchanged when a colour changes. Custom palettes use a version
  2 source document and render into Scratch SVG; default palettes keep version
  1 documents. Arcade project export writes the selected colours to `pxt.json`
  and retains exact `img` indices. If costumes use different palettes, export
  maps them to one project palette and reports the colour conversion.
- A pixel costume can hold up to 64 editable animation frames with per-frame
  duration, order, thumbnail, playback preview and onion-skin preview. The active frame's
  SVG remains the ordinary Scratch costume asset. Other frames live in a
  version 3 artwork document and reopen with their individual layers. A
  horizontal transparent PNG sprite sheet can be exported. A PNG sheet can be
  previewed as rows of frames and imported into the editable timeline after
  palette matching. Exporting frames as separate costumes remains future work.
- Archive tests cover round-trip preservation, stale source rejection and
  future-version pass-through. A browser gate checks layer visibility and
  persistence across SB3 save/reopen, lasso and wand selection, plus mouse,
  keyboard, trackpad and touch interactions. The GUI build is the integration
  gate. Scratch Paint's regular bitmap mode now also offers rectangle, lasso,
  and connected-colour wand selection. Its lifted selection keeps transparent
  pixels outside the mask untouched, and the wand has an adjustable tolerance.

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
   expand the new lasso and wand selectors into layer-aware selection, move/transform/crop, brush size/opacity and
   eyedropper. Keep layer pixels separately in source and generate a flattened
   PNG for Scratch. A save/reopen test must prove that painting one layer does
   not destroy another.
5. **Pixel and animation.** Add palette presets and improve timeline thumbnails.
   Export frames as costumes without hiding
   animation-only data in Scratch's render asset.
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
| Pen, eraser, fill, line, rectangle, circle, eyedropper, marquee, pan | Available, including brush sizes 1–8, filled shapes, marquee copy/cut/paste, and keyboard tool shortcuts | Test selection and toolbar interaction on iPad |
| Flip and quarter-turn, with selection scope | Available, with touch buttons, undo, and arrow-key selection moves | Test on iPad |
| Foreground/background colours, swap, colour replace and outline | Foreground colour, selection-aware index-preserving replace and outline | Add secondary colour and swap |
| Palette presets and 15 editable colours | All 15 colours can be edited or imported from `.hex`/`.txt`/`.gpl`; version 2 source, Scratch rendering and Arcade export use them | Add built-in presets |
| Animation timeline, frame order, interval, onion skin | Editable frames, thumbnails, duration, order, playback and onion skin use version 3 source; the active frame renders as the Scratch costume | Export frames as costumes and test touch interaction on iPad |
| Sprite-sheet and `img` import/export | Exact `img` literal paste/export, PNG export and horizontal transparent sprite-sheet PNG import/export exist | Add configurable palette conversion and animation metadata exchange |
| Tile and tilemap asset editing | Imported tilemaps are rendered as costumes | Add editable tile set/map source and Arcade-compatible export |

Custom palettes have a version 2 document unless the costume also has
animation frames, in which case it uses version 3. The ZIP entry path stays
stable, while its payload version follows the newest document present.
Older Brickwright treats the payload as future data and preserves it when the
rendered costumes are unchanged. Animation frames use version 3 documents; the
active frame is repeated in `layers` for the Scratch render, and all frames
remain in `animation.frames`.
An Arcade `img` literal has only palette indices and transparent pixels, so
literal export is refused while a visible layer has partial opacity. This
prevents a flattened approximation from silently changing the artwork.
