# Arcade Image circle drawing

## Ownership and source contracts

The Arcade integration lane owns circle drawing on mutable Image values and
Sprite images, its native Blocks commands, canonical Code vocabulary, import,
current-block export and portable project routes. The class callback lane owns
managed class descriptors and callable receiver frames; these operations must
not widen that separate admission gate. Live Font references remain a later
separate slice.

Primary sources are the MIT Microsoft PXT image helpers and simulator:
[image helpers](https://github.com/microsoft/pxt-common-packages/blob/v14.1.4/libs/screen/image.ts),
[simulator image operations](https://github.com/microsoft/pxt-common-packages/blob/v14.1.4/libs/screen/sim/image.ts).
Use the pinned SDK's actual bytes and retain its Microsoft copyright and MIT
notice. Current upstream source is context; actual behavior must come from the
selected original SDK and immutable qualification inputs.

The authentic MIT Sprite Utils dependency calls these methods:
[Sprite Utils v0.3.1](https://github.com/jwunderl/arcade-sprite-util/blob/v0.3.1/spriteutils.ts).
Supporting its drawing wrappers alone does not qualify the entire extension.

## Required implementation

- Add `drawCircle` and `fillCircle` with center x/y, radius and color inputs on
  existing Image references and Sprite images. Radius is its own editable input.
- Preserve mutable Image identity, alias visibility and Sprite presentation.
- Use native fixed operation fields with canonical producer descriptors and
  matching Blocks dropdowns. Reject malformed operations and argument counts.
- Export the actual current command inputs to the four-argument Image methods;
  reimport reconstructs the same operations. Preserve typed Image parameters.
- Preserve the selected original's coercion, clipping, radius-zero, negative and
  fractional-radius behavior. Determine pixel color conversion from actual
  original outputs, including values outside the usual palette.

## Acceptance

An immutable fixture measures complete pixel arrays for outline/fill, clipping,
zero/negative/fractional radius, input coercion and alias mutation in the actual
original simulator. Native, Code reconstruction, same/fresh saved SB3, edited
Blocks inputs, export and reimport must match those arrays. The graphics editor
must retain authored source pixels separately from live image mutations.

Canonical supplier changes need exact-head checks and normal adoption; generated
pixel source must pass its source-integrity check. Installed browser authoring
and visible canvas pixels remain a separate required qualification. Whole
StatusBar, Sprite Utils and game promotion still need their full dependencies,
callback behavior and presentation qualified.


## Reached pixel checkpoint

The selected original simulator passes 57 cases plus three alias/clone images:
4,860 complete measured pixel values. These include clipped and fractional
centers, outline integer-radius coercion, fill fractional-radius behavior,
zero/negative radii, bounded primitive coercions and colors outside the usual
palette. Rectangle/line comparison cases confirm the same eight-bit pixel
color conversion. The generated native pixel operations match this matrix;
source integrity and the existing clipped drawing control also pass.

Two explicit canonical commands are merged through
[sb3-creator PR146](https://github.com/CrispStrobe/sb3-creator/pull/146).
All four enabled exact-head checks passed; the declared Pages job skipped.
494 affected producer controls pass on the composed supplier source. Reviewed,
predicted and landed trees match. The consumer adopts merge
`7f74d75f3a574b5f74b5c62351326cd5d2e64c2a` through the normal three-way sync,
retaining its existing STM32 changes and all other dependency pins. The generated
vocabulary has 393 canonical commands and 398 spellings including aliases.

Three focused native pixel, Blocks-schema and import controls pass. The full
portable control additionally passes native execution, Code reconstruction,
same-session and fresh-session saved SB3, executed MakeCode export and reimport.
The exported program exactly matches the actual compiler input. Its 60 Images
match all 4,860 complete original pixels, including aliases and clones. All nine
SDK/bridge guards remain unchanged. A separate edited standard radius input
control passes: Code, saved-project execution and exported source use radius
three and match the selected original radius-three pixels.

The initial full-route probe failed because its observer read the extension
wrapper instead of the native instance and then formatted a large VM object.
A later ownership check exposed the shared dispatch service name after another
VM loaded. The corrected observer captures each actual native instance
immediately and checks its runtime owner across reloads. Preserve these failures;
they do not establish a drawing implementation fault or authorize SDK changes.

Visible browser authoring and graphics-editor journeys remain pending. These
focused controls do not admit a whole extension or game.
