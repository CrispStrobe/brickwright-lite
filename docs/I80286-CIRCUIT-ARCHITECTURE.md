# 80286 circuit architecture and acceptance tests

Status: proposed implementation contract, 2026-09-08. No new runtime is shipped.
Parent: [circuit-first plan](I80286-CIRCUIT-PLAN.md).

## Separation of responsibilities

```text
CPU architectural state + resumable execution
                  |
CPU bus sequencer / selected device's pin contract
                  |
deterministic circuit scheduler and resolved nets
                  |
decode / bus control / transceivers / ROM / RAM / peripherals
```

The CPU computes architectural addresses and operations. Its bus sequencer
drives and samples the external pins at specified phases. The circuit decides
which component responds and what data reaches the CPU. The editor observes
this process; it is not a substitute memory provider.

The execution engine must suspend at an unresolved external transaction and
resume without duplicating writes, instruction effects or peripheral events.
Memory callbacks that return bytes immediately are not sufficient for arbitrary
wait states, clock stepping and changing external signals.

Do not execute an instruction against hidden RAM and then fabricate a bus
trace. Prefetch activity, split transfers, interrupt acknowledge and bus
ownership are observable behavior requiring explicit contracts.

## Digital circuit contract

- Represent driven low, driven high, high impedance and unknown/conflict.
  Floating buses must not silently become plausible instructions. A pull-up
  or other default value needs an explicit electrical model or board policy.
- Resolve all drivers before sampling. Report contention with component/pin
  names and simulation time; conflicting drivers remain diagnosable even if
  a simplified logic rule could produce a value.
- Use integer simulation ticks and deterministic event ordering. Separate
  drive, settle and sample phases. Bound combinational settling and identify
  non-convergent loops rather than hanging the browser.
- Describe clocks as explicit signals and periods. Do not equate oscillator
  edges, CPU cycles and instruction counts.
- Define the selected device's address/data lanes and status signals from its
  datasheet, including A0 and active-low BHE byte selection, memory versus I/O,
  instruction/interrupt-acknowledge status, and bus-controller inputs.
- Specify reset sequencing and the initial physical fetch at `0xFFFFF0`.
  Preserve reset-time hidden segment state; a normal real-mode `CS << 4`
  calculation alone must not replace reset addressing.
- Define READY sampling/wait states, HOLD/HLDA ownership, interrupt sampling,
  LOCK and halt behavior before claiming each feature. Unimplemented
  coprocessor interfaces must be documented and rejected when used.
- Model external decoding and any A20 masking explicitly. Byte/word and odd
  address transfers must produce the correct external accesses, not merely
  the right final numeric value.

Exact edge tables, legal timing and package pin numbers remain M0 work and
must cite the selected datasheet revision. The list above is a requirements
inventory, not an already validated timing specification.

## State, debugger and UI

Expose separate capabilities for architectural stepping, bus-cycle stepping,
clock-edge stepping, protected mode, snapshots and acceleration. Distinguish
implemented, validated, unsupported and not-yet-tested features. Default-off
experimental status must remain visible in saved examples and machine details.

Trace records need simulation tick/phase, bus owner, address, byte lanes,
operation/status, resolved data, wait-state count and relevant driver changes.
Bound trace storage; report dropped history instead of presenting it as complete.
Pausing or rendering must not change simulated ordering.

Snapshot envelopes identify schema, backend/source revision, CPU variant,
execution fidelity and circuit topology/configuration. Payloads must include
hidden CPU state, pending transactions, device state, clock/event queue and
drive state sufficient for deterministic continuation. Reject incompatible
restores before mutating the machine. Initially advertise snapshots unsupported
until round-trip tests cover an in-flight wait state and interrupt sequence.

## Acceleration policy

Start with the detailed path as the correctness reference. Later allow direct
memory or batched execution only when topology and observation requirements
prove equivalence: stable decode, safe memory, no unhandled competing master,
and a known next external event. End execution batches before that event.

Circuit edits and relevant device changes invalidate eligibility and cached
code/mappings. Self-modifying code must invalidate translated instructions.
Trace/watchpoint requirements may require detailed execution; report that
explicitly. Do not switch CPU backends when enabling a fast path.

Bus-visible fidelity is not automatically exact internal microarchitecture or
instruction timing. Publish supported accuracy separately, and compare external
traces against hardware/documented references before claiming cycle accuracy.

## Acceptance matrix

All rows are planned, not passing results. Each test requires a deterministic
fixture, independently specified expectation and a bounded timeout.

| Area | Positive test | Negative or boundary test |
|---|---|---|
| Reset | Required reset sequence leads to ROM fetch at `0xFFFFF0` and far jump | Missing ROM cannot boot through hidden memory; invalid reset is diagnosed |
| Decode | Only the selected ROM/RAM bank drives data | Overlapping selects identify conflicting drivers |
| Byte lanes | Low/high bytes, aligned words and odd-address words give correct transfers | Swapped lanes change result or fail a named assertion |
| Wait states | Delayed READY preserves transaction and samples data at completion | No duplicate writes; permanently unready bus times out diagnostically |
| Ownership | HOLD/HLDA follows documented handoff and return | CPU does not drive the bus while another master owns it |
| Interrupts | INTR acknowledge/vector and NMI behavior match the contract | Masking, boundary arrival and halt wake-up are covered |
| Logic | Stable gate/transceiver network settles deterministically | Floating inputs, contention and oscillation are visible |
| Memory | ROM boot and RAM result use editor wiring | Removed chip/select/data wire prevents the expected success |
| CPU | Owned program and architectural suites agree on state | Unsupported opcodes/features stop explicitly, not as NOPs |
| Protection | Mode changes, descriptors and faults match specified 286 behavior | Invalid descriptors and privilege checks produce expected faults |
| Snapshots | Resume an in-flight transaction identically | Wrong backend/version/topology rejected without partial mutation |
| Fast path | Same guest state, device effects and required bus observations | Event deadlines, rewiring and self-modification invalidate assumptions |
| Browser | Run, pause, step and dispose stay responsive | Trace exhaustion and cancellation do not leak a running machine |

Use PCjs only as an additional architectural oracle where configurations and
defined behavior match; it is not the oracle for physical pin timing. Hardware
traces or primary timing specifications must ground bus-level expectations.
