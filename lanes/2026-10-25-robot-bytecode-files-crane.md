# Robot Lab bytecode serialization, virtual files and crane winch

Status: CLAIMED — merge before implementation.
Owner: Codex, user-authorized three-package continuation, in order.
Isolated branch `lane/robot-bytecode-files-crane-20261025`.
Base `a7f8348315ef7b31f33d8b236bf43d6e86c53a03`.

1. Implement NXT RXE FLATTEN and UNFLATTEN from independently described,
   cited firmware/protocol facts. Cover scalar, string, array and nested data,
   malformed/truncated inputs, bounded allocation, deterministic state and
   compiled-program roundtrips on the Virtual NXT.
2. Implement bounded EV3 program-data file operations with deterministic,
   isolated virtual storage: open/write/read/close, EOF, invalid handles,
   storage limits and snapshot/reset behavior. Reuse the existing virtual
   brick storage contracts where compatible. Never expose host files or
   network access. Preserve LOAD_IMAGE, program loading and current refusals
   outside the implemented subset.
3. Replace the shipped crane's fixed hook link with a motor-driven winch,
   drum and rope using existing rope physics. Qualify raise/lower/hold/slack
   and bounded load behavior, authored program and real browser save/reopen.
   Do not change the experimental model batch or existing physics coefficients.

Owned paths: `overlay/scratch-gui/src/lib/bw-sim/routes/nxt-vm/` and
`routes/ev3-vm/`; narrowly necessary EV3 virtual-file storage/snapshot hooks
under `overlay/scratch-gui/src/lib/bw-sim/hubs/ev3/`; matching VM and virtual
brick tests, owned NXC/lms compiler fixtures and fixture READMEs; shipped
`static/sim-lab/models/crane.ldr`, `static/sim-lab/programs/crane.bw`,
`scripts/gen-crane-model.mjs`, crane tests and its narrow existing browser
qualification helper; `docs/NXT-RXE-VM.md`, `docs/EV3-RBF-VM.md`, the affected
crane documentation and this claim. Apply canonical mirror rules where needed.
No shared pane, measurement, physics-core, dependency-pin, workflow, API,
release, native/firmware or experimental registry changes are claimed.

Qualification: preserve original failures, use meaningful negative/mutation
controls, cite facts without copying restricted sources, compile owned fixture
programs once using the existing owned hosted compiler, and retain its originals.
Require affected clean hosted bytecode/virtual-brick and real Jolt/browser
qualification, independent retained-original review without producer imports
or successful-case replay, every enabled exact-head check (declared skips only),
and normal matched-head landing with reviewed/predicted/landed parents/tree.
Do not weaken limits, physical oracles or existing acceptance thresholds.
Close this continuation only after all three packages qualify and land.
The separate API acceptance/final-documentation continuation remains open;
reuse its evidence and preserve its existing owner and private inputs.
