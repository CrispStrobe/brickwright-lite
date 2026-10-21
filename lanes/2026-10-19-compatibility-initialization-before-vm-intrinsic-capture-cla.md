## Compatibility initialization before VM intrinsic capture — claim proposal

DOCS-ONLY CLAIM; NOT IMPLEMENTED. Owner: Codex GUI and Arcade integration.
This claim requires a normal merge before any product implementation. It is
separate from the existing refusal-observation and optional-upload lanes.

Own the two real GUI entry boundaries (`packages/scratch-gui/src/playground/index.jsx`
and `packages/scratch-gui/src/index.js`), their managed overlay counterparts,
a small shared compatibility-bootstrap module and focused entry-order controls.
Include `src/playground/render-gui.jsx` and the two existing tooltip consumers
(`components/coming-soon/coming-soon.jsx`, `components/action-menu/action-menu.jsx`)
only to establish the actual required dependency and lifecycle contract; do not
replace their tooltip behavior. A webpack entry adjustment is permitted only
if the actual entry graph requires it, retaining both browser and library exports.

Establish an explicit dependency boundary in which the existing required
Promise.finally compatibility and existing tooltip initialization complete before
any VM-dependent graph captures intrinsic identities. Prove the bootstrap graph
does not itself reach that capture and that later chunks reuse its exact module
instances. Preserve Safari 11.0 Promise.finally support and every tooltip content,
placement, ID, delay, show/hide, touch, focus and disposal behavior. Do not edit
installed dependencies, strip bundled compatibility code, introduce an alternate
dependency build or change pins, locks, notices or browser-support policy.

Keep every intrinsic, owner, source, heap, generation and current-operation
predicate unchanged. No delayed capture, recapture, dynamic rebaseline, descriptor
allowlist, swallowed refusal or changed native function semantics is authorized.
Review the compatibility wrappers themselves before treating initialization order
as sufficient. Direct VM users and distinct library/browser entry contracts must
remain explicit; source import spelling alone is not execution-order evidence.

Qualification needs genuine entry-order observations, complete focused tooltip
and native ownership controls, sticky refusal after a later same-key mutation or
ABA restoration, fresh second VM, and the existing numeric, rotation, paint/menu
and public roundtrip browser journeys. Preserve all current P17/boot size and
performance thresholds, baselines, assertions and enabled exact-head gates.
A build dependency/order claim is not browser, performance, game or corpus credit.
