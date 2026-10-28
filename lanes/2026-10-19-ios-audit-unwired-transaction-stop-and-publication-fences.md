## iOS audit: unwired transaction Stop and publication fences — 2026-10-19

The same claimed workflow core now accepts a typed optional Stop callback, keeps
cancellation sticky, fences active effects after readback/preparation/observation,
and refuses successful publication if Stop occurs during cleanup/release. A valid
returned create identity is resolved before cancellation cleanup; other devices
remain untouched. Returned observation bytes remain retained with partial status.
Cleanup/release continue on cancellation. Six new authored lifecycle controls and
a publication-fence mutant complement normal and existing failure controls.
This is cooperative source behavior only: callback interruption, shared Stop
intent in the full wrapper, target/service/process-group authority and actual app
qualification remain open. No workflow phase invokes the transaction core.
