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

The iPad pixel workspace follows the tool/settings separation in the
[Pinta workspace](https://www.pinta-project.com/user-guide/overview/) and the
on-demand panels in [Krita's dockers](https://docs.krita.org/en/reference_manual/dockers.html).
Only two control rows stay above the canvas: recognizable 44-pixel icon tools
and a palette strip. Undo, redo, layers, frames, options and save stay visible
at narrow widths while the tool strip scrolls. Layer, frame, palette and file
settings open over the canvas and close without changing the artwork. The
converted-costume warning and save status sit over the canvas instead of
claiming permanent rows. Tool buttons retain localized accessible names.

The shared vector/bitmap workspace now keeps file actions reachable at tablet
widths, gives its drawing tools 44-pixel targets, scrolls command and settings
strips independently, and lets the properties panel float over the canvas on
a narrow screen. Both modes can enter and leave a canvas focus view by touch;
Escape also leaves that view. Bitmap rectangle, lasso and wand selection use
icon buttons with localized names. The bitmap brush has adjustable opacity;
its semitransparent pixels are stored in the ordinary PNG and survive SB3
save/reopen. This follows Pinta's icon toolbox and tool
settings bar and Krita's canvas-only view without changing how Scratch stores SVG
or PNG costumes.
The bitmap toolbar now exposes the canvas colour sampler beside the brush, with
one-tap sampling and a touch-sized cancel control. Fine, medium, broad and light
brush presets set size and opacity together while both remain adjustable. On desktop, holding Space
while dragging pans either vector or bitmap canvas without marking the costume;
trackpad wheel pan and pointer-centred zoom remain available.

This is a workspace improvement, not raster/vector feature parity. The next
capability gates are: (1) vector node operations such as join/split and
asymmetric handles that survive SB3 save/reopen; (2) bitmap layer rename,
locking, crop and richer compositing; (3) per-stroke opacity compositing and
colour history. Bitmap selections can already move, resize and rotate through
the properties panel; 90° turns are now in the Select toolbar for touch use.
Each gate needs desktop and iPad tests and must preserve the ordinary costume asset
for older Scratch readers.

The vector toolbox now has a pen. Tap/click to place corner nodes, drag a node
to create symmetric Bézier handles, tap the first node to close, or use the
contextual finish icon/Enter to keep a path open. Escape cancels a draft and
switching tools commits it. The browser gate verifies curved SVG output,
SB3 save/reopen, and iPad tap interactions. The reshape toolbar exposes
open/close operations for one selected SVG
path. They change the path's topology in Paper and save as an ordinary SVG
path, so an older Scratch reader can still display it. The browser gate draws
a path, opens it, saves/reopens the SB3, then closes it again. Node movement,
handle adjustment and adding a node on a curve were already present in the
reshape tool. The reshape toolbar now splits a path at one selected node and
joins two open paths at a shared endpoint. A split closed path opens at that
node; splitting an open path creates two editable SVG paths with their new
ends selected for an immediate join. The browser gates check Bézier geometry,
undo/redo, SB3 save/reopen and touch use. An on-screen Independent handles toggle
now lets touch users move one Bézier handle without moving the opposite handle;
Option-drag remains available on desktop. A browser gate verifies mouse and
finger drags, the untouched handle, and asymmetric SVG after SB3 save/reopen. Reshape double-click detection
also checks click position so a quick handle grab cannot move the whole path.

The bitmap editor now keeps separate full-size PNG layers. The compact layer
strip selects the paint target and can add, delete, reorder, rename, lock, hide and fade
layers. Locking the active layer moves the paint target to an unlocked layer;
switching layers commits a floating bitmap selection to its original layer.
The source document records their order, names, locks, visibility, opacity and active
layer; the SB3 stores each layer PNG under `brickwright/layers/` and still gives
Scratch one flattened PNG costume. Loading restores the editable layer stack,
including its name when only one layer remains.
The browser gate paints one layer, saves/reopens, paints another, and proves
that each layer's pixels remain unchanged when the other is edited. It also
checks that visibility and opacity affect the flattened costume and that the
add control works by touch on an iPad-sized viewport. Further layer-aware
selection transforms and masks remain ahead.

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
- Pixel art can use the default Arcade palette, choose any of the 11 preset
  palettes from MakeCode Arcade's Asset Editor, edit its 15 colours, or import
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
3. **Vector core.** Keep named groups and text editable. Improve
   gradient/stroke controls and precise transform handles. Use the source layer
   tree as the authority; render it deterministically to SVG. Test node edits
   survive save/reopen and match the Scratch stage preview.
4. **Raster core.** Expand the new lasso and wand selectors into layer-aware
   selection, move/transform/crop and
   eyedropper. The existing sampler is directly reachable from the bitmap
   toolbar; crop and richer selection transforms remain. Keep layer pixels separately in source and generate a flattened
   PNG for Scratch. A save/reopen test must prove that painting one layer does
   not destroy another.
5. **Pixel and animation.** Improve timeline thumbnails and palette switching feedback.
   Frames can now be named and added as ordinary Scratch costumes; each has its
   own SVG render and editable pixel source while the original animation stays
   intact. Next, test timeline gestures on iPad.
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
| Foreground/background colours, swap, colour replace and outline | Two colour slots with touch selection, X/button swap and right-mouse drawing; selection-aware index-preserving replace and outline | Add colour-slot persistence across editor sessions |
| Palette presets and 15 editable colours | MakeCode Arcade's 11 built-in presets, editing and `.hex`/`.txt`/`.gpl` import use versioned source, Scratch rendering and Arcade export | Test preset selection and persistence on iPad |
| Animation timeline, frame order, interval, onion skin | Editable frames, optional names, thumbnails, duration, order, playback and onion skin use version 3 source; the active frame renders as the Scratch costume. Export adds separately named Scratch costumes with editable pixel source per frame. | Test touch interaction on iPad |
| Sprite-sheet and `img` import/export | Exact `img` literal paste/export, PNG export and horizontal transparent sprite-sheet PNG import/export exist | Add configurable palette conversion and animation metadata exchange |
| Tile and tilemap asset editing | Imported tilemaps are rendered as costumes | Add editable tile set/map source and Arcade-compatible export |

Custom palettes have a version 2 document unless the costume also has
animation frames, in which case it uses version 3. The ZIP entry path stays
stable, while its payload version follows the newest document present.
Older Brickwright treats the payload as future data and preserves it when the
rendered costumes are unchanged. Animation frames use version 3 documents; the
active frame is repeated in `layers` for the Scratch render, and all frames
remain in `animation.frames`.
Frame names are optional in version 3. Projects saved before names existed still
open with numbered frames, while new names survive SB3 save/reopen and label
exported Scratch costumes.
An Arcade `img` literal has only palette indices and transparent pixels, so
literal export is refused while a visible layer has partial opacity. This
prevents a flattened approximation from silently changing the artwork.
