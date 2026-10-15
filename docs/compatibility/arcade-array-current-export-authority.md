# Current Array receiver export authority

## Implemented boundary

Current Blocks export checks Array receivers against actual connected producers and all writers. It does not infer an Array from the operation consuming it, a declaration annotation, a generated name, or a method signature alone. This change adds no Array word, runtime representation, supplier pin, or typed native domain.

The common guard covers length, item, random and indexed truthiness; mutation, take and remove; slice and both concatenation receivers; and index search. It checks current target membership, physical input ownership and schema, variable name/ID agreement, connected parents, and malformed or cyclic graphs. Ordinary allocations, aliases, proven arguments/results and captures retain their existing export route when initialization and all writers are proved.

Nested Array reads additionally need actual element presence. Mutation credit requires a definite body, rather than a possible alias or a constructor-site label. A repeated fresh factory return does not prove that two references share one body. A bounded once-execution proof preserves ordinary once-called fresh factories and genuine shared or formal aliases. Initially populated constructor bounds remain separate from mutation credit. Unresolved argument facts defer analysis; they do not grant a producer, and final initialization checks remain strict.

Implementation: [receiver authority](../../overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js), [current exporter](../../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js), and [focused controls](../../test/makecode-array-reference-export-authority.test.mjs).

## Qualification and counts

A pure regression profile used the same 29 retained original-compiler-valid project contexts and the reviewed full canonical Creator revision `8b620dd023782bed058b6bffc87fc838f0cf5295`. It observed source import, Code parsing/feedback, saved SB3 structure and artwork, current export, and reimport. All actual diagnostic channels were retained independently; diagnostic-bearing partial inputs were not pruned into apparent success.

| Stage boundary | Previous profile | Composed profile |
| --- | ---: | ---: |
| Source and Creator clean | 20 | 20 |
| Export clean from those clean inputs | 20 | 20 |
| Export clean from already-partial inputs | 2 | 0 |
| Complete pure pipeline | 19 | 19 |

The complete case set is unchanged. The two removed export-clean results were already-partial programs whose unproved Array receivers now receive diagnostics. An additional already-partial class program also reports Array diagnostics. These are more accurate refusals; they do not close those programs' missing APIs or raise the whole-project compatibility count. The raw corpus census is separate.

The profile ran once in 51.3 seconds with 6,945 unchanged file guards and no network attempts. This is source/current-project qualification. It does not establish native game behavior, a visible GUI journey, SDK execution, or shipped consumer adoption for the selected canonical Creator revision.

## Remaining authoring and diagnostic work

A visible browser journey must still demonstrate receiver edits through Code and Blocks, alias and whole-binding rename edits, save/reopen, and current export/reimport. Pure saved-project checks do not qualify those UI actions.

Refusals identify the operation and input, but still need a reliable location that takes the user to the relevant current block or Code occurrence. Multiple invalid receivers must remain visible individually; diagnostics must not be dismissed because partial TypeScript was returned.

Raw nested JSON constructor tails and exact mixed chain/tail transport remain separate gaps. General repeated or recursive factory identity, pointwise mutation bounds across ambiguous aliases, and unproved nested element presence remain explicit refusal boundaries. An unproved receiver is diagnosed; this guard does not issue a replacement Array or add numeric coercion.
