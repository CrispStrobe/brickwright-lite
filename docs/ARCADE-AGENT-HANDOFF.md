# Arcade compatibility: fresh-agent handoff and methodology

Updated 2026-10-10, with GitHub state observed at 10:17 UTC. This is the public
entry point for continuing MakeCode compatibility work without chat history.
Read the optional, gitignored `docs/ARCADE-AGENT-HANDOFF.local.md` for the
operator's actual checkouts, tools, private corpus and original receipts.
Historical checkpoints below are observations, not permission to assume that
branches, checks, ownership or dependency pins remain unchanged.

## 1. Two-line starter prompt

> Read `docs/ARCADE-AGENT-HANDOFF.md`, its local companion when available, and the linked capability/lane records before editing.
> Refresh remote heads/checks, claim an isolated next lane, and close it across runtime, authoring, interchange and real GUI evidence; preserve failures and exact identities.

The local companion contains an absolute-path version usable from the operator's
workspace root. Neither prompt requires earlier conversation or session logs.

## 2. Objective and meaning of completion

A user must be able to build an Arcade game in Brickwright Code/pseudocode,
Blocks and the graphics/resource editors, run it natively, save/reload it, export
it and run the export in original MakeCode Arcade. Importing the original again
must preserve assets, values, behavior and editable authoring. Conversion-only
support is insufficient. Normal MakeCode/micro:bit and Scratch-format conversion
remain separate measured targets. TurboWarp-specific compatibility is not
established by an SB3 structural audit.

Do not obtain `partial = 0` by hiding diagnostics, dropping inputs, replacing
unsupported constructs with comments/no-ops or reclassifying untested features.
`translated` means the importer reported no named gaps; it does not mean a game
is behaviorally equivalent or fully editable. Full authoring and execution gates
must also pass. Some hardware-specific capabilities require an explicit target
boundary, rather than a fabricated browser equivalent.

## 3. Authoritative records and complete capability inventory

Read these in order. They contain the existing implementation history, API
families, graphics/GUI gaps, asset contracts and planned acceptance criteria;
this guide explains how to work and how to interpret their evidence.

| Record | Role | Full repository URL |
| --- | --- | --- |
| [LANES.md](../LANES.md) | Ownership, branch claims and checkpoints | https://github.com/CrispStrobe/brickwright-lite/blob/main/LANES.md |
| [Capability and GUI ledger](CONVERSION-CAPABILITIES-AND-GUI-GAPS.md) | Complete conversion/runtime/authoring capability write-up and separate remaining GUI gaps | https://github.com/CrispStrobe/brickwright-lite/blob/main/docs/CONVERSION-CAPABILITIES-AND-GUI-GAPS.md |
| [Arcade compatibility plan](ARCADE-COMPAT-PLAN.md) | Export mappings, named refusals and authoring closure | https://github.com/CrispStrobe/brickwright-lite/blob/main/docs/ARCADE-COMPAT-PLAN.md |
| [Screen/render contract](ARCADE-SCREEN-RENDER-CONTRACT.md) | Indexed frame, render ordering and S01–S05 prerequisites | https://github.com/CrispStrobe/brickwright-lite/blob/main/docs/ARCADE-SCREEN-RENDER-CONTRACT.md |
| [Animation interchange](ARCADE-ANIMATION-INTERCHANGE.md) | Images, resources, animation bindings and preservation | https://github.com/CrispStrobe/brickwright-lite/blob/main/docs/ARCADE-ANIMATION-INTERCHANGE.md |
| [Public API census](generated/MAKECODE-PUBLIC-API-CENSUS.md) | Pinned declaration candidates; not a support denominator | https://github.com/CrispStrobe/brickwright-lite/blob/main/docs/generated/MAKECODE-PUBLIC-API-CENSUS.md |
| [Authoring vocabulary](generated/ARCADE-AUTHORING-VOCABULARY.md) | Generated editable words and coverage joins | https://github.com/CrispStrobe/brickwright-lite/blob/main/docs/generated/ARCADE-AUTHORING-VOCABULARY.md |
| [Historical compatibility audit](generated/ARCADE-COMPAT-AUDIT.md) | Per-input diagnostics at its recorded older source | https://github.com/CrispStrobe/brickwright-lite/blob/main/docs/generated/ARCADE-COMPAT-AUDIT.md |
| [Historical permutations](generated/CONVERSION-ROUNDTRIPS.md) | Structural/asset roundtrip report, not behavioral proof | https://github.com/CrispStrobe/brickwright-lite/blob/main/docs/generated/CONVERSION-ROUNDTRIPS.md |
| [Receipts](receipts/) | Exact tested source and bounded observations | https://github.com/CrispStrobe/brickwright-lite/tree/main/docs/receipts |

