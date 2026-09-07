# LEGO simulation architecture

This document fixes the contracts for the virtual hub, unchanged-firmware
execution, and the future Technic mechanism lab. Current task order and gates
are in [../PLAN.md](../PLAN.md).

## Non-negotiable boundaries

- Scratch extensions, firmware runners, protocol emulators, physics, and React
  components communicate through neutral state and event contracts.
- Official LEGO, Pybricks, and TI images are local user inputs selected by hash.
  They are never committed, redistributed, or uploaded.
- Firmware target, hub family, and transport are separate fields. A compatible
  CPU vector table does not establish a compatible board.
- Simulation cannot invoke a physical flashing command.
- One deterministic simulation clock orders protocol, device, physics, and GUI
  events. Wall time is never part of a correctness assertion.
- Unsupported operations return structured refusals.

## Firmware target identity

| Target | Board | Expected transport | Image policy |
|---|---|---|---|
| LEGO legacy v2 | SPIKE Prime | Classic RFCOMM/Scratch Link | local hash manifest |
| LEGO v3 | SPIKE Prime | LEGO BLE | local hash manifest |
| Pybricks Prime | SPIKE Prime | Pybricks BLE | local hash manifest |
| spike-nx | SPIKE Prime | image-declared | local hash manifest |
| Brickwright NuttX | SPIKE Prime | declared compatibility adapters | reproducible project build |
| LEGO Essential | SPIKE Essential | image-declared BLE | local hash manifest |
| Pybricks Essential | SPIKE Essential | Pybricks BLE | local hash manifest |

Prime and Essential use different Renode platform descriptions. The UI shows
target ID, board ID, transport, image SHA-256, execution state, capability set,
and fidelity limitations.

## State contract

