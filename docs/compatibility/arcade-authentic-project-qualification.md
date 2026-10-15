# Authentic Arcade project qualification ledger

Updated 2026-10-15. This is the bounded development campaign, not a claim about
the shipped application or every historical receipt. Read the
[handoff](../ARCADE-AGENT-HANDOFF.md), [closure plan](../ARCADE-PARTIAL-CLOSURE-PLAN.md)
and [GUI ledger](../CONVERSION-CAPABILITIES-AND-GUI-GAPS.md) first.

## Meaning of each gate

All sixteen contexts below have genuine retained resource bytes and a successful
selected-original compilation. Their immutable raw snippets remain unchanged.
The separate `31abb5767` snapshot has thirteen clean source/current-export routes
and twelve complete pure routes. The table preserves that snapshot except for
the explicitly dated later Lyla result below.

A native pass here means five observed routes: source import, current Code,
same-VM saved SB3, fresh-VM SB3 and current export/reimport. Actors, controls,
timers and resources are checked according to the actual complete project.
It is not an original-runtime, visible editor, rendering or full-game pass.
A dash means this campaign has not closed that gate. Earlier receipts must be
matched to the exact input and source before being credited here.

| Public source and snippet | Complete pure snapshot | Five bounded native routes | Original source guest | Current export guest | Visible authoring |
| --- | --- | --- | --- | --- | --- |
| [Alien](https://github.com/microsoft/pxt-arcade/blob/8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02/docs/tutorials/alien.md#8) (`0a50646d`) | Pass | Pass | — | — | — |
| [Free throw](https://github.com/microsoft/pxt-arcade/blob/8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02/docs/tutorials/free-throw.md#13) (`2cdb086e`) | Pass | Pass | — | — | — |
| [Arrow](https://github.com/microsoft/pxt-arcade/blob/8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02/docs/tutorials/arrow.md#20) (`5d0c02f5`) | Source blocked | — | — | — | — |
| [New pizza party](https://github.com/microsoft/pxt-arcade/blob/8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02/docs/tutorials/new-pizza-party.md#23) (`67958b6a`) | Pass | Pass | — | — | — |
| [Lyla Jr](https://github.com/microsoft/pxt-arcade/blob/8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02/docs/tutorials/lyla-jr.md#4) (`7b258f52`) | Later pass (`de740879`) | Startup + input + restart | — | — | — |
| [Horse](https://github.com/microsoft/pxt-arcade/blob/8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02/docs/tutorials/horse.md#6) (`90a0e61d`) | Source blocked | — | — | — | — |
| [Icecube](https://github.com/microsoft/pxt-arcade/blob/8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02/docs/courses/csintro/blocks/unit-2/lab0201-part2.md#1) (`a03d93d1`) | Pass | Pass | — | — | — |
| [Hundred](https://github.com/microsoft/pxt-arcade/blob/8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02/docs/tutorials/hundred.md#16) (`b1c05d93`) | Pass | Pass | — | — | — |
| [Difficulty prompt](https://github.com/microsoft/pxt-arcade/blob/8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02/docs/courses/csintro/blocks/unit-2/lab0206-part4.md#2) (`c0609881`) | Pass | Pass | — | — | — |
| [Birthday](https://github.com/microsoft/pxt-arcade/blob/8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02/docs/tutorials/birthday.md#18) (`c2576ea3`) | Source blocked | — | — | — | — |
| [Winter](https://github.com/microsoft/pxt-arcade/blob/8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02/docs/tutorials/winter.md#4) (`ddc8f1ca`) | Pass | Pass | — | — | — |
| [Pizza party](https://github.com/microsoft/pxt-arcade/blob/8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02/docs/tutorials/pizza-party.md#26) (`e4b668bd`) | Pass | Pass | — | — | — |
| [Crystal ball](https://github.com/microsoft/pxt-arcade/blob/8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02/docs/courses/csintro/blocks/unit-2/lab0205-part3.md#1) (`e7ab5324`) | Pass | Pass | — | — | — |
| [Flamethrower controller](https://github.com/microsoft/pxt-arcade/blob/8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02/docs/courses/csintro/blocks/unit-2/lab0201-part3.md#2) (`f1f82cba`) | Pass | Pass | Startup + Right | Startup + Right | — |
| [Flame handler with null receiver](https://github.com/microsoft/pxt-arcade/blob/8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02/docs/courses/csintro/blocks/unit-2/lab0201-part1.md#4) (`f583b791`) | Pass | Hold: null read | — | — | — |
| [Froggy](https://github.com/microsoft/pxt-arcade/blob/8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02/docs/tutorials/froggy.md#11) (`f65a6b2d`) | Pass | Pass | — | — | — |

Twelve contexts now have these bounded native route controls; one additionally
has its exact selected-original source/current-export startup and controller
comparison. No complete-project or raw-census promotion follows.

## Lyla condition-wait correction — 2026-10-15

Development candidate `7d566097d`, canonical compiler `8b620dd` and the unchanged
complete thirteen-file project pass all five bounded native routes. The source
wait implementation is also privately composed at `bb483b29c`, with identical
VM bytes. Its earlier first-source bootstrap timed out before any input or
completed route; that failure remains evidence.

The new observation completes in 20.604 seconds and retains 45 full active and
saved-scene inventories. Real A input dismisses the authored dialog; Right moves
the actual Player from x=40 to x=48 with vx=100, and release restores vx=0.
Stop/greenFlag restores the dialog and player connection on each route. The
resumed scene contains Text, Player and Projectile actors on every route,
including current export/reimport; background and per-kind image hashes agree.
Naturally random projectile trajectories are not equated.

The unused `holdText(thisText: string)` body and parameter declaration remain
present and unused. No caller or collision is invented. Actual runtime and
helper error arrays and all provided import/Creator channels are empty; listener
and headless-rendering warnings remain recorded. No pickup occurred in these
windows, so the score getter path and a nonzero score reset remain unqualified.
The observation did not read the music host's actual log or running state;
song completion and audible playback are also unqualified. Original-runtime,
visible-editor and full-game gates remain open.

## Observed failures which remain evidence

- Alien and Hundred initially exported an extra invisible Player from unused
  animation frame targets. The proper producer fix consumes an animation
  resource factory atomically. New exports preserve complete actor inventories;
  the earlier erroneous saved exports remain held and are not heuristically
  repaired. Legitimate authored hidden actors remain actors.
- Winter includes tutorial initialization in its complete project: three actors,
  a native splash and a countdown precede the root interval registration. Two
  observers incorrectly assumed root-only execution. The corrected check uses
  actual A input to resume that scene and retains all actors. The selected
  interval implementation initializes its timer to zero.
- The difficulty project observes the real QUESTION queue and one ANSWER per
  route, then actual Right press/release. This checks the native prompt protocol;
  it does not establish its visible widget or controller-pane journey.
- Both pizza projects retain their complete helper dependencies, four character
  images, background and music. Actual A input closes the splash and the song
  waits four seconds on each of the five routes. One helper unconditionally
  creates a Player; the other checks player connection before the splash and
  creates none in the observed native startup. Its selected-original startup
  still needs comparison; do not manufacture a player to match expectations.
- The first pizza observer looked up a service through a global registry after
  creating another VM. Per-VM registration names collided there; actual guest
  primitives retained their local service object. That observer failure is
  preserved. Sequential VM ownership keeps the original ownership assertions
  and all actors, inputs and music checks, without rebinding the dispatcher.
- The null-receiver flame handler compiles, but its A callback reads a Sprite
  variable which the original source leaves null. All five native routes silently
  continue: two property reads, projectile creation, velocity writes and
  AutoDestroy occur without an error. This is held, not a native pass. The first
  observer incorrectly expected event 1; actual Pressed is 2049. That failure
  happened before input and remains preserved. Observe the exact original fault
  and termination boundary before correcting compatibility; never repair the input.

## Next dependency order

1. Finish hosted supplier qualification and actual consumer adoption of the
   reviewed pre-mutation guards. The private composition passes its bounded
   controls; typed Array formals and default enrollment remain closed.
2. Compare the pizza projects with exact selected-original startup and music
   behavior, including the conditional connection query. Their ten native
   route controls do not establish original-runtime parity.
3. Compare additional exact current exports with retained originals. Bind actual
   emitted observation slots rather than matching variable names or reusing old
   numeric slots. Reuse successful original observations without replaying them.
4. Close the three Carnival source blockers using genuine producers, parameter
   contracts and all-writer proofs. Lyla now has pure and bounded native passes;
   qualify its actual pickup path and original/visible-authoring gates next.
5. Qualify reachable Code/Blocks/graphics authoring and controller/widget input,
   save/reopen and exported gameplay. Respect current pin/writer ownership and
   finish already queued hosted checks before replacing their heads.

Raw 184 remains **147 translated / 36 partial / one parse failure**. Fewer than
twenty partial cases requires at least seventeen genuine case closures from
that backlog; component controls and successful compilation are not closures.
