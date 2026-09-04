# Full-system debugger architecture

Started 2026-09-04. This is the contract and delivery plan for turning the
existing per-CPU debug adapters into a deterministic, inspectable,
time-travelling debugger without claiming fidelity a core does not possess.

## Outcome

A learner must be able to stop on the event that matters, inspect why it
happened, move backward and forward without changing the result, and correlate
source, blocks, instructions, buses, devices, signals and rendered output on
one timeline. The same commands should mean the same thing on every target;
unsupported precision must be named, not simulated by the debugger UI.

The intended end state combines the strongest useful properties of legacy
in-circuit emulators, monitor/debuggers and logic analysers with modern record
and replay:

- instruction, source, block, task, oscillator, machine-cycle and bus-phase
  stepping where the target can actually expose those boundaries;
- step over, step out, run to cursor/event/time and interrupt-aware stepping;
- execute, read, write, access, change, I/O, interrupt, register, signal,
  device, time and expression breakpoints;
- conditional breakpoints, hit counts, one-shot stops, logpoints, tracepoints
  and checkpoint actions;
- a loss-bounded live trace and a lossless bounded recording mode;
- checkpoints, deterministic replay, reverse step/continue and forked
  experiments;
- synchronized source/blocks, disassembly, registers, memory, stack, task,
  interrupt, device, bus-waveform, serial, audio and video views;
- exportable traces with an explicit schema and enough provenance to compare
  with hardware or an independent emulator.

This is not one giant UI feature. It is an execution-data contract with several
consumers. The UI comes after the recorder can prove that it preserves and
replays the truth.

## Current baseline

| target | stepping now | stops/hooks now | fidelity limit |
| --- | --- | --- | --- |
| 8051/STC | instruction, oscillator cycle, block, over, out | code, yield, write; code/IRAM/SFR/XRAM/bit memory | strongest reference target; event transport and read hooks are incomplete |
| AVR | instruction, block, over, out | code, yield, write | core executes an instruction atomically |
| RP2040 | instruction, block, over, out | code, yield, write | core executes an instruction atomically |
| 6502 | instruction, block, over, out | code, yield, write, symbols | instruction-atomic despite a cycle-returning interface |
| Z80 | instruction, over, out | code, write | no source symbols/yield integration; instruction-atomic |
| 8086 | instruction, over, out | code, memory write, port, interrupt | instruction-atomic; timing is estimated, no BIU/prefetch/bus-phase state |
| labwired | instruction | execute only | read-only debugger memory and current-PC-only disassembly |
| physical serial | monitor-specific | monitor-specific | capabilities must be negotiated, never inferred |

The existing shared pieces are `debug-runner.js`, `trace.js`,
`breakpoints.js` and `frames.js`. They remain compatibility surfaces while the
new event and recording contracts land. Existing adapter refusals are valuable:
they prevent a control from pretending to work on a target that cannot support
it.

## Non-negotiable semantics

### Recorded, predicted and reconstructed are different

Every timing datum carries one of these fidelity labels:

- `recorded`: emitted by the executing model at that boundary;
- `predicted`: derived from an opcode/timing table and not evidence that the
  model visited intermediate states;
- `reconstructed`: inferred after execution from before/after state.

Only `recorded` events may drive cycle stepping, signal-edge breakpoints or a
hardware-comparison claim. Predicted timing remains useful for education and
profiling, but is displayed as such. A static list of T-states must never be
presented as a captured bus trace.

### Pausing is an execution transaction

A stop has one immutable cause and a total order. The debugger pauses only at a
boundary declared safe by the target. Inspection cannot advance timers, drain
UART queues, acknowledge interrupts or mutate a read-sensitive device. Debug
reads therefore declare whether an address space is passive; a target may
refuse a destructive read.

### Replay is a correctness feature

Reverse execution means restoring an earlier complete state and replaying the
same timestamped inputs to the requested event. It does not mean applying
register diffs backward. Replay must reproduce event hashes, visible output and
the eventual stop cause. A mismatch halts with a divergence report; it never
silently continues on a new history.

### Capabilities are negotiated

Targets return a versioned capability document. Controls and breakpoint kinds
are derived from it. Absence is not false support, and a remote monitor may
change capabilities after reconnecting or loading different firmware.

## Canonical event stream

The transport is a versioned stream of normalized events. CPU cores and machine
layers emit the facts they own; adapters attach symbols and source mappings but
do not invent execution phases.