`main` links are discovery links: these stacked changes may not be merged there.
For the complete implemented snapshot through scrolling, use
https://github.com/CrispStrobe/brickwright-lite/tree/86a6335e55abea0c233d63118d4295e39a848842 .
Open the same relative paths at that immutable commit if main lacks them.
Older generated reports, plan paragraphs and private corpus READMEs retain their
historical counts. Do not silently treat them as a fresh census.

## 4. Repositories, pins and original sources

- Consumer: https://github.com/CrispStrobe/brickwright-lite . Native VM,
  importer/exporter, GUI, overlay integration and qualification scripts.
- Producer: https://github.com/CrispStrobe/sb3-creator . Shared Code parser,
  decompiler, dialect/opcode/menu schema and generated examples. Do not fork a
  second parser into Lite to make a test pass.
- Producer snapshot: https://github.com/CrispStrobe/sb3-creator/tree/eca752b7011656b9e73917bc6f816ffed24ad4b9 .
  This is the current Arcade stack's `vendor-pins.json` producer pin, not a
  statement about producer main or unrelated dependency pins.
- Producer image scroll/copy work: https://github.com/CrispStrobe/sb3-creator/pull/82
  and https://github.com/CrispStrobe/sb3-creator/pull/83 . Refresh actual state.
- Original Arcade source: https://github.com/microsoft/pxt-arcade/tree/2d7d59b5226e8a1a1e05e8042dd9f5248ed68fea
  (`v4.2.1`). Core: https://github.com/microsoft/pxt/tree/v13.2.1 .
- Normal MakeCode source: https://github.com/microsoft/pxt-microbit/tree/v9.1.1
  and https://github.com/microsoft/pxt/tree/v13.0.1 .
- Original editor: https://arcade.makecode.com/ . Hosted original execution in
  tests uses the pinned local simulator, not whatever editor version is live.

Read `vendor-pins.json`, the prepared runtime's `VERSIONS.json` and notices at
startup. The pinned Arcade declaration bundle recorded SHA-256
`6f35aadf1456436b3318d2f2339cc3d1add6e6c3b0bf8566f86d7f7bb4f7722e`.
Prefer exact pinned target contents over a newer upstream API when qualifying
this source. Dependencies and pin moves must be reviewed and explicit.

## 5. Latest measured corpus and what it proves

The locked original Arcade set contains **184 inputs**: **109 translated,
74 partial, 1 malformed**. Latest importer-changing evidence is
[the follow receipt](receipts/2026-10-09-arcade-sprite-follow.json), tested source
`3c4493c1eb8f68343234e86141ebd9c9e8a277f8`, preserving all184 original hashes.
Subsequent render/speech fixes did not rerank that corpus. Do not infer an
improvement from passing runtime tests or the hosted dialect corpus gate.

Other denominators are distinct: original MakeCode inputs across both targets,
full tutorial projects, captured importer test inputs, shipped Brickwright
examples, Scratch-format SB3 fixtures and conversion permutations. Assets absent
from plain text are an explicit structural loss, not proof that the SB3 exporter
cannot preserve assets. Original-PXT compile failure is separate from importer
failure and exported compile failure. Record all of them.

## 6. Active stack and current blocking check

All three recent implementation PRs remain **draft/open**, not merged:

| PR | Branch | Reviewed implementation | Current published head |
| --- | --- | --- | --- |
| https://github.com/CrispStrobe/brickwright-lite/pull/771 | `lane/arcade-native-legacy-bubble-20261009` | `d51cf93c7bcfd0bc62b9c9035d686651208939d8`; assertion repair `5c7b0435f7c3bf4175d4fb62c09f3bcb31c03c88` | `4e68ebbb8f96b3724ef96c4f84adbc24bf3e4c4e` |
| https://github.com/CrispStrobe/brickwright-lite/pull/772 | `lane/arcade-speech-hitbox-20261010` | `f6b48a499dce678c91cef052fcde424c90a6413a` | `25ae4f5d5e03caef043acb45d3e2456f7b968e19` |
| https://github.com/CrispStrobe/brickwright-lite/pull/773 | `lane/arcade-native-speech-scroll-20261010` | `7b158d559d92041a3d6893c29b2851dc6e5b8747` | `86a6335e55abea0c233d63118d4295e39a848842` |

