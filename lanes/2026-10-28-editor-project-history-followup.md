# Editor handoff T3 — remaining project undo operations

Delivery integration (2026-10-29): this scope is assembled on
`delivery/robot-editor-compat-20261029`. Original source history is preserved;
final hosted and main qualification is pending.

Status: DONE in this source candidate; hosted checks and merge pending.
Owner: Codex delivery coordinator, continuing the editor handoff.
Branch: `lane/editor-followups-20261028`, isolated coordinator checkout.
Base: `b9fa2e844`.

Audit sharing scripts to another sprite, project-title changes, extension
addition, and whole Robot Lab/Circuit example loading. Cover missing reversible
operations in `overlay/scratch-gui/src/lib/bw-project-history.js`, their actual
GUI/VM call sites and tracked mirrors, and
`test/project-structure-history.test.mjs`. Document an operation as intentionally
not undoable only with a concrete state/VM limitation and user-visible meaning.
Verify actual browser menu undo/redo and targeted tests. Update the T3 handoff
with observed results. Do not implement history persistence or change suppliers.

Results and validation: `docs/EDITOR-HISTORY-FOLLOWUPS.md`. The claim landed
in #1529 before implementation. No device release or persistent history.
