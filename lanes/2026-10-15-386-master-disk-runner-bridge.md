## 386 master-disk runner bridge — 2026-10-15

CLAIM — Codex x86, serialized within the media workflow above, after required
board qualification and explicit handoff.
Additional ownership is limited to canonical
`overlay/scratch-gui/src/lib/bw-debug/debug-runner.js`, its tracked generated
`packages/scratch-gui/src/lib/bw-debug/debug-runner.js` mirror, and new
`test/debug-runner-hdd-snapshot.test.mjs`. Publish and merge this contract before
runner implementation. Preserve concurrent runner changes and the supplier
owner's package/lock/vendor surfaces.

Add only a focused `snapshotAtaMaster()` bridge to the current target's method.
Keep the target private. Do not add arbitrary method dispatch, direct ATA access,
auto-pause/resume, storage persistence, or a new capability schema. Require an
active paused session and the underlying method, preserve structured refusals,
and reject pending results after stop, replacement, or destroy using session
ownership that cannot become valid again after stop/start. Mere target reference
equality is insufficient. A completed copy remains a point-in-time snapshot;
it does not grant a continuous paused lease or guest flush/completion.

Execute the actual bridge and lifecycle paths in focused controls: unsupported
and running targets make zero calls; board refusals survive; accepted bytes and
boundary survive ordinary resume after copying; stale destroy/replacement/
stop-start results fail closed. Preserve legacy targets and mirror equality.
The separate download helper must recheck the active GUI session during awaits,
clean up URLs on failure/disposal, and describe clicks as download initiation.
Actual installed browser download and fresh chooser reload remain mandatory
before a user-facing qualification claim. No supplier pin or chooser geometry
limit changes belong to this extension. See the
[handoff](docs/X86-NEXT-LANES.md#master-disk-export-continuation).