PR773 is based on PR772's branch; PR772 on PR771; PR771 on PR770's
`lane/arcade-negative-kind-20261009`. Earlier PRs remain part of the stack.
Inspect bases and merge state before integrating any of it.

**First next task: investigate the real hosted light-browser pixel failure.**
The PR773 exact-head build, corpus, check, heavy browser and FPGA surface passed;
light browser failed. Deploy and verify-gui skipped downstream of that failure.
PR771/772 light checks also failed; earlier notes saying queued are superseded.

- Official run: https://github.com/CrispStrobe/brickwright-lite/actions/runs/38025509301 .
- Failed job: https://github.com/CrispStrobe/brickwright-lite/actions/runs/38025509301/job/114146423199 .
- Artifact metadata: https://api.github.com/repos/CrispStrobe/brickwright-lite/actions/artifacts/11662660346 .
- Official artifact ZIP endpoint: https://api.github.com/repos/CrispStrobe/brickwright-lite/actions/artifacts/11662660346/zip .
- Artifact name `arcade-rotation-browser`; report `current.json`.
- Failure is `waitLayerPixel` at script line657, called at664 in that exact head:
  initial sprite-layer centre RGB `[255,33,33]` was not observed in30seconds.
- Fixture `test/fixtures/arcade-sprite-layer-routing.mjs`; red Player/front z1
  and yellow Enemy/back z0 at80,60. `layerReady=true`, `layerPhase=0` were present.
- Report contained two native sprites, device `arcade`, stepping true,
  no page errors, no block errors and no diagnostic entries. The preceding
  multiplayer journey had completed. These observations do not establish why
  the renderer pixel failed; do not call it a flake or waive the assertion.

Inspect the actual report/screenshot and native indexed centre pixel, drawable
z ordering, canvas backing size/readiness, palette, visible device-pane pixels
and actual loaded bundle identity. Determine whether source, presentation or
harness is wrong. Preserve the original failure and keep the intended pixel and
controller checks. Do not fix a failure solely by increasing its timeout.

## 7. Historical render prerequisites and evidence map

Each link is a separate lane and bounded receipt, not a merge or full-game claim.

| Area | PR | Public receipt |
| --- | --- | --- |
| Native follow; last109/74/1 ranking | https://github.com/CrispStrobe/brickwright-lite/pull/759 | [follow](receipts/2026-10-09-arcade-sprite-follow.json) |
| Sprite properties/layer routing | https://github.com/CrispStrobe/brickwright-lite/pull/760 | [layers](receipts/2026-10-09-arcade-sprite-layers.json) |
| Original numeric sign | https://github.com/CrispStrobe/brickwright-lite/pull/761 | Capability ledger's numeric sign section |
| Native info/browser typed observations | https://github.com/CrispStrobe/brickwright-lite/pull/762 | [browser repair](receipts/2026-10-09-arcade-info-browser-repair.json) |
| Image.scroll | https://github.com/CrispStrobe/brickwright-lite/pull/763 | [scroll](receipts/2026-10-09-arcade-image-scroll.json) |
| Image.copyFrom | https://github.com/CrispStrobe/brickwright-lite/pull/764 | [copy](receipts/2026-10-09-arcade-image-copyfrom.json) |
| Indexed background/sprites | https://github.com/CrispStrobe/brickwright-lite/pull/765 | [frame](receipts/2026-10-09-arcade-indexed-frame.json) |
| Native indexed tile layers | https://github.com/CrispStrobe/brickwright-lite/pull/766 | [tiles](receipts/2026-10-09-arcade-indexed-tiles.json) |
| Modern speech compositor | https://github.com/CrispStrobe/brickwright-lite/pull/767 | [modern speech](receipts/2026-10-09-arcade-indexed-modern-speech.json) |
| Global speech deadlines | https://github.com/CrispStrobe/brickwright-lite/pull/768 | [clock](receipts/2026-10-09-arcade-speech-global-clock.json) |
| Legacy camera bridge | https://github.com/CrispStrobe/brickwright-lite/pull/769 | [camera](receipts/2026-10-09-arcade-legacy-speech-camera.json) |
| Negative numeric sprite kinds | https://github.com/CrispStrobe/brickwright-lite/pull/770 | [negative kinds](receipts/2026-10-09-arcade-negative-kind.json) |
| Native legacy bubble identity/callbacks | https://github.com/CrispStrobe/brickwright-lite/pull/771 | [ownership](receipts/2026-10-09-arcade-native-legacy-bubble.json), [hosted gate repair](receipts/2026-10-10-arcade-hosted-gate-repair.json) |
| Scaled/rotated owner placement | https://github.com/CrispStrobe/brickwright-lite/pull/772 | [hitbox](receipts/2026-10-10-arcade-speech-hitbox.json) |
| Frame-replayed native scrolling | https://github.com/CrispStrobe/brickwright-lite/pull/773 | [scrolling](receipts/2026-10-10-arcade-native-speech-scroll.json) |

