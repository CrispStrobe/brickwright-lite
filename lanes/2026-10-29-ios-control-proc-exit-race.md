# iOS subprocess control: observe a process exiting during proc read

Delivery integration (2026-10-29): this scope is assembled on
`delivery/robot-editor-compat-20261029`. Original source history is preserved;
final hosted and main qualification is pending.

Status: IMPLEMENTED in an owned candidate; hosted Linux qualification pending.
Owner: Brickwright delivery coordinator.
Branch: `fix/ios-control-proc-exit-race-20261029`.

Main Build run 40725670736 failed unit shard 4 because the Linux-only test
observer saw a child disappear between checking and reading its proc stat file.
The resulting ProcessLookupError escaped even though process exit is the
condition the control is waiting for.

Scope: the inactive-process observer and deterministic race controls in
`test/ios-workflow-embedded-asset-audit.test.mjs`, plus this claim status.
Preserve production command execution, cleanup, deadlines and signal ordering.
Treat only missing-process observations as stopped; retain other read errors.

Qualification: deterministic disappearance controls, the existing real owned
subprocess controls, required hosted fast checks, and the following main run.
No simulator, device, release or installed-app acceptance is claimed.


Implementation: the test observer handles a process or proc entry disappearing
while reading, then retains the existing live-process probe. A missing proc
entry alone cannot prove exit on macOS or another host without proc. Successful
zombie/running reads and visibility of permission/I/O errors are retained.

One deterministic control covers eight read/probe cases. It passes with the
repair and fails when the original observer is substituted; JavaScript syntax
also passes. The actual embedded production retention/command implementation
is byte-identical. All 17 existing real-subprocess controls remain; the Node
wrapper now requires 18 controls after adding this regression. This Mac lacks
Linux waitid, so complete subprocess acceptance remains a required hosted
Linux with Python 3.12 result. The source joins the combined delivery candidate;
final hosted/main qualification and every original cleanup assertion remain.
