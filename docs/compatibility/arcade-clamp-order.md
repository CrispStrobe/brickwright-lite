# Ordered MakeCode clamp

`arcade clamp minimum (min) maximum (max) value (value)` is a Number reporter.
Its visible block, Code slots, and serialized inputs preserve the SDK's
minimum, maximum, value evaluation order. Imported `Math.clamp(min,max,value)`
uses this reporter; export writes the same API and argument order.

The selected SDK defines clamp as `Math.min(max, Math.max(min, value))`. Both
helpers select raw arguments with comparisons. Reversed bounds do not swap.
A NaN minimum or maximum can be ignored by selection, while a NaN value is
returned. Equal zero values retain the maximum argument's sign. Connected
primitive string, null and undefined inputs retain the observed SDK behavior;
numeric editor shadows are numbers. Reference argument conversion remains an
explicit unsupported diagnostic.

The former expression rewrite both reordered caller side effects and reversed
helper operands, changing NaN and signed-zero behavior. A dedicated operation
retains all three arguments once, in source order, and the actual helper choices.
It uses the existing primitive decoding and signed-zero export route described
in [the numeric contract](arcade-math-random.md). Locally authored negative-zero
shadows export through a nonfolded portable helper and survive reimport.

Primary source: [PXT 13.2.1 math helpers](https://github.com/microsoft/pxt/blob/v13.2.1/libs/pxt-common/pxt-helpers.ts).
The retained PXT MIT copyright/license notice remains in
`scratch-gui/static/licenses/pxt-core.MIT.txt`.

`test/makecode-arcade-clamp-order.test.mjs` checks actual original SDK execution,
three side-effecting arguments with order123, three mutating array-pop
reporter inputs in their actual VM evaluation order, fractional/reversed bounds,
NaN/raw primitive selection, zero signs, native/Code, same and fresh SB3,
original export, reimport, metadata order and refusal boundaries. The producer's
`test/arcade-clamp-order.test.mjs` checks independent ordered inputs, negative
bounds and connected reporters through Code and fresh SB3.

The frozen importer/decompiler census is checked without skipping unread lines,
warnings or moved graphs. These are bounded API and serialization controls;
they do not promote whole-game compatibility or establish a hosted full-editor
palette/controller journey. That GUI acceptance remains tracked separately.
