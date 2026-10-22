# MakeCode round-trip: uninitialised string global stays text

Claim: VPS Claude (opus), 2026-10-22.

## Landed

1. **Importer: `let s: string` with no value is text, not `0`.**
   `overlay/scratch-gui/src/lib/bw-makecode/translate-base.js` (Declaration case)
   emitted `set s to 0` for an uninitialised declaration. That made export.js
   type the global as a number and pxt refused the re-export. Now the declared
   text type's zero value is used (`""`), other types keep `0`.
2. **Export: a variable passed to a number-only built-in stays a number.**
   `overlay/scratch-gui/src/lib/bw-makecode/export.js` `NUMBER_SLOTS` did not
   cover `microbitplus_shownumber` / `microbitplus_plotbargraph`, so a mixed
   text/number variable reached them as `any` and compiled. Those VALUE slots
   are now number contexts; the mixed variable stays `number` and pxt refuses
   it by name (as for arithmetic and comparison).
3. **Arcade background corpus verifier.** `kind` is the numeric kind id; the
   runtime exposes the display name as `kindName`. The verifier compared
   `s.kind === 'Player'`, so the check could never pass. It now uses `kindName`.
4. **A proven array's `length` is a Number.** `source-value-producers.js` gained
   `provenArrayNames`: a name whose every definition is an Array literal (or a
   copy from another proven array), with only push/unshift/pop/shift and
   index/length writes, is an actual array from its producers alone — no type
   annotation is consulted. `procedure-constraint-source.js` enables
   `provenArrayLength`, so `arr.length` reaches a `number` formal as a Number.
   This closes `arcade-5522443bf9525301` (quicksort/sort), which failed on
   `swap.j`, `qsort.hi` and `partition.hi` feeding off `qsort(0, arr.length)`.

## Qualification

- `test/makecode-result-types.test.mjs`: 20/20 pass (includes the pxt-microbit
  simulator and pxt-ev3 compile controls).
- Procedure/array/loop controls: `makecode-procedure-constraint-*`,
  `arcade-procedure-constraint-*`, `makecode-dense-array-loop-entry`,
  `makecode-arcade-{loop-control,value-arithmetic,update-values,
  numeric-constant-values,array-*}`, `makecode-array-map-values`: 124 pass /
  11 documented todo / 0 fail. A second array set: 153 pass / 1 todo / 0 fail.
- `scripts/verify-arcade-background-corpus.mjs` on the local corpus: both
  inputs pass all four stages (native, Code, SB3, compile, MakeCode reimport).
- Full Arcade census (`scripts/compat-audit.mjs --target arcade`): **146
  translated / 37 partial / 1 malformed input** (was 145/38/1).

## Re-audited and not landed

- The earlier `("" + x)` guards in `export-arcade.js` were inert: a two-round
  Arcade export/reimport probe produced byte-identical output with and without
  them. Reverted rather than keeping unproven defensive code.
- Enabling `arrayValues` (or a declaration-annotation rule) in the procedure
  constraint graph closed `28379fc0` (snake) and `5522443b` (sort) but also
  accepted four known-negative controls in
  `test/makecode-dense-array-loop-entry.test.mjs`. It also violates the
  documented invariant that source annotations constrain consumers and never
  seed producer authority. Reverted; the four controls pass again.
- A do-while lowering variant made a do-while body's assignments visible to the
  producer graph. It produced no census change on its own and was reverted to
  keep the change set to proven work.

## Open coverage (37 partial + 1 malformed)

The 184-input local corpus is `147/36/1` in the published baseline and
`146/37/1` here. The one remaining delta row is `28379fc0` (snake), blocked by
array *element* reads (`snake[0] >> 8`) outside the dense-loop proof. Closing it
needs a sound definite-initialization proof for the array at the read (its
literal assignment happens in `nextLevel()`, reached through a call from
top-level `newFood()`), not a type annotation. The existing rule proves
`length`, not element presence.

The remaining families need external project context or cross-repo work:
- missing artwork/animation/song assets (25+ diagnostics);
- per-sprite `onOverlap` / `setVelocity` / `setStayInScreen` / `setFlag`
  (extension primitives, upstream-first);
- custom tutorial packages (`globetrotters`, `carnival`, `freethrow`, …);
- one genuinely malformed corpus input (unbalanced call, `12904c83`).
