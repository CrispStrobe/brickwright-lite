# MakeCode round-trip fixes: string globals, proven array length, readable calls

Claim: VPS Claude (opus), 2026-10-22. Isolated worktree
`wt-lite-makecode-roundtrip-20261022`, branch `lane/makecode-roundtrip-20261022`,
base `d81b0b7e0`.

## Scope

Complete task E18 of the owner queue (MakeCode round trip reaches a fixed
point) where it is root-cause fixable, and close Arcade static-census rows that
can be closed soundly.

## Paths

- `overlay/scratch-gui/src/lib/bw-makecode/translate-base.js`
- `overlay/scratch-gui/src/lib/bw-makecode/export.js`
- `overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js`
- `overlay/scratch-gui/src/lib/bw-makecode/procedure-constraint-source.js`
- `overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js`
- `scripts/verify-arcade-background-corpus.mjs`
- `test/makecode-result-types.test.mjs`

## What the changes do

1. An uninitialised `let s: string` imports as `set s to ""`, not `set s to 0`,
   so the re-export types the global as text and pxt accepts it.
2. `microbitplus_shownumber` / `microbitplus_plotbargraph` VALUE slots are
   number contexts, so a mixed text/number variable stays `number` and pxt
   refuses it by name instead of silently accepting `any`.
3. `provenArrayNames` proves a name is an array from its actual producers alone
   (no type annotation), so `length of` a proven array is a Number and the
   procedure-parameter Number proof accepts `arr.length`.
4. A call that omits arguments is padded with the dialect's explicit undefined
   value so it still matches its `DEFINE`; a missing required formal remains a
   named diagnostic.
5. The Arcade background-corpus verifier compares `kindName`, not the numeric
   `kind`.

## Qualification planned

- `test/makecode-result-types.test.mjs`.
- The procedure/array/loop controls and the Arcade buffer baseline.
- The 184-input Arcade static census and the prepared complete-context census.
- No dependency, lock, pin, workflow or generated-file change.