The complete earlier conversion additions (types, references, arrays, closures,
classes/namespaces, callbacks, scenes, controllers/multiplayer, physics, assets,
animations, palettes, tiles, dialogs and resource editors) are written in the
capability ledger. Follow its per-feature sources/tests instead of treating this
recent speech-focused table as the entire app's capability list.

## 8. Source ownership map

| Layer | Files/directory | Rule |
| --- | --- | --- |
| Arcade import | `overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js` | Typed/literal/asset translation and named unsupported diagnostics |
| Arcade export | `overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js`, `arcade-runtime.js` | Native PXT output/helpers; compile and run the real export |
| Values/types/resources | Same directory: `value-type-graph.js`, `declared-value-types.js`, `pixel-image.js`, `arcade-assets.js`, `arcade-animation-assets.js` | Preserve alias/type/asset identities and exact pixels |
| Native Arcade VM | `overlay/scratch-vm/src/extensions/crispstrobe/arcade/index.js` | Factory-generated extension, native scene/physics/image/callback state |
| Speech bridge | Same directory: `speech.js`, `speech-pxt.js`, `speech-native-legacy.js`, `speech-fonts.json` | Retained original glyph/renderer source; attributed resumable adaptation |
| Images/rotation | Same directory: `image.js`, `image-pxt.js`, `rotation-pxt.js` | Actual indexed images and original math/geometry |
| Shared authoring | Producer repo plus Lite `overlay/scratch-gui/src/lib/sb3-creator.js`, `arcadeDialect.js` | Change producer then official sync; no private parser fork |
| Controller/display | `overlay/scratch-gui/src/components/tw-pseudocode/arcade-device-pane.jsx`, `overlay/scratch-gui/src/lib/bw-arcade-device-frame.js` | Real user controls and renderer-backed display |
| Graphics/resources | `overlay/scratch-paint/`, `overlay/scratch-gui/` resource/editor integrations | Layered source, UUIDs, image/animation/tile metadata, palette and SB3 persistence |
| Original oracle | `test/helpers/pxt-arcade-runtime.mjs`, `scripts/lib/pxt-node.mjs` | Actual pinned compiler, simulator and fibers |
| Integration helpers | `scripts/apply-vm-overlay.mjs`, `scripts/integrate.mjs`, `test/helpers/bw-integrated.mjs`, `scripts/lib/register-gui-scope.mjs` | Source ownership and explicit prepared dependency root |

Edit tracked overlay sources, not only ignored prepared `packages/` files.
The factory serializes exported functions into the extension: a helper that
works through a module-scope Babel binding may vanish in the actual bundle.
Qualify both fresh development and production extension bundles.

## 9. Repeatable implementation cycle

1. Read applicable AGENTS files and these records. Inspect remotes, branch,
   worktrees, status, producer pins and current checks. Refresh narrow refs.
   Confirm the lane has not already been completed elsewhere.
2. Work in an owned isolated tree; record claim, affected files, branch/base and
   acceptance criteria in `LANES.md`. Follow its claim coordination rules.
   Do not reset, stash, clean, switch or overwrite somebody else's dirty tree.
3. Rank actual named corpus gaps. Pick one semantic family and an unchanged
   original app that needs it. Write the exact contract from pinned original
   source, including edge cases, ordering, timing and invalid/null/undefined data.
4. Demonstrate the current failure against actual original execution. Preserve
   source/inputs, command, versions, logs and original outcome. A harness failure
   is evidence about the harness, not an app bug.
5. Implement the native semantics. If new authoring words/schema are necessary,
   add them to shared producer, parser/decompiler, native Blocks metadata and
   runtime, then update importer/exporter and graphics/resource persistence.
   Reuse arrays extensions where appropriate, with real identity semantics.