```js
{
  schema: 1,
  seq: 184467,
  time: {ticks: 99321n, domain: 'oscillator', hz: 12000000},
  cpuId: 'main',
  kind: 'instruction', // bus, memory, port, interrupt, signal, device, scheduler
  phase: 'retire',
  fidelity: 'recorded',
  pcBefore: 0x0180,
  pcAfter: 0x0183,
  instruction: {address: 0x0180, bytes: [0x75, 0x90, 0xff], mnemonic: 'MOV'},
  changes: {registers: {A: {before: 0, after: 1}}},
  memory: {space: 'xram', address: 0x2000, width: 1,
           direction: 'write', before: 0, value: 1},
  source: {file: 'main.c', line: 18, blockId: null, task: 'main', state: null},
  device: {id: 'uart0', event: 'tx-ready'},
  signals: {rd: 1, wr: 0, ale: 1},
  cause: null
}
```

Fields irrelevant to an event are omitted. Integers whose width exceeds safe
JSON range use canonical hexadecimal strings at serialization boundaries.
Within a worker, hot events use numeric kind/field dictionaries and typed
arrays. The object above is the public decoded shape, not the per-cycle storage
layout.

Required invariants:

1. `seq` is strictly increasing within a recording and provides total order.
2. Time never decreases within one clock domain.
3. Every retire event identifies its pre- and post-PC.
4. Every mutation event identifies the owner, address/register and new value;
   the old value is present when the producer can supply it without side
   effects.
5. An event links to a checkpoint/input-log position without embedding a full
   snapshot.
6. Producers state loss. A ring overwrite increments a visible dropped-event
   counter and inserts a gap marker.
7. Schema negotiation rejects unknown required fields and ignores unknown
   optional fields.

The browser path is a producer-owned ring buffer with bulk drain, preferably a
`SharedArrayBuffer` where isolation permits and a transferable chunk fallback
elsewhere. One JavaScript/WASM crossing per event is prohibited for cycle-mode
cores; a core writes compact entries and the worker drains batches.

## Checkpoints and deterministic inputs

A checkpoint is only valid when it includes every state that can affect future
execution:

- CPU architectural and private microstate, including pending instruction,
  prefetch/microcode position and sleep/halt state where applicable;
- RAM and writable code/media state;
- devices, timers, DMA, interrupt controllers, UART queues, video scan state,
  audio phase, pin nets and analogue solver state;
- machine scheduler queues and simulated clock domains;
- deterministic PRNG state;
- debugger configuration that affects execution or event production;
- input-log cursor and event-sequence cursor.

External inputs are appended before they are applied. This includes keyboard,
buttons, pointer controls, sensors, serial/network receive, media insertion,
reset, clock changes, debugger memory/register edits, breakpoint actions that
mutate state, and any entropy source. Each input has simulation time, ordering
sequence, producer, payload and schema version.

Storage starts conservatively: periodic full snapshots plus deduplicated page
hashes and event/input chunks. Copy-on-write and deltas are optimizations only
after restore equivalence is proven. Recordings have explicit memory/time
budgets and eviction happens at checkpoint boundaries so every retained event
remains reachable from a retained restore point.

Checkpoint tests must prove:

- serialize/restore equality for every target-owned state component;
- replay from checkpoint produces the same normalized event hash;
- input at the same simulated timestamp retains insertion order;
- eviction leaves no dangling event range;
- schema/version mismatch fails closed with a useful reason;
- a deliberately omitted timer, queue or PRNG field causes the divergence gate
  to fail, proving the test is sensitive.

## Breakpoint and action engine

All breakpoints compile to predicates over events plus optional state reads.
The engine is target-neutral; capability negotiation determines which event
kinds can ever occur.

Breakpoint kinds:

- execute address/range, source line, block, yield, task and scheduler state;
- memory read, write, access or value change by space/range/width;
- I/O port read/write, interrupt request/acknowledge/vector/return and exception;
- register value/change/transition and expression transition (`false → true`);
- signal/pin edge, level duration and named bus phase;
- device event and device-register change;
- instruction/cycle/time count and run-until timestamp;
- call/return/depth, stack corruption and return-address watch;
- dataflow transition watchpoints added later by replay search.

