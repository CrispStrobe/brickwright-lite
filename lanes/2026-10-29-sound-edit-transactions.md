# Sound editing — bounded asynchronous operations and History results

Status: CLAIMED. Owner: Brickwright delivery coordinator, continuing the
operator's global Undo/History delivery. Claim branch:
`docs/sound-edit-transaction-claim-20261029`; implementation joins
`delivery/robot-editor-compat-20261029` after registration.
Base: `f5acf3b3b` main. Existing Circuit, Arcade, native-engine and numerical
qualification owners retain their scopes and original-evidence custody.

The actual sound consumer currently moves its Undo/Redo stacks before encoding
and discards the encoder's failure result. Independently asynchronous effects,
paste and encoding can also complete after selection changes, using the newer
sound index. A private attempted delayed-stack fix was rejected because an
intervening effect could have its new History entry removed.

Scope: `overlay/scratch-gui/src/containers/sound-editor.jsx`,
`containers/audio-selector.jsx`, `components/sound-editor/sound-editor.jsx` and
`lib/audio/audio-effects.js` below the same overlay root; any dual-tracked
mirrors must match. Preserve successful sound edits, playback and selection.
Use a visible bounded operation state to prevent overlapping destructive edit
actions, capture actual VM/target/sound identity before asynchronous work, and
invalidate stale work on selection, target replacement or unmount. Commit
History stack changes only after success and propagate refusal/rejection to
the coordinator. Cover offline render failure so a failed operation releases
the busy state.

Validation scope: `test/sound-operation.test.mjs`, narrowly required GUI-scope
declarations, the existing global-Undo browser gate and the editor follow-up
handoff. Require source-bound original-negative regressions, focused tests,
production GUI/browser acceptance and enabled final-head CI. Do not claim
physical audio/device acceptance from headless controls. No new dependencies,
first-load imports, supplier pin, model/program/fixture/limit changes, persistent
history, native release or App Store action. Private prototypes are review
material only; shared implementation waits for this claim to land.
