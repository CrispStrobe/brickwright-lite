# Arcade unit failures: exact-source follow-up

This is a triage list from reviewed integration source
`2c2141954cbc3063274a18650d9e248f63bfdf92`,
[completed unit shard](https://github.com/CrispStrobe/brickwright-lite/actions/runs/38586245394/job/115928912237).
The shard has 3,550 tests: 3,503 pass, 40 fail, five skip and two TODO.
Its failures are a different denominator from the unchanged 184-input corpus.
Later source-type and exported Array receiver fixes require new exact-source
qualification; this historical list does not claim every case still fails.
The other shard has no completed census.

Five controls from `makecode-arcade.test.mjs` now pass in focused checks after
correcting expectations for the qualified source-kind reporter, numeric kinds
read from the hash-bound original SDK initializer, the actual source startup
HAT, and the current random/temporary vocabulary. The timed-spawn frame count
is unchanged. The geometry control also executes its exact original fixture
and checks decoded dimensions and the resulting score change. These are test
expectation corrections, with no runtime patch, complete-game promotion or
new full-shard result. The historical forty-entry list below remains intact.

Four further historical controls pass in focused checks: destroyed/overlap
imports use the qualified kind reporters; named scene procedures and primitive
numeric kind registrations are valid and execute in the real native VM; the
pinned side projectile receives the original numeric default kind; and timed
speech expires after awaited VM frames while its caller has already continued.
The complete scene-import file passes 16 controls. Original first failures
are retained. These corrections preserve runtime assertions and do not close
the yielding-wall scheduling entry or establish a new full-shard result.

## Later completed shard and pending qualification

The [later completed unit shard](https://github.com/CrispStrobe/brickwright-lite/actions/runs/38595437543/job/115960919223)
at `9879c62f023755d88168cdaa17acf441c3a4c422` reports 3,570 tests:
3,522 pass, 41 fail, five skip and two TODO. It retains the forty historical
failures below and additionally fails
[`makecode-arcade-terrain-event-runtime.test.mjs`](../test/makecode-arcade-terrain-event-runtime.test.mjs):
“a yielding wall callback holds its explicit movement caller until completion”.
The observed callback order is `AABC`, compared with `ABC` in that original
execution. This entry remains open; a focused native observation reaching
`ABC` does not establish equivalent scheduling or close the hosted failure.
The other shard remains without a completed census.

The same exact yielding-wall source has since been compiled and executed once
in the unchanged pinned original simulator. Ordinary native manual and timed
cadences both match its `ABC` order, caller completion and final velocity `-40`.
The affected test now uses ordinary timed cadence for its real 30 ms wait,
instead of compressing 160 manually supplied physical frames into that wait.
All three original comparisons remain unchanged, and all nine SDK/bridge
byte guards remain unchanged. This is a test-cadence correction; it does not
claim a runtime scheduler patch or a new full-shard result. The original
hosted `AABC` failure remains preserved for comparison.

New physical Sprite lifecycle and independent Array-reference support have
focused native and selected-original evidence, recorded in the
[handoff](ARCADE-AGENT-HANDOFF.md). Their combined hosted unit and browser
qualification is pending. These changes do not revise the immutable corpus's
36 partial inputs or turn focused controls into a full-shard result.

## Method for closing each entry

1. Read the named test and identify which route first fails: original source,
   native runtime, Code reconstruction, saved-project reload, original export
   execution, reimport, or visible GUI.
2. Preserve the original failure. Reproduce only the affected route against the
   exact current source and independently qualified supplier pins.
3. Compare actual selected-original inputs and observations before deciding
   whether the implementation or an old expectation needs correction. A source
   shape change alone is not runtime evidence; source evaluation order and
   runtime frame order must come from the actual selected SDK.
4. Implement the missing behavior, then check the affected portable routes and
   meaningful negative cases. Preserve ownership, identity, cancellation and
   source declaration checks.
5. Record exact source, observations and remaining GUI requirements. Close the
   entry only after its affected gate passes. Keep corpus counts separate.

The i8086 fixture below belongs to its separate CPU lane. Coordinate with its
owner rather than taking unrelated simulator files.

## Recorded failures

| Test file | Actual failed control |
| --- | --- |
| [i8086-wait-reach.test.mjs](../test/i8086-wait-reach.test.mjs) | commented-zero mutation cannot put either timer program back into honest reach |
| [makecode-arcade-info-registration.test.mjs](../test/makecode-arcade-info-registration.test.mjs) | life zero and countdown end due in one frame: the life events come first, as in the original HUD pass |
| [makecode-arcade-lazy-values.test.mjs](../test/makecode-arcade-lazy-values.test.mjs) | nested logical arguments and array elements retain left-to-right evaluation order |
| [makecode-arcade-lazy-values.test.mjs](../test/makecode-arcade-lazy-values.test.mjs) | compound array assignment snapshots its reference, index and old value before a lazy right operand |
| [makecode-arcade-lazy-values.test.mjs](../test/makecode-arcade-lazy-values.test.mjs) | ordinary compound assignments evaluate array receivers and indexes once before mutating calls |
| [makecode-arcade-legacy-layout-editor.test.mjs](../test/makecode-arcade-legacy-layout-editor.test.mjs) | single-assignment image aliases edit source artwork and preserve live pixel mutations |
| [makecode-arcade-local-projectiles.test.mjs](../test/makecode-arcade-local-projectiles.test.mjs) | a function creates dynamic projectiles with per-call handles and destruction callbacks |
| [makecode-arcade-managed-function-yields.test.mjs](../test/makecode-arcade-managed-function-yields.test.mjs) | explicit function waits survive export while stop and restart cancel pending calls |
| [makecode-arcade-multi-physics.test.mjs](../test/makecode-arcade-multi-physics.test.mjs) | a fast crossing delivers one event, stops its mover and preserves callback geometry across all paths |
| [makecode-arcade-named-handles.test.mjs](../test/makecode-arcade-named-handles.test.mjs) | a pinned fire game keeps named handles and both event parameters |
| [makecode-arcade-named-handles.test.mjs](../test/makecode-arcade-named-handles.test.mjs) | stay in screen clamps a handle and stopping countdown prevents game over |
| [makecode-arcade-named-handles.test.mjs](../test/makecode-arcade-named-handles.test.mjs) | an active countdown ends the game after its VM frames |
| [makecode-arcade-physics-engine.test.mjs](../test/makecode-arcade-physics-engine.test.mjs) | engine replacement preserves membership, clamps existing engine movers, and restores suspended membership across all paths |
| [makecode-arcade-pixel-drawing.test.mjs](../test/makecode-arcade-pixel-drawing.test.mjs) | sprite pixel reporters and drawing commands execute through Code, SB3, PXT export and reimport |
| [makecode-arcade-projectiles.test.mjs](../test/makecode-arcade-projectiles.test.mjs) | a pinned PXT side projectile retains image, incoming edge, velocity and handle |
| [makecode-arcade-say-text.test.mjs](../test/makecode-arcade-say-text.test.mjs) | timed sayText uses a nonblocking Arcade speech command |
| [makecode-arcade-say-text.test.mjs](../test/makecode-arcade-say-text.test.mjs) | the pinned hat overlap game speaks from the colliding handle while its script host stays hidden |
| [makecode-arcade-scene-runtime.test.mjs](../test/makecode-arcade-scene-runtime.test.mjs) | native button registrations use app keyboard bindings and pane signals do not cross-fire A/B |
| [makecode-arcade-scenes-import.test.mjs](../test/makecode-arcade-scenes-import.test.mjs) | destroyed and overlap callbacks preserve typed mutable sprite arguments |
| [makecode-arcade-scenes-import.test.mjs](../test/makecode-arcade-scenes-import.test.mjs) | unsupported scene object access, handler identity operations and malformed events retain gaps |
| [makecode-arcade-screen-paint.test.mjs](../test/makecode-arcade-screen-paint.test.mjs) | screen reads return the last composed frame, as in the original |
| [makecode-arcade-settings-browser-storage.test.mjs](../test/makecode-arcade-settings-browser-storage.test.mjs) | real Chromium device settings survive page and browser-process reload with stable saved-project identity |
| [makecode-arcade-sprite-collections.test.mjs](../test/makecode-arcade-sprite-collections.test.mjs) | unsupported dynamic sprite-kind queries remain named diagnostics |
| [makecode-arcade-sprite-collections.test.mjs](../test/makecode-arcade-sprite-collections.test.mjs) | destroyAllSpritesOfKind removes a snapshot, preserving callbacks, other kinds and retained handles across roundtrips |
| [makecode-arcade-sprite-collections.test.mjs](../test/makecode-arcade-sprite-collections.test.mjs) | destroyAllSpritesOfKind rejects dynamic kinds, effects and duration explicitly |
| [makecode-arcade-sprite-registration.test.mjs](../test/makecode-arcade-sprite-registration.test.mjs) | sprite overlap/destruction retain live captures, event identity and yielding order through roundtrips |
| [makecode-arcade-terrain-events-import.test.mjs](../test/makecode-arcade-terrain-events-import.test.mjs) | wall and tile registrations create separate token hats with typed mutable callback cells |
| [makecode-arcade-terrain-events-import.test.mjs](../test/makecode-arcade-terrain-events-import.test.mjs) | procedure registrations capture real local cells and source parameters remain shadowed |
| [makecode-arcade-terrain-events-import.test.mjs](../test/makecode-arcade-terrain-events-import.test.mjs) | reserved callback names, reassignment and nested registrations use current local cells |
| [makecode-arcade-terrain-events-import.test.mjs](../test/makecode-arcade-terrain-events-import.test.mjs) | unsupported dynamic kind, named callback and malformed callback forms remain explicit |
| [makecode-arcade-terrain-events-import.test.mjs](../test/makecode-arcade-terrain-events-import.test.mjs) | creation registrations retain their existing token and event reporter semantics |
| [makecode-arcade-terrain-events-import.test.mjs](../test/makecode-arcade-terrain-events-import.test.mjs) | nested inherited TileLocation arrays and unrelated numeric arrays keep separate capture bindings |
| [makecode-arcade-text-source-admission.test.mjs](../test/makecode-arcade-text-source-admission.test.mjs) | exact TextSprite admission retains the genuine kind initializer and immutable source identity |
| [makecode-arcade-update-values.test.mjs](../test/makecode-arcade-update-values.test.mjs) | complex update index effects retain JS semantics; pinned PXT duplication stays named |
| [makecode-arcade.test.mjs](../test/makecode-arcade.test.mjs) | a real Arcade game becomes sprites, costumes and scripts |
| [makecode-arcade.test.mjs](../test/makecode-arcade.test.mjs) | timed spawns preserve their own positions, artwork and native velocities |
| [makecode-arcade.test.mjs](../test/makecode-arcade.test.mjs) | the translation compiles into the sprites and blocks it names |
| [makecode-arcade.test.mjs](../test/makecode-arcade.test.mjs) | sprite dimensions and edges use the decoded image geometry |
| [makecode-arcade.test.mjs](../test/makecode-arcade.test.mjs) | one native callback moves a neighbour and changes another sprite velocity |
| [makecode-ts-instanceof.test.mjs](../test/makecode-ts-instanceof.test.mjs) | instanceof preserves call operands and reports unimplemented class identity |

Next shared mechanisms are callable capture/dispatch and actual-body export,
physical Sprite subclass update/lifecycle ownership, and general Arcade Array
reference identity independent of artwork routing. The GUI acceptance list
remains in [the capability ledger](CONVERSION-CAPABILITIES-AND-GUI-GAPS.md).
