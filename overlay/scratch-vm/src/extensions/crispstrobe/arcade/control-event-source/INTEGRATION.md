# Selected control event queue profile

`control-events.js` adapts the MIT Microsoft PXT simulator EventBus/EventQueue
and `base/eventcontext.ts` behavior. The selected Arcade4.2.1/core13.2.1 target
hash is `6f35aadf1456436b3318d2f2339cc3d1add6e6c3b0bf8566f86d7f7bb4f7722e`.
Selected simulator `pxtsim.js` SHA256:
`4976bc55c36d82d692bbbd0d6fe1d1435e8dd8c7dcff76e5aa28e02bf3baf826`.
Selected `base/eventcontext.ts` SHA256:
`95bbeb486dec17ad75674f03978e0836f087f93faf442ae58895a7ffb25b2925`.

Primary navigation: [PXT simulator](https://github.com/microsoft/pxt/tree/master/pxtsim)
and [EventContext](https://github.com/microsoft/pxt-common-packages/blob/master/libs/base/eventcontext.ts).
The adjacent license retains Microsoft attribution. These are source-backed
queue adapters, not a cleanroom claim.

## Runtime integration

The runtime imports this module for foreground `control.onEvent`,
`control.raiseEvent`, `control.waitForEvent`, and shared notify-source allocation.
Actual scene EventContexts install and restore wrappers; an invocation snapshots
its current registration, while a busy queue retains ordered pending events.
Raises return before dispatch. Only queues existing when the raise occurs are
eligible: later registrations do not receive an earlier event. The selected
pending limit admits six pending events plus the running invocation. Selected
public listener flags are evaluated once but ignored by the original internal
shim; handlers remain serialized.

Inline source callbacks use actual emitted extension hats, target ownership,
live captured cells and the source continuation driver. The bus never retains a
registration thread or calls a keyboard API. Stop/load cancel queue generations
and settle blocked waiters. Saved projects preserve the emitted registrations,
not transient queue state.

Controller source IDs share the same allocator. The selected module constructs
players 2, 3, 4, then 1, consuming IDs 1024 through 1027 before the first public
allocation. Multiplayer connection listeners belong to the active scene and
receive actual Player references. The selected connected setter uses loose
inequality and retains the supplied primitive; exported deliberate raw values
use a cast at this API boundary. Internal button events update SDK button state;
explicit user events dispatch handlers without changing held keyboard state or
being blocked by the physical user-event gate.

## Qualified boundary and remaining work

Focused controls cover wildcard order, waiter-before-handler ordering, busy
replacement, mutable captures, scene restoration, queue saturation, late
registration, raw connection values, physical versus raised button state and
Stop/restart. Editable Code, same/fresh SB3 and original MakeCode export/reimport
are exercised for representative inline control and multiplayer fixtures.
This does not qualify a complete corpus game or the installed GUI.

Named/dynamic callbacks remain diagnosed until the canonical callable service
is qualified. Background/idle listeners, timestamp APIs, runtime debugger pause,
notify-one delivery and controller menu/any-button getters are not qualified.
The helper contains the selected notify-one mapping, but it has no original
comparison gate yet. This target does not expose `control.eventValue`,
`control.eventTimestamp` or `EventCreationMode`; conversion retains diagnostics
for those names. No generic source-fault propagation or arbitrary raw object
argument contract follows from primitive controls.
