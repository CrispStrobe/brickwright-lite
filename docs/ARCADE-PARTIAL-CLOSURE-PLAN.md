# Arcade partial closure plan

## Fresh-agent entry point

Read this plan, [the handoff](ARCADE-AGENT-HANDOFF.md),
[the GUI capability ledger](CONVERSION-CAPABILITIES-AND-GUI-GAPS.md) and
[LANES.md](../LANES.md). Refresh remote heads before claiming work. Keep private
corpus paths and receipts in the ignored local handoff or private evidence repo.

Suggested prompt: “Continue the Arcade partial closure plan. Refresh the remote
baseline and LANES.md, take the first unowned unresolved batch, and qualify
conversion, runtime, authoring and roundtrips without suppressing diagnostics.”

## Locked baseline and meaning of zero

The original corpus has **184 inputs: 142 translated, 41 partial, one parse
failure**. Both remote-main source `38b6bc3adbe636eb3b46dda6aa831e28a5df61fb`
and complete integration source `1ff099af6c0b65c81c5d15c663e38f252551b991`
produced this static census. Original corpus commit:
`c67f4854610ccc823682280b4d1fbdf737f4a585`.
Content-multiset SHA256:
`a3dc8c21a33a9fb5e1808d2b2b2b2d2dbc2f7ce1ab33655b7b4cb14a16894b9f03`.

Preserve original bytes and denominator. An output-producing import is not
necessarily complete. A project's partial status clears only when all its
remaining diagnostics clear. Family counts overlap and cannot be subtracted.
Track original snippets and authentic context-enriched projects separately;
recovering absent dependencies/assets must not silently replace original inputs.
For unavailable context, retain the diagnostic and record exactly what input is
needed. Never invent assets, accept unsupported calls as no-ops, discard code,
change the compiler denominator or call a compiler failure a successful game.

Zero partial imports is one gate. Full compatibility additionally requires
original compilation, Brickwright execution, behavioural comparisons,
roundtrips and user authoring. Resolve the separate parse failure explicitly.

## Ordered batches

| Batch | Work | Required evidence |
| --- | --- | --- |
| B0 | Qualify and integrate all recovered candidate heads in PR810. Repair Carnival browser observation; adopt peer painter repair only after reviewing its exact head. | All enabled checks on final head; reviewed merge tree; refreshed-main census. |
| B1 | Map every partial input to its original documentation fence, authentic assets, tutorial context and pinned packages. Recover images, animations, backgrounds, tile maps and songs separately. | Source URLs/revisions, hashes, dependencies, unchanged snippet proof, and separate complete-project import/compiler receipts. |
| B2 | Native sprite-mode detection and typed handle flow: projectile return values, variables, functions, properties, flags, following, camera and tile placement. | Original/native controls using several independent sprites; no stage-only approximation; export and SB3 reopen. |
| B3 | Sprite-scoped overlap/event methods, after identifying their declaring packages and exact semantics. | Correct callback arguments, filters, registration lifecycle and observed original event order. |
| B4 | Remaining standard APIs: tile-map forms, background scrolling, settings array aliases and persistent values. | Original/native controls, real persistence, malformed-input diagnostics, roundtrips. |
| B5 | Custom packages in bounded families: bundles/Carnival wrappers, sports packages, character helpers and remaining tutorial wrappers. | Source-backed semantics, dependency manifest export, runtime controls and visible authoring vocabulary. |
| B6 | Finish blocks, pseudocode, image/animation/tile-map/song editors and assets. Keep each earlier batch's GUI exposure current. | Create/edit/run/export/reimport through real UI; fresh-context SB3 save/reopen; exact retained assets. |
| B7 | Full matrix and parse-failure closure. | All original rows classified; complete projects compiled and run; zero unexplained diagnostics/failures; explicit runtime and GUI coverage. |

Initial estimate: 8–12 implementation/qualification batches, revised after B1.
This is a batch estimate, not a completion-date promise. Do not mark a batch
complete from static translation alone.

## Per-batch protocol

