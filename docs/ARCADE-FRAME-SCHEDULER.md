# Native Arcade frame scheduler contract

## Status and scope

This is a proposed implementation and qualification contract. Merge its
[lane claim](../LANES.md) before changing the product hook. The current timing
failures remain open. A diagnostic execution order or passing value controls
do not qualify a scheduler fix or a complete game.

The implementation envelope is the Arcade phase hook in
`scripts/apply-vm-overlay.mjs`, a new
`overlay/scratch-vm/src/extensions/crispstrobe/arcade/frame-phase.js` driver,
the necessary phase/lifecycle hooks in that directory's `index.js`, and focused
`test/makecode-arcade-frame-phase*.test.mjs` controls. Coordinate shared-file
hunks before implementation. Preserve other runtime patches and source owners.

## Original source authority

Use the complete original Arcade SDK selected by the project and record its
target/core versions and worker/source hashes in qualification receipts. The
investigation used Arcade target 4.2.1 and PXT core 13.2.1. Its target release is
[pxt-arcade v4.2.1](https://github.com/microsoft/pxt-arcade/tree/v4.2.1).
Component source navigation is provided by the official
[EventContext](https://github.com/microsoft/pxt-common-packages/blob/master/libs/base/eventcontext.ts),
[Scene](https://github.com/microsoft/pxt-common-packages/blob/master/libs/game/scene.ts)
and [physics](https://github.com/microsoft/pxt-common-packages/blob/master/libs/game/physics.ts)
files. Those moving source links do not identify the exact packaged SDK bytes;
the selected SDK and receipt hashes remain the comparison authority.

The official [game-loop guide](https://arcade.makecode.com/developer/game-loop)
explains the controller, physics, update and render order, and independently
scheduled overlap fibers. It describes an earlier editor version; use the
selected source for exact priorities and timing.

In the inspected SDK, EventContext queues its frame fiber, initializes the
previous timestamp, and runs an initial frame with zero delta. Subsequent
callbacks target a 20ms interval, subject to callback execution time. Scene
physics precedes user updates. Physics uses elapsed time to determine its
movement rounds; the initial zero delta does not create an overlap round.
Overlap callbacks are queued independently from the frame callback sequence.

## Current observed limits

The native hook emits `ARCADE_FRAME` before the normal sequencer pass. Finite
authored controls with a controlled program clock exposed these differences:

| Authored case | Original observation | Current native observation |
| --- | --- | --- |
| Synchronous startup installs an update handler and creates overlapping sprites | Main completes at 0ms; update runs at 0ms with zero delta | A natural first tick runs main at 0ms, but its first update is at 20ms |
| Main sets sprite x to 80, pauses 20ms, then sets x to 100 | Main resumes before frame 20; that update observes x=100 | Frame 20 observes x=80; main resumes after it; update 40 observes x=100 |
| A creation handler pauses 20ms before returning to `sprites.create` | Handler and caller resume at 20ms before that frame | Handler finishes at 20ms after the frame; its caller resumes on another turn at 40ms |

The creation case also distinguishes an internal Promise continuation from
the source's authored pause. Its caller's additional turn must not become an
invented source yield.

A forced initial 20ms test step advances an empty native scene before main.
That is a harness phase choice and must be recorded separately from the
natural first zero-duration tick. Do not subtract a timestamp or insert a
fixed delay to make traces agree.

The inspected SDK targets 50 frames per second. The GUI selects Scratch
compatibility mode in `overlay/scratch-gui/src/lib/vm-manager-hoc.jsx`, whose
step interval targets 30; the VM's other mode targets 60. The native test
helper's default explicit step also uses 30. Controlled 20ms comparisons do
not qualify the installed application's cadence, jitter or responsiveness.
Product scheduling must be
qualified separately, including its interaction with ordinary Scratch threads.

## Required phase behavior

1. At project start, execute startup source until return, its first authored
   wait/yield, or the shared work limit. Drain ready internal API continuations
   at the same timestamp. An authored pause inside a creation handler allows
   frames to run while its caller remains suspended; do not wait for all main
   code to finish before starting the initial frame.
2. Run the initial frame with its actual initial zero delta. Preserve the
   selected original controller, physics, update and render priorities.
3. At later timestamps, give newly due source continuations their original
   eligibility before the corresponding frame. Distinguish authored timers
   from ready internal reporter/callback continuations.
4. Give new parallel frame/overlap fibers their eligible turn after the frame
   at that timestamp. Preserve callback arguments, captured references, locks,
   scene ownership and registration order.
5. Hold source threads that already consumed an authored tick yield until
   their next eligible tick. Share one work deadline across all phases and
   continuation pumps. Running a second complete sequencer pass must not reset
   tick eligibility or double-step loops and forever handlers.

Program monotonic time, accumulated scene time and callback delta remain
distinct. Preserve pauses, suspended scenes and independent fibers across
scene changes. A plain global move of the frame event cannot establish this
contract: new frame fibers could become one frame late, or a second sequencer
pass could execute previously yielded work again.

## Lifecycle and debugger guards

Stop, disposal, project replacement and restart must cancel the old run's
scheduled work and internal continuations. Late completions must not publish
state into a replacement run. Restart creates fresh program/scene epochs;
scene push/pop preserves the original ownership rules within a run.

Breakpoints, stepping and debugger pause must retain suspended source state
and callback ownership. A paused debugger must not execute hidden bootstrap
work, advance physics or consume source yields. Resume must not replay a
completed frame. Work exhaustion must retain pending work for its next valid
turn with an explicit diagnostic where required, rather than report success
after dropping callbacks. Preserve validation of invalid/backward clocks.

## Acceptance and reporting

Qualify the three authored cases above with the actual original compiler and
simulator, the native VM and a controlled clock. Compare main completion,
creation and overlap dispatch, every selected callback, sprite state,
program/scene timestamps and delta. Preserve the current exact timing failure
until the combined product source passes the comparison.

Additional controls must cover yielding overlap callbacks, ordinary loops,
forever handlers, bounded work exhaustion, scene push/pop, nested callbacks,
Stop/disposal/replacement/restart and debugger pause/step/resume. Include
non-Arcade programs to prove that the scoped hook preserves their scheduling.

Then qualify Code and Blocks, original-compiler export/reimport, fresh SB3
reopening, real controller inputs and the installed GUI on the final source
and dependency pins. Compare event order and relevant pixels at matched
phases; a smoke run or roundtrip alone does not establish equivalent behavior.
Keep prototype results separate from product qualification, preserve all
failures and report any remaining phase/cadence limits. Corpus classifications
and whole-game compatibility remain separate acceptance gates.
