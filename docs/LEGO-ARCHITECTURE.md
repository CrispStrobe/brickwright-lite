# LEGO authoring and runtime boundaries

Brickwright supports multiple LEGO extension schemas and transports. Similar
names do not make their opcodes, firmware APIs, or protocols interchangeable.

## Layers

| Layer | Input/output | Owner |
|---|---|---|
| Scratch extension | blocks and transport calls | this repository's owned overlays |
| Code conversion | extension opcodes ↔ Brickwright dialect | pinned `sb3-creator` producer |
| On-hub generation | dialect/project → hub-specific program | pinned extension transpilers |
| Transport | program commands ↔ real or virtual hub | BLE, Classic, or bridge adapter |
| Firmware execution | unchanged image ↔ modeled hardware | Renode integration |
| Observable brick | motors, sensors, display, power, IMU | neutral `HubState` contract |

A result at one layer proves nothing about another unless an integration gate
crosses both boundaries.

## Supported family identities

SPIKE Prime, SPIKE Essential, EV3, NXT, Boost, WeDo 2.0, and Powered Up retain
distinct extension IDs and device descriptions. SPIKE legacy v2, LEGO v3,
Pybricks, spike-nx, and Brickwright NuttX are distinct firmware targets even on
the same Prime hardware.

Generated programs may target GPL or mixed-license user-installed runtimes
without embedding those runtimes. Their code and firmware remain outside the
distributed application.

## Block/code expansion contract

For each extension ID, generate a census directly from `getInfo()` containing:

- opcode and block kind;
- arguments, defaults, and menu domains;
- dialect verb and reverse mapping where supported;
- required device capability;
- classification: mapped, host-control, event-only, or refused;
- semantic fixture for stateful operations.

Forward conversion creates a real ZIP project whose declared extensions match
its opcodes. Reverse conversion preserves compatible arguments and reaches a
deterministic fixed point. Incompatible schemas are never collapsed by display
name. Unknown opcodes survive as explicit refusals rather than being dropped.

Transport tests are separate. A converted project is not evidence that a hub
connected or accepted a command.

## Runtime contract

Real and virtual transports implement the same lifecycle:

`idle → permission → discovery → connecting → connected → disconnecting → idle`

Cancellation, denial, incompatible firmware, timeout, remote disconnect, and
adapter loss are named terminal events. Reconnect creates a new session and
cannot retain stale subscriptions or port state.

Protocol adapters decode bytes into the neutral state defined by
[SIM-LAB-PLAN.md](SIM-LAB-PLAN.md). React components render snapshots and emit
commands; they never parse GATT, RFCOMM, HCI, or LPF2 frames.

## Editors

SPIKE and ev3dev deliverables use the Python editor but still need optional
hub-API completion and diagnostics. NXT NXC needs a dedicated language mode.
EV3 LMS bytecode is a binary artifact and is inspected, not hand-edited. These
editor additions rank below correct round-tripping and runtime behavior.

## Acceptance rule

A family may be called end-to-end only when the public UI path selects its exact
identity, loads or generates its artifact, crosses its declared transport or
firmware runner, mutates observable brick state, reads sensor feedback, handles
failure and teardown, and preserves the project on save/load. Each unsupported
stage remains visible in the capability document.
