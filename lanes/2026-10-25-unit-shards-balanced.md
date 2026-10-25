# CI: balance the six unit shards by measured file time

Claimed 2026-10-25 by a Claude Code agent for the owner. Claim and change in one PR.

Replace the modulo assignment in `scripts/list-tests.mjs` with a deterministic
greedy assignment over a committed timing table, hash fallback for new files.

Owned paths: `scripts/list-tests.mjs`, `scripts/gen-unit-test-timings.mjs`,
`scripts/data/unit-test-timings.json`, `test/unit-shards.test.mjs`,
`docs/ARCADE-CI-QUALIFICATION.md`, `test/test-run-todo-accounting.test.mjs` (fixture copies the table).

Qualification: all enabled exact-head checks green with `ci:full`; the slowest
`unit (n/6)` leg well under 20 minutes.
