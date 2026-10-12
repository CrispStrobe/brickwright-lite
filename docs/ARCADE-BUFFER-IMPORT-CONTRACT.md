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
- Arrays fallback: https://github.com/CrispStrobe/extensions/pull/34

Repository paths:

- `scripts/generate-arcade-buffers.mjs`: exact extraction/regeneration and hash.
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
| `Buffer.fromHex(text)` | `arcade_bufferFromHex` | Fresh mutable decode; preserve odd-length original behavior |
| `hex` tagged template | `arcade_bufferLiteral` | Readonly literal; same source site reuses identity, different sites stay distinct |
| `buffer.length` | `arcade_bufferLength` | Byte count, not Scratch string length |
| `buffer[index]` | `arcade_bufferGetByte` | Original byte read and bounds |
| `buffer[index] = value` | `arcade_bufferSetByte` | Mutate shared storage; evaluate receiver/index/value once in source order |
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
6. A per-allocation1MiB guard exists. Aggregate collection, UTF8 construction and
   APIs absent from the table remain separate runtime/authoring gaps. Do not
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
