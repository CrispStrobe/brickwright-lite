# 80286 Circuit Editor: circuit-first plan

Date: 2026-09-08. Status: limited wired CPU and isolated application lab;
general 286/editor component not yet delivered.

Implementation update: the paired engine now executes an owned loop ROM through
the ideal digital nets, Harris phase sequencer, external controller/latch and
existing RAM/ROM models. Engine `14f2538` adds saved fixed-profile recipes and a
bounded debugger session (117 targeted engine tests passed). Lite packages an
exact, separate experimental copy and exposes an explicitly enabled lab through
Settings → 8086 execution diagnostics → Open experimental 286 board lab.
See [lab usage and verification](HARRIS-286-BOARD-LAB.md).

This is partial M2 work, not a complete 286, arbitrary editor part placement,
full controller timing or protected mode. The production engine pin and project
CPU defaults remain unchanged. The lab's browser component test does not stand
in for a full application build, CI, hardware traces or general CPU conformance.

## Decision

Build a virtual computer from connected components in Circuit Editor. The CPU
must execute through the user's memory, decoding logic and peripherals. A
complete PC emulator displayed inside the editor does not satisfy this goal.

This supersedes the earlier priority of building a PCjs whole-machine adapter
before deciding on circuit integration. Keep PCjs and v86 experiments isolated
and default-off as software references and performance comparisons. Their
results alone cannot establish circuit compatibility.

The first target is a minimal wireable 286 board, not DOS, an IBM AT clone, or
a complete 386 implementation. Start with a documented Harris 80C286 variant
and package; do not silently treat every Intel/Harris variant as identical.

## Motivating builds

- [Original Pico-controlled 286 project](https://deadlime.hu/en/2026/02/22/computer-generated-dream-world/):
  a physical CPU interacting with software-provided memory and control signals.
- [Hackster overview](https://www.hackster.io/news/building-a-virtual-computer-for-the-intel-80286-3712f8db0474).
- [rehsd's breadboard system](https://www.rehsdonline.com/post/start-to-an-80286-system):
  discrete memory and supporting logic around a Harris processor.
- [Harris 80C286 datasheet](https://datasheets.chipdb.org/Harris/80c286.pdf):
  primary reference for the selected device's signals and timing. Before
  implementation, record revision, checksum and page references per contract.

We aim to reproduce the CPU/board interactions these builds demonstrate, not
their incidental host implementation. Simulating the Pico, MicroPython and SPI
expanders is a separate future feature, not required for the first 286 board.

## Current baseline and gap

The existing [8086 machine](../overlay/scratch-gui/src/lib/bw-board/i8086-machine.js)
uses instruction stepping, decoded memory/I/O windows, and peripheral advance
by instruction cycle counts. Its useful component and debugger infrastructure
does not establish clock-edge CPU-pin fidelity. Existing 8086 validation is not
evidence of 286 instruction, reset, protection or bus correctness.

Do not widen address masks or rename the 8086 to claim 286 support. A 286 needs
its own architectural state, reset behavior, instruction semantics and external
bus implementation. A20 gating belongs to board wiring, not an implicit CPU
assumption copied from a PC configuration.

## Implementation sequence

| Milestone | Deliverable | Exit gate |
|---|---|---|
| M0: contracts | Variant/package selection, source-backed bus contract, engine/parts/editor ownership map | Every initial signal has polarity, sampling and support status documented |
| M1: circuit foundation | Deterministic net resolution, bus handshake scheduler, memory/decode components, trace format | Synthetic bus-master tests pass, including deliberate wiring faults |
| M2: minimum 286 | Resumable CPU subset sufficient for owned boot firmware, connected ROM and RAM | Reset fetch, far jump, arithmetic, RAM store and halt occur through real nets |
| M3: useful board | Broader real-mode execution, bus controller, wait states, interrupt acknowledge and arbitration | Hardware-contract tests and circuit examples pass; unsupported operations remain explicit |
| M4: CPU completeness | Protected-mode descriptors, faults, privilege and task-state behavior | Versioned architectural suites and mode-transition tests pass with declared exclusions |
| M5: safe acceleration | Proven fast paths for eligible circuits | Detailed/accelerated differential tests and measured browser gains |
| M6: expansion | Evaluate 386SX, then DX or other targets | Separate CPU and bus contracts; no inference of support from 286 success |

M2 is an experimental subset, not a general-purpose 80286. No calendar or
performance promise is implied. Decide the CPU implementation at M0 using
the [backend evaluation criteria](X86-BACKEND-EVALUATION.md).

## First example and definition of done

Ship an owned, source-available ROM and a saved editable circuit containing
clock/reset, CPU, low/high ROM and RAM banks, decode logic and required bus
control. Boot from the 286 reset address, far-jump to the program, read two
operands, add them, store the result and halt. The source, assembled bytes,
expected result and bus assertions must be reproducible.

The learner must be able to stop the clock, step bus activity, inspect both
byte lanes and memory, and break the program by disconnecting or miswiring
the actual data path. A firmware loader may program ROM contents; it must not
secretly provide CPU-visible fallback memory when ROM is disconnected.

See [architecture](I80286-CIRCUIT-ARCHITECTURE.md) for the execution contract
and acceptance matrix.

## Boundaries and delivery policy

- Digital logic simulation first. No claim of transistor, analog voltage,
  metastability, signal-integrity or board-layout validation.
- Keep current 8086 defaults, pins and valid gated experiments unchanged.
- Add 286 only behind an explicit experimental gate with visible limitations.
- Keep the CPU/backend fixed for a running machine; never silently substitute
  v86 or another model for an unsupported circuit.
- Separate instruction stepping, bus stepping and clock stepping in the UI.
- No ROM/OS redistribution from third-party archives. Audit any reused source
  and build dependencies before vendoring.
- Implementation, upstream pin changes, merge and deployment are separate
  milestones. These documents do not claim any of them has happened.

## Repository ownership

Application means `CrispStrobe/brickwright-lite`: editor integration, examples,
capability presentation, browser tests and comparison tooling. Engine means
`CrispStrobe/bw-board`: CPU, machine and execution/device contracts. Part
definitions belong in the applicable parts upstream after its current schema
and ownership are inspected. Do not treat Lite's vendored engine copy as an
independent source of truth; coordinate engine implementation and verified pins.
