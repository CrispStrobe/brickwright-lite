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

Independent review also reproduced a queued copy running after the loader had
cleared its target but before `loadProject` resolved. Copies now retain the
requested target identity and cancel in that intermediate loading window too.

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

A jump also stops before entering a different editor, a newly registered
replacement for the same editor, or a replacement project's History. A
project-only jump remains independent of tab selection. A late failure from
the previous project cannot remove the replacement project's Redo entry.
Together with the loading-window regression, the focused History/artwork/boot
and claim checks pass all 49 controls without skips. The sound consumer's
encoding/selection transaction repair is scoped separately; coordinator tests
do not establish actual sound-write cancellation or audio playback acceptance.

## Sound edit operations

Sound effects, paste, delete/crop and Undo/Redo share one visible busy operation.
Their mutation controls and trim gestures are disabled while work is pending;
playback, copying and selecting another sound remain available. Each operation
captures its actual VM, target, sound object and index. Completion checks that
context, including the target's continued presence in the runtime, before
writing. Selection changes and unmount invalidate stale work.

Undo/Redo move their stacks and labels only after the encoding and VM update
succeed, and return their actual success/refusal to the coordinator. Offline
effects and resampling expose promise rejection so errors release the busy
state; callback-only WebKit completion remains supported. Earlier attempted
delayed-stack code was rejected because it could remove an intervening edit.

Delete and Crop require a finite selection covering at least one actual sample.
Shift+Delete with no selection previously encoded one silent sample, while
ordinary Delete added a redundant History entry. Both now refuse that input
before encoding; valid crops and deleting a whole selected sound remain undoable.
The maintained browser gate reproduces the original Shift+Delete corruption
and checks that the repaired production editor preserves the decoded samples.

The combined focused suite passes72 controls without skips; all four source
files pass ESLint. A separate Chromium helper probe exercises real offline
reverse and resampling, but required production acceptance is the maintained
global-Undo browser gate: actual WAV buffers, Reverse/menu Undo/Redo, disabled
controls during a held real render, sound selection before render completion,
and a renderer rejection. These are software observations, not device playback.

The independently started Copy-to-New callback/VM decoding path remains outside
this operation gate; its button is disabled while these operations are busy.
A VM update that throws after partially changing its own state is not rolled
back by this controller. Neither limitation is represented as fixed here.

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
