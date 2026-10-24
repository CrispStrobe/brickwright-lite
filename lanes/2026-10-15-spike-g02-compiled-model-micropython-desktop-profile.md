## SPIKE G02 compiled-model MicroPython desktop profile — 2026-10-15

IN PROGRESS — Codex, isolated implementation branch
`lane/spike-g02-compiled-micropython-20261015`. Claim PR946 and predecessor PR936
are merged. The existing desktop
MicroPython launcher always includes source models; the retained desktop
runtime already contains compiled Prime models. Earlier qualification kept
those compiled and legacy source-overlay routes separate. Support metadata
alone does not qualify a selected image or a current installed MicroPython boot.

Envelope: this ledger; the MicroPython profile/launch contract in
`apps/tauri/src-tauri/src/{spike_micropython_launch,renode_supervisor,renode_debugger}.rs`;
`scripts/{prepare-spike-micropython-pins,build-spike-linux-desktop}.mjs`;
`scripts/prepare-spike-compiled-micropython-support.mjs` if needed; focused
`test/spike-compiled-micropython-profile.test.mjs` and inline Rust profile/launch
controls; `docs/SPIKE-STATUS-AND-LANES.md` and
`docs/spike-micropython-{launch-plan,installed-resources}.md`. Supplier staging
changes require a separate supplier claim. Retain
the qualified legacy source-overlay path and credited components. Make profile
selection explicit and bound to the reviewed runtime/model closure; skipping
includes without admitting compatible platform type names is insufficient.
No silent dependency adoption, runtime/model implementation change, firmware
bundling or image download. Use the existing operator-supplied application only
after exact identity/format admission, with immutable original bytes retained.

Acceptance: reject mixed or mismatched profiles before launch; retain positive
legacy and compiled contracts with meaningful removal/admission negatives;
qualify the actual selected-image Code path, normal raw-REPL completion/error,
Stop during final sampling, ownership release and distinct fresh recovery on a
source-bound installed package. Record generation/image adversaries separately
from actual native attachment transitions. All enabled exact-head CI and the
affected installed checks must pass before matched-head integration. Preserve
failed originals and existing budgets; no full SDK, reference, physical,
distribution/licence, release or whole-G02 claim from a finite profile slice.

The implementation adds an explicit native descriptor pin, offline native
platform assembly from immutable public inputs, and preserved legacy support.
The 25 packaging controls, two actual Rust planner controls and meaningful
guard/order-removal negatives pass. The source-bound installed Linux package
passes six real MicroPython contexts: Code/raw-REPL completion, guest error,
Stop during final sampling, two authored client-delivery identity adversaries
and distinct fresh recovery. A wrong-caller native UART generation request is
refused while the original attachment remains ready. An independent reader
checks original UART envelopes, six completed startups, distinct generations
and ownership release. Exact-head CI remains required before integration; this
finite profile slice does not close G02 or qualify every evolving-main package.

### Continuation — mixed legacy/compiled pairing refusal, 2026-10-24

Claude (operator-assigned) continues this claim on
`lane/spike-g02-micropython-support-pairing-20261024`, inside the existing
envelope (`scripts/prepare-spike-micropython-pins.mjs` and its focused test).

Observed: an installed package assembled from legacy source-overlay support
and a runtime that already compiles the Prime models fails every MicroPython
start. A closed native startup record showed launch complete after 14.6 s, then
`rsp-connect reason=unavailable` for the full 60 s window. A per-command Renode
probe of the same image located the cause: the `models.cs` include aborts
because the runtime already defines `ILpf2Device`, so the platform cannot
resolve `BrickwrightSTM32SPI`, the electrical ports and CPU setup fail, and
`StartGdbServer` never opens a debugger endpoint. The documented requirement
(compiled runtime needs compiled support) was not enforced.

Change: pin preparation now refuses legacy overlay support when the runtime
contains both compiled-model names (`ILpf2Device`, `CreatePrimeElectricalPorts`).
Compiled support with its runtime-bound descriptor is unchanged. Two focused
controls: the refusal fails on the original script and passes on the fix; a
runtime with only one name is still accepted. Against the actual installed
runtime and its legacy support, the original script staged the pairing and the
fixed script refuses it. This fixes packaging admission only; a compiled-support
installed MicroPython UART/generation qualification remains required, and no
installed guest result is claimed here.
