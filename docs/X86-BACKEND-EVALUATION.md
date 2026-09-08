# x86 backend evaluation: subordinate to circuit compatibility

Date: 2026-09-08. Status: evaluation plan, not a benchmark result or license clearance.
Decision context: [80286 circuit-first plan](I80286-CIRCUIT-PLAN.md).

## Options and recommendation

| Option | Advantages | Costs / limitations | Recommendation |
|---|---|---|---|
| Native resumable 286 core | Direct control of bus suspension, state and debugger integration | Largest CPU-correctness and validation effort | Preferred architecture if no reusable core passes the circuit spike |
| Adapt a permissive existing core, initially PCjs | Reuse established architectural semantics | Internal memory/chipset assumptions; bus timing and suspension need substantial proof or changes | Time-box a feasibility spike before committing to a fork |
| Whole-machine PCjs | Useful independent 286 software reference | Its own motherboard is not the user's wired circuit | Separate default-off comparison tool |
| Whole-machine v86 | Useful broader x86 browser execution/JIT comparison | Not a selected 286 chip or arbitrary wireable motherboard | Separate default-off comparison tool |
| Other native/HDL cores | Potential architecture or bus-reference reuse | Browser port, simulation speed, integration and per-file licensing burden | Consider only with a concrete core and evidence |

JavaScript versus Wasm is an implementation choice, not the architectural
decision. Either can implement a resumable CPU; neither supplies correct pin
timing automatically. Do not rewrite the engine in Wasm before profiling the
circuit workload and validating its execution contract.

## Reuse spike: go/no-go evidence

For each candidate record exact source revision and modifications. Demonstrate:

1. External memory and I/O can be supplied exclusively by a test circuit.
2. A transaction can wait across host calls without committed or repeated effects.
3. Reset, byte lanes, relevant prefetch and interrupt accesses can be represented
   without fabricated after-the-fact traces.
4. CPU state, pending work and scheduling are inspectable and serializable.
5. Unsupported selected-chip behavior is visible and bounded.
6. License and dependency obligations fit distribution of the intended artifacts.

Failure means the candidate remains a software reference, not a circuit CPU.
Passing instruction tests or booting an OS is not a substitute for these gates.
Record measured adaptation scope before choosing reuse over a native core.

## Comparison track and current receipts

Source preparation during the earlier whole-machine investigation pinned:

- PCjs: `c7f21b4fa2bdedac3d5c73094a6402fdc8b24c70`.
- v86: `d96be774e549a83371b038b86e819804c96b921f`.

A local v86 release Wasm/module build completed in scratch storage. This is
only a build receipt: no integrated adapter, circuit validation, comparative
performance result or vendored distributable is established by it. PCjs source
inspection likewise does not establish bus-level suitability. Recheck revisions,
toolchain and dependency hashes before turning either into reproducible tooling.

Use identical owned guest binaries and an independent result oracle. Record
CPU model, board/devices, build flags, source/artifact hashes, browser/host,
sample counts and raw results. Separate download/build/startup/Wasm compilation
from warmed execution. Label uncompiled/debug builds; do not rank them as
equivalent to optimized release builds.

Report completed work and correctness, then median/spread and memory use.
For the circuit path also report simulated time, bus events and tracing cost.
A ratio to nominal MHz is not an apples-to-apples emulator comparison, and a
whole-machine JIT result is not an expected speed for clock-stepped circuits.

## Licensing and distribution boundaries

PCjs identifies its source as MIT and excludes third-party archival materials
from that grant: [license](https://github.com/jeffpar/pcjs/blob/c7f21b4fa2bdedac3d5c73094a6402fdc8b24c70/LICENSE.txt).
v86's core license is BSD-2-Clause:
[license](https://github.com/copy/v86/blob/d96be774e549a83371b038b86e819804c96b921f/LICENSE).
Neither statement clears every bundled dependency, firmware image or build tool.

Before shipping, inventory every included file/artifact, preserve notices,
record local modifications and audit dependencies. Do not serve bundled BIOS or
OS images merely because they are present in a source checkout. Prefer owned
firmware with source and reproducible assembly for the first board and benchmarks.

Copyleft alternatives are not excluded on technical grounds, but need an
explicit distribution-policy review. A worker, iframe or Wasm boundary does not
by itself remove license obligations. Broader contender licensing remains a
per-revision/per-artifact audit, not a blanket approval based on project names.

## Ordering

Prioritize the circuit contracts and minimal wired-board test. Keep comparison
work optional and bounded so that it does not become the product architecture
by accident. Preserve valid old experiments behind their gates; remove only
paths shown to be genuinely broken. No automatic backend replacement, production
pin change, merge or deployment is part of this documentation milestone.
