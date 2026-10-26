# SPIKE macOS runtime feasibility (Renode under the App Sandbox)

Status: CLAIMED — feasibility study, not a macOS SPIKE delivery.
Owner: Claude, operator-authorized SPIKE macOS feasibility task.
Base: `8bf40b2c3d2` (main at claim time).

Find out whether the SPIKE Renode runtime can run on macOS inside a sandboxed
`.app`. Work happens on hosted GitHub macOS runners (`macos-14` arm64,
`macos-13` x64) in the owner's public Renode forks
(`renode-spike-prime`, `renode-infrastructure-spike-prime`): build the portable
.NET Renode with tlib for osx-arm64/osx-x64, check tlib's Apple Silicon JIT
handling (`MAP_JIT`, `pthread_jit_write_protect_np`), and probe a minimal
ad-hoc-signed sandboxed wrapper that boots the project's own source-built NuttX
guest. Reference/original firmware is never used.

Scope in this repository: this claim, a new `docs/SPIKE-MACOS.md`, the macOS
section of `docs/SPIKE-STATUS-AND-LANES.md`, and generated macOS crate
inventories under `docs/generated/` produced by the existing inventory
generator (a `--filter-platform` option may be added to
`scripts/gen-spike-linux-crate-inventory.mjs` if needed). Any new workflow is a
separate file; `.github/workflows/release.yml` is owned by the model-delivery
lane and is not touched or dispatched. No native, frontend, pin or model change.

Findings are recorded with their original failures. Licence notes are
notice/obligation inventories, not a licence clearance. Docs-only changes need
docs/source-policy CI and normal matched-head landing.
