# Repeated Array publication and frame-delta native addition

Status: first source candidate on the Arcade integration branch. Claim and
change travel together in the integration PR; not runtime-qualified.
Owner: Arcade integration, continuing its conditional Array entry lane.
This does not take another runtime, supplier or editor lane.

## Owned scope

- `project-conditional-array-entry.js`: a second private issuer,
  `createProjectArrayPublicationFrontier`.
- `array-reference-export-authority.js`: consume that issuer as a separate
  fallback in `available()`, and let the existing dead local-reset proof cross
  closed SDK waits/splash/sound statements, zero-argument ordinary calls and
  closed global writes that never name the reset local.
- `source-value-producers.js`, `ordinary-frame-delta-number-source.js` and
  `native-array-binary-domain.js`: the frame-delta Number census and its use.
- `export-arcade.js`: the frame-delta owned-snapshot bridge for the direct API.
- New tests `test/project-array-publication-frontier.test.mjs` and
  `test/arcade-frame-delta-array-reads.test.mjs`, their census rows, one
  documented expectation change in `test/project-conditional-array-entry.test.mjs`,
  this claim and the Arcade handoff text.

Runtime, SDK, pins, workflows, budgets and thresholds stay unchanged.

## Publication frontier

When every inventoried writer of a global receiver publishes a frame-local
Array allocated earlier in its own straight chain (no intervening write of
that local), the receiver binds an initialized Array from the first such
write until the run ends. Stop ends the run; game over pops every scene and
its paint renderables, then calls stopAll and greenFlag. Before the first
write only the startup thread runs: every top-level block is an inventoried
root, no other hat exists, and the closed concrete prefix registers nothing.
Its splash, wait and sound statements therefore cannot run user code, and
their argument subtrees must be closed and must not read the receiver. Any
later occurrence in any scope or callback executes after the first write. The
proof issues that actual writer; the authority's producer, compatible-writer
and initialization checks remain authoritative. It proves no element
presence, length, value or completion.

One existing expectation changed deliberately: a fresh alternate paint
publisher was refused under the startup-only certificate and is now admitted
by this separate proof. A non-fresh alternate publisher (an alias of another
global) is added and stays refused. The original refusal remains in the
retained run record.

## Frame-delta native addition

`game.eventContext().deltaTime` reads are Numbers when the existing closed
frame census admits the program. The census now also admits index reads
and `push`/`unshift`/`pop`/`indexOf` calls whose receiver the value graph types
as only Array, undefined or null. Index reads also need an initialized
Number index and must not be write targets; `indexOf` needs primitive
arguments. Write targets keep the
existing allocation/all-writer proof. The native-addition domain consults
that read fact for operand initialization, with its own currentness. The
direct API uses a descriptor-checked owned snapshot, as the math proof does,
which also restores direct/JSON parity for frame-delta declarations. That
parity was broken on the previous source too, but hidden because both
routes refused the export.

## Controls

Nine publication-frontier groups and four frame-delta groups, plus the
existing conditional-entry, Number and math cohorts and reset neighbours.
Guard cuts detected: closed prefix grammar, effect-argument purity, hoisted
reset crossing reads, index write targets, indexOf primitive arguments,
domain frame-delta use and the direct bridge. Not independently detectable:
writer census, fresh allocation, local reassignment and receiver read before
publication. The authority's all-writer initialization check and the prefix
grammar refuse those cases too. The receiver-domain read check is also not
independently detectable, because the importer refuses non-Array index reads.

## Result and remaining

The retained authentic snake now has no source export refusal; its two math
queries still pass. This is a source export result only, not SDK, native,
browser, editor or game completion. Hosted SDK/native/browser qualification,
connected editor acceptance and corpus completion remain open.

## Addendum: askForNumber operands

`ordinary-primitive-sdk-number-source.js` also recognizes `game.askForNumber`
with one to three arguments as a Number on normal return (PXT parses the
entered text; NaN is still a Number), only while `game` is the SDK namespace
and is never written or used as a value. The raw-corpus export census moves
three calculator inputs that were refused only for native addition to clean
source exports. New test `test/arcade-ask-number-addition.test.mjs`: two
representative programs through both routes and reimport, and two rebinding
negatives. The candidate cut is detected; the game-safety cut is backed by the
importer, which already refuses both rebinding forms. No input, timing or
keyboard behaviour is claimed.

## Current hosted control reconciliation

The first integration run's unit shard 4 retains an old negative expectation
for canonical `game.eventContext().deltaTime` native addition. That expectation
predates the Number contract above. The continuation adds it to the positive
producer table and adds native-addition negatives for a shadowed/replaced SDK,
a written delta and escaped game/context values. Editing the actual member
invalidates the held proof; restoring its text cannot revive that proof.
No implementation guard, original failure or unsupported case is removed.
The updated source control awaits hosted qualification; no suite ran on the
shared server.

The same hosted integration exposes a startup-Number native result mismatch:
original SDK passes, Lite reports 0 where 14 is required. Its unchanged value
and reopen assertions remain; diagnostics now report runtime/Creator errors
first and identify the failing generation. This is an open runtime/connected
producer task, not a qualified representative or a source-export regression
that may be waived.
