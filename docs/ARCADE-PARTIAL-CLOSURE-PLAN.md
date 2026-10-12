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
