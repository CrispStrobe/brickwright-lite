# Arcade group A per-slot Array receiver proofs and typed SDK Number globals

Status: DONE in the implementing PR (claim and change together).
Owner: Arcade lane (operator-approved follow-up, 2026-11-02, option b).
Base: main after the composed created-field receiver PR.

## Scope

- `overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js`:
  call-site getter results, constant-condition branches, unenterable
  procedures (closed call graph), text-sprite kind resets, omitted slice
  bounds, `mp.allPlayers()`
  as a fresh SDK Array, and the shared project context for animation
  resources named by a never-written global.
- `animation-frame-array-producers.js` and `export-arcade.js`: that context.
- `source-scalar-declarations.js`: a small typed SDK Number table
  (`scene.backgroundColor`, `Math.floor/ceil/round/abs/sqrt`), fixing the
  no-sprite `set color to 2` text bug.
- `source-value-producers.js`: `Math.map` is not an Array map site.
- Tests: the cleared ARCADE-888 rows, new controls, docs rows.

## Qualification

Each newly admitted case compares with original PXT (existing row tests or
new ones) and has a mutation that fails it; refusal controls for the
boundaries. Every enabled exact-head check must succeed before merge.
