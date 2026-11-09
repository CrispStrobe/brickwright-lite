# Arcade row 2d follow-up: native named-array operations on reimport

Status: DONE in the implementing PR (claim and change together). Row 2d's
full-path test stays TODO (two export-side refusals left, see ARCADE-888 C).
Owner: Arcade lane, row 2d (`lanes/2026-11-03-arcade-pending-after-1643.md`).
Base: the row 2d reimport PR (#1687).

## Change

- `named-array-item-helpers.js`: an exact `__bwNamedArrayPop/IndexOf/Remove`
  helper call on an owned registry lowers to the native named-array block
  (remove only as a statement, pop and indexOf only as values, primitive
  arguments); the helper is dropped only when every use was lowered and it
  never escapes. A whole `X = registry` copy becomes `reference to named
  array` only when the nearest earlier writer of that registry in the same
  straight statement list created it, with no call (other than a recognized
  named operation), function or registry write in between. Elsewhere the
  stored variable is kept: the native reference errors after a delete where
  the variable holds null.
- `arcade-translate.js`: emits `remove item`, `pop from array`, `index of`
  and the native reference.
- `native-array-binary-domain.js`: its plain-source view reads the native
  reference as the registry binding it replaced.

## Tests

New `test/makecode-arcade-named-array-native-reimport.test.mjs`: native
blocks and VM values after reimport; a copy after an intervening call stays
the variable. Mutations: no passive recognition fails the first test; treating
every copy as live fails the second.
