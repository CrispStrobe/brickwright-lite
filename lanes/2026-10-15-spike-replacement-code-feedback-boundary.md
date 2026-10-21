## SPIKE replacement Code feedback boundary — 2026-10-15

Continuation in the merged G02 session/pane/feedback envelope, branch
`lane/spike-g02-code-feedback-20261015`, stacked on the pending-upload Stop fix.
Keep Code Stop available while replacement waits. Old poll/STOP and upload READY
observations do not finish the replacement's feedback; publish its status after
upload/START succeeds. A current live-session upload rejection notifies its Code
error consumer and ends that consumer's running state. Later native observations
remain live in the pane without replacing the failed Code run's error. A retry
or fresh cold run invalidates retained-upload listeners; cancellation of an
already closed session remains Stop rather than a new upload error.

Twelve authored controls exercise the real session/client/feedback and original
Code dispatcher with shipped pane methods. The original phase controls reproduced
six failures; three additional error/consumer controls reproduced three failures.
All twelve and 99 affected host controls pass; eleven broken guards are detected.
The initial candidate's explicit-cancellation regression is retained and fixed.
These are host protocol controls, not rendered or actual guest evidence.
Fresh source-bound installed Code re-upload, visible Stop, completion, live error,
late telemetry, retry/cold recovery and final-head CI remain required before merge.
Cold-listener, output-attribution and concurrent caller completion boundaries are
not promoted beyond their named controls. No importer, native/model/firmware/pin/
workflow/deadline change or whole-G02/physical/rollback/release claim.
