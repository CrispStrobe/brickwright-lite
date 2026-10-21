## Arcade PR #888 TODO tests, second pass, group B — 2026-10-20

CLAIMED and done in one PR — Claude, at the owner's request. Group B (procedure
parameter constraint) of docs/ARCADE-888-OPEN-FAILURES.md: fix a test only with
a sound proof, remove its `todo` once it passes and record "fixed in <sha>";
keep an unsound case's TODO with its counter-example. Refusal suites stay red
on wrong input. Paths: `scalar-export-flow.js`, `export-arcade.js` (procedure
formal types), test/makecode-arcade-scalar-export-flow.test.mjs,
test/makecode-arcade-value-arithmetic.test.mjs and the doc.
