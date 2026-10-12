# Buffer import integration contract

Read this after `ARCADE-AGENT-HANDOFF.md`, `ARCADE-PARTIAL-CLOSURE-PLAN.md`
and the current `LANES.md`. Buffer runtime/export authoring exists in PR810;
E10 retains importer and expression/type-lowering ownership. This contract is
preparation, not a claim that namespace Buffer imports already work.

## Sources and implementation entry points

- Original PXT algorithms: https://github.com/microsoft/pxt/tree/v13.2.1/pxtsim
- Original MIT notice: https://raw.githubusercontent.com/microsoft/pxt/v13.2.1/LICENSE
- Candidate integration: https://github.com/CrispStrobe/brickwright-lite/pull/810
- Canonical authoring producer: https://github.com/CrispStrobe/sb3-creator/pull/96
- UTF8 construction producer: https://github.com/CrispStrobe/sb3-creator/pull/97
- Readonly Boolean producer: https://github.com/CrispStrobe/sb3-creator/pull/98
- Concat/equality/search producer: https://github.com/CrispStrobe/sb3-creator/pull/99
- Number-format size producer: https://github.com/CrispStrobe/sb3-creator/pull/100
- Number-array/static-concat producer: https://github.com/CrispStrobe/sb3-creator/pull/101
- Common-package helpers: https://github.com/microsoft/pxt-common-packages/blob/master/libs/base/buffer.ts
  (exact consumed source is the pinned Arcade target bundle; generated output records complete/selected source hashes).
- Arrays fallback: https://github.com/CrispStrobe/extensions/pull/34

Repository paths:

- `scripts/generate-arcade-buffers.mjs`: exact extraction/regeneration and hash.
- `scripts/generate-arcade-buffer-helpers.mjs`: pinned concat/equality/search and format-size functions with checked indexed-read adaptation.
- `overlay/scratch-vm/src/extensions/crispstrobe/arcade/buffer-helpers-pxt.js`: generated common-package helpers.
- `overlay/scratch-vm/src/extensions/crispstrobe/arcade/buffer-pxt.js`: generated original algorithms.
- `overlay/scratch-vm/src/extensions/crispstrobe/arcade/buffer.js`: bounded mutable host facade, dynamic hex and readonly literal construction.
- `overlay/scratch-vm/src/extensions/crispstrobe/arcade/index.js`: native Buffer blocks and scoped heap.
- `overlay/scratch-vm/src/extensions/crispstrobe/arcade/music.js`: shared Buffer song bridge.
- `overlay/scratch-vm/src/util/bw-values.js`: Buffer reference identity and scope.
- `overlay/scratch-gui/src/lib/arcadeDialect.js`: canonical Blocks/Code words.
- `overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js`: importer; E10 owns changes.
- `overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js`: existing Buffer export and constraints.
- `overlay/scratch-gui/src/lib/bw-makecode/value-type-graph.js`: Buffer is recognized in the two atom whitelists.
- `docs/generated/ARCADE-AUTHORING-VOCABULARY.md`: full spelling and opcode inventory.

## Lower existing AST expressions to native values

Use genuine Buffer values, never a string substitute for shared mutable storage.
The parser already represents tagged hex as `Template` with `tag === 'hex'`.
The current `music.createSong` importer accepts inline literals or an immediate
`Buffer.fromHex` call; it still diagnoses arbitrary Buffer variables. Preserve
named-song resource metadata on the existing inline/resource route.