6. Test original native behavior, authoring roundtrips, assets and browser users
   separately. Run affected regressions, not an indiscriminate local full build.
7. Commit implementation; record its immutable tested SHA. Keep prose/receipt
   checkpoint separate so the receipt never claims its own future hash was tested.
8. Normal push and draft PR with explicit base/stack and bounded evidence.
   Use a body file/structured argument, preserving real newlines. Archive raw
   private originals plus source patch/receipt/checksums before disposal.
9. Refresh all enabled exact-head checks. Merge only with authorization, all
   required checks successful, reviewed head matching and declared skip policy;
   use `gh pr merge ... --match-head-commit <reviewed-SHA>`. A green older head,
   subset of jobs or broad heavy shard does not clear a failed Arcade journey.
10. Re-measure the unchanged locked corpus when importer coverage actually
    changes. Record hashes, denominator and changed rows; update all capability,
    GUI, lane, receipt and handoff sections affected by the new evidence.

Parallel agents require explicit authorization, isolated worktrees and disjoint
file ownership. Do not delegate overlapping edits to the central importer or VM
class. Root integrates and reviews; a read-only independent audit is useful when
it can compare an exact final source/evidence boundary.

## 10. Original-PXT comparisons and clock methodology

`runPxtArcade` compiles `main.ts`/`pxt.json` with the prepared pinned target, serves
its actual simulator in Chromium, uses the original runtime/class dispatch/fiber
scheduler and returns scalar globals. Supply dependencies for optional packages
(e.g. multiplayer or color-coded tilemap). Use `waitForGlobals` for callbacks
that continue after main returns. The helper's completion is not a full-game win.

For complete planes, capture original `screen.getPixel(x,y)` into19200 palette
indices after the frame rendered. Prefer indexed values over RGB: custom
palettes, duplicate RGB colors and explicit color-zero writes can hide errors.
Compare native `bwArcadeDeviceState.sceneFrame.pixels`, coordinates, IDs, flags,
image dimensions, aliases and memberships independently. Hashes alone need
collision/boundary awareness; preserve actual pixels for failures.

For scrolling, the fixture registers an original diagnostic-priority150 handler
(after render90), records every original `game.eventContext().deltaTime`, captures
every observed bubble image and samples completed stage planes. Speech is
created after three update callbacks, not only at startup. Replay those exact
deltas through native `ARCADE_FRAME` events after authored initialization. Compare
all observed bubble pixels, the full samples and an actual return to the initial
image after scrolling. Test default speed, duration-dependent speed and both
6x8/12x12 font selections. Arbitrary wall-clock pauses and a different number of
native frames are not a valid timing comparison.

Current result at `7b158d559`:45 distinct checks, zero failures/skips. Shared
batch44 plus final3 repeats/strengthens two cases and adds international text.
Final traces replay921 frames, compare915 bubble images/1303328 pixels and
41 full planes/787200 pixels. This does not qualify suspension/modal clocks,
yielding scrolling constructors, complex reentry or shipped GUI presentation.
See `test/makecode-arcade-native-speech-scroll.test.mjs` for the runnable method.

## 11. Native pitfalls established by original execution

- Negative kinds keep scene/physics/creation callback identity, but original
  `allOfKind(-1)` is empty. Do not exclude negative sprites from overlaps.
  Observe bubbles through `sprites.onCreated(-1, ...)`.
- The legacy bubble is a real independent sprite/image with its own ID, z and
  callbacks. Creation handlers see blank artwork before Ghost/camera/text.
- Original owner destruction leaves the independent legacy bubble alive; owner
  updates and its expiry stop. Earlier assumed automatic cleanup was corrected.
- Native flags differ from the glyph bridge: RelativeToCamera512 maps to2;
  native Ghost7168 corresponds to all three ghost-through flags.
- Restore the originating shared BlockUtility thread/sequencer around Promise
  continuation and creation completion. Do not use whichever callback last
  mutated the shared utility. Respect project epoch and canceled callers.
- Copy global deadline semantics separately from per-scene suspended frame clocks.
  Capture native hitbox top before yielding constructor callbacks; scale/rotation
  and blank artwork invalidate a display-width mask-row guess.
- Initial scrolling hold reads the owning scene current delta, including
  creation within an update callback and resumption after optional allocation.
