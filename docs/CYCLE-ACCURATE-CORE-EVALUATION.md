# Cycle-accurate core evaluation

## Z80 and 6502

The shipped Z80 and W65C02 implementations remain the fast functional
engines. Both execute an instruction atomically and return only its aggregate
cycle count, so neither can truthfully provide cycle stepping, intermediate
bus events, or a mid-instruction checkpoint. A replacement qualifies only if
one call advances one externally observable cycle, the address/data/control
pins are available at that boundary, and all decoder, interrupt, pin, and
partial-instruction state can be saved and restored deterministically.

| candidate | license and browser fit | cycle/debug contract | decision |
| --- | --- | --- | --- |
| [floooh/chips Z80, pinned evaluation](https://github.com/floooh/chips/blob/ca7d7ddd3ba77b48685d24120cf413ea53786767/chips/z80.h) | zlib; dependency-free C99 subset; the upstream examples are compiled to WebAssembly | `z80_tick` advances one clock and returns address, data, M1, MREQ, IORQ, RD, WR, RFSH, WAIT, INT and NMI pins. `z80_t.step`, registers, latched pins and interrupt bits retain the in-flight state. | **Integrate as the first Z80 cycle provider**, behind the existing fast core. Compile a small WASM wrapper that batches ticks/events; define our own versioned snapshot from explicit fields rather than persisting the C struct ABI. |
| [redcode/Z80](https://github.com/redcode/Z80) | LGPL-3.0; portable C | Upstream explicitly describes instruction-level granularity: most instructions cannot stop during their M-cycles and register/cycle updates normally occur after the instruction. | Keep as an independent retire-state oracle only. It cannot drive recorded cycle controls, and bundling LGPL code would add avoidable distribution obligations. |
| [floooh/chips m6502, pinned evaluation](https://github.com/floooh/chips/blob/ca7d7ddd3ba77b48685d24120cf413ea53786767/chips/m6502.h) | zlib and WASM-friendly | `m6502_tick` exposes one pin-level cycle and upstream supplies snapshot callback fixups. It emulates MOS 6502/6510, not the W65C02 used by the breadboard target. | Use as a **6502 bus-contract prototype and NMOS oracle**, not as the shipped W65C02 replacement. Substituting it would silently lose CMOS opcodes and WAI/STP behavior. |
| [JSMoo 65C02, pinned evaluation](https://github.com/raddad772/jsmoo/tree/b6cc506e7c2f7b2b14cce6e98d0463467eb8c4d6/component/cpu/m6502) | MIT; native JavaScript plus an AssemblyScript/WASM variant | Generated 65C02 micro-operations advance through `TCU` cycle states and expose address, data, RW and interrupt pins. Its versioned serializers include in-flight registers and pins. The project-level claims are broader than its per-core conformance evidence. | **Run a CI-only qualification spike before product integration.** It is the closest W65C02 fit, but must first pass our W65C02 retire corpus, per-cycle bus traces, reset/IRQ/NMI/WAI/STP cases, and checkpoint replay hashes. Vendor only a reviewed minimal core if it passes. |
| [vrEmu6502](https://github.com/visrealm/vrEmu6502) | MIT; compact dependency-free C99; supports WDC65C02 | Its public `Tick` is timing-compatible but executes all instruction reads, writes and register effects on the first tick, then counts down remaining cycles ([implementation](https://github.com/visrealm/vrEmu6502/blob/aae98cb14386d832cb7357c99626520b6590bc24/src/vrEmu6502.c#L324-L370)). | Retire-state oracle only. Accurate totals are useful, but reconstructed idle ticks cannot support bus hooks or mid-instruction snapshots. |

The Z80 provider can proceed without an architecture or licensing decision.
The 6502 production switch is deliberately gated: first add a provider-neutral
`tick(pins) -> pins + zero-or-more-events` adapter and run the JSMoo spike in
GitHub CI, where compilation and exhaustive traces do not burden the small
development VPS. Acceptance requires:

- agreement with the existing SingleStepTests-derived Z80 corpus or the full
  W65C02 retire corpus at every instruction boundary;
- expected address/data/control activity for cycle-bearing vectors, including
  wait states and interrupt entry, with every emitted cycle labelled
  `recorded`;
- byte-identical replay hashes after snapshots taken at every microstep of a
  representative instruction/interrupt set;
- no callback, clock, pending pin edge, decoder temporary, or peripheral time
  held outside the versioned checkpoint; and
- batched WASM transfer with a bounded ring buffer, never one JS/WASM crossing
  per clock.

Until a W65C02 candidate passes those gates, expose predicted instruction
timing only and keep cycle/reverse-cycle controls unavailable. Do not relabel a
cycle countdown as bus evidence.

The first isolated run at the pinned JSMoo revision found a concrete snapshot
defect: its own status-register deserializer forces the B latch to one, so a
save/restore changes `regs.P` even though the following short bus trace happens
to match. The hosted lane records this as an expected rejection, not a waiver;
JSMoo cannot be promoted unless a reviewed wrapper serializes and restores each
flag exactly and the complete qualification set then passes.

That rejection is now independently exercised against a hash-pinned,
CI-fetched WDC65C02 v1 corpus slice: 32 vectors apiece for TSB, RMB, BBR, INC A,
STZ, BRA, LDA and NOP (256 total). The receipt separates architectural retire
state from ordered bus activity per opcode and retains examples from both
failure classes, so the known `P.B` defect cannot hide a later bus mismatch.
The upstream suite deliberately has no WAI (`CB`) or STP (`DB`) single-step
files; those two omissions are recorded explicitly and remain separate
qualification work rather than being counted as passes.

## Intel 8086/8088

An instruction timing total or post-hoc bus schedule is not cycle-accurate.
The provider must be resumable at the advertised boundary, expose the bus or
device event there, and serialize every state element needed to resume
deterministically.

| candidate | fidelity and debugger surface | license and browser fit | decision |
| --- | --- | --- | --- |
| [MartyPC, pinned evaluation](https://github.com/dbalsom/martypc/tree/294a2c4ab2c35ed13e79642046ab8865c98e9317) | Its 8088 models the asynchronous BIU, prefetch queue and per-T-state bus activity. The project reports 99.9997% agreement with the 8088 V2 hardware suite and supplies cycle logging, execution/access breakpoints, instruction history and cycle-state collection. | MIT. Its workspace builds a complete eframe application for `wasm32-unknown-unknown`, and `marty_core` is a platform-independent `cdylib`/Rust library. This proves browser feasibility, not a small standalone JavaScript CPU API. | **Primary behavioral and CI oracle; do not vendor the whole machine now.** A pinned `marty_core` experiment must first expose the contract below and publish compressed-WASM/startup receipts. |
| [SingleStepTests/8088 V2, pinned](https://github.com/SingleStepTests/8088/tree/aea84484abc79d09639d855b7b0ab32bc9e4dbeb) | Real NMOS 8088 captures include address/data bus signals for every cycle, T-state/bus classification, initial and final prefetch queues, architectural state and ordered RAM accesses. The suite explicitly omits wait states and interrupt/trap-flag exercise. | MIT test data, not a runtime core. Large corpus work belongs in hosted CI. | **Required conformance oracle.** Retain queue-empty/full, prefix, read/write and wraparound shards on every provider change. It cannot alone certify READY/Tw, HOLD/DMA or interrupt timing. |
| [PCjs PCx86, pinned evaluation](https://github.com/jeffpar/pcjs/tree/c7f21b4fa2bdedac3d5c73094a6402fdc8b24c70) | Mature browser-native x86 machine and debugger with stepping, breakpoints and register/memory inspection, but its CPU is coupled to the PCjs component/bus model. Its published contract does not make MartyPC's real-chip per-cycle accuracy claim. | MIT and JavaScript. Adoption would still import a machine framework and require its attribution notice on every page where it runs. | **Secondary black-box architectural/debug-workflow oracle, not the cycle provider.** Its debugger is useful precedent, but not enough evidence to unlock cycle controls. |
| Brickwright `I8086` plus `i8088-biu.js` | The in-tree core is exhaustively retire-state tested and records ordered accesses. The BIU module predicts totals and queue pressure after an atomic instruction; it explicitly omits exact transfer T-states, wait states and DMA stealing. | Already shipped, small and browser-native. | **Keep as default fast provider and differential retire oracle.** Label timing `predicted`; never route cycle-step through it. |

The MartyPC assessment uses its [accuracy and debugger
description](https://github.com/dbalsom/martypc/blob/294a2c4ab2c35ed13e79642046ab8865c98e9317/README.md),
[MIT license](https://github.com/dbalsom/martypc/blob/294a2c4ab2c35ed13e79642046ab8865c98e9317/LICENSE),
[`marty_core` manifest](https://github.com/dbalsom/martypc/blob/294a2c4ab2c35ed13e79642046ab8865c98e9317/crates/lib/marty_core/Cargo.toml),
[WASM build](https://github.com/dbalsom/martypc/blob/294a2c4ab2c35ed13e79642046ab8865c98e9317/.github/workflows/wasm-unknown-unknown.yml),
and [808x implementation](https://github.com/dbalsom/martypc/tree/294a2c4ab2c35ed13e79642046ab8865c98e9317/crates/lib/marty_core/src/cpu_808x),
inspected at that pin on 2026-09-05. The core owns the EU/BIU, queue, bus phase,
wait-state, DMA, interrupt, trace and validation state required for accurate
execution. Although it depends on Serde and exposes architectural register
state, it has no public, versioned serializer for the complete mid-instruction
CPU-plus-bus state. Its public `step()` retires an instruction; its cycle
functions advance microcode and bus state during that call. A thin wrapper
therefore cannot honestly provide arbitrary cycle pause/checkpoint/replay
without upstream work or a maintained fork.

An optional 8088 engine must implement the repository's provider boundary and:

- return one event per externally visible T-state, including `Ti`, `T1`-`T4`,
  every `Tw`, address/data/status pins, queue transitions, interrupt
  acknowledge and HOLD/HLDA boundaries;
- serialize architectural registers **and** EU microcode position, partial
  decode/prefix/REP state, BIU request and bus phase, prefetch contents and
  pointers, interrupt/trap shadows, wait/DMA state, counters and pending input;
- support passive inspection, execute/read/write/I/O/event breakpoints, bulk
  event draining, and an instruction-retire marker without perturbing timing;
  and
- publish hosted receipts for trace conformance, WASM size/startup/throughput,
  checkpoint size and restore latency. Builds and exhaustive traces belong in
  GitHub Actions, not on the small production VPS.

No third-party 8086/8088 runtime enters the shipping bundle in this pass. The
first spike should be an **unshipped CI-only pinned MartyPC adapter** proving
8088 V2 traces, deterministic mid-instruction restore, hook mapping and browser
cost. Promote it to an optional downloaded WASM provider only if all four pass.
Keep instruction mode as default; an unavailable cycle module must report
`cycle: unsupported`, never silently fall back to predicted instruction timing.
