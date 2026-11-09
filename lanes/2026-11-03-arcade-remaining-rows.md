# Arcade remaining documented rows (2026-11-03)

Status: DONE in the implementing PR (claim and change together).
Owner: Arcade lane (operator-approved, 2026-11-03).
Base: main after the group A per-slot proofs PR.

## Scope

- `source-value-producers.js`: positional elements of never-mutated literal
  and exporter push-built Arrays; NumberFormat enum leaves
  (`ordinary-primitive-sdk-number-source.js`, shared member list with
  `arcade-translate.js`).
- `console-inspect-values.js`: the matching native positional proof.
- `array-reference-export-authority.js`: constant computed indexes.
- Tests and ARCADE-888 / handoff rows; reasons for the rows that stay open.

## Qualification

Each admission has an original-PXT comparison, mutations that fail it and
refusal controls. Every enabled exact-head check must succeed before merge.
