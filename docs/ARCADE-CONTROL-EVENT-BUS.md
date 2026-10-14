# Arcade control events and multiplayer connections

Status: proposed lane claim; documentation only. Merge before product edits.
Fresh agents should read this contract, its LANES.md section, and
[frame phases](ARCADE-FRAME-SCHEDULER.md) and
[object semantics](ARCADE-CLASS-AND-OBJECT-SEMANTICS.md), then check active owners.

## Goal and original authority

Implement authorable source control events and multiplayer connection callbacks
with their actual queue, context and lifecycle behavior. These are remaining
conversion gaps in an authentic multiplayer splash helper. Registering an empty
callback or parsing its source does not qualify the whole game.

Initial authority: selected Microsoft MIT Arcade4.2.1/core13.2.1 bundle, target
SHA256 `6f35aadf1456436b3318d2f2339cc3d1add6e6c3b0bf8566f86d7f7bb4f7722e`.
Primary navigation:

- [base/eventcontext.ts](https://github.com/microsoft/pxt-common-packages/blob/master/libs/base/eventcontext.ts): registration, replacement and context push/pop.
- [game/controller.ts](https://github.com/microsoft/pxt-common-packages/blob/master/libs/game/controller.ts): connection state, allocated IDs and events.
- [multiplayer/player.ts](https://github.com/microsoft/pxt-common-packages/blob/master/libs/multiplayer/player.ts): per-scene MPState and callback replacement.
- [PXT runtime](https://github.com/microsoft/pxt/blob/master/pxtsim/runtime.ts) and [simulator sources](https://github.com/microsoft/pxt/tree/master/pxtsim): queues and bus.

These links identify components, not immutable selected-source receipts. Bind
actual bundled bodies, simulator files, compiler worker and target hashes before
qualification. Retain Microsoft MIT notices for original bodies and adapters.
No hardware/CODAL, unrelated art licensing or whole-game claim follows.

## Initial API boundary

| Selected public API | Required behavior |
| --- | --- |
| control.raiseEvent(src,value) | Evaluate numeric operands once in source order; announce an actual event with the original asynchronous delivery boundary. |
| control.onEvent(src,value,handler,flags=16) | Capture actual cells; bind the EventContext; preserve replacement, wildcards and busy queues. Evaluate optional flags even if ignored by the selected simulator. |
| control.waitForEvent(src,value) | Suspend that source fiber until matching notification; no polling, fabricated return or time advancement. |
| mp.onControllerEvent(event,handler) | Connected/Disconnected registration, actual typed Player argument, per-scene replacement and restoration. |

Selected declarations contain no EventCreationMode, control.eventValue or
control.eventTimestamp. Preserve named unsupported diagnostics for them. The
simulator's internal third raiseEvent mode is ignored; internalOnEvent drops
listener flags before DAL registration. Queue-if-busy is the initial simulator
profile even when source supplies flags. Other targets require their own
original declarations and execution proofs.

The internal bus tracks last event value and microsecond time relative to
runtime start; getLastEventTime applies a 32-bit mask. Observe units, signed wrap
and real clock authority in reference controls. Do not expose absent public
reporters or substitute Scene milliseconds.

## Event identity and state

Raising an event does not press a keyboard button, connect a device or invoke the
controller pane. A controller connection setter changes connected state and
raises its event only on transition. Controller source IDs use the shared notify
allocator; do not guess IDs from a project or allocate a separate counter that
changes initialization order.

The user-events gate selects IDs for real physical button transitions. It must
not block explicit raiseEvent of a user-event ID. Compare explicit user/system
raises with genuine input transitions and held-state queries. Ordinary Scratch
input/events remain unchanged.

## Context, queue and lifetime

EventContext replaces the same source/value handler. Push unregisters the
parent; pop unregisters the child and restores the parent. Outside-context
registration follows the selected internal bus. Busy replacement uses deferred
mutation, not immediate replacement of an in-flight callback.

The selected bus orders wildcard/exact queues and background/foreground queues.
Its finite pending bound, waiters, notify-one behavior, nested raises and busy
serialization need direct original comparisons before porting. An EventEmitter
or an immediate callback list does not establish those behaviors.

MPState owns per-scene connection registrations. Repeating an event registration
replaces its callback. Each underlying controller supplies its actual Player;
connection state remains controller-owned while handlers follow active context
and MPState. Verify yielded callbacks, replacement/reentrancy, retained Player
identity and push/pop restoration.

Dispatch through the existing source continuation driver at actual program time
with the shared work budget. Do not inject frames, sleeps, guessed delays or
clock offsets. Waiters own exact fiber/context/generation. Stop/load/dispose
cancel safely; restart rebuilds registrations and allocators. Preserve debugger
pause and ordinary Scratch waits. Coordinate any necessary phase hunk separately.

## Product ownership after claim merge

- New `overlay/scratch-vm/src/extensions/crispstrobe/arcade/control-events.js` and bounded source/provenance helpers.
- Narrow Arcade index.js event registration/delivery, controller connection, Scene context lifecycle and metadata. Preserve object heap, Scene flags/rendering, HUD, arrays and dialog owners.
- Arcade-only cases in arcade-translate.js and export-arcade.js; lexical shadowing, typed IDs, optional operand effects, callback captures and parameter identity must survive.
- Separate own sb3-creator branch for genuine authoring words/fields. Qualify canonical Code/Blocks/Boolean/argument-slot/SPIKE controls before reviewed pin adoption; never push another supplier lane.
- Focused original/native/Code/export/reimport/SB3 tests, official-build browser journey, capability/GUI records and this contract.

No global Array/EventEmitter patch, generic scheduler replacement, source
pruning, unknown package admission or corpus promotion. Deliver bounded slices
and retain precise unimplemented API diagnostics.

## Acceptance matrix

| Area | Required original/native controls |
| --- | --- |
| IDs and evaluation | Literal/dynamic/zero wildcard/negative/fractional IDs, operand side effects and selected compiler/shim conversion. |
| Dispatch | Asynchronous return, exact/wildcard order, callback arguments, nested raises, busy replacement and finite queue saturation. |
| Waiters | Before/after raise, multiple waiters, selected notify-one semantics, cancellation and scene transitions. |
| Controller | Every Player, real connect/disconnect/equal-state transitions, raised event with unchanged state, disabled user events and real button edges. |
| Scenes | Parent/child context and MPState, replacement, mutable captures, yield/push/pop and late old-owner delivery. |
| Projects | Stop/restart/load/dispose, two runtimes, stale registrations, saved metadata and debugger pause. |
| Authoring | Real live numeric/Boolean inputs where supported, callback blocks/captures, Code edits, original export/reimport and same/fresh SB3. |
| GUI | Exact admitted official build; palette edits, controller pane and visible witness, File Save/fresh reopen and export compiled with that artifact's SDK. |

Use unchanged original fixtures with recorded external clock/controller stimuli.
Local probes and prepared browser scripts are preparation, not GUI qualification.
Retain first failures and source/pin/worker/asset receipts privately. Public docs
use repository paths and official URLs, with no machine paths or private art.