\`HubState\` is plain immutable data plus ordered events. It contains no
protocol bytes, React objects, Renode types, or physics-engine objects.

\`\`\`text
HubState
  schemaVersion, seq, clockNs
  target { id, board, transport, imageSha256, capabilities, limitations }
  lifecycle { state, bootMilestone, resetReason, fault }
  power { batteryMv, currentMa, charger, powerHold }
  buttons { center, bluetooth }
  display { width, height, pixels, statusLed }
  imu { quaternion, accel, gyro, temperature, ready, interrupt }
  audio { enabled, sampleRate, queuedFrames }
  storage { medium, size, dirty, operation }
  ports[A..F] {
    attachment, typeId, mode, authority,
    motor { command, speed, position, load, stalled },
    sensor { kind, values, valid }
  }
  bluetooth { controller, linkState, peers, services, lastError }
\`\`\`

Required invariants:

1. \`seq\` increases for every mutation; \`clockNs\` never decreases.
2. Snapshots are immutable and schema-versioned.
3. Attach/detach, authority changes, commands, feedback, and faults are events.
4. Integers wider than JavaScript's safe range serialize as canonical
   hexadecimal strings.
5. Unknown required fields fail closed; unknown optional fields are ignored.
6. Producers report dropped events and insert an explicit gap.
7. Serialize/restore followed by the same inputs yields the same event hash.

Sensor authority is \`dashboard\`, \`physics\`, or \`firmware\`. Exactly one
authority writes a value. Starting physics transfers relevant sensors to
\`physics\` and disables dashboard controls; stopping returns them to
\`dashboard\`.

## Adapter boundaries

\`\`\`text
Scratch extension ── BLE/Classic bytes ─┐
                                       ├─ protocol adapter ─┐
unchanged firmware ── Renode devices ───┘                    │
                                                            ▼
                                                    HubState/event bus
                                                       │           │
                                                   dashboard   physics bridge
\`\`\`

The virtual Web Bluetooth implementation exposes only the Web Bluetooth shape
used by the extensions. A \`VirtualPeripheral\` supplies advertised identity,
service UUIDs, \`onWrite(uuid, bytes)\`, and ordered notifications. With no
virtual peripheral registered, existing real-device behavior is unchanged.

The Renode adapter consumes versioned newline-delimited JSON snapshots and
commands. Transport framing is owned by the adapter; decoded state is the only
object visible above it. Every command carries \`schemaVersion\`, \`requestId\`,
\`targetId\`, and an optional expected sequence. Every response echoes the ID
and returns \`ok\`, a state delta, or a structured error.

The Bluetooth controller service sits below firmware HCI and above simulated
peers. Its transport-neutral interface covers:

- HCI command, ACL, and event packets;
- Classic inquiry/connect, L2CAP, RFCOMM, credits, disconnect, and timeout;
- BLE advertising, connection, ATT/GATT discovery, read/write/notify, pairing
  state where required, disconnect, and timeout;
- deterministic peer scripts and injectable malformed packets or failures.

The TI service pack is not emulated as proprietary controller internals. A
synthetic controller responds at the HCI boundary. Tests requiring the real
patch accept a local user-supplied file and produce no public artifact.

## LPF2 device contract

Each port model implements:

\`\`\`text
attach(descriptor)
detach()
receive(bytes, clockNs)
advanceTo(clockNs)
snapshot()
restore(snapshot)
injectFault(kind, parameters)
\`\`\`

The first reference set is one tacho motor and one UART sensor. It models
attachment and identification, UART-mode negotiation, format selection, input
samples, output commands, encoder feedback, load, stall, detach, reconnect,
timeout, checksum/framing errors, and deterministic reset.

Motor integration uses simulated time. Sensor samples carry acquisition time
and validity. Semantic state changes only after a valid complete frame.

## Brick-device contract

Peripheral models expose reset, clocked advancement, snapshot/restore, and
fault injection. The minimum interactive set is:

- Prime matrix/TLC5955 and Essential LP50xx display state;
- LSM6DS3TR-C registers, FIFO, interrupts, and sample timing;
- external flash persistence, erase/program rules, busy state, and corruption;
- center and Bluetooth buttons with debounce;
- battery, charger, power-hold, brownout, and shutdown;
- speaker/audio DMA with observable sample frames.

Tests assert firmware-visible registers or transactions and resulting
\`HubState\`; instruction progress alone cannot pass.

## Technic mechanism lab decisions

These decisions remain fixed unless a measured gate forces reconsideration:

- Jolt Physics (MIT) in a worker at fixed 120 Hz; Rapier is the fallback only
  if the iOS size/memory gate rejects Jolt.
- three.js and \`LDrawLoader\` (MIT) for rendering.
- a curated, hash-pinned LDraw subset under CC-BY-2.0 with attribution.
- project-authored connectivity metadata; never copy proprietary BrickLink
  Studio or unclear-license LDCad connectivity data.
- LDraw MPD text is the format of record stored as a project asset.
- simulate mechanisms, not one rigid body per brick connection.

Connectivity metadata is the one source for snapping, compilation, collision,
and gear inference. It defines connector type/pose, gear teeth and pitch,
colliders, and mass. A validator checks declared geometry against the LDraw
mesh.

The mechanism compiler merges rigid connections into compound-body islands and
creates constraints only for real motion. It infers axle hinges, motorized
hinges, sliders, parallel/bevel gear pairs, racks, and worms from validated
metadata. The engine worker receives a versioned engine-neutral scene and emits
bounded-rate pose/joint snapshots. The bridge maps motor commands to joints and
joint/sensor results back to \`HubState\`.

## Remaining delivery slices

1. Renode-to-\`HubState\` adapter and one motor/sensor scenario.
2. Deterministic Classic/BLE HCI controller service.
3. Full LPF2 reference motor and UART sensor.
4. Display, IMU, buttons, power, audio, and storage fidelity.
5. Firmware-family scenario matrix, faults, snapshot replay, and soak tests.
6. Mechanism metadata schema, validator, curated LDraw pipeline, and viewer.
7. Mechanism compiler, worker, bridge, sensors, editor, persistence, and lessons.

Every slice requires focused contract tests, a packaged/browser gate when it
crosses that boundary, license and provenance updates, deterministic replay,
and explicit resource budgets.

## V1 refusals

Refuse soft-body physics, photorealistic rendering, arbitrary unvalidated LDraw
parts, proprietary connectivity imports, multiplayer, mobile AR, unrestricted
firmware upload, and physical flashing. EV3 Classic firmware execution remains
separate until its board and transport contracts are modeled.