| Original API | Native opcode | Required value semantics |
| --- | --- | --- |
| `control.createBuffer(size)` | `arcade_createBuffer` | Fresh mutable buffer |
| `Buffer.fromUTF8(text)` / `control.createBufferFromUTF8(text)` | `arcade_bufferFromUTF8` | Fresh mutable UTF8 bytes; original surrogate replacement, byte bound before encoding |
| `Buffer.fromHex(text)` | `arcade_bufferFromHex` | Fresh mutable decode; preserve odd-length original behavior |
| `hex` tagged template | `arcade_bufferLiteral` | Readonly literal; same source site reuses identity, different sites stay distinct |
| `buffer.isReadOnly()` | `arcade_bufferIsReadOnly` | Original Boolean readonly state; aliases retain it, detached slices become mutable |
| `buffer.concat(other)` | `arcade_bufferConcat` | Detached fresh mutable result; bound combined allocation before creation |
| `buffer.equals(other)` | `arcade_bufferEquals` | Original content equality Boolean; explicit null equality is supported by runtime, foreign/stale references still diagnose |
| `buffer.indexOf(other)` | `arcade_bufferIndexOf` | Original first byte-match index / -1, including empty needles and out-of-range zero reads |
| `Buffer.fromArray(numbers)` | `arcade_bufferFromArray` | Fresh mutable bytes; numeric array remains detached; original byte coercion |
| `buffer.toArray(format)` | `arcade_bufferToArray` | Fresh scoped number array; all16 formats; ignore trailing incomplete numbers |
| `Buffer.concat(buffers)` | `arcade_bufferConcatArray` | Fresh mutable detached buffer; readonly inputs stay untouched; total-byte bound |
| `buffer.length` | `arcade_bufferLength` | Byte count, not Scratch string length |
| `buffer[index]` | `arcade_bufferGetByte` | Original byte read and bounds |
| `buffer[index] = value` | `arcade_bufferSetByte` | Mutate shared storage; evaluate receiver/index/value once in source order |
| `Buffer.sizeOfNumberFormat(format)` | `arcade_bufferFormatSize` | Original16 format sizes; dynamic enums and invalid numeric formats return original zero |
| `buffer.getNumber(format, offset)` | `arcade_bufferGetNumber` | All16 original integer/float formats |
| `buffer.setNumber(format, offset, value)` | `arcade_bufferSetNumber` | Original byte order, signedness and static-buffer behavior |
| `buffer.slice(offset, length)` | `arcade_bufferSlice` | Detached copy; second argument is length |
| `buffer.write(offset, source)` | `arcade_bufferWrite` | Shared source, overlapping writes retain original behavior |
| `buffer.fill(value, offset, length)` | `arcade_bufferFill` | Preserve original defaults and clipping |
| `buffer.shift(amount, offset, length)` | `arcade_bufferShift` | Original shift direction/range |
| `buffer.rotate(amount, offset, length)` | `arcade_bufferRotate` | Original rotation direction/range |
| `buffer.toHex()` | `arcade_bufferToHex` | Encode current bytes |
| `buffer.toString()` | `arcade_bufferToText` | Decode UTF8 from current bytes |
| `music.createSong(buffer)` | `arcade_songFromBuffer` | Song keeps the actual buffer; later mutation affects playback |

The canonical FORMAT slot is a reporter input with a native `bufferFormats`
dropdown. Lower named `NumberFormat` members to the menu, preserving the exact
original enum values for dynamic reporters. Numeric strings arriving from the
Scratch string slot must resolve to numeric enum IDs, not reverse enum labels.
Neither `NumberFormat` nor `Buffer` may bypass local shadowing checks.

## Scope, typing and initialization

1. Record a Buffer type for namespace/global/local declarations, procedure
   arguments/results and array elements. Distinguish indexed Buffer byte access
   from ordinary reference-array access. Preserve aliases through assignments,
   closures, custom blocks and arrays; a copied slice gets a separate identity.
2. Namespace constants containing hex are executable initializer values, not
   image resources or guessed strings. Retain namespace names, declaration
   order, referenced initializers and once-only initialization. Honor shadowing.
3. Route Buffer operations after receiver type resolution. Unknown receivers,
   unsupported constructors/formats and unsupported syntax keep named diagnostics.
   Do not promote a program merely because its bytes were extracted as a constant.
4. Preserve readonly versus mutable construction by the original operation;
   the original numeric/byte methods themselves define their exact static checks.
5. Native heap references are per project run. Project load/start/disposal drops
   the heap; serialized references cannot revive it. Source reconstructs values
   when the program runs. Export discards matching Buffer sidecar placeholders
   as initializers, emits real Buffer/Buffer[] types and rebuilds actual values.
6. A per-allocation1MiB guard exists. Aggregate collection and APIs absent from the table remain separate
   runtime/authoring gaps. UTF8 construction uses the pinned original
   TextEncoder path, with encoded-byte counting before allocation. Do not
   silently replace a refused value with an empty buffer or successful no-op.

## Required acceptance and unchanged corpus boundary

Use `test/makecode-arcade-buffer-values.test.mjs` and
`test/makecode-arcade-byte-buffer.test.mjs` as actual original-runtime controls.
`test/arcade-buffer-controller.test.mjs` verifies real native keyboard events,
Blocks/Code reconstruction and export from the VM's serialized project, including
a global named `hex` that must be renamed around the original template tag.
`scripts/verify-arcade-buffer-browser.mjs` is the hosted visible editor journey;
its source is preparation until the exact-head browser artifact proves success.

