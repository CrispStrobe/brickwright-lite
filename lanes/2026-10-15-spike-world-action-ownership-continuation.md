## SPIKE world action ownership continuation — 2026-10-15

Continuation in the merged G02 pane/lifecycle envelope, branch
`lane/spike-g02-world-action-ownership-20261015`, stacked on PR966.
After delayed teardown, obsolete lesson loads, challenge selections, sandbox
updates and manual-drive requests must not replace the current world, persist
old sandbox data, or send motor commands. Admit the current teardown intent and
its owned bridge before continuation; retain the selected bridge for delayed
render callbacks. Unit-load success/error also checks ownership after fetching.
Stop reentering manual-drive notifications suppresses subsequent motor commands
and running feedback. This adds no sandbox feature or new model behavior.

All 32 new actual-method authored-boundary controls and 44 inherited pane controls
pass. The baseline passes fourteen new cases and fails eighteen; eight ownership,
render-callback and bridge-recording mutations are detected. Fresh installed
own-guest representative world/action cancellation and recovery plus every enabled
final-head check remain required. Keep the parent qualification and merge gates;
retarget to main only after parent integration and review composition again.
No native, dependency, firmware, Runtime, model, deadline or workflow changes;
no guest, whole-G02, physical, release or distribution claim from host controls.
