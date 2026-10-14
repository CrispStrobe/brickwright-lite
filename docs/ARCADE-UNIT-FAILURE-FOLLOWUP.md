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

## Current exact-source qualification failures

Three further focused controls now pass after correcting stale expectations.
The optional-argument control checks the explicit `CALL:` syntax and still
executes the procedure with an omitted argument, producing exactly three
`Hello` lines. Multiplayer negative controls now reject an unknown controller
event rather than the implemented `Connected` event; malformed movement arity
and unsupported player members remain refused. Existing connection controls
exercise the supported event's transport, replacement and scene behavior.
These expectation corrections do not establish a new complete-shard result.

At `12d8bc43327309003a9de9c69c06a7c60cac2cea`, the
[completed first unit shard](https://github.com/CrispStrobe/brickwright-lite/actions/runs/38618756907/job/116045316170)
reports 4,610 tests: 4,548 pass, 46 fail, 14 skip and two TODO. The
[second shard](https://github.com/CrispStrobe/brickwright-lite/actions/runs/38618756907/job/116045316011)
was cancelled, with 29 visible top-level failures and no completed fast-shard
census. Its earlier 13-control preflight summary is not the shard result.
These counts remain separate from the corpus's 36 partial inputs.

The [light browser check](https://github.com/CrispStrobe/brickwright-lite/actions/runs/38618756907/job/116050270743)
now saves the edited assigned-image project and downloads its MakeCode export.
Its retained failure report shows the next project replacement temporarily has
no targets. The harness dereferenced the absent stage in that interval. Its wait
now requires a present replacement stage with a different ID; the conversion,
pixel, save and reimport assertions remain intact. Hosted qualification is pending.

The [heavy browser check](https://github.com/CrispStrobe/brickwright-lite/actions/runs/38618756907/job/116050270760)
failed its unchanged startup budget: 4,484,181 initial JavaScript bytes against
4,467,136. The official chunk graph shows Circuit Playground's synchronous
builtin manager entry contributes its 44,933 raw source bytes to the startup
chunk. This does not establish an exact minified attribution. Circuit Playground
now uses the existing asynchronous builtin loader; its pane already awaits
registration. The boot-payload gate requires its actual extension marker in a
lazy chunk and rejects that marker in startup scripts. Seven focused controls pass, including actual VM concurrent-load deduplication,
registration readiness, primitive execution and project builtin precedence.
Fresh hosted byte measurement remains required.

The [build job](https://github.com/CrispStrobe/brickwright-lite/actions/runs/38618756907/job/116045316099)
failed the source-manifest gate because the generated stage-header message
catalogue lacked the Circuit Playground entry. Standard Babel extraction now
regenerates that entry. The manifest gate and bundle budget are unchanged.
The official numeric browser job skipped after this build failure; it provides
no qualification for this source.

## Latest completed integration run

At `6992416ec1224e567abc6b964753c28784d8323a`, the
[completed second unit shard](https://github.com/CrispStrobe/brickwright-lite/actions/runs/38600508784/job/115994916126)
reports 3,570 tests: 3,526 pass, 37 fail, five skip and two TODO.
The first shard was cancelled and has no complete census. These counts are
separate from the immutable corpus's 36 partial inputs.

The same source passed the official numeric browser gate and the heavy browser
shard. The light shard failed at the assigned-image export download after an
SB3 reload. The uploaded artifact retains the saved project but contains no
failure report: an unhandled pending download rejection ended the process.
The harness now reopens the real Code actions menu after reload and handles
both the click and download promises immediately. All asset, pixel, export and
reload assertions remain. A new hosted result is required to close this failure.

The next combined source includes qualified supplier pins, physical Sprite
updates, independent Array references, the closed callable prototype and the
bounded named array helper core. It passes 24 focused transport, admission and
named-helper controls using an immutable native source projection. The later nested named-array follow-up corrects the original second-export
receiver failure using a graph-bound Array receiver view. Both byte-identical
original exports and native portable routes pass focused checks; their original
failures remain retained. Class callbacks and default callable admission remain
separate work.

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

Three named-handle controls additionally pass after checking the qualified
kind reporters, actual numeric kind values, and the real game-over operation.
At countdown expiration the original terminal service reports `over`, owns a
new scene, and retains its parent with countdown zero and inactive. The test
observes that service from its own real VM; it no longer reads the unrelated
legacy instant-stop `gameOver` flag. This corrects the observer and does not
patch terminal execution or claim a new full-shard result.

## Selected PXT expression-order controls

Three historical lazy-value failures now have direct selected-original source
comparisons. Each original keeps the exact test fixture prefix and appends only
a final read of `rows[0][0]` into a scalar observation; actual compilation inputs
and executables are retained privately. All nine SDK/bridge hashes are unchanged.

| Source case | Measured original and native behavior |
| --- | --- |
| Nested lazy operands | Trace `214356978`, sum `3`, pair `7`, receiver/index calls `1/1`, final row `9` |
| Lazy compound Array assignment | Receiver/index calls `1/2`, final row `107` |
| Ordinary compound Array assignment | Receiver/index calls `1/2`, trace `1223`, result/other rows `12/30` |

The earlier tests expected ordinary JavaScript sequencing, including one index
read. The corrected expectations retain the measured PXT behavior. Three focused
controls also pass native execution, Code reconstruction, saved-project reload,
export construction and reimport. That check does not invoke the original
compiler or execute newly exported originals; their hosted gate remains required.
No staging/runtime implementation is patched from the old JavaScript expectations.
The unchanged historical failure titles below preserve the original record.

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


## Further focused terrain and artwork qualification

Terrain import controls now use the qualified SpriteKind reporter while retaining
exact handler tokens, source parameter shadowing and captured local bindings.
The staged Array construction has distinct captured temporaries in each source
procedure; the tests retain those distinct bindings. All nine controls pass,
including a primitive numeric kind whose actual native handler registration
survives Code and export/reimport. Named callbacks and malformed callback
signatures remain explicit gaps.

The artwork alias case now checks source-preserving uninitialized `Image`
declarations. Its one actual exported MakeCode execution observes tile values
4 and 2 and edited tile-art pixel 3. That run also exposed a genuine final
negative-case failure: a stale saved resource tag overrode an externally edited
standard SB3 variable. Export now preserves that edited value and names the
resource-tag mismatch. Four authority controls pass, including edited zero, null and Boolean values
with typed Image writers; the complete native
artwork/editor/save test passes against byte-identical retained original input
and observations, without another original execution. These are focused results,
not a new full-shard count or a corpus promotion.

## Subsequent composed checks

The [focused check at composed source](https://github.com/CrispStrobe/brickwright-lite/actions/runs/38630804698/job/116083332275)
`28bb7c07051d8f8990ba96de11ab18859f5c44d0` reports 496 controls:
495 pass and one fails. The failure is the tracked extension-manager mirror
being stale relative to the lazy-loader source. The mirror is now refreshed
from that owned source, together with the newly adopted canonical compiler
mirrors. The unchanged HEAD-blob identity gate passes locally. Other current
hosted diagnostics still need their exact-source results.

The named Array procedure-result export gap now has a narrow current-graph
proof: uniquely bound target-owned zero-argument procedures must have complete
scalar return producers. Unknown, native-reference, mixed, parameter-dependent,
recursive, missing and duplicate bindings stay refused. Nine affected pure
controls and the original named-operation native/export/reimport control pass.
One actual changed export preserves all five original values, including five
argument evaluations and the distinct NaN includes/indexOf results. All nine
SDK/bridge guards remain unchanged; this grants no general callable or Any
result admission. The original export and reimport refusals remain retained.