Add importer tests that start with original TypeScript, not prewritten native
Code: namespace constants, aliases, mutation, function/array flow, source-site
literal identity, readonly errors and a song played from mutated shared bytes.
Execute original PXT and native VM observables, then Code reconstruction, native
export/original execution, import again and actual SB3 fresh reopening. Test
unsupported malformed forms and shadowed names without removing diagnostics.

For authentic context qualification, use the private corpus handoff: originals,
manifest, exact companion files/dependencies and immutable input hashes. Keep
original snippets and project-context results separate. The three Pizza-related
originals listed in the partial plan additionally have missing assets and APIs;
Buffer support alone is not whole-game equivalence. Never invent those inputs.

Last full immutable184-input census:142translated/41partial/1parsefailure.
Authenticated41-context checkpoint:7translated/33partial/1Code-to-Blocks
parsefailure. Rerun both with identical inputs after integration and report changed
diagnostics and observed execution separately. Do not call either count a number
of proven failing games. Do not change denominators to achieve zero partials.

## Public API scope and remaining Buffer authoring gaps

Validate against `base/buffer.ts` and `base/shims.d.ts` in the pinned original
`packages/scratch-gui/static/makecode/arcade/target.json`, then compile and execute
an original fixture before adding a native word. Simulator internals alone are
not the public API. The original `Buffer.write` declaration takes exactly
`dstOffset, src`; its simulator implementation has additional internal arguments
that the compiler rejects. Keep the existing two-argument write. To select a
source fragment, use the public `slice(offset, length)` operation and write that
copy. Do not export four-argument `write` calls.

Actual public declarations still needing runtime/native authoring/export work:

| Public API | Required work beyond the existing Buffer foundation |
| --- | --- |
| `Buffer.create(size)` | Import alias for the existing allocator; resolve shadowing |
| `getUint8` / `setUint8` | Import aliases for byte reads/writes |
| `unpack`, `packAt`, `Buffer.pack`, `packedSize` | Exact public format parser, array flow and malformed-format behavior |
| `hash(bits)` | Original FNV-1 algorithm and public bit-width semantics |

This is a source-derived backlog, not a claim these calls occur in every partial
corpus app. Every implementation needs original execution, native value/alias
controls, Blocks/Code, typed export and actual SB3 reopening; importer work stays
with E10. Aggregate Buffer collection remains a separate host-resource task.

### Format-size authoring continuation

`arcade byte buffer number format UInt16BE size` returns2; a reporter in the
FORMAT slot supports computed numeric enums. The native menu retains all16
original formats. Public `Buffer.sizeOfNumberFormat` is extracted from the same
pinned target source as the existing helpers, with source hashes and exact
regeneration. Export emits the genuine static API and preserves numeric function
returns. Invalid numeric formats retain the original zero result. Import alias
resolution and visible editor qualification remain separate acceptance tasks.

Run the affected controls with the exact producer pin:

```sh
node --import ./scripts/lib/register-gui-scope.mjs --test test/makecode-arcade-buffer-format-size.test.mjs test/makecode-arcade-buffer-values.test.mjs test/makecode-arcade-byte-buffer.test.mjs test/lego-spike-roundtrip.test.mjs
node scripts/generate-arcade-buffer-helpers.mjs --check
node scripts/generate-arcade-authoring-inventory.mjs --check
```

### Number-array and static concatenation continuation

Native words are `arcade byte buffer from number array ARRAY`, `arcade byte
buffer BUFFER to number array format FORMAT`, and `arcade concatenate byte
buffers in array ARRAY`. Their inputs/outputs use the existing session-scoped
array heap; runtime wrappers refuse foreign or expired arrays. JSON fixed finite
number-array constructors now export to real numeric array literals; negative
zero is retained in source. Other unsupported constructor forms keep diagnostics.
Use reference-array mutation with a numeric reporter (for example `convert value
(77) op "+"`), since unwrapped inputs in the Arrays block are text.

The original algorithms are selected directly from the consumed target bundle.
Six Buffer reads and one write adapt indexed access to original getByte/setByte
shims; ordinary number-array reads remain ordinary array reads. Both directions
copy storage. Static concat copies bytes, even for one input or readonly literals.
The original decoder has a zero-size infinite loop for invalid formats; the host
refuses that input before invocation with a named diagnostic. Never run it as a
positive original-runtime case. Per-buffer1MiB and input-array element guards
remain; aggregate heap collection/resources remain separate gaps.

