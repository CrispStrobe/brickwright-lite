Scope-reset and cooperative circuit-clock package adoption — **DONE candidate
2026-10-08**, Codex, branch `lane/scope-reset-adoption-20261008`; canonical
claim `59dddb13ed53d941141c2476bec312047032e660` from exact main
`0441d5b6247e3b3c6a41fac68fba36f0c7387927`. Adopt bw-board
`ac7595b609daa75717c696830982f59940c97e8b` and bw-circuit-ui
`5f336b24447351ce80742c0e71078cdd23e7912b` only; sb3/flasher unchanged.
Upstream Board CI37805382935/Harris37805382883 and CUI CI37816453619
passed, including the real scope-reset browser scenario. This descendant
range also includes cooperative live clocks, finite-analysis refusal and
wrapped-envelope labels; it is not a reset-only source patch. Root/GUI
manifests and locks, notices, census/mirrored module, matrix, 8086 report and
overlay ROM provenance were regenerated. All eight ROM binaries and BIOS
source bytes remain unchanged; these ROM provenance files have no tracked
packages mirror. GUI lock also reconciles the already-selected Board's pinned
avr8js dependency. No engine/UI source copy, model tuning, other pin, workflow,
Arcade/SPIKE change or deployment claim.

Installed-package affected checks pass29/29, including CLI independent waveform,
current/KCL and refusal controls, retained scope identity, an empty reset ring,
all5000 first50ms envelopes, and failure-latch preservation. Package/provenance
checks pass26 with one history-dependent skip; the affected census/BIOS history
checks subsequently ran with the actual pinned checkout. Generator checks:
Rust notices, 8086 report, matrix, part profiles, reader coverage, hosted targets
against its own recorded stc snapshot, Board census, and package notices pass;
unchanged generated outputs were not rewritten. Global pin-history check remains
for the full hosted checkout: local sparse-checkout missing-file refusals are
not passes. Installed payload identity and the new actual Build/Sim restart
browser journey remain mandatory in one exact-head hosted Build before landing.
The browser proof imports an owned passive fixture, uses real controls and
observes Board events without changing its clock or simulation implementation.

Forward repair envelope after Build37826679610: the full unit suite reported
four failures (6410 tests,6385 pass,4 fail,21 skips). Pin-chain coverage also
requires `static/roms/cpm-roms.provenance.json` (overlay and tracked mirror),
overlay `static/roms/free-386-bios.provenance.json`,
`static/dos/msdos200-base.provenance.json` (overlay and tracked mirror), and the controller entry in
`overlay/scratch-vm/src/extension-support/bundled-upstream-pins.json`.
Each is updated only after pinned-source byte equality; historical receipts
retain their original pins. The explicit checkout/assertion refs in
`.github/workflows/i80386-freedos-circuits-direct-actual.yml` must follow this
same package pair, without changing its label-only execution or claiming a new
guest run. `test/native-prompt.test.mjs` needs lexical binding detection and
positive/negative controls: the added DOS grading modules' locally defined or
imported `prompt` predicates are not calls to the browser's global dialog.
No package paths are waived and no remaining browser dialog may be hidden.
Repaired prompt/bundle checks pass36/36; disabling lexical resolution or hiding
every bare call independently makes the new control fail. Source binary hashes
remain unchanged. The new `scripts/verify-circuit-ux.mjs` reset journey now uses
the real Step control after Build/Sim, which preserves the existing pause choice.
The separate existing green-flag first-write journey reports a real stalled
clock and wrong pin level in this candidate. Diagnostic-only additions to
`scripts/verify-green-flag-first-write.mjs` expose the visible simulation error
and pause-control state; all its original assertions and time bounds remain.
Build37826679610 is rejected (unit and browser failures); heavy browser installation
also failed before its journeys ran. No unchanged rerun or landing is authorized
by the corrected unit tests. A forward hosted qualification must diagnose the
green-flag failure before this package pair can be adopted.
