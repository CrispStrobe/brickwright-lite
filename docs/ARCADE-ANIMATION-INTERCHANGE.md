# Native Arcade animation interchange

Status: format codec implemented and locally tested; asset exporter/importer
wiring and original-editor qualification remain open. This extends U04 in the
[GUI closure ledger](CONVERSION-CAPABILITIES-AND-GUI-GAPS.md#u04--animation-binding).
No locked corpus partial result is closed by format tests alone.

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
identity tests (zero skips), and four vendored original-export tests pass. These are separate finite boundaries:
the full controller/export/reimport browser gate is still being debugged and has
not passed. Native original-MakeCode animation asset editing is also still open.

## Original generated asset contract

Original PXT `emitProjectImages(jres)` emits `images.g.ts` with
`helpers._registerFactory("animation", function (name: string) {...})`.
Its switch checks `helpers.stringTrim(name)` and returns an Image[] for the
asset's native ID or display name. Each lookup allocates a new array; no
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

1. **Native export:** emit real animation JRES and generated factory declarations;
   use cached `assets.animation` references and explicit uniform intervals.
   Compare output with the original emitter and execute original PXT. Preserve
   computed resource-ID lookup and runtime image/array identity.
2. **Native import:** parse animation entries separately from ordinary images,
   resolve canonical namespace IDs and display names, and lower named asset
   references to persistent resource reporters. Return complete resource source
   through the shared project-import pipeline, including unused assets. Keep
   attached `animation.Animation` objects separate from named frame resources.
3. **Rich source:** design a versioned companion file listed in `pxt.json.files`,
   keyed by native asset ID. Store UUID, layered document and normalized
   dimensions/frame pixels/order/interval/palette revision. Reattach original
   layers only after exact validation against the current native asset. On a
   MakeCode edit, retain the edited native frames and issue a named stale-source
   diagnostic. Reject malformed or duplicate metadata atomically. Without valid
   metadata allocate a new UUID; do not infer identity from a mutable name.
4. **Original GUI:** open the exported project in actual MakeCode Assets, locate
   the animation, edit name/frame order/pixels/timing, save/download and reimport
   in Brickwright. Verify native asset-backed blocks and test whether the
   original editor retains the companion file. Compiler inclusion alone does
   not establish that retention.
5. **Cross-surface regression:** verify Code↔Blocks, SB3 save/reopen, Pixel source,
   controller trigger/stop/restart and exact original playback. No-edit imports
   should recover validated source/UUID; edited assets must never resurrect
   stale layers. Test duplicate/renamed/deleted resources and generated names.

Variable-duration scheduling, attached action bindings and custom-palette RGB
qualification remain distinct work. Neither the native format nor the current
uniform interval reporter should silently flatten those differences.
