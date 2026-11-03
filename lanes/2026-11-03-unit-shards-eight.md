# CI: eight unit shards instead of six, with fresh shard timings

CLAIMED and DONE in the same PR. Branch `ci/unit-shards-8-20261103`.

## Why

On 2026-11-03 the six 30-minute unit shards ran out of room:
- On main, `unit (6/6)` was cancelled at the job limit (run 41662060181, after #1644), and `unit (3/6)` took 29 minutes.
- On #1646, shards 3, 6 and then 1 were cancelled at 30 minutes. No test failed.
- With freshly regenerated timings, all six legs come out even, but each one is close to 30 minutes on a busy runner.

## Change

- `.github/workflows/build.yml`: `unit (n/8)`, matrix `[1..8]`, `BW_TEST_SHARD: n/8`. The 30-minute timeout stays.
- `scripts/verify-vercel-main-checks.mjs`: `REQUIRED_BUILD_JOBS` now needs the eight legs. `scripts/gen-ci-skips.mjs` also knows the `/8` names.
- `scripts/data/unit-test-timings.json` is regenerated from main run 41586247225 with `scripts/gen-unit-test-timings.mjs`. It is the same content as commit `524b736c` on #1646.
- Tests: `test/unit-shards.test.mjs` and `test/vercel-main-checks.test.mjs`. Six-way success is now historical and cannot stand in for an eight-way leg.

## Proof

- All 45 test files that read the workflow or the shard selection were run: the same failures as on unchanged main (24, all from the Mac's missing `/usr/bin/bash` or local-only prerequisites). The one test that pinned six legs is updated and passes.
- The hosted proof is this PR's own run: eight `unit (n/8)` legs, each well under 30 minutes.

## Follow-up

If the shards drift again, regenerate the timings from the latest full green main run:
1. `gh run download <id> -p 'unit-shard-*' -D <dir>`
2. `node scripts/gen-unit-test-timings.mjs <dir> <id>`
