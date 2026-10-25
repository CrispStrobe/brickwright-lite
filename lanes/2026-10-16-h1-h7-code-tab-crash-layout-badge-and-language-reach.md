## H1–H7 — Code tab crash, layout, badge and language reach — 2026-10-16

CLAIMED — VPS Claude (opus), branches `lane/code-tab-h*-20261016`, base main
`fc455ff55`. Tasks H1–H7 of docs/OPEN-TASKS-2026-09-29.md, in that
order, one PR each. Owns: `containers/lazy-pseudocode-importer.jsx` (H1 error
naming/reload), the Code tab toolbar, status line, conversion-report and
Animation rows in `components/tw-pseudocode/pseudocode-importer.jsx` and its
CSS (H2, H4, H5), `lib/bw-matrix/capabilities.js` with the generated matrix
(H3), the fe/Tcl/Forth routes in `lib/bw-debug/dos-toolchain-routes.js` and
new non-DOS routes (H6), their tests and browser gates. Keeps test ids and the
gates that click them. H7 (STM32 faces) edits bw-circuit-ui only after the
owner of that repo's face lane agrees, then a CUI pin adoption sequenced after
other open CUI adoptions. No pin, engine or workflow-budget change otherwise.

### Takeover — 2026-10-25

New owner Claude (opus), assigned by the operator; reason: stale (no PRs
since 2026-10-16, all rows still `queued`). Scope H1–H6; H7 is not taken
(it edits bw-circuit-ui and needs that repo's face-lane owner first).

Finding: the original owner had already landed H1–H5 and the RISC-V part
of H6 directly on main on 2026-10-16/17 without updating the task table.
Commits: H1 `9e0951ed`, `64cff89c`; H2 `4f67a322`, `dda09ec5`; H3
`fcad7568`; H4 `0d045903`, `ae1b2f34`, `2f2bc0f3`; H5 `81bca263`; H6
`6636755c`, `7f0e9c86`, `3b4788c8`. H1 was not reproducible on the
production deploy on 2026-10-25 (Code tab, every language tab, the +
menu, every chip-selector entry, Debugger, SPIKE arena, maximize). This
takeover records the status only; no source changed. H6's browser-WASM
route, the other C targets, RAM/flash measurements and matrix rows stay
open for a new claim. This lane is closed with this record.
