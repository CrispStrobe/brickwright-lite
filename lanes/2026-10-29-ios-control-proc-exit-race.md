# iOS subprocess control: observe a process exiting during proc read

Status: CLAIMED, before implementation.
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
