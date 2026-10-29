# Editor handoff T6 — multi-step History keyboard and scroll gate

Delivery integration (2026-10-29): this scope is assembled on
`delivery/robot-editor-compat-20261029`. Original source history is preserved;
final hosted and main qualification is pending.

Status: DONE in this source candidate; hosted checks and merge pending.
Owner: Codex delivery coordinator, continuing the editor handoff.
Branch: `lane/editor-followups-20261028`, isolated coordinator checkout.
Base: `b9fa2e844`.

Scope: `scripts/verify-global-editor-undo.mjs` and narrowly necessary History
panel behavior fixes and tracked mirror if the stronger gate exposes a defect.
Exercise at least three steps with ArrowDown/ArrowUp and Enter moving exactly
two steps; after at least thirty undos check that the selected Now row is
inside the visible list. Preserve existing browser journeys and thresholds.
Verify against a production GUI and update T6 in the editor handoff. No persistent
history, native release or changes to unrelated browser gates.

Continuation in the combined delivery: the stronger multi-step review exposed
that `lib/bw-undo-coordinator.js` discarded asynchronous editor completions in
the merged timeline. Its narrowly scoped repair awaits each completion before
the next History entry and stops on refusal/rejection. The first-load core is
unchanged; focused ordering/error regressions are in `test/editor-history.test.mjs`.

Results and validation: `docs/EDITOR-HISTORY-FOLLOWUPS.md`. The claim landed
in #1529 before implementation. No device release or persistent history.
