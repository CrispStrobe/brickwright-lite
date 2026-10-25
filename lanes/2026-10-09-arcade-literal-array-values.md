## Arcade literal array values — 2026-10-09

Codex owns `lane/arcade-array-values-20261009`, stacked on PR756.
Use the existing reference-array runtime for literal array values, including
function arguments and returns. Verify scalar aliases, mutation, typed empty
arrays, original PXT execution, Code/Blocks/SB3 and MakeCode interchange.
Remeasure all unchanged corpus inputs and keep malformed/unsupported cases.
No new producer vocabulary or dependency adoption is planned for this lane.
Checkpoint `38cf4623d`:25 array checks plus one native controller fixture pass;
corpus108/75/1 across184 unchanged hashes. Recovered empty-body tutorial passes
original/export execution and Code/SB3 restart. Fresh shipped browser remains
required. Prior display repair now passes full build and both browser shards.