1. Refresh remotes and ownership; use an owned tree and explicit file envelope.
2. Select actual failing rows and record original expected semantics.
3. Implement conversion, execution and editable authoring together. Record any
   deferred editor work in the GUI ledger with an acceptance journey.
4. Run focused original MakeCode/native controls and relevant existing checks.
5. Test TS/project → Blocks → Code → Blocks → MakeCode project, and Blocks →
   SB3 → fresh VM → MakeCode. Compare semantics/assets, not generated names.
6. Exercise game controls/widgets and relevant graphics editors in Playwright.
7. Run the entire locked static census; record source, pins and corpus identity.
8. Archive failures and fixes privately. Update this row ledger and the public
   handoff using portable URLs. Merge only after enabled final-head checks pass.

## Commands and durable locations

Public source: https://github.com/CrispStrobe/brickwright-lite

Combined candidate: https://github.com/CrispStrobe/brickwright-lite/pull/810

Producer grammar: https://github.com/CrispStrobe/sb3-creator

Private corpus/evidence: https://github.com/CrispStrobe/brickwright-firmware-private

Original-source study: https://github.com/microsoft/pxt-arcade and
https://github.com/microsoft/pxt-common-packages . Use exact selected revisions
and retain licences/notices for adopted code. TurboWarp implementation gaps stay
under the separately required clean-room process.

Use the pinned Node/runtime described in the local handoff. Before tests, verify
all requested files exist; sparse Node test discovery can silently omit files.

```sh
node scripts/compat-audit.mjs --target arcade --corpus-commit "$CORPUS_COMMIT" --out "$REPORT_FILE" "$ORIGINAL_CORPUS_DIR"
node scripts/compat-audit.mjs --target arcade --compile --fetch-extensions --out "$COMPILE_REPORT_FILE" "$COMPLETE_PROJECT_DIR"
node scripts/conversion-roundtrips.mjs --out "$ROUNDTRIP_REPORT_FILE" --corpus-commit "$CORPUS_COMMIT" "$ORIGINAL_CORPUS_DIR"
```

Runtime/GUI receipts must state the exact executable/build under observation.
Full application builds and full browser qualification remain hosted; focused
local controls are not installed/production-GUI proof.

## B0 checkpoint — 2026-10-12

