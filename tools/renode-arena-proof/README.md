# Managed SPIKE browser proof

This BSD-3-Clause authored test driver uses the production native policy and
managed Renode supervisor/debugger with a small closed test executor. It accepts
bounded NDJSON on stdin, never monitor text, executable paths, ports, or arbitrary
memory requests. Its host-owned leases stay inside Rust. It does not instantiate
the Tauri adapter, broker WebView, or installed WebView ACL.

The optional trusted `BW_PROOF_FLASH_ROOT` environment variable configures the
native supervisor's validated private flash directory before any session. It
never arrives through a browser operation. This initialization depends on the
host flash journal integration and must be compiled with that integration.
Without the variable, the guest proof retains its existing startup behavior.

Use the current emitted GUI and verified package environment. After building the
driver with the existing dependency cache, set `BW_RENODE_ARENA_PROOF_DRIVER`,
`BW_SPIKE_BUILD_ROOT`, and an external private `BW_SPIKE_EVIDENCE_DIR`, then run
`node scripts/verify-spike-renode-arena-browser.mjs`.

`BW_SPIKE_PROOF_MODE=guest` preserves the managed guest arena proof.
`nuttx-source` uses the GUI reader/compiler for a timed A–F program, saves it,
uploads a distinct idle replacement, loads without autorun, and runs the saved
program. `nuttx-python` enters authored `brickwright` Python in the editor,
checks ARM console output and all six motors, then stops them. Both NuttX modes
select the sandbox's six-motor topology and close through the execution selector.
Run these modes separately so each owned process retains its existing 120-second
limit. Native packet, startup, and broker deadlines remain unchanged.

Observations come from the actual managed firmware/model snapshots and shared
hub. C–F are extra motor observations; only A/B drive the arena rover. Results
describe a modeled simulation and do not establish physical hardware equivalence.
Private receipts explicitly identify the injected browser test transport and
contain actual transport replies, frames, checks, and a screenshot. Installed
WebView ACL qualification is a separate native desktop test.
