# Bounded ExtendableSprite constructor and update bridge

Status: bounded candidate. Seven selected-original constructor/lifecycle controls
and three independently compiled new exports are qualified. Native Code and
same/fresh saved-project controls preserve the three constructor/lifespan
observations. Hosted GUI, full-game graphics, audio and cadence qualification
remain pending; these finite controls do not qualify Carnival applications.

## Selected authority

Arcade 4.2.1/PXT 13.2.1 selects MIT pxt-common-packages 14.1.4.
[ExtendableSprite](https://github.com/microsoft/pxt-common-packages/blob/v14.1.4/libs/game/extendableSprite.ts)
SHA-256 `5deac86004236ed206f821987efe310e8217e6e581e446e23bfe70ca2b95931b`
and [Sprite](https://github.com/microsoft/pxt-common-packages/blob/v14.1.4/libs/game/sprite.ts)
SHA-256 `c452013b5ddea08284a6d9e6ee34e86fdc59df2dead6f34cf12d01a2dda2d4da`
define the constructor and frame contract. Retain the existing Microsoft MIT notice.

ExtendableSprite calls Sprite construction, selects the supplied kind, joins
its actual scene physics engine, invokes matching created handlers using the
supplied kind argument, then sets hasCustomDimensions=false. Its __update calls
the base Sprite __update before the public update method, whose argument is the
current scene event context deltaTimeMillis. Base lifecycle destruction does
not omit the subsequent public call. Base __update handles lifespan, then
AutoDestroy, then speech. Scene pre-render updates use real scene membership
and camera ordering.

## Bounded implementation

Reuse the existing SDK constructor bridge and physical Sprite body. Class
storage, base-Sprite aliases, image identity, physics membership and source
method slots remain the same object; do not allocate a wrapper Sprite. Admit
only the exact public update signature initially. Draw, dimensions, hitbox,
private serialization and constructor-reaching unqualified virtual overrides
retain explicit refusals.

An update invocation must retain its actual class method and project target.
A completed constructor thread is not its caller. Add a scoped native frame
method activation API to the existing phase driver: the activation validates
actual allSprites entry membership, declared method/body and target, scene owner,
program generation and frame epoch. It lends authority only while creating the
real managed procedure thread; nested calls inherit that thread's existing
managed ownership. Nothing is stored in project-visible flags, fake hats or
serialized arguments. All work shares the existing quantum and clocks.

The live scene array is iterated in its actual current order, including prior render
sorts, removals and appends. Registration can precede the end of a paused
constructor and physics insertion; a construction-complete or physics-members
gate would change the selected source. Capture membership before base lifecycle
work so lifespan or AutoDestroy destruction does not erase that same entry's
subsequent public update. Keep the entry issuer in a module-private controller;
the extension exposes only the one-shot validator, never an observer entry mint.

A pending activation remains owned by its physical scene. Scene push must not
silently run its suspended continuation as ordinary Scratch work. Pop/disposal,
Stop and project replacement invalidate or suspend it according to measured
selected event-context behavior. Selected-original/native controls cover update pause, scene push with a child
update worker, pop, Stop and replacement. They preserve initial delta 0 and
post-pause deltas 41 and 20 ms. Other lifecycle combinations retain their own
qualification boundaries.

## Required controls and authoring

Use independently authored controls for base/class/Sprite alias equality,
physical motion, numeric kind, image mutation, created-handler observations
before derived constructor assignments, per-frame delta and override dispatch.
Include finite source loops, nested method calls, an authored pause, scene
push/pop, destroying the actor during update, and Stop/load while pending.
Original and native event ordering must match without a clock offset or skipped
frame. Existing plain Sprite behavior remains an affected regression control.

Class metadata and the update method stay editable in Blocks and Code. Save to
fresh SB3, export a real subclass and update method to selected original PXT,
execute the newly exported original, and reimport. Image artwork must retain its
actual costume/resource identity through edits. Hosted GUI interaction is a
separate gate. This slice alone does not qualify Carnival games: captured
renderable callbacks and higher-order arrays remain separate dependencies.

## Physical lifecycle defaults

The selected Sprite constructor leaves lifespan undefined. An explicit lifespan
0 expires at its next eligible update; positive values subtract that frame's
delta once. Preserve typed undefined in the property reporter. Every physical
Sprite receives base lifecycle and speech work through the same live array pass;
then an Extendable entry invokes its selected method. BaseSprite and non-Sprite
renderables retain their no-op distinction. Ordinary Scratch setup retains its
normal kernel turns and defaults; only the registered callback receives the
frame activation.

## Observed source controls

A paused derived constructor and paused virtual setImage each permit two updates
that observe the derived Number field as undefined. The authored snapshot sees
four updates with deltas 0,20,20,20 ms. Lifespan-zero destruction retains one
subsequent public update and the same Sprite alias/kind. An update paused for
40 ms yields subsequent deltas 41 and 20 ms. A pushed child scene receives two
updates while its parent method waits; the parent resumes and pops normally.
A destruction handler can push a scene before the same entry invokes its public
update, which reads that new context's initial delta 0. Removing an earlier plain
Sprite shifts the live array and skips the following custom actor in that pass.

Stop prevents the pending method's later write, and restart/project replacement
create new activations. The driver rejects forged entries, foreign targets,
duplicate spawns, stale generations and same-scene iterator reentry. Independent
scene workers retain separate entry ownership. All work keeps the existing
shared quantum, host turns and real program clock.
