## Primitive identifier bitwise compound assignments — 2026-10-15

IMPLEMENTED LOCALLY — Codex Arcade integration, source `1e65f988c`.
Claim #943 is merged; 18 focused checks and independent review pass. Two
exact ordinary source/export programs pass selected-original execution; captured
factory original execution and visible editor journeys remain open. Contract:
[primitive bitwise compound assignments](docs/compatibility/arcade-primitive-bitwise-compound.md).
Own the identifier compound-assignment operator selection in
`Arcade.expressionStatement` and focused source/current-block/native/export
controls. Reuse existing primitive producer proof, native value operations and
local/captured/global assignment paths. No opaque coercion, assignment-as-value,
member/index widening, new vocabulary, dependency pin or frame-clock change.
Coordinate the Arcade translator with callable, inspection and numeric owners.