- Compare booleans as booleans, arrays/handles by semantic identity, NaN and
  signed-zero where relevant. Do not normalize failures to success defaults.
- Native images exist at spawn. Image mutation must preserve shared aliases,
  clone isolation, actual pixel buffers, hitboxes and renderer skin cleanup.
- `sceneFrame.coverage` currently includes background/tilemap/sprites/modernSpeech;
  renderables/HUD/legacySpeech/effects remain gated in `remaining`. Do not expose
  global `screen.clone()` as a background copy or advertise a completed screen API.

## 12. Authoring, assets and conversion permutations

For every newly supported family check the complete chain:

- Original TypeScript/project import to readable pseudocode, without named gaps.
- Pseudocode to native Blocks with correct argument/menu sockets and reporters.
- Blocks back to Code, including callbacks, captures, references and aliases.
- Native execution with actual costumes/resource uploads.
- SB3 save/load/green flag with exact indexed images and source/metadata intact.
- MakeCode export plus original compile and execution with real dependencies.
- Reimport that export and run again; include repeated/permuted conversions.
- Real GUI file chooser/Code entry, To blocks, Blocks editing, graphics/resources,
  controller pane, Stop/restart, save/reload and exported file reopen.

Pass `uploads: imported.costumes, storage: true` to `runProgram` for asset tests.
Keep plain-text `.bw` limitations distinct from binary SB3 preservation. Sprite
images, animation frame/resource identity, JRES/factory assets, palette metadata,
tile maps/wall layers/scales and layered editor sources need their own receipts.
The animation interchange document and ledger provide these contracts.

## 13. Commands and integration discipline

Run from the owned consumer root with Node22 and the prepared dependencies.
Machine-specific binary/dependency/corpus locations are in the local companion.
After **every VM source edit, including formatting**, apply the overlay before
fresh bundle tests:

```sh
node scripts/apply-vm-overlay.mjs
node --test --test-concurrency=1 --import ./scripts/lib/register-gui-scope.mjs test/makecode-arcade-native-speech-scroll.test.mjs
node --test --test-concurrency=1 --import ./scripts/lib/register-gui-scope.mjs test/arcade-browser-bundle.test.mjs
```

Other focused tests: `test/makecode-arcade-native-legacy-bubble.test.mjs`,
`makecode-arcade-speech-hitbox.test.mjs`, `makecode-arcade-speech-hitbox-roundtrip.test.mjs`,
`makecode-arcade-legacy-speech-camera.test.mjs`, `makecode-arcade-speech-global-clock.test.mjs`
and `arcade-speech-render.test.mjs`, all under `test/`.

Producer adoption is explicit and sequential:

```sh
node scripts/sync-sb3creator.mjs --dir "$ARCADE_PRODUCER" --pin
node scripts/sync-sb3creator.mjs --dir "$ARCADE_PRODUCER" --check
npm run integrate
```

`ARCADE_PRODUCER` is a reviewed local source checkout, not an arbitrary current
main. The producer must be committed at its reviewed SHA before sync; `--pin`
is a deliberate dependency adoption. Check both overlay/prepared mirrors and
run producer tests and the consumer dialect gate. Source tests use owned source;
`BW_INTEGRATED_ROOT` is an explicit dependency override, not source substitution.
A stale prepared extension cannot qualify current source.

The existing CLI reports unsupported elements and compiles with original PXT:

```sh
node scripts/makecode.mjs to-sb3 input.mkcd -o artifacts/imported.sb3 --bw artifacts/imported.bw --target arcade
node scripts/makecode.mjs to-project artifacts/imported.sb3 -o artifacts/exported.mkcd --target arcade
node scripts/makecode.mjs to-ts artifacts/imported.sb3 -o artifacts/exported.ts --target arcade
node scripts/makecode.mjs to-hex artifacts/imported.sb3 -o artifacts/game.uf2 --target arcade --board rp2040
node scripts/compat-audit.mjs --target arcade --out artifacts/audit.json --corpus-commit "$ARCADE_CORPUS_SHA" --compile --execute "$ARCADE_CORPUS"
node scripts/conversion-roundtrips.mjs --out artifacts/roundtrips.json --corpus-commit "$ARCADE_CORPUS_SHA" --compile "$ARCADE_CORPUS"
```

