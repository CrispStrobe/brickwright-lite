# StringArray Settings

The Settings read/write blocks expose a fixed `StringArray` type choice. Code uses
`arcade read setting ("key") type StringArray` and the corresponding write word;
array reporters remain connected to the write value input.

Portable MakeCode source uses `bwStringArraySettings.read(key)` and
`bwStringArraySettings.write(key, values)`. Export includes the independently
authored MPL-2.0 helper as `bw-string-array-settings.ts`, referenced by `pxt.json`.
Its canonical source is `src/compat/arcade-string-array-settings.ts`. Regenerate
both runtime and importer source receipts with
`node scripts/generate-arcade-string-array-settings.mjs`; `--check` detects drift.
Only that exact owned source is admitted as a native replacement. Altered source
is translated and diagnosed. No BetterSettings package or unverified-license
source is bundled or generally admitted.

## Storage behavior

The helper uses the retained licensed PXT Settings numeric-array codec, packing
UTF-16 code units separated by numeric `-1`. Unicode surrogate halves are retained.
Missing keys return `undefined`. Reads return detached arrays. Empty arrays and a
single empty string share an empty encoding and both read as an empty array;
two empty strings encode one separator and read as two entries. These details
were derived from private black-box API/storage observations of the original
package, without reading or copying its implementation. This is an implementation
method description, not certification of training-data independence or an
entire clean-room process.

Malformed buffers retain the licensed numeric decoder's behavior, including
zero-filled truncated numeric operands and named errors for rejected type tags.
Null arrays/elements fail; the native block also rejects foreign array references
and non-string elements. Exact malformed-program thread termination is outside
this qualification; storage decoding and its error boundary are covered.

## Qualification and remaining GUI work

`test/makecode-arcade-settings-string-array.test.mjs` checks observed bytes,
missing/empty values, alias isolation, malformed inputs, actual native menu
metadata, and original MakeCode/native/Code/same and fresh SB3/export/reimport
execution. The producer's `test/arcade-settings-string-array.test.mjs` checks
fixed menus and connected reporters through Code and fresh SB3 serialization.
These checks establish this bounded API; they do not qualify a whole corpus game.

A hosted full-editor journey must still exercise selecting `StringArray` in the
visible block palette and menu, editing a string array, saving/reopening, and
exporting. Menu metadata and serialized connected blocks are already tested;
full-editor discoverability remains an explicit GUI gap.
