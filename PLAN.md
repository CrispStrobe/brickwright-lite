# Brickwright execution plan

This file contains only work that remains. Read [HANDOFF.md](HANDOFF.md) before
editing, [LANES.md](LANES.md) before claiming work, and [HISTORY.md](HISTORY.md)
only when prior evidence matters.

## Product boundary

Brickwright is a permissively licensed visual computing workbench for circuits,
firmware, debugging, guided lessons, and LEGO hubs. The browser and native app
must share project formats and observable device state. An unavailable feature
must be refused explicitly; silent fallback is a defect.

The repository owns overlays and integration code. `packages/` is a generated,
validated mirror of pinned upstream sources. Never repair an upstream-owned
file only in its vendored destination.

## Work order

### P0 — SPIKE firmware simulation

Deliver one end-to-end scenario for every selectable SPIKE target: LEGO legacy
v2, LEGO v3, Pybricks, spike-nx, and Brickwright NuttX. A target is supported
only when an unchanged user-supplied image executes in Renode and publishes the
same transport-neutral brick state consumed by the dashboard.

Required sequence:

1. Import the Renode snapshot protocol through a narrow adapter; do not expose
   Renode types to Scratch extensions or React components.
2. Model one motor and one sensor through attach, identify, command, feedback,
   detach, reconnect, timeout, and malformed-frame paths.
3. Publish display, buttons, battery, power, IMU, audio, storage, and Bluetooth
   state through the same immutable snapshot contract.
4. Cover Classic RFCOMM and BLE GAP/GATT/ATT through a transport-neutral HCI
   controller service with deterministic time and injectable failures.
5. Prove each firmware target with boot milestones and observable assertions,
   not instruction-count progress alone.
6. Add SPIKE Essential only through its distinct board map; never run an
   Essential image on the Prime machine definition.

Acceptance gates:

- no LEGO, Pybricks, or TI firmware is committed or uploaded as an artifact;
- local images are selected through a hash manifest and remain local;
- a missing image produces a named skip, never a false pass;
- two identical runs produce identical snapshots and event order;
- the GUI identifies family, firmware target, transport, image hash, run state,
  attached peripherals, and unsupported capabilities;
- simulation cannot call a physical flashing path;
- Node contract tests and a browser scenario cover the adapter boundary.

The wire contract and ownership boundaries live in
[docs/SIM-LAB-PLAN.md](docs/SIM-LAB-PLAN.md). LEGO authoring boundaries live in
[docs/LEGO-ARCHITECTURE.md](docs/LEGO-ARCHITECTURE.md).

### P1 — LEGO authoring coverage

Extend measured block/code round-tripping without treating incompatible hub
schemas as aliases. Each hub needs a table derived from its extension metadata:
opcode, block kind, argument shape, menus, device capability, and refusal.

Acceptance gates:

- the census denominator is generated from `getInfo()`;
- every opcode is mapped, host-only, event-only, or refused with a reason;
- forward output is a real `.sb3` ZIP and reverse output reaches a fixed point;
- deterministic VM semantics are asserted for representative operations;
- transport behavior is tested separately from code conversion.

### P2 — Native capability boundary

Keep browser pages unprivileged. Bluetooth, files, camera, microphone, and
sharing cross the reviewed native broker boundary only. Capabilities are
declared per caller and unavailable operations fail closed.

Acceptance gates:

- BLE and Classic adapters implement one neutral interface;
- caller identity is established at the broker/Rust boundary;
- packaged broker assets are content-pinned and verified;
- desktop and mobile tests cover permission denial, reconnect, cancellation,
  timeout, and teardown;
- real-hardware verdicts remain separate from simulator verdicts.

### P3 — Emulator fidelity

Increase fidelity where a user-visible or debugger-visible contract requires
it. Prioritize Arduino peripheral behavior and source-level debugging, RP2040
symbols and peripherals, then explicit capability gaps on other machines.

Acceptance gates:

- every target advertises capabilities rather than inheriting a global set;
- unsupported registers, buses, and source features are refused or recorded;
- differential oracles compare state, never wall-clock speed;
- performance work preserves deterministic state and wake ordering.

### P4 — Circuit and project integrity

Close the gap between rendered schematics and the electrical model, extend
symbol coverage, and preserve all project surfaces across save/load/export.

Acceptance gates:

- circuit variants assert solved topology as well as rendering geometry;
- project bundles retain code, blocks, circuit, controller, simulator model,
  firmware manifest references, and explicit refusals;
- corrupt or newer-schema input fails without destroying the current project;
- undo/redo and autosave operate on the same authoritative model.

### P5 — Lessons and release quality

Review lessons against the shipped runtime, instruments, translations,
accessibility surface, and hardware/simulator boundaries. Then close platform
release feedback without weakening gates.

Acceptance gates:

- every automated lesson checkpoint has a manual fallback;
- examples execute through the same public path learners use;
- English and German user-facing strings stay synchronized;
- web, desktop, iOS, and Android builds state their capability differences;
- release notes distinguish simulated, hardware-tested, and experimental work.

## Completion rule

A task leaves this file only when its code, focused tests, integration gate,
documentation, and provenance changes are committed together and the required
remote checks are green. Record the durable result in [HISTORY.md](HISTORY.md),
release its lane, and delete superseded planning text.
