## Optional micro:bit update loading and unchanged P17 budget — 2026-10-21

CLAIM CANDIDATE — Codex GUI integration. Merge this docs-only claim before
implementation. The existing optional Scratch micro:bit update path statically
imports DAP and universal-HEX libraries. Review a selected-device loading boundary
without changing the update API or treating source-attributed bytes as emitted
savings. Existing CSV/GIF upload ownership does not cover this device-update path.

Envelope: `overlay/scratch-gui/src/lib/microbit-update.js`, a narrowly required
private update-implementation module, their managed package mirrors, focused
owned boundary controls and this ledger. Include only necessary connection-modal
update-action ownership/error integration and its affected controls; preserve the
rest of the connection modal and all other devices. Add the overlay needed for
the selected source candidate rather than editing a generated copy alone.

Keep the synchronous capability predicate and the existing native
`navigator.usb.requestDevice` invocation in the eager shell. Do not await a
chunk before opening the chooser. Acquire the real update implementation only
after the chooser returns the selected device, preserving the existing async
return contract. Cancellation or chooser rejection must not acquire or run the
updater. Each action retains its actual selected device and progress callback;
late completion cannot deliver through a different or cancelled action.

Retain the genuine DAP and universal-HEX implementations, transport receivers,
HEX validation and byte delivery, connect/flash ordering, progress events and
existing disconnect/finally behavior. Preserve original error identities and
cleanup precedence. Failed chunk acquisition must have an observable owning
error and allow a later action to retry. Inspect initialization effects before
deferring these packages; no late intrinsic recapture, guard relaxation or
replacement protocol/firmware implementation is authorized. Dependency versions,
firmware inputs and device support policy remain unchanged. No hardware flashing
or new device action is part of source qualification.

Acceptance requires complete affected boundary and connection-modal controls:
synchronous chooser activation, cancellation, dependency failure/retry,
concurrent selected-device ownership, exact callback/error delivery and cleanup.
Use genuine offline package code and explicitly scoped fake transports where
needed; do not turn those controls into hardware or firmware accuracy claims.
Retain all existing assertions, original failures, resource bounds and browser
budgets. Qualify the actual chooser/modal journeys and the existing exact-head
hosted production build, boot guards and emitted webpack ownership report.
Source import changes or attributed package sizes alone do not establish P17
fit or faster startup. No baseline, threshold, workflow, dependency pin, VM guard,
renderer, generic upload or unrelated device change is in scope.
