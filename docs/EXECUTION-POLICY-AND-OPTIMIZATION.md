# Execution policy and optimization

Application companion to bw-board's execution-policy plan at `5804fff` and
`docs/WIRED-X86-PERFORMANCE-PLAN.md`. This lane starts from Lite
`411828a304dd84759cd4c1fb82444e72944ffbdc`, whose engine pin is
`53c3fdbabab232667da98f92db9e3a184f371373`. Its scoped adoption target is
`5ecd6125b685e52819b1064871750ed41f7f16d0`. No deployment is implied.

**P1 PAUSED/SUPERSEDED — 2026-09-12.** The coordinated owner-authorized npm
dependency migration replaces copied bw-board/bw-circuit-ui roots and their
sync/identity gates. The separate `feat/execution-policy-adoption` branch
preserves the bounded old-mechanism experiment only; do not land its vendor pin,
copies or sync repair over that migration. This GUI branch contains none of those
pin, sync or copied-engine changes.
Continue adoption through the migration owner's pinned package mechanism.
The policy/GUI/performance stages below remain applicable independently.

Before the pause, the isolated sync reached `5ecd612`, generated mirrors and
census, and refreshed BIOS provenance without changing ROM bytes (SHA-256
`6f9f5463afa5c30ce25263c0430f741cbb0274e98b00c675ef04c9edfee0aa34`).
Source `de39245b0f74ade850e05efb93867c700646b57b` is an ancestor of this pin,
with zero later BIOS-source commits. Two new module-discovery/import tests pass
on Node 22.12.0. Full identity, application behavior, build and browser gates
were not run: this is a checkpoint, not a qualified adoption candidate.

## Distinct choices

Functional machines execute instructions through software memory/port interfaces.
The DOS-program bench additionally supplies DOS services for COM/EXE programs;
that is different from booting DOS through BIOS and disk devices.
Wired digital machines resolve actual address/data/control connections through
bus phases, including contention, chip selects, READY and bus ownership. They
are supported ideal-digital models, not complete electrical/silicon simulations.

Implementation is a separate axis: reference JavaScript, indexed/compiled
JavaScript, or native/Wasm. The Harris native kernels currently cover selected
net/memory/phase operations, not a complete CPU/peripheral/project runner.
Vendoring these sources does not make native execution selectable in the app.

## Current GUI and automatic behavior

The original behavior below is the baseline. The P3 candidate now adds
construction-time Auto/Functional/Wired preferences and actual/refused status
for 8086/80186 only; see `I8086-EXECUTION-POLICY-GUI.md` for the implementation,
20 passing focused checks and still-required package/browser integration gates.
Cross-chip consumers and observation/topology re-admission remain future work.

Settings → 8086 execution diagnostics exposes optimized/reference RAM word
access, persisted locally and applied only to newly constructed targets.
Reference disables that shortcut, not all optimizations. Its JS/decoded/Wasm
benchmark has isolated bundled programs; it does not change project execution.
The RAM reference setting is not the engine's reference-core selection mode;
P3 deliberately offers no reference-core selector or native project backend.
COM/EXE identification routes to the DOS bench; machine media follows hardware
setup. Safe RAM access has guarded shortcuts and fallback. These are specific
rules, not a universal fidelity/backend selector.

8051 already uses Wasm as its normal core; AVR/RP2040 use JS/TypeScript cores.
Z80 has an optional externally supplied cycle-provider interface. W65C02 has a
candidate-provider interface, but the rejected candidate is not selectable.
We should share policy and observation infrastructure, not duplicate every core.

## Selection contract to implement

Offer Auto, functional-machine and wired-digital requirements, with reference
and experimental overrides in diagnostics. Auto may choose a faster qualified
implementation but must never silently lower fidelity. Unknown/unavailable
requests return named refusals, rather than silently becoming functional mode.
Show requested mode, actual backend, selection/refusal reason, supported
observations and restart requirement. New observations must be supported or
explicitly refused. Whole-backend changes initially require reconstruction;
registers/RAM alone are insufficient for seamless migration of pending bus
phases, interrupts, devices and scheduler state.

## Staged work and acceptance

1. **P1 engine adoption (this lane):** repair nested JavaScript vendor discovery
   and exact relative-import validation; sync only the pinned engine, preserve
   BIOS bytes while refreshing provenance, regenerate census then matrix and
   vendor index, update tracked mirrors, run identity/behavior/build gates.
2. **Policy:** pure capability-based resolver and explicit refusal tests in the
   engine, then application construction integration. No invented availability.
3. **GUI:** requested/active/reason status and restart-only preferences, tested
   against actual constructed targets, including storage failures and refusal.
4. **Measurements:** full application workloads separating execution, device,
   solving, rendering, allocation and messaging costs; report input latency too.
5. **Shared host improvements:** dirty rendering, bounded slices, lazy debugger
   observations, reusable buffers and appropriate workers. Workers alone do not
   improve intrinsic simulation throughput.
6. **Wired optimization:** affected-net/component scheduling, correct topology
   invalidation, complete native CPU bus/peripheral execution region, bounded
   batching respecting READY/IRQ/DMA/input/observation boundaries.
7. **Qualification:** reference comparisons, applicable pinned external oracles,
   DOS boot/app tests, browser benchmarks and debugger/replay tests. Promote only
   measured winners and retain the reference path. No default/deploy promotion
   follows merely from a component benchmark passing.

P1 does not deliver stages 2–7. The conventional CPU/debug improvements already
exist at the old pin; this adoption adds experimental sources and memory-model
interfaces, not a demonstrated functional performance gain. The wired target
remains unproven: 4.77 MHz equivalent requires about 9.55 million modeled
periods/s under the current two-period convention. Isolated-kernel throughput
is not full-board capacity or retired-instruction throughput.
