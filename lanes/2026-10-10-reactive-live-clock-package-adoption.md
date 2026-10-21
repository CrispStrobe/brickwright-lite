## Reactive live-clock package adoption — 2026-10-10

SUPERSEDED candidate — Codex, isolated branch `lane/reactive-live-package-adoption-20261010`,
exact base `9ac32a75562577c945baff383fbfb5dcddd02804`. Adopt bw-board
`74b971b48a9ebe97d5dd2a793ba3f85a6ffa0d42` only; keep CUI, sb3 and flasher pins
unchanged. Upstream CI37985452352 and Harris37985452331 are exact-head green;
the source range from the old pin changes only14 lines in board.js live span
selection. No copied engine source, solver policy change or SPIKE source work.

Envelope: this ledger; vendor-pins.json; root and scratch-gui package manifests
and lockfiles; pin-derived I8086 report, language matrix, board census and its
two census-snapshot mirrors; paired bw-packages.sources.json notices; ROM/DOS
provenance records only (binary bytes unchanged); bundled-upstream-pins.json;
board-pin assertions in existing ADP7118/CLI-KCL/LM324/LM741/LT1001/LT1763/scope
adoption tests; scope-reset-package-adoption.test.mjs continuation evidence;
new test/reactive-live-package-adoption.test.mjs; the existing FreeDOS-circuits
workflow's three exact board-pin references only; existing browser proof for
motor/scope continuation if stronger assertions are required. Regenerate with
the established scripts, run every-generator checks and pin/mirror/provenance
gates, qualify the installed package and actual browser via hosted Build.
Local old dependencies are not adoption evidence. No waveform expectation,
failure-latch, tolerance, runtime/GUI, compiler, firmware or browser timeout
change. Deployment follows qualified landing; no deployment claim in advance.
Selected browser evidence path: scripts/verify-circuit-ux.mjs only. Keep its
strict5000 one-volt/reset assertions; explicitly load the ideal one-volt source
with a capacitor, and observe real advanceToLive receipts. Corrected after
Build38024305644: the time-view100kHz recording is an envelope, not a point
sample. Its solver bound remains the interactive100us profile ceiling, so a
16-step callback is bounded by1.6ms; that run preserved all5000 exact one-volt
envelopes and published31 partial receipts, with no receipt mismatch.
The replacement must additionally select the actual spectrum point-sample
tap at100kHz through the UI, verify its capture kind and10us interval, and
prove16-step callbacks bounded by160us with real partial continuation.
No engine, profile, accuracy, timeout or existing waveform assertion change.
Continue on `lane/reactive-live-package-replay-20261011`, retaining main's
newer sb3 pin. The prior branch/run stays rejected, not rerun unchanged.
This is temporal receipt evidence, not a CPU-time or analog-probe realism claim.
Continuation: `fix/painter-installation-proof-20261011` integrates PR797's
Board9c8777d5 descendant rather than the obsolete74b-only pin move, PR800's
published Arcade ordering repair, and the exact qualified circuit proof files.
Build38155522851 passed both installed reactive cases and the envelope/point
browser receipts, but failed the inherited painter check. The combined exact
candidate remains subject to all enabled hosted gates; pending is not landed.