Predicates support conditions, hit counts, modulo counts, ignore counts,
one-shot and enable windows. Actions are an ordered list of `halt`, `log`,
`capture`, `checkpoint`, `counter`, `script-safe-expression` and, only where
explicitly enabled, `write`. Logpoints and tracepoints do not require a stop.
Action failures become debugger events and cannot disappear into console logs.

Conditions use the existing safe expression machinery extended with a bounded,
side-effect-free context. No `eval`, function calls, getters or unbounded
memory reads. Reads against destructive device spaces are rejected at compile
time. A compiled predicate reports required event kinds so producers can avoid
generating unused high-volume events.

Stop arbitration is deterministic: collect every match for an event, sort by
breakpoint creation sequence, execute non-mutating actions, create an optional
checkpoint, then halt once with all matching breakpoint IDs attached.

## Commands and stepping

The common command surface is:

`pause`, `continue`, `stepInstruction`, `stepCycle`, `stepPhase`, `stepSource`,
`stepBlock`, `stepTask`, `stepOver`, `stepOut`, `runTo`, `reverseInstruction`,
`reverseCycle`, `reverseContinue`, `seekEvent`, `seekTime`, `checkpoint`,
`restore`, `fork`, `read`, `write` and `evaluate`.

Each command returns `{accepted, commandId, capability, boundary}` immediately
and later emits completion/stoppage. Unsupported commands return a structured
refusal naming the missing capability. `stepCycle` means the target advanced to
the next recorded target cycle boundary; it is not an alias for an instruction.

Step-over/out prefer target call/return metadata. A conservative temporary
execute breakpoint is allowed only when control-flow decoding proves a unique
safe return boundary; interrupts and task switches remain visible in the event
history. When that cannot be proven, the adapter refuses instead of guessing.

## User workspace

Every pane follows one selected event rather than independently querying “now”.
Selection synchronizes:

- source, blocks and disassembly with executed bytes and symbol provenance;
- registers/flags and before/after diffs;
- memory hex, typed interpretations, changed ranges and access heat;
- call stack, return sites, tasks and scheduler transitions;
- interrupt controller/request/acknowledge history;
- device registers and semantic device events;
- bus and pin waveforms, with cursor-aligned instruction/microcode phase;
- serial terminal, audio waveform and video frame/scan position;
- checkpoint/input/fork timeline and recording budget.

Live inspection stays lightweight. Full recording is opt-in and estimates its
event rate and retention window before starting. Filters reduce display work,
not historical truth, unless the UI clearly says the producer is no longer
recording a class. MartyPC-scale traces can reach gigabytes; exports stream and
the UI never materializes an entire recording at once.

Import/export starts with canonical JSON Lines for diagnostics and a compact
binary container for recordings. CSV and sigrok/VCD exports are derived views
for bus/signal work. Exports include schema, target/core versions, firmware
hashes, clock configuration, capability document, fidelity labels and gap
markers.

## CPU delivery plans

### 8051/STC — reference integration

Use the existing genuine oscillator-cycle boundary as the reference producer.
Add bulk event transport, passive read watchpoints, interrupt/timer/UART/device
events and complete snapshot serialization. Prove forward/reverse equivalence
here first because it already has the precision the architecture needs.

### 8086/8088 — first new cycle engine

Keep the validated functional core as the fast instruction mode and oracle.
Add a separate resumable execution engine that owns decoder, EU microstate, BIU,
prefetch queue, bus T1–T4/Tw phases, interrupt acknowledge, HOLD/DMA boundaries
and partial-instruction snapshot state. The two modes must agree on
architectural retire state.

Ground it against Intel documentation, SingleStepTests retire state, real-chip
cycle captures and black-box independent emulators. MartyPC is a behavioral and
workflow reference, not code to copy. The acceptance is captured bus/event
agreement, not a timing table that sums to the expected instruction total.

### 6502 and Z80 — true cycle cores

The present cores remain fast functional modes. Cycle stepping requires
resumable cores whose state machines expose each bus transaction and interrupt
sampling boundary. Validate retire state against existing vector suites and
cycle/bus traces against cycle-bearing vectors or hardware captures. Predicted
opcode timing can ship earlier, under the `predicted` label, but cannot unlock
cycle controls.

### AVR and RP2040

First supply deterministic snapshots, complete memory/I/O hooks, interrupts,
task/scheduler events and reverse instruction execution. Cycle or pipeline
stepping waits for cores that expose resumable microstate. RP2040 multicore
recordings require a deterministic machine scheduler and must show which core
owned each event.

