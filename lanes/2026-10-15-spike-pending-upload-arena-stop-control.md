## SPIKE pending-upload Arena Stop control — 2026-10-15

Continuation in the merged G02 pane/lifecycle envelope, branch
`lane/spike-g02-upload-stop-control-20261015`, stacked on PR962.
An installed upload probe found no Arena Stop element at a pending return.
Keep Stop visible whenever the current session is uploading, including paused
program observations. Pending-upload Stop delegates to full session teardown
with ready feedback and cleared upload text, using the qualified closure guards. Ordinary retained
program Stop keeps its storage session. A delayed cancellation error must retain
pane intent ownership before changing feedback.

All 14 new controls and 14 existing pane lifecycle controls pass. The baseline
passes five new cases and fails nine; five targeted visibility/routing/feedback
mutations are detected. Host coverage evaluates the shipped JSX branch predicate
and actual pane methods, with authored stop/error promises. Actual installed
visible-control cancellation and distinct guest recovery remain required, along
with every enabled exact-head check. Preserve parent merge gates and retarget
only after PR962 integration. Code-feedback generation remains a separate open
boundary. No importer, native, pin, firmware, Runtime, model, deadline or workflow
change; no full G02, rendered-UI, guest, physical or release claim from host tests.
