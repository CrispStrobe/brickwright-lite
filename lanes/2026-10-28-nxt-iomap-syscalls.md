# NXT compiled-program bounded IO-map calls

Status: IMPLEMENTED CANDIDATE, hosted qualification pending.
Owner: Codex Robot Lab continuation, user-authorized ordered follow-up.
Branch: `lane/nxt-iomap-syscalls-20261028`.

The virtual-file syscall work in #1430 is complete. Implement syscall 32
IOMapRead and 33 IOMapWrite for explicitly supported virtual module fields,
using independently described firmware ABI, module identity, extents and
status facts. Unknown or unmodeled fields must refuse explicitly; no fabricated
firmware memory image or silent successful write.

Own IO-map dispatch and necessary bounded buffer helpers in
`overlay/scratch-gui/src/lib/bw-sim/routes/nxt-vm/`, narrowly necessary virtual
state adapters in `overlay/scratch-gui/src/lib/bw-sim/hubs/nxt/`, focused NXT VM,
brick and map tests, owned NXC/compiler fixtures and README under
`test/fixtures/nxt-rxe/`, the IO-map paragraphs in `docs/NXT-RXE-VM.md` and
`docs/ROBOT-LAB-AGENT-HANDOFF.md`, and this claim. Existing NXT source owners
retain all unrelated work; coordinate any actual overlap before editing.

Preserve file/wire layouts, motor/sensor semantics, VM allocation and work caps,
snapshot/reset/Stop ownership and all existing assertions. No host memory or
filesystem, network or Bluetooth mapping; no physical timing or hardware claim.
No engine, model, production pane, pin, workflow or budget changes. Firmware
sources are cited facts only; do not copy their implementation.

Merge this claim before implementation. Freeze the supported byte ranges and
read/write policy from cited facts before executing fixtures. Require exact
ABI/status/bounds/alias/lifecycle controls and meaningful negative controls.
Compile owned NXC inputs once with the existing hosted compiler; tests
use the retained bytes, not the network. Fresh clean affected hosted virtual
brick qualification and all enabled exact-head checks must pass, with declared
skips only, before a normal matched-head merge and exact tree/parent proof.
Retain first failures and acquire each official original once. Unsupported
modules remain documented; this is finite virtual IO-map compatibility.

The candidate supports only `Button.mod` release-counter and held projections,
plus exact three-zero-byte counter clearing. Unknown names and unmodeled or
arbitrary writes refuse; the stock firmware's wider raw access is not claimed.
Nine engine-free ABI/state controls pass. The final owned 2,410-byte fixture input compiled
once; source and executable hashes are frozen in its hosted-only brick test.
Compiler version is not reported by the service. Four bounded local virtual-brick cases now pass: actual upload/run, signed
errors, Stop/restart and running snapshot. Fresh hosted evidence remains required.
The first distinct compiled fixture failed three local cases because field
assignments emitted string-copy instructions. Direct Buffer initialization fixes
the fixture; expected numeric assertions and VM behavior are unchanged. Both
compiler responses and the first failure are preserved.
