## micro:bit importer: comparisons assigned to variables, regression tests — 2026-10-20

CLAIMED and done in one PR to main — Claude (owner-approved follow-up to #1139). The suspected
bug, `w = (a & b) == 0` importing as `set w to 0`, does not reproduce: the import writes
IF <comparison> THEN set w to 1 ELSE set w to 0, and a probe that read only the last
`set w to` line saw the ELSE branch. Tests only: test/makecode-arithmetic-roundtrip.test.mjs runs
the original and exported programs for ==, !=, <, <=, >, >= with bitwise and arithmetic operands.
