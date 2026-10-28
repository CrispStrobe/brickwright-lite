# Editor handoff T5 — Android autosave folder availability

Status: CLAIMED; implementation after claim landing.
Owner: Codex delivery coordinator, continuing the editor handoff.
Branch: `lane/editor-followups-20261028`, isolated coordinator checkout.
Base: `b9fa2e844`.

Scope: `overlay/scratch-gui/src/lib/bw-autosave.js`, the autosave controls in
`components/bw-history-panel/history-panel.jsx`, their tracked mirrors and
`test/autosave-settings.test.mjs`. On Android hide the inaccessible native
folder option and explain that autosaves remain in the app. Preserve desktop,
iPad/iPhone and browser folder behavior. Verify the Android and iOS cases and
the real History autosave controls. No new native plugin or release.
