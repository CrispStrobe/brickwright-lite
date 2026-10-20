## Robot Lab R13 — SPIKE firmware in Renode, lockstep (desktop) — 2026-10-17

PROPOSED — Robot Lab lane. Plan: docs/ROBOT-LAB-SPIKE-EMULATION.md (on lane/simlab-next-20261017, PR #1049's follow-up). Owns new code only:
`overlay/scratch-gui/src/lib/bw-sim/hubs/spike/spike-firmware-hub.js`,
`overlay/scratch-gui/src/lib/bw-sim/routes/renode-lockstep/**`, `test/bw-sim-renode-lockstep*`,
and, coordinated with the SPIKE native owners below, ADDITIVE native operations
`renode.spike.lockstep.{begin,step,end}` (validator in `apps/tauri/src-tauri/src/arena_inputs.rs`,
policy/capability entries, the lockstep wait in `renode_brick_state.rs`, the OPERATIONS map in
`native-renode-capability.js`) behind the target capability `lockstep/v1`. Does not change the
arena session/bridge, existing ops, frame formats, firmware, Runtime/model pins or packages.
Consumes Runtime `lockstep/v1`, `motor-bridge-drive/v1`, `external-shaft/v1`,
`nuttx-program-deferred-start/v1` only at reviewed exact pins. Desktop-only; the web build
keeps the route disabled. First slice R13-M (measurement), then R13a.
Coordination: renode-infrastructure-spike-prime#37 (external shaft), renode-spike-prime#58
(lockstep command, profiling), brickwright-spike-prime-fw#54 (FYI), brickwright-lite#1055
(broker ops, session bound — SPIKE G02 owners: please say whether you own the native part).