PR810 candidate `56badf1a17ceb691bf283cda1f09492851a8502a`:
[Build38208078539](https://github.com/CrispStrobe/brickwright-lite/actions/runs/38208078539)
passed build and corpus; both browser shards failed. Light failed the already
peer-owned painted-map installation observation. Heavy timed out on the
Carnival SVG text selector even though its original screenshot visibly shows
the block. Blockly Field replaces spaces with NBSP; match whitespace while
retaining actual visible block observation, unchanged timeout and every later
runtime/save/reopen assertion. Replacement hosted qualification is pending.

## B1 context recovery checkpoint — 2026-10-12

All41 original partial inputs map uniquely to documents at original PXT commit
`8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02`. The recovery CLI verified every
original manifest hash, fetched each exact document and preserved main.ts
byte-for-byte in separate native project envelopes. Initial recovery retained
one failure: Alien's package fence names an unversioned repository while its
asset project's pxt.json pins the same repository. The assembler now retains
that explicit pin; different repositories or two different explicit revisions
still fail. Eight tutorial/project/collector controls pass. A corrected recovery
assembled41/41 contexts; this does not close41 original import diagnostics.
At clean source `49d3cc5a89e0acc2186601f3c67a28d2a82e073b`, the fresh original
census remains142/41/1. The separate41-context audit is **7 translated /33 partial
/1 Code-to-Blocks parse failure**. Seven contexts clear their static import:
Alien, Wakanda, Arrow, two bundles/countdown tutorials, Alien animation/shooting
and DunkFrame. Those seven have not passed full gameplay/GUI qualification.
The recovery frontier has38 distinct declared GitHub dependency specifications;
actual source/asset resolution and immutable provenance remain pending.
Three actual CLI controls also pass: altered original hash rejected before
output, existing receipt directory preserved, empty partial set recorded.

```sh
node scripts/recover-makecode-context.mjs --manifest "$CORPUS_MANIFEST" --audit "$IMPORT_REPORT" --corpus-dir "$CORPUS_ROOT" --out "$NEW_CONTEXT_DIR"
node scripts/compat-audit.mjs --target arcade --out "$CONTEXT_IMPORT_REPORT" "$NEW_CONTEXT_DIR"
```

The CLI refuses an existing output directory and changed original hashes. Its
report records exact source URLs, document hashes, dependencies and tool hashes;
it preserves downloaded documents even if assembly fails. It does not fetch
external packages or fill in prior tutorial-step setup. Next B1 work: resolve
required package assets with exact source/provenance and classify incomplete
fragments separately from full projects. Full-context compilation, native
execution and authoring are pending.

## Original partial-input checklist

Each row remains OPEN. These are original static diagnostics, not runtime
failure counts. All listed diagnostics must be resolved before closing a row.

| Original input | Remaining diagnostics |
| --- | --- |
| `arcade-0a50646d3a7f920a.ts` | Missing animation asset reference: "Animated Alien"; sprites.createProjectileFromSide() in forever callback — projectile artwork is unavailable; sprites.createProjectileFromSide() as a value |
| `arcade-102e28d473a52b31.ts` | globetrotters.askQuestion2(); globetrotters.checkScore() as a value; globetrotters.setLevel2(); globetrotters.tossBall(); Code to Blocks: Line 13: Empty body: "IF truthiness of value (0) THEN:" has no indented lines under it, so it does nothing. If the following lines were meant to be its body, indent them further than this line. |
| `arcade-1403d6dfbdbfda3d.ts` | Shuri: sprite image — sprite artwork is unavailable in this project; Namor: sprite image — sprite artwork is unavailable in this project; Riri: sprite image — sprite artwork is unavailable in this project; Okoye: sprite image — sprite artwork is unavailable in this project; scene.setBackgroundImage() with art we could not read; sprite.setStayInScreen() — no stage equivalent; Namor.follow() — Scratch scripts can only move their own sprite; Namor.setPosition() — Scratch scripts can only move their own sprite |
| `arcade-1ddbbd17c358a155.ts` | player.onOverlap() — unsupported Arcade handle method |
| `arcade-22b371b8b8fa6957.ts` | valentine.set_win_lose_size() |
| `arcade-2721ae65eef96a3d.ts` | sprites.createProjectileFromSprite() as a value |
| `arcade-28db91a73d9dc1e6.ts` | jumper.onOverlap() — unsupported Arcade handle method |
| `arcade-2cdb086eac46d6df.ts` | athlete: throw_imgs.dunk — sprite artwork is unavailable in this project; hoop: throw_imgs.hoop — sprite artwork is unavailable in this project; scene.setBackgroundImage() with art we could not read; sprite.setVelocity() — no stage equivalent; sprite.setBounceOnWall(); hoop.setPosition() — Scratch scripts can only move their own sprite |
| `arcade-2dfc9d75b91259dc.ts` | spaceship.onOverlap() — unsupported Arcade handle method; r.onOverlap() — unsupported Arcade handle method |
| `arcade-318e958c14146483.ts` | car.onOverlap() — unsupported Arcade handle method |
| `arcade-383f2359d4446bef.ts` | sprites.create() as a value; fireSprite.setPosition(); fireSprite.setVelocity(); fireSprite.setFlag() |
| `arcade-3e97847322a94308.ts` | tiles.setTilemap() requires a readable literal tile map with wall layer and tile scale |
| `arcade-5840453b73b41d29.ts` | freethrow.onOverlapHoop(); freethrow.onA(); freethrow.setCourt(); freethrow.addPlayer(); freethrow.addHoop(); freethrow.gameCountdown() |
| `arcade-5d0c02f598d4eda3.ts` | scene.setBackgroundImage() with art we could not read; bundles.wrap1(); bundles.wrap2(); bundles.wrap3(); bundles.wrap4() |
| `arcade-67958b6a5a875e41.ts` | Missing song asset reference: "countdown"; scene.setBackgroundImage() with art we could not read; pizza.setPlayersWith(); music.createSong requires a hex literal or Buffer.fromHex expression |
| `arcade-72d0c967c399700b.ts` | rockscout: sprite image — sprite artwork is unavailable in this project; scene.cameraFollowSprite(); tiles.placeOnRandomTile() — tilemaps have no stage equivalent |
| `arcade-7b258f528af901d5.ts` | Missing song asset reference: "countdown"; sprites.sendFlying(); scene.setBG(); game.gameCountdown(); sprites.assignPlayerImgs(); music.createSong requires a hex literal or Buffer.fromHex expression |
| `arcade-7cf6f6fa5b8ff423.ts` | football.createGame() |
| `arcade-90a0e61d3299702c.ts` | finish: sprite image — sprite artwork is unavailable in this project; scene.setBackgroundImage() with art we could not read; assets.image`…` — image or asset literal not translated here; game.wrap() |
| `arcade-999ed460b9bd1d1e.ts` | scene.setBackgroundImage() with art we could not read; bundles.wrap1(); bundles.wrap2(); carnival.startCountdownGame() |
| `arcade-9c4a169d9d7f1171.ts` | smurfy.set_first_smurf(); smurfy.add_floating_smurf() |
| `arcade-a03d93d1b0b9d753.ts` | iceSprite: lab2imgs.icecube — sprite artwork is unavailable in this project; sprite.setVelocity() — no stage equivalent; sprite.setFlag() — no stage equivalent |
| `arcade-a63932786084c167.ts` | Missing animation asset reference: "DunkFrame" |
| `arcade-b1c05d93bd099fec.ts` | Missing animation asset reference: "Animated Alien"; scene.setBackgroundImage() with art we could not read; scroller.scrollBackgroundWithSpeed(); sprites.createProjectileFromSide() as a value; projectile.y = … — a sprite held in a variable, which the stage cannot follow |
| `arcade-b8a65f49c9f42730.ts` | turkey.onStartSimple(); turkey.onA(); turkey.turkeyOverlapCage(); turkey.onCages() |
| `arcade-c06098817e66322b.ts` | flamethrower: lab2imgs.flamethrower — sprite artwork is unavailable in this project; sprite.setStayInScreen() — no stage equivalent |
| `arcade-c2576ea38bf22bfe.ts` | scene.setBackgroundImage() with art we could not read; bundles.wrap1(); bundles.wrap2(); carnival.startCountdownGame() |
| `arcade-c88488d3d16301b4.ts` | blockSettings.writeNumberArray(); blockSettings.writeStringArray() |
| `arcade-d8509d60f9807d87.ts` | sprites.step_right() |
| `arcade-d90dfaf541db52b1.ts` | sparksjr.onScore2() |
| `arcade-d9e2b51bad2378e4.ts` | tiles.setTilemap() requires a readable literal tile map with wall layer and tile scale |
| `arcade-db4713b4f6e9dd9c.ts` | tiles.setTilemap() requires a readable literal tile map with wall layer and tile scale |
| `arcade-db8b30332dc1be2c.ts` | sprites.createProjectileFromSprite() source must be a sprite handle or null |
| `arcade-ddc8f1cacad743df.ts` | sprites.createProjectileFromSide() in game.onUpdateInterval callback — projectile artwork is unavailable; sprites.createProjectileFromSide() as a value |
| `arcade-e38a6d6052580d02.ts` | tiles.setTilemap() requires a readable literal tile map with wall layer and tile scale |
| `arcade-e4b668bd7d79aed0.ts` | Missing song asset reference: "countdown"; scene.setBackgroundImage() with art we could not read; pizza.setPlayersWith(); music.createSong requires a hex literal or Buffer.fromHex expression |
| `arcade-e7ab5324f14c41d8.ts` | fortuneTellerSprite: lab2imgs.crystal_ball — sprite artwork is unavailable in this project |
| `arcade-f1f82cba5cb33a44.ts` | flamethrower: lab2imgs.flamethrower — sprite artwork is unavailable in this project; sprite.setStayInScreen() — no stage equivalent |
| `arcade-f583b7911b0931fd.ts` | flameSprite: lab2imgs.flame — sprite artwork is unavailable in this project; flamethrower.x — a sprite held in a variable, which the stage cannot follow; flamethrower.y — a sprite held in a variable, which the stage cannot follow; sprite.setVelocity() — no stage equivalent; sprite.setFlag() — no stage equivalent |
| `arcade-f65a6b2d8bfcc716.ts` | frog: flies_imgs.frog — sprite artwork is unavailable in this project; fly: flies_imgs.fly — sprite artwork is unavailable in this project; scene.setBackgroundImage() with art we could not read; fly.setVelocity() — Scratch scripts can only move their own sprite; fly.setBounceOnWall() — Scratch scripts can only move their own sprite |
| `arcade-faf260517b2744d5.ts` | bubble.tossBubble(); bubble.load_bubble() |

## Separate parse-failure input

`arcade-12904c83e83fe45a.ts` remains a separate OPEN parser/input-investigation lane.

## B1 dependency specification repair — 2026-10-12

Actual original package declarations include a trailing slash before the Git
revision, for repositories and subfolder packages. The on-demand fetch parser
and PXT worker lookup now canonicalize that single trailing slash consistently.
Double slashes, traversal and malformed paths remain rejected. Eight extension
controls pass, including actual original PXT compilation through both normal
and trailing-slash subfolder references, offline compiler hooks and root-notice
inheritance. This repairs package resolution; it does not prove Arcade native
execution of those packages or resolve unavailable asset inputs.

Source recovery records declared refs, resolved root commits, exact fetched
file hashes and licence notices. Preserve unsuccessful attempts. Any mistaken
local audit adapter must be identified separately from an application defect.
Unpinned transitive dependencies and unrecognised source licences remain explicit
qualification/redistribution boundaries; source availability alone is not a
shipping claim.

### Source frontier after canonical specification repair

At clean `f97bd3ab149371751109b883d2f61ab935600ce1`,17 final focused
checks pass (tutorial/collector, real original compiler/extension, HEAD mirrors).
Of38 declared root specifications,36 source graphs resolve and2 retain the
existing per-extension source-size refusal. Exact root refs and recognised
licence notices are recorded privately; transitive unpinned refs and unknown
licences are explicit remaining boundaries. This is source recovery, not native
execution or shipping qualification.

The two size refusals have different causes: one is a real image gallery/source
set; the other includes a large editor history file despite small current art.
Next establish original compiler/editor file semantics, bounded byte streaming,
proper dependency assets and metadata preservation. Do not blindly increase a
limit, discard code or omit an asset because it is inconvenient to parse.

### Bounded dependency compiler inputs — 2026-10-12

`extension-fetch.js` now counts streamed UTF-8 bytes before retaining each
chunk, cancels oversized bodies, and applies an aggregate budget even to failed
downloads. Default limits are 8 MiB of listed compiler inputs per package,
32 MiB across a compile, and 256 KiB each for manifests and licence notices.
This accommodates the observed art gallery while keeping named refusals for
larger inputs. Text-only fetch adapters use the same byte accounting, but cannot
cancel downloads while reading; browser/Node Fetch responses use streams.

The pinned original PXT worker compiles a dependency whose unchanged manifest
lists `_history` without requesting that file. Only dependency compiler loading
omits `_history`, reporting `fetched.excludedFiles`; it preserves the original
manifest and all other listed non-image inputs. Project import/export and
archives retain their existing semantics. This is not a lossless dependency
archive API. `sourceBytes` reports the actual retained compiler-input bytes.

Two real pinned package controls now resolve without refusals:
[Hawks gallery](https://github.com/kiki-lee/hawks-imgs/tree/1b40ca1abe244fe2bd9b122159eba9ce43460bb7)
retains 1,767,377 bytes of manifest-listed inputs; the earlier 3.1 MiB repository
inventory also included a generated file absent from that manifest.
[Pizza assets](https://github.com/kiki-lee/new-pizza-assets/tree/779c3dad9b2024327d12eb90a78a89a8f3998ea1)
retains 79,176 bytes, explicitly excluding its 36 MB editor history.
The authentic pizza context compiles in original Arcade without diagnostics.
The authentic Hawks snippet fails original compilation with undeclared `harry`;
preserve that incomplete-context failure rather than synthesizing a sprite.
Neither control qualifies native conversion, gameplay, GUI editing, roundtrips
or redistribution. The original 184-input static census is unchanged.

Focused controls cover large retained art, split multibyte decoding, actual byte
limits, early response cancellation, aggregate budgets including failures,
bounded notices, reported history omission and original PXT compilation.
Next close dependency asset preparation for native imports, recover complete
original project context for compiler failures, and then remeasure the separate
context corpus. B1 remains open.

### Native dependency preparation — 2026-10-12

`resolveProjectInputs` in `scripts/lib/pxt-node.mjs` obtains package source order,
conditional inputs, asset-pack declarations and normalized resources from the
original PXT worker. Preparation is distinct from successful compilation.
`dependency-project.js` builds an internal native translation view: package
filenames have separate prefixes, root galleries and main source remain intact,
and resources already supplied by the root are not registered twice. Vendored
API implementations stay with the existing call-site translators; their omitted
library sources are explicitly recorded and unsupported calls remain diagnosed.
External helper source is included in original compiler order.

PXT generates asset-pack fixed-instance image declarations with empty buffer
placeholders. Native preparation fills those declarations with the exact decoded
JRES pixels. Qualified image constants are distinct from editor display labels;
labels do not create a root factory. Namespace song buffers retain their original
generated source, including named unsupported diagnostics until native buffer
conversion is implemented. No substitute pixels, empty songs or no-ops are used.

CLI usage (explicit network opt-in; default remains offline):

```sh
node --import ./scripts/lib/register-gui-scope.mjs scripts/makecode.mjs \
  to-sb3 game.mkcd --fetch-extensions -o game.sb3 --bw game.bw
```

The SB3 includes `bw.makecode-dependencies.json` with source hashes, fetch notices,
input provenance and the vendored-source boundary. The internal flattened view
is not a MakeCode export format: original project files remain separate.

Controls exercise actual original asset-pack generation, transitive source order,
exact image pixels/position in Brickwright, original-Arcade export compilation
and native reimport, and real CLI child-process offline/opt-in behaviour.
Root gallery bytes and unsupported source cases remain checked.

New explicit next gaps:

- Namespace-level Buffer/hex constants and dynamic `music.createSong(buffer)`
  need real mutable buffer identity and conversion. Coordinate importer changes
  with E10 ownership; do not inline a mutable buffer as a guessed constant.
- Foreign animation dimensions can exceed the current native codec limits.
  Qualify wider frames with bounded total pixels/bytes, clipping, collision,
  codecs, export, SB3 reopen and graphics editing before changing limits.
- Dependency factory lookup needs source registration order and scoped aliases;
  do not infer lookup names from dropdown labels. Deferred library declarations
  must keep diagnostics when used.
- Original incomplete snippets still need complete authentic source context;
  Hawks' undeclared `harry` remains an original compiler failure.

Repeat the separate context census after these changes. The locked original
184-input census has not been promoted by preparation or component controls.

The two authentic prepared-project controls remain partial: pizza exposes its
namespace hex-buffer declaration; Hawks exposes `TrampolineDunk` (`anim8`),
whose packed header is 161×121 pixels, 32 frames and 311,720 bytes. Its original
snippet still fails original compilation on `harry`. Root/dependency animation
IDs are no longer spuriously registered twice. Earlier failed preparation
attempts and corrected source/metadata receipts are preserved privately.
The focused suite also checks that known unsupported namespace song buffers
remain diagnosed; a passing suite does not mean that feature is implemented.

### B1 animation dimensions checkpoint — 2026-10-12

The native JRES codec's160-pixel dimension cap is removed using the native u16
format and bounded packed/decoded resource sizes. Original-PXT golden controls
cover161x121 with32frames (311720packed bytes), full edge pixels and hostile
headers before allocation. Editor publication/library installation still has
a160x160 bound; runtime/graphics/export/SB3 browser acceptance remains open.
No change to the locked184-input denominator or142/41/1 baseline is claimed.

### B1 wide artwork source/editor candidate

The native161x121 timeline can now become editable Pixel artwork and a native
runtime resource. Bundle8 advertises dimensions through512x512, with whole-
document pixel/byte budgets and old-reader opaque preservation. Headless VM/
SB3/original-PXT export and actual editor method controls pass. The added hosted
Pixel painting/save/reopen/export journey is pending. Keep the original census
and wide collision/screen oracle requirements open until measured.

### B1 wide sprite collision and display oracle

The added control in `test/arcade-wide-artwork.test.mjs` executes a161x121
sprite in the pinned original PXT simulator and the native VM. Opaque pixels
outside the160x120 viewport still collide in both argument orders; a transparent
neighbour does not; pixel painting and erasure update collision masks. Every
one of the19200 presented screen pixels matches. The original display observer
requires a real screen update after program completion before comparison.

The same assertions pass after Blocks-to-Code reconstruction and fresh SB3
reload, and the exported native MakeCode project executes in original PXT with
the same collision results and screen. The first fixture attempt waited on an
optimized constant completion marker and timed out before comparison; its
failure is retained privately. A mutable marker corrects the observation.
No product runtime change was necessary for this case. This closes the focused
wide-image collision/display requirement; hosted Pixel authoring qualification
and the unchanged142/41/1 original census remain separate gates.

```sh
node --import ./scripts/lib/register-gui-scope.mjs --test --test-name-pattern='wide sprites retain' test/arcade-wide-artwork.test.mjs
```

### B1 byte-buffer runtime foundation

The mixer's limited four-format numeric adapter is replaced with the complete
buffer algorithms from the pinned pxt-core13.2.1 simulator. Extraction retains
the original algorithms; a generator records their SHA256 and verifies exact
regeneration. The host facade retains mutable Uint8Array storage, delegates
numeric/byte/slice/write/fill/shift/rotate operations and bounds each allocation
to1MiB. All16 number formats include signed/unsigned integers, both byte orders
and32/64-bit floats. Source attribution and the original MIT notice are retained.

This is runtime foundation, not namespace Buffer import support. Subsequent
work must add a distinct session-scoped Buffer reference, alias-preserving
variable/function/array flow, native Code/Blocks vocabulary and proper export.
Then connect `hex`, `Buffer.fromHex`, `control.createBuffer`, numeric access and
`music.createSong(buffer)` without substituting a string for mutable storage.
Coordinate the importer/helper edits with E10 ownership. Literal readonly
buffers and mutable constructed buffers need separate original controls.
Keep namespace hex-buffer diagnostics until those paths execute correctly.

```sh
node --import ./scripts/lib/register-gui-scope.mjs --test --test-concurrency=1 test/makecode-arcade-byte-buffer.test.mjs test/makecode-arcade-song-runtime.test.mjs test/makecode-arcade-song-values.test.mjs
```

### Buffer authoring checkpoint — 2026-10-12

The followup now implements scoped Buffer references and16 native Code/Blocks
words, with alias-preserving variables/custom arguments/reference arrays,
detached slicing and actual mutable song storage. Export supplies Buffer types,
all16 numeric enum members and intact hex text. Original-runtime controls caught
literal content interning and number-declaration/menu-expression mistakes; the
fixes retain source-site identity and true original compilation/execution.
Component candidates are sb3-creator PR96 and extensions PR34; exact pins are
recorded, with targeted Arrays adoption preserving unrelated sources. Final
hosted qualification remains required; do not confuse candidate source with main.

Next closure: E10 namespace Buffer imports and init order, then real-browser
Buffer authoring and byte inspection. Keep whole-corpus classifications unchanged
until the immutable184 originals and authenticated contexts are rerun. Wide
animation authoring has separate observed hosted proof from Build38256137458;
that older-head proof does not cover these later edits.

### Buffer Base64 checkpoint — 2026-10-12

Native Buffer construction and encoding now cover genuine Base64 APIs, original
padding/incomplete-group/URL-safe semantics and explicit malformed-input errors.
The candidate has29 affected controls and352 producer controls passing, zero
skips, including original export execution and fresh SB3. Source is stacked on
PR843; hosted qualification remains pending. Namespace imports and a visible
byte inspector remain separate acceptance tasks. Next source-derived Buffer
slices are chunking (including UTF8 boundaries), packing/unpacking and hash,
followed by aggregate heap lifetime. Full immutable project recensus, original
asset closure and browser journeys remain necessary before41 can become0.

### Buffer chunking checkpoint — 2026-10-12

Native byte/UTF8 chunk arrays now retain the source-extracted original alias,
copy, fractional-slice and UTF16/surrogate behavior. Scoped Buffer[] custom
returns and export through genuine MakeCode calls survive original execution
and actual fresh SB3.31 distinct controls and354 producer controls pass without
skips. Resource limits diagnose excessive collections before another output
allocation. Import, visible chunk inspection and full original-app recensus
remain open. Next: pack/unpack format parsing and hash, then aggregate live heap
closure. Hosted full builds and editor proof remain required; observed PR834
unit success with a cancelled full build is not release qualification.

### Buffer packing checkpoint — 2026-10-12

Four packing APIs now have native words, scoped numeric arrays, typed custom
returns, original MakeCode export and fresh SB3 controls. Seven new controls
pass without skips;30 preceding affected controls passed in the preserved
first batch. Producer passes358 controls, canonical vocabulary315. Original
format syntax and partial-write behavior remain intact; bounded repeat/work
and result allocation reject excessive requests explicitly. The Buffer
contract records engine-dependent undefined-float NaN payloads and original
panic108 versus native source-level diagnostics. Namespace imports, visible
format/byte/array tools and immutable whole-project recensus remain open.
Next: original hash, then aggregate live heap/lifetime, followed by real app
qualification. Latest PR834 build/heavy passed; light pending at checkpoint.

Browser followup: PR845 light reached real format/numeric edits and the A
mutation, then timed out on B because the fixture listened for b while the
pane sends z. Use the actual pane mapping in that fixture; preserve ordinary
b as a separate keyboard input and retain original exported controller proof.
Heavy/FPGA passed; fresh full visible journey remains required.

### Original Buffer hash checkpoint — 2026-10-12

Native k-bit FNV-1 reporter, Code word and genuine typed `.hash(bits)` export
retain the complete original common simulator functions. Three hash controls
and seven rechecked packing controls pass without skips; producer359 passes.
The source-derived Buffer authoring API backlog now leaves importer aliases
with E10. Whole-app original asset/API closure, native GUI inspectors and
aggregate live memory remain open. Strong Buffer registry entries currently
retain discarded temporaries until reset: implement root tracing and reserve
allocations before copies; an ever-growing historical counter is insufficient.
PR845 full build timed out and the light B-fixture failure is preserved; obtain
exact-head complete build/editor proof before acceptance or corpus promotion.

## Authentic terrain recovery and prepared audits — 2026-10-13

Standalone tutorial `jres` fences were omitted from recovered project envelopes.
The assembler now preserves their original bytes and uses the pinned original
`pxt.emitTilemapsFromJRes` worker to generate companion TypeScript. Collector,
recovery and tutorial-to-project CLI callers record worker versions/hash and
emitter provenance. Conflicting, malformed and unterminated resource fences
are diagnosed; original main files remain unchanged. Four authentic map
contexts (Maze, Cherry Pickr, Simple Extensions, Dance Party) compile originally
and import without native diagnostics. Gameplay/roundtrip qualification is
being measured separately; these are not changed raw snippets.

The compatibility CLI can separately inspect genuine prepared dependency inputs:

```sh
node scripts/compat-audit.mjs --target arcade --prepare-extensions --fetch-extensions --out "$PREPARED_REPORT" "$AUTHENTIC_PROJECT_DIR"
```

Fetching stays explicit. Raw `stage`/`unsupported`/`tally` are preserved;
`preparedTranslation` and `preparedTally` report the added input layer with
original/prepared file hashes, package source provenance and explicit failures.
The resolver is not a compiler or gameplay oracle. A requested preparation or
prepared parse failure returns a failing CLI status. Compilation, execution,
behavioural comparisons and GUI evidence remain separate gates.
