# Editor History follow-ups, 2026-10-28

Continuation of T3, T5 and T6 in `EDITOR-HISTORY-HANDOFF.md` (PR #1527).
The implementation commit carries the released lane claims. Hosted checks and
merge are still required before these changes reach users.

## T3: remaining operations

| Operation | Result |
| --- | --- |
| Rename the project using its title field | One project History step; Undo and Redo restore the Redux title. Loading a project does not create a title-edit step. |
| Copy a script to another sprite | One step per copy, including newly created variables. Undo removes the copied blocks and those variables; Redo restores their IDs and values. Concurrent copies are serialized so their steps remain independent. |
| Add an extension | Intentionally outside Undo. The VM extension manager loads services, opcodes and workers and provides no safe inverse unload operation. Undoing the capability could invalidate existing blocks; adding or editing blocks still has its ordinary undo behavior. |
| Load a whole example project | A project replacement, outside the current project's Undo. Successful `vm.loadProject` clears structural History. Circuit examples with programs already warn before replacing blocks, pins and board; circuit-only examples retain the circuit designer's own undo. Robot Lab example program loaders also reach the project-loading boundary. Save/download the previous project or use an available autosave to return to it. |

The live browser regression uses the public Undo/Redo controls for a real title
edit and an actual VM script copy. It verifies that undoing the copy leaves the
destination sprite present. VM tests also cover copied local variables, two
concurrent copies, unchanged source variables, and the existing project-load
History reset. The extension decision is a source/API audit, not a device test.

A copy waiting for an extension belongs to the project where it started.
Successful project replacement starts a fresh copy queue, cancels queued copies
from the previous project, and prevents their late completions from adding old
Undo entries. The real-VM regression holds an extension load open across project
replacement and checks that a new-project copy completes independently, only
its own History step remains, and ordinary new-project edits still record.
The original implementation fails this regression; the repaired History,
global Undo, artwork Undo and overlay checks pass all 28 controls.

Restoring a deleted sprite also reconstructs its costume and sound objects.
Earlier duplicate, rename and reorder steps now follow those restored identities
rather than looking for the discarded objects. Matching retains the serialized
order, names and asset identity, so differently named assets sharing the same
SVG or WAV remain distinct. Real-VM regressions undo and redo both kinds of
asset edits through two sprite delete/restore cycles. Both fail with the
original implementation; the combined focused suite passes all 30 controls.
The sound fixture checks asset/history reconstruction, not audio playback.

## T5: Android autosaves

Android native builds hide the inaccessible folder option, ignore a previously
selected private folder, and explain that versions stay inside the app and can
be downloaded. iOS, desktop and browser folder behavior is retained. This is
covered with simulated native bridge/platform tests; no Android installation or
new native release was performed.

## T6: maintained browser gate

`scripts/verify-global-editor-undo.mjs` now checks three real edits, ArrowDown
and ArrowUp focus, and Enter undoing exactly two edits. After 35 further edits
and a 32-step jump it reopens History and checks that the selected Now row lies
inside the visible list. Existing Widget, Code, costume, autosave and recovery
journeys remain in the same gate.

The merged History coordinator also waits for asynchronous editor steps before
choosing the next editor/project entry. A rejected or refused edit stops the
jump without counting an unapplied step; asynchronous errors appear through
the existing Undo error state. Synchronous editors retain their synchronous
return values. Three coordinator regressions reproduce the original premature
completion, misordered project steps and overcounted failures, then pass with
the repair. This changes only the lazy coordinator, not the first-load core.

## Validation

The final combined Node 22 run passed all 37 controls, including project/global
editor History, Android autosaves, overlay pairs, boot and lane claims. The standard production
GUI build, boot-payload verifier and maintained Chromium gate passed, including
the new T3 and T6 journeys. The build with the optional FPGA flag could not
resolve the local optional `@yowasp/yosys` dependency; it is not a passing local
FPGA build. Hosted checks must qualify the published source.

T1 iPad observations remain with the owner, who will test later. T2 requires a
reproduced device palette crash. T4 history persistence remains deferred pending
its separate decision. No App Store Connect, TestFlight or release was performed.