### labwired and physical targets

Labwired gains arbitrary disassembly, symbols, safe writes, access hooks,
interrupt/peripheral events and serialization. Physical targets negotiate a
monitor protocol describing address spaces, hardware break/watch registers,
trace buffer, halt semantics and checkpoint support. Host-side polling is not a
watchpoint and must not be labelled one.

## Delivery slices and acceptance

### Slice 0 — contract and capability census

- this document, typed schemas and a target capability matrix;
- conformance tests for schema, ordering, gaps and structured refusals;
- no behavior change to existing adapters.

### Slice 1 — event foundation

- compact ring/chunk producer and decoded `DebugEvent` API;
- runner routes old trace consumers through an event compatibility adapter;
- 8051 and 8086 instruction-retire producers, mutation-proved for PC/order;
- bounded overhead benchmarks with tracing off, live ring and recording on.

### Slice 2 — recorder and replay

- versioned snapshot/input contracts and storage budgets;
- checkpoint/restore on 8051 and 8086 instruction mode;
- deterministic replay hash and divergence reports;
- reverse instruction/continue implemented as restore plus replay.

### Slice 3 — unified breakpoints

- predicate compiler and ordered action engine;
- execute, memory, port, interrupt, register transition and time predicates;
- legacy breakpoint migration and capability-sensitive refusals.

### Slice 4 — timeline workspace

- event cursor and synchronized panes;
- recording controls, retention/gap visibility and streamed exports;
- checkpoint restore/fork and reverse controls.

### Slice 5 — real cycle targets

- 8086/8088 resumable BIU/EU core first;
- 6502 and Z80 cycle cores next;
- waveform/hardware comparison harnesses and recorded-fidelity gates.

### Slice 6 — causal debugging

- replay-indexed “when did this become wrong?” transition search;
- dataflow provenance where producers can supply it;
- automated bisection between a known-good checkpoint and bad event;
- shareable minimal recording slices with firmware/source provenance.

Every slice must ship with executable acceptance tests, mutation evidence for
the central claim, documentation of unsupported cases and measurements of
runtime/memory cost. A green test that never observes a producer is not
evidence; producer activity and non-empty event ranges are preconditions.

### Verification resource policy

This repository's full suite includes CPU-heavy circuit, lesson and corpus
workers. The shared four-vCPU development host is for focused tests: changed
modules, their direct integration gates, overlay/package parity and quick
smokes. Before any local run, use `npm run check:load`; do not launch the full
`npm test` or production webpack build on this host. Push the reviewed commit
and let GitHub Actions run the parallel full suite/build on disposable runners.
If CI fails, reproduce only the named failing gate locally. This is an
execution policy, not permission to weaken or skip the full remote verdict.

## Work ownership and integration order

The coordinator owns contracts, cross-module integration, compatibility,
capability truthfulness, final verification and remote delivery. Independent
agents may own non-overlapping implementation units after the contract lands:

1. event schema/ring plus focused tests;
2. checkpoint/input recorder primitives plus focused tests;
3. predicate/action breakpoint engine plus focused tests;
4. later, CPU producers and UI panes in separate files.

No agent independently changes the public event shape. Contract questions go
through the coordinator. No agent pushes `main`; integration is reviewed and
committed from the isolated coordinating worktree. Overlay changes must be
mirrored into `packages/` through the repository integration script before a
delivery commit.

## References and design ancestry

- [MAME debugger](https://docs.mamedev.org/debugger/index.html): device address
  spaces, conditional breakpoint/watchpoint actions, register/exception points
  and annotations.
- [GDB process record and replay](https://sourceware.org/gdb/current/onlinedocs/gdb.html/Process-Record-and-Replay.html): reverse execution over recorded state.
- [Intel ICE-86A operating instructions](https://www.bitsavers.org/pdf/intel/ICE-86/162554-001_ICE-86A_Microsystem_In-Circuit_Emulator_Operating_Instructions_for_ISIS-II_Users_May81.pdf): period-appropriate in-circuit visibility and trigger workflows.
- [MartyPC user guide](https://github.com/dbalsom/martypc/wiki/MartyPC-User-Guide)
  and [releases](https://github.com/dbalsom/martypc/releases): instruction and
  cycle histories, machine/device windows, memory inspection and trace export.

These are capability references. Their implementations and licences do not
change the repository’s clean-room and dependency rules.
