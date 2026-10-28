# Board c7bcbe4b / CUI da28bb8c consumer adoption

Claim and change in one PR, stacked on #1478 (branch
`lane/junction-packages-adoption-20261026`). Branch
`lane/cui-da28-adoption-20261028`. Supplier targets: bw-board
`c7bcbe4bcd583d2215372dd4ee1e65002e249a04` (merged LM741 bias/supply; runtime
tree identical to `97f60b97`) and bw-circuit-ui
`da28bb8ce9b38aa18d2e424f692c6570fc1d6d1d` (LM741 CLI and opt-in passive
precision batch).

## Owned paths

The same current-role surfaces #1478 moved: vendor-pins.json, root and
packages/scratch-gui package.json/package-lock.json, both
bw-packages.sources.json copies, the Board record in bundled-upstream-pins.json,
current package-identity tests, instrument-regression supplier selectors,
386 GUI controller/reader BOARD/CUI declarations, current-role workflow and
provenance citations with their packages/ mirrors, and the generated capability
report. History-role citations are unchanged.

## Pending

- Board census (`docs/generated/bw-board-census.json`, both census-snapshot.js
  mirrors) was read fresh at `c7bcbe4b` with the census generator, and the
  language/device matrix regenerated from it; neither is hand-edited.
- bw-circuit-ui lock integrity was recomputed from the packed `da28bb8c` tree (the same method reproduces the previous `66e37240` value).
- Full CI after #1478 lands.
