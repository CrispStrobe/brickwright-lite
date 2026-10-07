# Native Arcade animation interchange

Status: native gallery export and behavioural import implemented and locally
tested against original PXT. Validated rich-source companion transport is
implemented; persistent GUI resource reconstruction and original-editor
qualification remain open. This extends U04 in the
[GUI closure ledger](CONVERSION-CAPABILITIES-AND-GUI-GAPS.md#u04--animation-binding).
The uniform-resource production-browser journey is locally qualified as recorded
in the ledger. Original native animation asset editing and editable GUI resource recovery
remain open. No locked corpus partial result is closed by these
format or synthetic authoring tests alone.

## Reached format boundary

`overlay/scratch-gui/src/lib/bw-makecode/animation-jres.js` implements native
`application/mkcd-animation` entries. Data is base64 of ASCII hexadecimal bytes:
four little-endian u16 values (interval, width, height, frame count), followed
by row-major packed bitmap pixels, low nibble first, padded per frame. This is
different from the column-major `image/x-mkcd-f4` image encoding.

The codec validates native namespace/ID and display names, timing, frame/pixel
counts, palette indices, exact payload length, padding and canonical encoding.
Its explicit application bounds are160×160,64 frames,1MiB packed bytes;
intervals are1–65,535ms. Existing GUI publication is narrower:2–64 frames,
20–10,000ms and uniform timing. Outside-policy input produces named errors;
it is not resized, coerced or truncated. Palette RGB and rich source are not
represented by this native binary format. Native IDs/namespaces are bounded
nonblank printable references, not JavaScript identifiers. Display names follow
original MakeCode asset-name rules; they are not silently sanitized.

The decoder accepts explicit native IDs/namespaces, including entries normalized
by original `Package.parseJRes`. Its raw-gallery convenience arguments use a
qualified fallback key once; this intentionally does not reproduce original
PXT's double-prefix edge case for missing IDs and already-qualified gallery
keys. Keep the original gallery key when generating native factory aliases.

`test/makecode-arcade-animation-jres.test.mjs` invokes the actual retained
Microsoft PXT worker encoder, decoder, package normalizer, emitter and name
validator. Eight tests cover asymmetric odd/even layouts, large bounds, frame counts, native key/namespace
resolution, hyphen/Unicode IDs and namespaces, and malformed input. The combined
maximum resource has an exact local roundtrip; original-worker goldens test the dimension/count bounds
separately. This is compiler-format evidence, not original asset-editor evidence.

## Adopted native authoring boundary

The shared parser [PR62](https://github.com/CrispStrobe/sb3-creator/pull/62) is
merged and the consumer now pins
[`33ce7380e388e20b7c3a30e8ea84d1b774c30248`](https://github.com/CrispStrobe/sb3-creator/commit/33ce7380e388e20b7c3a30e8ea84d1b774c30248).
At consumer source
[`96e812a23`](https://github.com/CrispStrobe/brickwright-lite/commit/96e812a2355a193bfb92cfb4b6982d82299792ad),
the canonical frame/interval resource words and native menu shadows are adopted.
Three publication-browser journeys qualify the named Blocks reporters, actual
palette drag/drop and UUID picker storage alongside Pixel publication/SB3
persistence. Eight codec tests, two highlight tests, four explicit producer
identity tests (zero skips), and four vendored original-export tests pass. The
full production controller/export/reimport journey subsequently passed at
`89700204711ce470ebb7a77e511ec960fa1e8b6d`, before native gallery wiring.
Native original-MakeCode animation asset editing remains open.

## Native wiring qualification

At source `8bca7037c`, the explicit production build passes. The full browser
journey passes six workflows with zero page errors and zero invalid playback
frames after readiness. The downloaded HEX contains a native gallery named
`Run`, three exact3×2 frames in the edited order and100ms timing, with both
asset files listed in `pxt.json`. Original PXT compiles those downloaded files
without network attempts; all19,200 same-frame screen pixels match Brickwright.
File reimport and repeated controller stop/restart pass. This is native asset
transport and playback evidence, not original Assets editor or rich-source
reconstruction evidence.

The final export/import/integrated-overlay batch passes21 tests without skips;
the browser budget/shard/timeout/wait contracts pass25. The earlier affected
export/census batch passed119 tests with two stale integrated-copy failures;
after synchronization, both overlay checks pass in the final focused batch.
The saved-zero scalar test separately passes against original PXT. Earlier
failures remain preserved, including a stopped preview server and a harness
assertion that read shared dimensions from individual decoded frames.

## Companion transport qualification

At product source `55da1b20e`, the explicit production build passes. The browser
gate passes seven journeys: its downloaded companion recovers exactly the
current source document, including UUID, frame IDs, layers and palette. A real
malformed companion file import reports the error and preserves loaded target
identities, Code and published resources. Valid file reimport, controller
stop/restart, native gallery data and all19,200 original-PXT pixels still pass;
there are no page errors or compiler network attempts. The recovered document
is not yet installed into an editable imported Pixel timeline.

The affected project/import/export/overlay batch passes20 tests; the final
companion/project/overlay batch passes17, including native galleries larger than
128 assets. All seven existing CLI tests pass, including firmware roundtrips.
Companion unit cases cover native edits, missing/unused/deleted entries, palette
remapping, source validation, duplicate identities and bounded malformed input.
The first combined run passed24/25: its new file fixture passed a source string
where the byte importer requires bytes; the corrected three project tests pass.
This fixture failure is preserved, alongside the previous hosted single stale
unclaimed-animation diagnostic test. Native fresh-array runtime semantics are
unchanged by source recovery.

## Deferred loading and final local qualification

Native gallery parsing now lives in `arcade-animation-assets.js`, separate from
shared Pixel image rendering. The earlier hosted head had pulled the codec
into startup through shared artwork helpers. At product source `9f6ace3da`,
the production React profiling build passes the existing webpack ownership gate:
initial JavaScript is4,466,111 bytes, below the unchanged4,467,136-byte limit.
The [emitted ownership receipt](receipts/2026-10-07-arcade-animation-deferred.json)
identifies all three native animation parser/codec/companion modules in a
noninitial chunk. This qualifies emitted ownership/bytes, not startup latency.

The final ordinary production build also passes. Its animation gate passes all
seven journeys again with exact companion source recovery, atomic malformed-file
refusal and19,200 original-PXT pixels. The background gate separately passes
seven journeys after observing decoded SVG corner pixels before opening controls.
The saved hosted failure showed the asynchronous SVG load closing that panel;
no fixed sleep, forced click, timeout increase or assertion waiver was added.

The translation/companion batch passes140 tests without skips; after the module
split the native import/project/overlay batch passes16. Browser budget/shard/
timeout/wait contracts pass25. The stale hosted unclaimed-tag test now asserts
separate exact diagnostics for unsupported tags and missing native animations.
The earlier hosted build and both browser failures remain preserved. Fresh
final-head hosted qualification remains required before merging PR704.

## Original generated asset contract

Original PXT `emitProjectImages(jres)` emits `images.g.ts` with
`helpers._registerFactory("animation", function (name: string) {...})`.
Its switch checks `helpers.stringTrim(name)` and returns an Image[] for the
generated gallery-key alias or display name. Canonical IDs are identities,
not necessarily lookup aliases: ordinary galleries accept a short key, custom
namespaces and nested gallery keys can require the full key. The importer
reproduces the original package/emitter rules, including wildcard defaults,
explicit empty namespaces and double-prefix normalization. Actual original
compile/simulation tests cover eleven alias lookups and reject names for which
the original factory returns null. Each lookup allocates a new array; no
factory cache or interval reporter exists. Native references use
`assets.animation` tagged templates. The original
[asset template declarations](https://github.com/microsoft/pxt-arcade/blob/2d7d59b5226e8a1a1e05e8042dd9f5248ed68fea/libs/game/assetTemplates.ts)
provide the animation block identity separately from generated declarations.

A Brickwright exporter must cache each native factory result once to preserve
its own shared frame-array identity. Include `images.g.jres` and `images.g.ts`
in `pxt.json.files`, not only generated inline image literals. Asset display
names must satisfy original MakeCode rules, with explicit mapping/diagnostics
if a richer Brickwright display name needs adjustment. Avoid duplicate native
names and generated variable collisions.

## Remaining implementation sequence

1. **Native export implemented:** published resources, including unused ones,
   emit real `images.g.jres` entries and `images.g.ts` factories. Main code caches
   each used resource once, preserving shared array identity and computed UUID
   lookup. Uniform intervals remain explicit. Native ID/display-name collisions
   and user-global namespace collisions are handled; invalid names and duplicate
   aliases produce diagnostics. Original emitter substitution and actual PXT
   execution verify exact dimensions, frame order, pixels and fresh factory
   arrays. Palette remapping precedes both native and factory encoding.
2. **Behavioural native import implemented; persistent resources open:** native
   animation galleries are parsed separately from image assets. Tagged lookups
   lower to typed image arrays with original allocation and alias semantics.
   Malformed entries and ambiguous aliases produce diagnostics. Unused assets
   are validated but do not yet become editable GUI resources. Rich documents
   and stable UUIDs arrive separately through companion recovery below; this
   lowering preserves the native factory allocation semantics.
3. **Validated rich-source transport implemented; GUI restoration open:**
   `brickwright-animation.json` is listed in `pxt.json.files`. Version1 records
   bind canonical native asset IDs to complete validated source documents and
   exact exported projections. A no-edit match recovers UUIDs, frame IDs,
   layers and palette; native name changes update the label. Pixels, order,
   dimensions, timing or project-palette edits invalidate old source with a named
   warning while retaining native assets. Malformed/future metadata or duplicate
   bindings fail atomically. Missing metadata remains valid native playback.
   The companion is limited to16MiB and128 source records; this count limit does
   not restrict native gallery imports. Recovered documents are separate from
   image-array code and are not yet installed into an editable GUI library.
4. **Original GUI:** open the exported project in actual MakeCode Assets, locate
   the animation, edit name/frame order/pixels/timing, save/download and reimport
   in Brickwright. Verify native asset-backed blocks and test whether the
   original editor retains the companion file. Compiler inclusion alone does
   not establish that retention.
5. **Cross-surface regression:** verify Code↔Blocks, SB3 save/reopen, Pixel source,
   controller trigger/stop/restart and exact original playback. No-edit imports
   should recover validated source/UUID; edited assets must never resurrect
   stale layers. Test duplicate/renamed/deleted resources and generated names.

## Next persistent-resource transaction

Keep native resources separate from costume imports. `arcade-animation-assets.js` already
returns all valid animation entries, including unused entries. These now travel
through `arcadeToPseudocode` and `importProjectFiles` with independently validated
rich documents and named recovery warnings. `applyMakeCodeImport` displays those
warnings but does not yet install the resources. Carry them into the existing
compile transaction next. Generate validated resource carrier costumes
and artwork metadata inside the SB3 before `vm.loadProject`, then use the
existing artwork/resource synchronization and Code artwork retention. Clear
pending imports at the same unrelated-file/example/project boundaries as other
artwork. A half-valid document must never replace the loaded project.

Do not append resource carriers to existing actors or Stage: doing so changes
costume/backdrop counts and index behaviour. A dedicated hidden resource-library
target needs an explicit persistent role, preserved visibility through
Code↔Blocks, and exporter exclusion from gameplay actor creation. Name-based
recognition is insufficient. Rename/delete/Undo/duplication must preserve or
renew identities appropriately. The current Code artwork retention does not
preserve such a role or visibility; implement that before introducing carriers.

Native factory references create fresh arrays and images per lookup, while the
existing Brickwright frame-resource reporter returns a shared cached array.
Live imported resource bindings therefore need a fresh-copy access operation
with correct mutation/alias semantics; replacing every native lookup with the
cached reporter is incorrect. Native files also allow one frame and intervals
outside the current GUI publication bounds. Preserve these behaviours and
report editing limits explicitly until versioned persistence/UI supports them;
do not duplicate frames or clamp timing to manufacture compatibility.

Reuse the existing bundle document validator and resource normalizer rather
than adding a second definition of valid layers. A bounded, versioned companion
must bind unique native IDs and resource UUIDs to source documents and their
exact exported projection. Compare dimensions, ordered pixels, interval and
palette against current JRES after the same palette remapping as export.
No-edit matches may restore UUIDs/layers; changed native pixels/order/timing or
palette must retain the edited native asset under a fresh identity and emit a
stale-source diagnostic. Names alone do not establish resource identity.

Acceptance must cover unused assets, multiple resources, duplicate UUID/ID
bindings, malformed/future metadata, renamed/deleted/edited native assets,
transparent pixels, custom palettes, SB3 reopen/Undo and Code↔Blocks. Test both
file and share imports. Original editor companion-file retention still needs
an actual Assets edit/save/download journey; compiler acceptance is insufficient.

Variable-duration scheduling, attached action bindings and custom-palette RGB
qualification remain distinct work. Neither the native format nor the current
uniform interval reporter should silently flatten those differences.