```sh
node --import ./scripts/lib/register-gui-scope.mjs --test test/makecode-arcade-buffer-arrays.test.mjs test/makecode-arcade-buffer-format-size.test.mjs test/makecode-arcade-byte-buffer.test.mjs test/lego-spike-roundtrip.test.mjs test/dialect-arcade-import-lines.test.mjs
```

This is native authoring/export source, not namespace Buffer import or visible
GUI qualification. Keep corpus classifications until actual immutable recensus.

### Base64 construction and encoding continuation

Native words are `arcade byte buffer from Base64 text TEXT` and `arcade byte
buffer BUFFER to Base64 text`. Export emits genuine `Buffer.fromBase64` and
`.toBase64`, preserving dynamic strings and literal numeric text. Constructed
buffers are mutable; encoding a readonly literal preserves its bytes and flag.
Foreign or expired references, non-string construction and malformed input emit
named errors rather than successful empty values.

The generator selects the original alphabet, encoder, parser and constructor
from the consumed MIT `base/buffer.ts`. It now checks nine Buffer indexed reads,
four indexed writes and ten string indexed reads. String indexing adapts to
PXT `String_.charAt`: incomplete groups can yield zero-filled trailing bytes.
Preserve that original behavior, URL-safe input and original padding validation;
a standard Base64 library is not an equivalent replacement. The original scan
calculates the exact allocation under the existing1MiB buffer guard. A separate
input scan bound permits every accepted group up to the output limit. Aggregate
heap lifetime and a visible byte/encoding inspector remain separate gaps.

```sh
node --import ./scripts/lib/register-gui-scope.mjs --test test/makecode-arcade-buffer-base64.test.mjs test/makecode-arcade-buffer-arrays.test.mjs test/makecode-arcade-buffer-format-size.test.mjs test/lego-spike-roundtrip.test.mjs test/dialect-arcade-import-lines.test.mjs
node scripts/generate-arcade-buffer-helpers.mjs --check
node scripts/generate-arcade-authoring-inventory.mjs --check
```

Namespace import stays with E10; native authoring/export controls cannot promote
immutable original apps or establish visible editor qualification by themselves.

### Buffer chunking continuation

Native words are `arcade byte buffer BUFFER chunks of at most SIZE bytes` and
`arcade UTF8 text TEXT byte buffer chunks of at most SIZE bytes`. They return
existing scoped array references containing Buffer references. Custom Buffer[]
returns, array indexing and static concatenation retain typed MakeCode export
through genuine `.chunked` and `Buffer.chunkedFromUTF8`. E10 retains namespace
import and shared type helper ownership.

The original `bufferChunked` returns `[source]` when it fits: preserve reference
identity and its readonly flag. Several chunks are detached mutable slices.
Fractional sizes retain the original indexed-slice behavior. Nonempty byte
buffers with nonpositive/NaN sizes are refused before the original nonprogressing
loop. Empty-buffer branches retain the original result.

The original UTF8 chunker uses UTF16 string offsets, a binary search and signed
`Math.idiv`; it may split surrogate pairs and encode each half as replacement
bytes. Preserve observed original output instead of substituting a Unicode
code-point chunker. Text and size values are passed through the original selected
functions with the existing bounded UTF8 constructor. NaN/undefined sizes that
would never progress are refused; original sizes below3 retain their error.

Per-buffer1MiB and UTF8 input1MiB code-unit limits apply. Both output collections
are limited to65536 chunks. The generator checks exactly two collection pushes
and adapts them to reserve before invoking the next chunk allocation; exceeding
the limit produces a named error, never a successful truncated collection.
Aggregate live heap collection and a visible byte/chunk inspector remain open.

```sh
node --import ./scripts/lib/register-gui-scope.mjs --test test/makecode-arcade-buffer-chunking.test.mjs test/makecode-arcade-buffer-arrays.test.mjs test/makecode-arcade-buffer-format-size.test.mjs test/makecode-arcade-byte-buffer.test.mjs test/lego-spike-roundtrip.test.mjs test/dialect-arcade-import-lines.test.mjs
node scripts/generate-arcade-buffer-helpers.mjs --check
node scripts/generate-arcade-authoring-inventory.mjs --check
```

Original comparisons, native Code/Blocks reconstruction, Buffer[] custom returns,
typed exported execution and actual fresh SB3 are controls. Visible editor and
whole original-project recensus remain separate qualification tasks.
