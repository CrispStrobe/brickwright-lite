## Arcade Buffer array bridge — 2026-10-12

CLAIMED — Codex, `lane/arcade-buffer-arrays-20261012`, stacked on PR841.
Extract original Buffer.fromArray, bufferToArray and static Buffer.concat; retain
byte coercion, all numeric formats, detached array/Buffer storage and readonly
input behavior. Bridge existing scoped array references, bound allocation before
copy, refuse stale/foreign arrays and invalid decode formats before original
zero-step loops. Native reporters, Code vocabulary and typed number[]/Buffer[]
export need original execution, custom-return/alias controls and fresh SB3.
E10 retains importer/shared type helper ownership; use existing exporter graph
constraints without changing shared inference code. Preserve GUI qualification
failures and locked corpus counts.

Buffer array bridge scope refinement: the actual authoring check found that
fixed numeric JSON arrays run in Arrays.createReference but export diagnoses
them as a non-chain constructor. Include export of fixed finite number-array
literals using JSON parsing and exact numeric source expressions, retaining
negative zero. Other dynamic/non-numeric constructor inputs keep diagnostics;
do not replace refused inputs with empty successful arrays. Shared E10 helpers
remain untouched.
