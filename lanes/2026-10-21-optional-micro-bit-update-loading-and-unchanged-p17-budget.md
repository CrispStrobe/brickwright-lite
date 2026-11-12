## Optional micro:bit update loading and unchanged P17 budget — 2026-10-21

CLAIM MERGED in #1154 / SOURCE CANDIDATE — Codex GUI integration.
Qualification is pending. The existing optional Scratch micro:bit update path statically
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

SOURCE candidate: the lightweight support and chooser shell remains eager;
the unchanged genuine update implementation is acquired after device selection.
No failed module promise is cached by the shell. Each call keeps its selected
device and progress callback. A modal-owned intent retires on close, disposal,
replacement or extension change; chooser/chunk completion checks that intent
before starting a transport. The update child forwards its own current predicate
to the modal, so phase-driven child unmount also retires pending acquisition.
Retired UI progress/results are not delivered.
Once the real update has started, its original connect/flash/disconnect cleanup
runs unchanged; this does not add an interruptible firmware-update protocol.

The moved implementation body and existing dependency versions are unchanged.
Selected exact DAP/universal-HEX ES sources have no identified global polyfill
initialization; this static inspection is not emitted-code or browser evidence.
Focused controls use explicitly mocked transports and genuine unchanged ES
package APIs in the host process through a focused test loader requiring no
custom Node flags. A distinct package-main UMD control exposed
its bundled global polyfill writer and is retained as a failure; it is not the
production module entry. All ten complete corrected controls pass, including the genuine ES API and
prototype assertions. Emitted ES/browser initialization, actual chooser/modal
journeys and unchanged hosted P17/boot qualification remain pending. No hardware
or emitted-size result follows from this SOURCE candidate.
