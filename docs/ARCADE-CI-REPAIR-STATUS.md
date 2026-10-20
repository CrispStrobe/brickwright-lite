# Arcade integration repairs and qualification order

## Current batch and acceptance boundary — 2026-10-20

The saved failures on [#1128](https://github.com/CrispStrobe/brickwright-lite/pull/1128)
and [#1132](https://github.com/CrispStrobe/brickwright-lite/pull/1132) are caused by
this development stack. Later repairs on main are composed explicitly below;
a historical green run does not qualify its latest head. The current batch
composes the follow-up from #1132 into #1128 for one hosted qualification
campaign. #1132 is merged into the parent branch by ancestry;
its work is not yet on main. Do not push its stale head or add another
`ci:full` request.
Keep runtime ownership guards and original compiler comparisons intact.

| Failure family | Repair and current evidence | Remaining acceptance |
| --- | --- | --- |
| Fetch census | Remove the obsolete workflow fetch row and constant; census follows the shipped source-admission script. | Complete final-composition guard passes all 13 tests, zero skips; hosted checks remain. |
| Inert Sprite fixtures | Pure extension fixtures use the existing empty-target runtime helper; guest fixtures use real VM runtimes and cleanup. | All six complete modules, 41 tests, including original PXT, webpack and browser dependencies. |
| Inert or off-thread Array fixtures | Execute through actual registered blocks, cached inputs and VM threads. Whole reference/table modules pass all 16 tests, zero skips. Strict stale-access errors and unchanged backing contents are checked. | Three other complete modules, 15 tests, retaining original compiler disagreements and TODOs. |
| Old Arrays carrier | Value and string tests decode the strict registered carrier. Callable controls bind its exact supplier and independent reviewed host/supplier factories; both complete callable modules pass all six tests. Exponentiation uses the same strict reader without changing any of its four test bodies. | Whole exponentiation and affected original-compiler/runtime modules on the current normal installation. |
| Temporary directory | Unit workflow exports the runner-owned temporary directory; fixtures still require an explicit owned directory. | Final hosted unit step. |
| GUI dependency scope | Add the actual procedure-model consumers to the allow-list. The current first shard also identifies the new public named-Array roundtrip as an additional real consumer; it is added explicitly. Both complete affected modules pass all 13 tests, including the tile artwork roundtrip; the recorded strict scope check passes. | Final hosted checks; no blanket allowance. |
| Importer source contracts | Preserve the normal lazy gateway and its intentional bare share-receiver fallback. Whole UI contract module passes all 12 tests. The prompt mutation matches the current call formatting. | Complete native-prompt module on the normal generated GUI checkout; a local incomplete-checkout run is not a pass. Prompt/confirm audits also decode registered Arrays bodies and add explicit detection controls; their whole modules need hosted qualification. |
| Notices and vendor fixture | Use the canonical renderer, reject the old carrier, and include the actual vendor helper dependency. Both complete modules pass all 13 tests. | Final hosted checks; licence and pin assertions remain unchanged. |
| Event/state gate | The complete gate-shape module passes all 11 controls at the composed candidate, without changing its scanner or zero baselines. | Final hosted checks. |
| Foreign iterator/currentness | The retained primary-proof repair separates closed-profile refusal from genuine Array currentness and preserves ABA expiry. Its complete 93-control regression group passed at its tested source boundary. | Final composed hosted execution; never substitute a closed-profile rejection for the real primitive proof. |

The Arrays supplier [#57](https://github.com/CrispStrobe/extensions/pull/57) is
merged after every enabled check passed at its reviewed head. Lite deliberately
retains its explicit reviewed supplier pin; do not silently replace it with the
merge commit. The normal installation, native 64 + 17 controls and two public
roundtrips described in the handoff retain their original source boundaries.

**No corpus entries are promoted by these fixture results.** Historical counts
remain 147 translated / 36 partial / one malformed. A complete current corpus
report, original SDK comparisons, visible Blocks/Code/artwork authoring and
complete playable-game checks remain required. Preserve each original failed
run and do not re-download or replay successful originals for inspection.

## Final-campaign integration finding — 2026-10-20

The exact-head hosted x86 controls reported one additional composition failure:
the app's seven canonical Circuit UI declarations already select the newer B27
revision, while the GUI audit controller and reader still require the previous
revision. Main has since landed [#1136](https://github.com/CrispStrobe/brickwright-lite/pull/1136),
which makes both consumer declarations explicitly follow the existing app
selection. The integration branch includes that normal merge and the separate
CAD pointer repair from [#1131](https://github.com/CrispStrobe/brickwright-lite/pull/1131). Dependency pins, drift assertions, workflow activation guards and
limits are unchanged. Historical originals keep their historical readers; a
new actual observation needs a fresh complete source/request/event/artifact
envelope and the existing affected qualification.

The intended canonical-selection test passes locally after this repair. The
complete 67-control local attempt is **not qualified**: an unchanged manufactured
reader control reached the diagnostic CPU limit. Its original failure is
retained, with no assertion or limit change. The complete hosted module remains
required at the repaired final head. This source-selection repair establishes
no new browser or guest result.

## Additional failures from the current campaign — 2026-10-20

The completed third unit shard has one ordinary failure: the named Array item
fixture calls an ownership-protected native reporter outside its VM operation.
The candidate routes its three calls through the existing actual registered-block/
thread helper, preserving the original aggregate, JSON and alias assertions and
lifecycle guards. Complete affected-module hosted execution remains required.
Declared TODO outcomes remain separate from this ordinary failure. The first
shard additionally reports two genuine original-PXT disagreements in Array
coercion: native concatenation produces `52`/`5`, where the original compiled
runtime produces `[object Object]2`/`[object Object]`. Preserve those original
comparisons. The native Array authoring checks require their own existing
JavaScript semantics; a correct repair must model the source language explicitly,
rather than changing their expected values or all Array coercion globally.

The heavy browser job reports three separate problems that need diagnosis:

- Initial JavaScript exceeds the existing budget by 28,424 bytes. Attribute the
  increase before choosing a change; preserve the budget. Saved ownership
  identifies growth in eagerly required VM authority code. Late intrinsic
  capture would change its guarantees. Optional GIF/CSV loading needs a
  separate scoped review of picker timing, parser callbacks and failure cleanup;
  source bytes are not emitted savings.
- The Carnival import readiness check times out before recording its document.
  The candidate waits for the actual named import document, then retains it
  before the unchanged native-command assertion. The saved failure screenshot
  shows a complete library translation; native Carnival support stays open.
- The animation controller journey observes only the initial colour. Diagnose
  actual block errors, frame resources and controller delivery; preserve both
  required frame colours, Stop behavior and renderer assertions.

The completed light browser shard also fails five live editing journeys:

| Journey | Observed failure | Next acceptance |
| --- | --- | --- |
| Rotation and assigned artwork | `verify-arcade-rotation-browser.mjs` times out waiting for edited assigned pixels. | Retain actual assigned-image/project observations; verify edited costume pixels reach the running game and survive both file formats. |
| Tilemap painter | Saved levels fail runtime checks; adding a level reports a missing startup block. | Diagnose the actual edited block graph and startup chain. Preserve paint, wall/collision, new-level and save/reopen checks. |
| Tile identity | A real rename/pixel edit fails to update both uses of the source ID. | Retain both actual block payloads and editor identity; preserve shared source identity and export names. |
| Legacy layout | The initial painted layout runs; the edited run times out. | Compare edited block payloads and actual runtime errors without changing legacy wall semantics. |
| Sprite placement | Runtime placement is absent and removal leaves the saved placement. | Trace actual Save/write/delete events and the running startup chain; keep unrelated placements and undo/revert behavior. |

The palette candidate defers/coalesces edit observations and fences released
watchers. Direct inspection remains strict; a permanently invalid graph retains
its original error in an explicit unavailable preview. Both complete modules
pass all eight controls. Restoring the old observer makes the four new real
Blocks engine regressions fail. This establishes the mutation/observation
boundary, not the browser result. No writer, execution cache, VM intrinsic guard
or existing browser assertion changes.

Original reports and images are retained. These failures do not yet establish a
shared cause. Source/VM-only artwork tests do not qualify the live GUI journeys.

These are open failures, not accepted baselines. Wait for the other existing
checks to finish, then compose the concrete repairs into one normal push.

## Registered-carrier CI fixture repair — 2026-10-20

All13 tests in the complete notice-drift and targeted-vendoring modules now pass
locally, with zero skips. The Arrays notice fixture uses the current registered
carrier and explicitly rejects the legacy unregistered form. The isolated vendor
fixture copies the carrier helper imported by the actual vendoring script.
Original immutable-fetch, pin-receipt, unrelated-bundle and licence assertions
remain intact. No product code, pins or notice declarations changed. Hosted
qualification and the other recorded CI failure families remain pending.

Updated 2026-10-16. This records the development integration candidate. Its
source is being assembled for the next hosted qualification campaign.

The historical 184-input census remains **147 translated, 36 partial and one
malformed input**. Focused controls below do not change that census or establish
complete game compatibility.

## Array unit fixture repair candidate

The saved hosted failures include behavior tests that construct the registered
Array extension on inert fake runtimes, and roundtrip assertions that call
tracked Array primitives outside a VM operation. The candidate runs these calls
through actual registered blocks, cached inputs and VM threads. Metadata-only
probes and low-level value tests retain their separate scopes. No product
admission rule, supplier pin or runtime fallback changes.

The reference and table assertions retain their value, alias, escaping, mark,
style and renderer-absence checks. Table rows are observed during an actual
named operation and passed to the unchanged pure SVG builder. After restart,
the lifecycle control checks the actual ownership refusal and exact issued
error for stale reference reads, writes and named access, with unchanged old
backing contents.

The complete reference/table modules now pass all 16 tests with zero skips.
The remaining three modules and their original compiler comparisons still
require qualification. Existing compiler disagreements, TODOs and original
hosted failures remain open; these fixture controls establish no corpus result.

## Current areas

| Area | Implemented or observed | Next required evidence |
| --- | --- | --- |
| Discarded map and current exported loops | An unused map result preserves receiver-once evaluation, cached iteration length, current indexed reads and complete callback effects. Actual dense producers supply constrained callback inputs. Current exported loops separately prove allocation, aliases, cached positive bounds, read presence, all-call type union and stable backedge values. Twenty-seven controls pass in segments; the strict fixture completes ten actual stages, including connected input editing from 1 to 2 and both export/reimport pairs. | Complete original compiler/simulator versus normal native comparison, visible Blocks/Code editing and final composed checks. The original 25-pass/two-failure test-oracle result remains retained. No annotation, generated name or generic indexed read supplies private Number authority. |
| Text positioning and fixed music effects | Forty-one Text/shared-frame controls qualify plain edge writes on actual TextSprites. The music successor passes 46 controls, requiring every actual SDK music.play occurrence to be a direct callee with its exact fixed mode. It grants no Playable type or general API permission. | Current authentic-library diagnostic, real playback/error behavior, graphics edits, visible authoring and repeated full project conversion. The earlier method-value escape failure is retained; whole-game support is not established. |
| Animation resources as Arrays | Current validated publication supplies Array export authority; unknown or invalid resources retain their diagnostics. Nineteen focused controls and the complete original five-test suite pass, including real VM/storage, three plain CLI conversions and original Arcade compile/run. | Independent saved-output audit passes, including both archives and every costume/sound role. Visible authoring and final-head hosted qualification remain. |
| Plain CLI library loading | The installed GUI library boundary supplies its canonical VM module through normal package resolution. Eighteen focused controls, the normal VM installer and the original five-test animation/CLI suite pass. | Valid Player2 edited-project export, retained EV3 gaps and final integration checks. |
| Controller event literals | Emission and ordinary Number proof share the actual closed builtin event values. Focused and affected headless native controls pass. | Fresh production browser registration and final integration checks. |
| Original simulator clock | A complete positive profiler-frame bootstrap preserves paused-zero admission and relative timers. Eight platform controls and the exact corrected 0/20/40 program-clock guest through the original helper pass. | Saved-output audit passes with all 337 mapped-file joins; final integration checks remain. Current normal CLI qualification stays separately scoped. |
| Loop arrows | Static registration supplies the current workspace media path to the exact generated arrow field. Eleven focused controls pass with explicitly modeled theme/Blockly fixtures. | Actual default, contrast and restored-theme workspace/flyout rendering under a deployment prefix. |
| Malformed animation import | The exact browser error fixture now retains the dependency translation stage shown by the original failure artifact. Product behavior and all identity assertions stay unchanged. | Fresh production run of the complete browser journey. |
| Per-player score Number proof | All 41 new source controls and four ordinary constraints pass. Actual native controls preserve four independent player scores and reject seven altered cache bindings before ordinary body effects. An affected connected-writer edit, current export and reimport pass in the real VM, with both original helper archives retained. | Visible Code/Blocks editing, fresh save/reopen and final integration checks. |
| Initial bundle budget | Saved production graph identifies the root `react-virtualized` List barrel as a bounded import cut. The implemented import change requests the existing direct named List entry and preserves the complete widget body. | Production resolution, actual widget save/reopen behavior and the unchanged hosted P17 budget; a source import census is not measured bundle savings. |
| Carnival package import | A source-derived two-file editor-control fixture resolves its actual pinned dependencies through the normal resolver and public async importer. All 138 conversion diagnostics are retained. No compile, VM or browser run is claimed. | Source-bound initialization, defaults, primitive/callback/class flow and complete bodies; meaningful native behavior and the visible editor import journey. |
| Managed SDK callbacks | The private physical update entry has eleven passing component controls. The unchanged actual paused-constructor guest reaches `completed = 7`, observes two updates during construction and four total, and preserves values and call counts after Stop. | The explicit Throw source route passes 64 controls. A fresh normal VM passes 18 unwind/publication controls and both unchanged native guests: one Throw error, earlier effects, later updates, detached input and paused-constructor/Stop stability. Public importer opt-in, visible authoring and final-head checks remain; constructor-continuation and nested-step mechanisms retain separate qualification. |
| Shared frame Array transport | Twenty-four source/public artifact controls pass, including exact stateful kind allocation order. A real native guest qualifies repeated Image aliases, clone independence, separate equal-pixel resources, ordinary Array mutations and resource reconstruction after Stop/restart. [Transport contract](ARCADE-SHARED-IMAGE-ARRAY-TRANSPORT.md). | A second native guest executes two stateful kind allocations in order, with successive actual values and unchanged alias/lifecycle checks. Authentic seven-backing library effects, edited artwork, fresh save/reopen and repeated current export/reimport remain separate. |
| Generated helper recognition | Thirty-six focused controls pass. Recognition proves actual lexical bindings, complete bodies, parse profiles, defaults and continuation effects; legacy nested Array helpers rewrite against the same original proof before staging. | Complete affected native and authored-project journeys, source census and final integration checks. |

The six implementation contracts landed through
[joint claim 1007](https://github.com/CrispStrobe/brickwright-lite/pull/1007),
including the original claim commits from 1005 and 1008. All enabled checks
passed at the reviewed claim head; its actual merge parents and tree matched
the review. This authorizes bounded implementation and does not qualify the
subsequent source candidates.

The original component run's foreign-child message mismatch remains recorded;
its corrected fixture passes all eleven controls without changing product
refusal. The later native run passes nine of eleven: one export fixture used
the wrong exported cell name, and one genuine class-Throw source case fails
before the VM. The cell fixture now binds the actual unique Creator and runtime
cell and passes its separate affected real-VM run. The original runtime cleanup failure is also retained: three errors instead of
one and no later update. Its proper generator-unwind/private-publication repair
passes all 18 component controls and both unchanged native guests on a fresh
normal VM installation. All original one-error and later-update assertions pass.

The source/Creator/export campaign passes all 78 controls, including the
unchanged clock controls. The latest combined run on the normal composition
passes all 202 controls: those 78, all 36 helper controls, all 24 shared-frame
controls and all 64 Throw/source controls; none are skipped. A later 245-control
composition is qualified in segments: 215 complete cases before an original
timeout and only the 30 unobserved cases in a passing successor. Exact source,
module and name joins preserve both results; the original combined execution
remains timed out. Independent validation now reports malformed physical
clock reporters even when another malformed caller prevents argument emission.
It grants no Number authority or emission permission.

The small shared-frame backing-array increase is repaired: a declaration with
no initializer no longer counts as an unknown assignment. Unknown compound and
update writers remain refused. The native alias/clone/equal-resource/Array and
Stop/restart guest now passes with its original project archive and all runtime
observations retained. Its earlier test failure incorrectly looked for global
variable writers on the Stage; the corrected fixture joins actual Game writers
to the same Stage cells by IDs and connected source-entry chains. The authentic
seven-backing project, edited artwork and visible authoring remain open. The
[source provenance scope](https://github.com/CrispStrobe/brickwright-lite/pull/1012)
is merged. Its private prepared-source issuer passes nine focused controls,
binding the actual prepared map, exact admitted source and currentness. That
receipt alone authorizes neither Text effects nor any value type or game result.
The subsequent Text consumer passes 37 source/public artifact controls (the
original 24 plus 13): actual existing parser returns, exact admitted source,
private currentness, connected ordinary-Array fallback and Code/SB3/export.
This source-model result does not qualify the authentic seven-backing project
or new SDK/resolver execution.

The [original failing campaign](https://github.com/CrispStrobe/brickwright-lite/actions/runs/38862860015)
remains the regression baseline. Current source composition preserves adopted
SPIKE/editor changes and existing dependency pins. Its final-head checks remain
required before merging.

## Reproducible method

1. Read `LANES.md`, the relevant contract and this status before editing. Refresh
   remote heads and actual check results. Claim shared surfaces before changing
   them and keep other lanes' merged work when composing normally.
2. Retain each original input, its authentic project configuration, dependency
   source, license, ordering, assets and all diagnostic channels. Identify
   tutorial fragments separately from complete projects. Do not infer missing
   source context or package permissions.
3. Freeze the source and concrete execution inputs. Record hashes and distinguish
   source inspection, modeled controls, actual application execution and saved
   data audits. Inspect the actual dependency scope before launching tests.
4. Run the unchanged affected public path. For animations, this includes
   [the complete five-test module](../test/animation-native-library-import.test.mjs),
   its real CLI children, normal VM/storage, saved project, original compiler
   and simulator. Keep raw failures and cleanup results before interpreting them.
5. Audit saved files, complete ZIP members and every costume/sound role. Resource
   identities and content hashes have distinct purposes. Preserve rich resource
   metadata while proving the actual exported behavior; retain each stage's
   unsupported elements and diagnostic provenance.
6. Follow current Code into Blocks, edit the connected program, save/reopen and
   export the actual current graph. Reimport using that export's authentic
   dependency context. Compare values, timing, image pixels and resource aliasing
   at explicit boundaries. Preserve complete bodies and assets through each
   conversion permutation.
7. Exercise the actual GUI through visible controls: imported readable art,
   graphics edits, primitive blocks, controller input, Game Console execution,
   save/reopen and export. Use a fresh frontend built from the reviewed source.
   A headless VM result does not establish this visible authoring path.
8. Run one composed hosted campaign after the identified source causes have
   fixes. Admit every enabled check at the final head and review the landed
   merge tree and parents. Update whole-case counts only from complete-case
   evidence; maintain separate original-input and complete-project cohorts.

## Clock contract correction

`control.millis()` measures program time. `game.runtime()` reads the current
scene's cached frame time. An ordinary pause can resume before the scene update
at that same timestamp. The original diagnostic therefore observed raw clock
0/20/40 while unchanged guest scene reads were 0/0/20. The original failed
assertion and its resource-inspection hold remain preserved.

The new exact elapsed-wait control uses `control.millis()` and retains assertions
0/20/40. Scene-frame ordering requires its own callback-priority proof. This
changes the authored test's API choice; it changes neither original PXT code nor
Brickwright's runtime clocks. See the
[clock contract](ARCADE-REFERENCE-CLOCK-BOOTSTRAP.md).

## Remaining authoring and compatibility work

Track editor work alongside converter/runtime support in
[the capability and GUI ledger](CONVERSION-CAPABILITIES-AND-GUI-GAPS.md) and
[the agent handoff](ARCADE-AGENT-HANDOFF.md). Continue the actual edited-program
checks for shared/fresh frames, rich animation libraries, per-player values,
Carnival initialization, tile/art identity and Code/export/reimport growth.
Keep licensing holds and missing tutorial context explicit when choosing the
next complete projects.

## Saved-output audit boundary

The original five-test application run and its independent output audit pass.
The audit checks both complete project archives, every costume and sound role,
rich used and unused artwork documents, all three real CLI results, and actual
source content before and after inspection. Original internal VM and compiler
channels that were not separately captured remain identified as source-bound
passing assertions; the audit does not invent raw captures of those channels.

Two earlier audit failures remain preserved: repeated source reads exhausted
the first reader's time bound, and a later check incorrectly required random
asset filenames to survive reimport. The final reader checks complete actual
role metadata, references, member coverage and exact asset bytes, with explicit
proof for the three regenerated default asset identities. The application,
CLI children and successful compiler were not rerun to inspect these outputs.
This remains a bounded animation roundtrip result, with GUI and whole-project
qualification tracked separately.

## Further component qualification

- Image entry analysis: the complete 60-test source suite passes without skips. Opaque root procedure metadata is observed by identity; consumed metadata and serializer data retain explicit schemas and currentness.
- Authentic import: the original first clone now receives a successful entry proof. The next refusal is the overlap-callback sprite alias `destroy()` call. Full F resource admission, original/current-export execution and whole-game promotion remain open.
- Editor contracts: all 22 request-fence and 13 editor-contract tests pass. This is source-method and parser evidence; native-prompt, production browser and installed-dialog evidence remain pending.
- Notice inventory: five hyphenated notice filenames were absent from the earlier inventory. Their current primary bytes and scopes are retained separately; they do not retroactively extend the earlier guarded inputs.

Keep the original failures and immutable census. A successful component suite does not replace the outstanding selected-project, edited-export, native lifecycle or visible-editor gates.
