## CI: path-aware browser shards on PRs — 2026-10-20

CLAIMED and done in one PR — Claude (owner request: PRs must not wait hours on
browser tests that cover nothing they change). scripts/ci-browser-scope.mjs maps
a PR's changed files to the browser shards (heavy, light, robotlab) and fpga
surface that exercise them: none for tests, Rust/Tauri, the CLI, docs and
scripts no gate reaches; robotlab alone for bw-sim/sim-lab; every shard for
shared or unknown paths. `full CI requested` asks for ci:full only when a shard
is needed. Main pushes and dispatches still run every shard. Owns build.yml's
scope/full-ci-gate/browser/fpga-surface conditions and test/ci-browser-scope.test.mjs.

