# Arcade source scene and polling timers

Native source dialogs now follow the selected MakeCode scheduling components:
`base/poll.ts`, `base/eventcontext.ts`, `game/scene.ts` and
`game/textDialogs.ts` from [the pinned Arcade4.2.1 target bundle](https://unpkg.com/pxt-arcade@4.2.1/built/target.json).
The selected target is commit2d7d59b5226e8a1a1e05e8042dd9f5248ed68fea,
PXT13.2.1. Microsoft MIT attribution is retained beside the adapted helpers.

## Execution contract

A shared condition-poll queue checks actual predicates every50ms. It keeps its
phase through the final50ms sleep before releasing an empty queue. Registrations
in that interval join that phase. Splash and LongText set their completion flag
when their scene closes; source resumes when the actual condition timer wakes it.
There is no fixed delay added to a dialog and no program-clock adjustment.

Each source scene owns its EventContext frame worker. Registration starts an
initial frame with delta0; subsequent sleeps are `max(1,20-callbackRuntime)`.
Unregister invalidates the worker. A sleeping predecessor releases its running
state at its next wake; restoring a still-running context waits through the
shared polling queue. Scene time advances from that worker's actual delta.
Source scene frames run independently of the ordinary Scratch rendering and
thread schedule. They do not step unrelated Scratch threads.

Source wait blocks retain the real executor and stack timer. An actual timer is
bound to the exact live source thread, execution context, timer object, duration,
run generation and program-clock epoch. A wake reevaluates that wait through the
executor; it does not supply a synthetic result. Timer continuations do not
release consumed graphics or tick yields. Actual scene frames release those
source yields once for their frame. Stop, load, restart and disposal cancel old
waits and workers; an old timer cannot revive another project's threads.

Boolean-question readiness keeps its existing guard and release/press rules.
It receives actual owned scene-frame deltas in the timed profile and explicit
manual-frame deltas in the manual profile.

## Clock authority and tests

Production uses the existing monotonic program clock and platform
`setTimeout`/`clearTimeout`. An owned control can supply
`runtime.bwArcadeProgramClock = {now,setTimeout,clearTimeout}`. Its independent
timer platform must dispatch deadlines between physical observations, such as
150ms between observations140/160. The runtime never substitutes a guessed
150ms timestamp for a clock that only advances on a20ms grid.

A now-only injected clock declares manual physical frames and supplies no timer
authority. Exact native condition-poll controls require timer hooks. The
headless `runProgram` helper explicitly defaults to the historical manual-frame
profile with a real program/wait clock; it does not fast-forward waits or prove
GUI50fps. Exact timer tests select `frameAuthority: 'timed'` and supply the owned
discrete platform. GUI runtimes receive no manual test flag.

Focused controls compare original/native Splash, LongText, sequential and
concurrent dialogs, source pauses0/20/30, Code, same/fresh savedSB3, original
export and reimport. They retain the observed original ordering: a dialog
closed at120 resumes source on the150 poll with scene time20, before the160
frame; a second scene created150 owns frames150/170/190. Separate actual-VM
controls cover source tick quotas, unowned Scratch waits, actual sequencer
guards, context replacement and cached project reload. The loaded phase class
and installed source bytes are both checked to reject stale test dependencies.

The existing music-backed `_arcadePause` is a separate scheduler boundary.
This slice does not qualify every music wake, debugger user interface, every
native Blocks/mixed-Scratch authoring path, installed GUI cadence, unseeded
terminal pixels or arbitrary corpus games. Production GUI and whole-project
receipts must use their exact reviewed build and pins.

## Selected bundled source hashes

| File | SHA256 |
| --- | --- |
| base/poll.ts | d278bfc08a5488844911ebd12eeaf795c5672bdaa0ed41ff584489af09eb9d68 |
| base/eventcontext.ts | 95bbeb486dec17ad75674f03978e0836f087f93faf442ae58895a7ffb25b2925 |
| game/scene.ts | 33fdb3e4e549da2607c35d93238d51db0497771bd141ae4d9aaa0fb41992669f |
| game/textDialogs.ts | d52d1c046debe4f889f2a82792882de2358f68233037cf4ca42cbfdf3d408caf |
