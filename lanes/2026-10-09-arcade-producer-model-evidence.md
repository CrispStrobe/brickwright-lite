## Arcade producer model evidence — 2026-10-09

Codex owns `lane/arcade-producer-model-evidence-20261009`, stacked on PR757,
and producer `fix/arcade-producer-model-evidence-20261009`, stacked on PR78.
The full producer run passed measured quantities but rejected stale model
provenance stamps. Re-derive stamps against exact pinned engine/model sources,
keep numerical tolerances/claims unchanged, and run the actual quantity and
stamp gates before adopting the corrected producer. Preserve the original CI
failure. Full producer CI remains required; no new Arcade capability is claimed.
Checkpoint producer `4df2b00f` /Lite `ffeb88c80`:31 remeasured stamps, ten
quantity/provenance checks, stamp freshness and six Lite pin/dialect checks pass.
Claim census1313 checked /1548 declined /0 disagreements. Full hosted producer
CI37944827934 passed every enabled check at `4df2b00f`; publishing was disabled
for this feature branch. PR79 merged into its camera-shake feature parent at
`4757ab8a`; the merge and reviewed trees both equal
`7ab491f920b83d6297c19331b3cf6abbb8599075`. This is not a main merge.
Arcade corpus at this checkpoint stays108/75/1.
