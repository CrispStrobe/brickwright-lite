# Arcade CI qualification and unit shards

## Why the workload is split

[PR845 build](https://github.com/CrispStrobe/brickwright-lite/actions/runs/38306464578/job/115001603045)
passed7037 units in20m42s. Setup, source checks and later guards consumed most
of the remaining30-minute job budget. Webpack started at21:40:11UTC and the
job was cancelled at21:42:48UTC. Unit success did not establish distribution
success. Retain that failure; do not report the job as a passed build.

## Required jobs and unchanged boundaries

The build job keeps integrated preparation, source and provenance guards,
mutation proofs, webpack, emitted-distribution checks and the sole Pages
artifact upload. Two required unit matrix legs prepare the same integrated
inputs and partition the complete non-corpus suite. Corpus and browser/FPGA
jobs retain their own acceptance contracts. Deploy requires all those jobs.
The external main-publication audit also requires both named unit legs.
No timeout, test assertion, skip-pointer rule or distribution guard is relaxed.

`test/unit-shards.test.mjs` checks preparation equality between build and unit,
so a later preparation edit must be carried to both jobs. This intentional
setup duplication avoids exchanging a mutable dependency/build tree between
jobs. Unit artifacts contain TAP, per-file census and GUI-resolution records;
unit jobs cannot produce the Pages artifact. Matrix fail-fast is disabled so
one failure preserves the other leg's result.

## Selection and reproduction

`scripts/list-tests.mjs` remains the source of test membership. Corpus retains
its two existing files. Fast shards select each remaining filename by the
first32 bits of its SHA256 modulo shard count. New files automatically join
exactly one shard. Index/count is one-based, validated and bounded; unsupported,
invalid or empty selections fail explicitly. Full local commands remain full.

```sh
node scripts/list-tests.mjs fast --shard 1/2
node scripts/list-tests.mjs fast --shard 2/2
BW_TEST_SHARD=1/2 npm run test:fast:shard
BW_TEST_SHARD=2/2 npm run test:fast:shard
npm run test:fast
```

Each CI leg checks its actual selected files, not the complete fast list:

```sh
node scripts/check-test-run.mjs --set fast --shard 1/2 --tap /tmp/unit.tap --census test-results/fast.census.json --max-stdout-bytes 0
node scripts/check-gui-scope.mjs --log test-results/fast.gui-scope.tsv
```

The auditor still rejects vanished/empty/unexpected files, missing summaries,
uncounted failures, raw stdout transport writers and undocumented skips. Tests
exercise missing-file, wrong-shard, failure and skip adversaries against the
actual auditor. `gen-ci-skips.mjs` reads both new unit names and historical
build/corpus jobs; existing generated historical evidence is not rewritten.

## Qualification still required

Source controls establish partition and gate behavior, not observed hosted
runtime or throughput. Obtain every enabled exact-head check, both complete
unit censuses, completed emitted-build guards and the visible editor journey
before acceptance. Preserve named failures and compare measured durations.
No whole-app MakeCode compatibility promotion follows from sharding CI.
