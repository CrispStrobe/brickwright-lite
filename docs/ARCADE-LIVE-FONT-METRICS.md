# Arcade live font metrics

Status: proposed claim. Product implementation starts after this claim is merged.

## Selected source and boundary

The selected Arcade 4.2.1 package pins common packages 14.1.4 and PXT 13.2.1 in its [package declaration](https://github.com/microsoft/pxt-arcade/blob/2d7d59b5226e8a1a1e05e8042dd9f5248ed68fea/package.json). The immutable [screen text source](https://github.com/microsoft/pxt-common-packages/blob/31abf23d118f35010fb75122e60a1eb2b6dffe9f/libs/screen/text.ts) defines `Font.charWidth` and `Font.charHeight` as numeric fields. Its blob is `e30b7f61c9717e83c4e7ce2dbc500dc76dec51dd`, identical to the selected bundled source.

The font bindings are constant; their objects have mutable fields. Read the actual font objects used by the existing original text module and renderer. Do not replace a property read with a guessed constant or cache its numeric value. Preserve existing component notices and font attribution; this lane adds no glyph assets or broad licensing claim.

The initial scope covers direct, lexically unshadowed reads of `image.font5`, `image.font8` and `image.font12` numeric metrics. Font aliases, custom fonts, dynamic font selection, writes, multiplier/data inspection and other font APIs remain named unsupported boundaries until separately qualified. A shadowed `image` receiver cannot acquire SDK font authority.

## Portable authoring contract

Add a Number reporter `arcade_fontMetric` with fixed quoted `FONT` and `PROPERTY` fields. Canonical Code is:

```text
arcade font "font5" metric "charHeight"
```

`FONT` admits `font5`, `font8`, `font12`; `PROPERTY` admits `charWidth`, `charHeight`. Both are direct fields, with matching producer grammar, native metadata, decompilation and export. They are not text/menu input slots or dynamic reporters. Unknown or malformed selections receive explicit diagnostics rather than a fallback font, metric or zero.

Native reads delegate to the existing original text module's actual font object. Export emits the corresponding original property read. Scalar and primitive provenance may recognize only this proven SDK member; unknown, object and reference operands retain their guards. Known scalar source declaration/default handling must preserve reads before initialization without guessing types from names.

## Required controls

Compare all six builtin metrics against the selected original execution. Qualify source import, editable Blocks representation, Code decompilation, same and fresh SB3, exported original execution and reimport. Verify FIELD shapes directly, including invalid choices and connected-reporter refusal. Retain strict shadowed/opaque/reference negatives.

Use actual original/native image rendering with metric-derived text placement and compare all pixels, including Unicode where the selected font supports it. Editing the metric fields must survive Code and fresh SB3. Preserve actual artwork uploads/export inputs. Observe module lifetime through restart/project replacement and scene transitions; do not introduce clock, scheduler or pixel offsets. Focused metric controls do not qualify complete games or installed GUI journeys.

## Ownership

Own new font metric classification/helper/tests and narrow Arcade expression, scalar/primitive provenance, native reporter/getInfo/menu, export/type, canonical vocabulary/field and reviewed pin hunks. Coordinate source-reference/callable owners, the controller-repeat property lane and active converter/runtime owners. Do not edit their class, callback, scheduler, controller or reference lifecycle hunks. No product edits before the claim lands.
