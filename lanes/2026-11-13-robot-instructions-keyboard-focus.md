# Robot Lab building-instructions keyboard focus

Status: DONE (implementation); qualification pending.
Owner: Codex, user-requested Robot Lab continuation.
Branch: `lane/robot-instructions-keyboard-focus-20261113`.
Base: `6f8a49d5c7a4`.

The user requested coordination and source in one PR without a claim-only push.
Scope: `sim-lab-instructions.jsx` and
`test/bw-sim-instructions-keyboard-focus.test.mjs`.

Keep Tab navigation inside the modal using its currently enabled buttons,
including loading, drawing failure and a disabled focused Print control. Restore
the connected launcher when closing only while focus still belongs to this
dialog and document; preserve another control or window's focus. Preserve the
existing page and Escape shortcuts and printing behavior.

Validation: eight real React DOM keyboard-focus tests and six existing print
recovery tests pass, without skips. No model, physics or instruction-generation
changes. Exact-head hosted qualification remains pending.