These are examples, not a command to build hardware firmware or perform flashing
for the current speech lane. CLI exit codes:0 complete,1 compile/refusal failure,
2 usage error,3 unsynced runtime. `--execute` audit smoke is bounded, not semantic
proof. The corpus-commit argument is a declaration; verify its tree and file
hashes independently. The report distinguishes start/end source/pin/version
identity and records dirty state; do not describe dirty-source results as clean.

`collect-makecode-corpus.mjs --out ...` collects inputs/provenance, while
`capture-arcade-import-corpus.mjs` captures current test importer inputs for the
dialect gate. They are different corpora. Do not rewrite the locked original184
inputs to make a regression disappear or regenerate fixtures without review.

## 14. Real browser qualification

Primary journey: `scripts/verify-arcade-rotation-browser.mjs`. Despite its name,
it now also covers imports, typed helpers, arrays, multiplayer, palettes,
following/layers, scroll/copy, tiles and dialogs. It opens files, uses visible
Code/Blocks and real controller controls, records runtime diagnostics and saves
screenshots. Other focused `verify-arcade-*.mjs` scripts cover resource/schema,
animation, terrain, scenes, physics and graphics families.

For an already built source-matching app:

```sh
PROOF_URL=http://127.0.0.1:8620/ node scripts/verify-arcade-rotation-browser.mjs --out artifacts/arcade-browser/current.json
```

The loopback URL is an example port, not a claim that a matching server is active.
Check served bundle identity and build profile. Run actual PNG decode readiness
and canvas dimensions before samples; do not replace intended palette/image
assertions with generic nonblank checks. Headless native indexed frames do not
prove the GUI compositor presented those pixels. Read job artifacts, not only a
summary or heavy-shard success. Use hosted full builds on the constrained host.

## 15. Evidence storage, licensing and publication

Public Markdown/receipts hold source URLs, public relative paths, exact SHAs,
contracts and bounded conclusions. Operator paths, credentials, hosts, raw logs,
private receipt URLs and corpus locations belong in the ignored local companion
or private evidence repository. The companion path is excluded by `.gitignore`;
never force-add it. Review diffs for accidental absolute paths/private links.

Preserve failed and passing invocations separately. Record source SHA, base and
producer pins, input hashes/manifest, original target/core versions, test counts,
actual build profile, original/native outputs, raw logs and check identities.
Archive explicit filenames with SHA256SUMS and a source patch to the final docs
head. Avoid broad artifact globs. If a failed oracle was overwritten, state that
only its failure log remains; never reconstruct a trace and call it original.

PXT source is used under its retained license/attribution, with notices preserved.
`speech-native-legacy.js` is an attributed resumable adaptation, not unchanged
original source or a clean-room rewrite. `speech-pxt.js` and font data are retained
comparison sources. Inspect `THIRD-PARTY-NOTICES.md` and exact corpus manifest
licenses before redistributing assets. User requested independent implementations
for missing TurboWarp-specific features: do not copy its implementation to fill
those gaps or claim SB3 structural tests establish TurboWarp equivalence. Existing
Scratch/PXT-derived components retain their own notices; no blanket clean-room
or license-clearance claim.

## 16. Next lanes and acceptance criteria

1. **Hosted layer/display failure:** preserve the exact failed report; prove the
   correct native indexed pixels and real visible centre palette pixel, then
   pass A/B z-change cycles and the complete source-matching browser journey.
2. **Speech reentry/scene/suspension:** original/native yielding creation and
   destruction, nested say/clear/destroy, owner/scene changes, project reset,
   long scrolling across suspension/modal changes, exact frame/ID/callback order.
3. **Live-image hitbox timing:** original mutation revision/cache/refresh order,
   scaled/rotated/blank image changes and constructor offset snapshots; do not
   assume recomputation at every API call is original behavior.
4. **Completed screen composition:** S01 closure, real global image identity
   and `screen.clone`, paint/shade/renderables ordered by z/id, HUD and effects;
   compare actual original planes before changing the coverage marker.
5. **Authoring/resource closure:** implement ledger GUI gaps across menus,
   Code/Blocks, graphics, tiles/animation/JRES/palette persistence, full authored
   game -> save -> export -> original run -> reimport -> edit/run.
6. **Corpus closure:** rank actual remaining named gaps, implement one family
   at a time, remeasure unchanged inputs and preserve changed rows. Repeat across
   extensions and normal MakeCode without substituting parser success for games.

Each lane finishes with concrete editable/runtime/original/GUI evidence and a
bounded receipt. Do not estimate a zero-partial date from these test counts.
