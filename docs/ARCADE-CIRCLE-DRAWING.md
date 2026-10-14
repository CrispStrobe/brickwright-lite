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
