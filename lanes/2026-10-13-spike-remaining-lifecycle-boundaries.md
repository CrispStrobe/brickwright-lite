## SPIKE remaining lifecycle boundaries — 2026-10-13

Continuation candidate `lane/spike-g02-output-stop-20261014` stays in this
merged session/test envelope. Six actual-method controls fail on the baseline:
poll and packet hub/output callbacks, packet program-state callback, and a late
packet input-write reply after Stop. Closure fences prevent subsequent input
requests and observer publication while preserving correlated packet replies
for serialized cancellation. All 41 affected controls pass, including the live
packet publication control; removing each of the six new fences is detected.
These use authored native boundaries. Fresh installed own-guest observer Stop,
late-reply cleanup/recovery and all enabled exact-head checks remain required.
No firmware, Runtime, model, native/Rust, deadline or workflow change; no full
G02, physical or release claim.

Continuation candidate `lane/spike-g02-terminal-fences-20261014` addresses
synchronous Stop from final frame/program-state callbacks within this same
session/test envelope. Three baseline failures, 34 passing affected host
controls and two detected fence mutations are recorded. Fresh installed own
NuttX cancellation/recovery and exact-head CI remain pending; no full G02 claim.


CLAIMED — Codex SPIKE integration, `lane/spike-g02-lifecycle-20261013`.
Envelope: `overlay/scratch-gui/src/lib/spike-arena/renode-arena-session.js`,
`code-run-feedback.js` in that directory,
`overlay/scratch-gui/src/components/tw-pseudocode/spike-arena-pane.jsx`,
`test/spike-renode-arena-session.test.mjs`, `test/spike-code-run-feedback.test.mjs`,
`test/spike-micropython-code-tab.test.mjs`, `test/spike-arena-pane-units.test.mjs`,
small owned lifecycle fixtures/helpers if necessary, this ledger and the SPIKE
status guide. First review and qualify existing guards using delayed/error-capable
native boundaries: chooser cancellation/disposal/backend intent, Stop during
final sampling, connection/UART generation change, late polls and stale session
callbacks after replacement. Fix demonstrated gaps in owned session/pane/feedback
files; qualify representative cases with a fresh source-bound actual installed
own-guest package. Preserve PR631/755/860 regression and artifact boundaries.
Require one terminal result, no late world publication or owned process leak,
and no stale owner stopping a replacement; broken terminal/ownership/generation
mutants must fail. No importer, painter, peer, native feature, firmware/Runtime/
model pin or workflow changes. Any required shared-file or dependency extension
needs a separately recorded coordinated envelope before implementation. Do not
fetch restricted images, fabricate reference storage/mapping or infer physical
safety, full G02 coverage or distribution closure from bounded simulations.


PR879 merged the finite native Start and chooser intent fences. Installed
consumer `f1772cf0fe96988f7a4a3c665a478ef8fac4b065` qualified seven UI cases
and own-NuttX startup Code Stop separately from the whole evolving main package.

Continuation: `lane/spike-g02-stale-cleanup-20261013`, same owner and envelope.
A subsequent installed own-NuttX run reached the teardown boundary: after the
disposed pane's real firmware session closed, delaying only that completed Stop
return let a replacement pane start the shared VM. Releasing the old return
then called `stopAll` on that replacement. The candidate checks pane disposal,
Stop revision and bridge identity before resumed shared cleanup, and suppresses
stale teardown errors while preserving current errors. All 14 actual-method
controls pass; five guard/error mutations fail. Fresh candidate installed
qualification and enabled exact-head checks remain required; this does not
close G02. Earlier cold-start failures remain unresolved despite successful
startup in the new diagnostic. No timeout, native feature or pin changed.
