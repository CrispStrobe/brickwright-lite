# Editor handoff T6 — multi-step History keyboard and scroll gate

Status: CLAIMED; implementation after claim landing.
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
