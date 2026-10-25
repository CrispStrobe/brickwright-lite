# Arcade physical null Sprite getter failure

## Bounded requirement

The retained flame-handler project leaves a Sprite receiver null. Pressing A
creates a projectile, then reads the null receiver's x coordinate before any
setPosition, velocity or AutoDestroy operation can complete. Its selected
original reports a TypeError at Sprite_x. The already-created actor remains
at x=80, y=60 with zero velocity and zero flags; later actor operations are
absent. The simulator remains running. This proves this particular failure
boundary; it does not prove the behavior of every other fiber or getter.

Own a narrow physical primitive failure handoff, coordinated with the existing
[Throw handoff](compatibility/arcade-throw-statements.md). Evaluate the actual
current receiver exactly once. Identify an actual null value at the current
arcade_spriteProperty operation before any String conversion or ID lookup.
A missing Sprite, unknown ID, empty string, the text "null", stale capability
or absent argument must not be manufactured into null. Existing non-null
service behavior and valid historical/destroyed Sprite handling remain intact.
The bounded property set is x/y/width/height, each individually qualified.
Only x has the selected original runtime failure observation; y, width and
height remain unqualified until their own evidence. Source and current Blocks
must preserve each actual getter rather than infer another property from x.
Do not infer broad SDK Sprite admission or reference authority from this lane.

## Failure ownership and effect order

Only the actual executing cached primitive may issue a null-receiver failure.
Bind its runtime, active thread, block container, reachable current operation,
argument-object identity and registered function. Recheck the current receiver
and supported property at that boundary. A retained utility, copied arguments,
replaced cache/registration, disconnected graph, public tag or arbitrary Error
cannot acquire failure authority. An annotation or raw Sprite ID grants none.
Do not re-read effectful receiver expressions or reinterpret a normalized value.

Privately issue the actual primitive fault and hand it to the shared exception
owner. Retire the real affected stock activation and linked managed callers;
settle owned invocation continuations exceptionally exactly once. Preserve
already committed allocation and earlier effects. No subsequent receiver,
position, velocity, flag or enclosing-caller effects may run as successful
completion. Keep unrelated detached fibers live. Do not substitute stopAll,
game-over, Undefined, a zero value or a normally completed child.

Capture the actual owning invocation and its completion before failure; neither
a guessed caller nor a raw block/thread ID can manufacture a lineage edge.

Report a TypeError with its actual fault boundary through the normal runtime
error path. Keep issue/consume provenance private and per runtime/thread.
Stop, restart, Load, disposal, asynchronous completion and capture/return-ticket
cleanup retain their existing generation and ownership rules. This is no general
arbitrary-Error conversion entry point and no try/catch/finally implementation.

## Qualification

Retain the original failure observation without replay. Run the authentic source,
current Code, same/fresh SB3 and current export/reimport routes against the actual
native primitive. Record all diagnostic channels, the created actor, actual
getter and downstream operation counts, live threads and subsequent observations.
An intentional error counts only when earlier effects and the absence of later
effects agree; a timeout or missing actor is not parity. The selected original's
raw framebuffer evidence does not qualify visible presentation.

Add authored nested ordinary-call and managed-callback controls: fault propagates
to the real caller without success settlement or leaked waiters, preeffects stay,
and an unrelated detached fiber continues. Exercise restart and reload plus
foreign/stale/copied-argument and changed-graph negatives. Keep direct native
service calls and existing non-null Sprite cases compatible. Visible Blocks,
Code editing, save/reopen and GUI error reporting remain independent gates.

Root review and a finite source-bound native execution packet precede native
tests. No SDK or browser execution is authorized by this document alone.
Claim publication and normal qualified merge precede product implementation.
Keep existing Sprite/Image capabilities, Arrays, source admission, dependency
pins, supplier schema and other owners' exception work unchanged. No whole-case
promotion, full SDK, original presentation or release claim follows from this
bounded contract.

### Bounded current-artwork control

The authored current-artwork control now passes source, Code, same-session SB3,
fresh-session SB3 and current export/reimport routes using one live VM at a time.
It retains the saved project and SVG inventory, the saved ZIP hash, the created
actor, the physical x-getter failure and the absence of later actor effects.
The separate positive control retains current position and velocity behavior.
The ZIP bytes were not retained by this control, so its result does not claim
an independent ZIP extraction audit. These fixture observations do not qualify
the authentic full project, visible editors, physical presentation or selected
original behavior for y, width or height.
