# Live Arcade Font values

PROPOSED. This source audit defines a future qualification slice. It does not
admit Font values, change fixed metric selectors, or qualify complete libraries.

## Source authority

The selected screen implementation is byte-bound to PXT common packages
`31abf23d118f35010fb75122e60a1eb2b6dffe9f` (`v14.1.4`):

- [Font records, selection, scaling and printing](https://github.com/microsoft/pxt-common-packages/blob/31abf23d118f35010fb75122e60a1eb2b6dffe9f/libs/screen/text.ts),
  SHA256 `2ff6f11be61e3953a316ab3655c405861aaac3d76043ed88da02b535fa159a33`.
- [Unicode glyph resource](https://github.com/microsoft/pxt-common-packages/blob/31abf23d118f35010fb75122e60a1eb2b6dffe9f/libs/screen/font12.jres),
  SHA256 `2347313d1a7022d77108da534d3cc2f661a25c0af64befb3a139675ab0b8b46e`.
- [MIT source notice](https://github.com/microsoft/pxt-common-packages/blob/31abf23d118f35010fb75122e60a1eb2b6dffe9f/LICENSE).
  Preserve the existing Adobe/SIL Open Font License notice for font12 glyphs;
  the source-code licence does not replace the glyph notice.

Retained consumers include [StatusBar v0.4.1](https://github.com/jwunderl/pxt-status-bar/blob/v0.4.1/status-bar.ts),
[Carnival v0.0.7](https://github.com/microsoft/arcade-carnival/blob/v0.0.7/carnival.ts)
and [Football text utilities](https://github.com/microsoft/pxt-kickoff/blob/c2c7f8193af1dafaebda3a7cda235df4c42b87ae/textUtil.ts).
The last file matches retained SHA256
`40be1c525494004354881d355ba6dc9025268cf4706617f5adae3b54ad7fdd28`.
The retained Football package was fetched at HEAD; this file comparison does
not establish equality of its entire package closure with that commit.
Keep each consumer's MIT notice and its actual source bodies.

## Observed source semantics

`image.Font` has writable `charWidth`, `charHeight`, `data: Buffer` and optional
`multiplier` fields. Constant bindings do not make their objects or data Buffer
immutable. A bounded read-only bridge must diagnose writes, including writes
through aliases, until their real semantics are separately qualified.

| Producer | Source identity and layout |
| --- | --- |
| `image.font5` | Canonical record, width 6, height 5, absent multiplier |
| `image.font8` | Canonical record, width 6, height 8, absent multiplier |
| `image.font12` | Canonical record, width 12, height 12, absent multiplier; JRES-backed glyph data |
| `image.getFontForText(text)` | Returns font12 if any UTF-16 code unit is greater than `0x2000`; otherwise returns font8 |
| `image.scaledFont(font, size)` | Coerces size with signed `| 0`; sizes below 2 return the same Font object; larger sizes create a new record sharing the same data Buffer |
| Repeated scaling | Multiplies width and height; multiplier is composed with the previous truthy multiplier |

Font5 contains 904 glyph bytes (113 records); font8 contains 5,272 bytes
(659 records). Each record has a little-endian UInt16 character code followed
by column bytes. Font12's retained JRES decodes to 202,488 bytes, 7,788 records
of 26 bytes. Selected-original qualification must also bind the compiler's
actual font12 resource generation/subsetting; an empty source `hex` placeholder
is not the live glyph buffer.

Printing consumes the actual Font object. Omitted or falsy Font chooses
`getFontForText`; falsy color becomes 1. Coordinates are truncated with `| 0`.
The helper searches glyph records and falls back to the initial space record.
It iterates UTF-16 units, skips controls below 32, and advances a newline by
`charHeight + 2`. Centering measures the complete string's `length * charWidth`,
including its control units. Scaled printing shares glyph data and draws scaled
runs; explicit text-effect offsets remain a separate qualification surface.

## Proposed owner and resource contract

Separate an immutable resource manifest from a live Font value. The manifest
binds the source pin, glyph digest, concrete metrics and scaling recipe. Live
identity must follow the actual Font record and actual shared Buffer, not a
font-name String, a copied record, or structural field equality. This is a
mutable Font value contract: read-only admission is its first staged boundary,
not a replacement for the SDK's mutable records.

Prefer the existing canonical host-object reference and descriptor services
after their exact schema review. Reserve a distinct Font role and a canonical
reference for each actual producer object. Repeated constant lookup and scaling
below 2 preserve that reference; scaling above 1 allocates the actual new record.
Expose `data` through the actual owned Buffer service without copying on reads.
This proposal does not automatically add a canonical reference kind.

Every access checks the runtime owner, active generation and Font role. Stop,
reload, restart, disposal and foreign-runtime calls invalidate retained authority.
A same-shaped ordinary object, an assertion, a font-looking String or an old
reference cannot acquire authority. New variables and class fields may hold
and replace qualified Font references without making the Font fields writable.
Glyph Buffer writes must be refused across aliases by the actual Buffer owner
in the first slice; source-only rejection is insufficient for editable Blocks.

The next slice admits writes only after actual original mutation controls.
Write the actual Font record's fields without guessed clamping or normalization;
replace `data` with the actual owned Buffer and preserve old Buffer aliases.
Glyph mutations must be visible through every Font sharing that Buffer. Scaling
reads current fields and shares current data. The immutable manifest describes
the original resource and recipe; it cannot stand in for current mutable state.
Reconstruct authored mutations and alias topology through Code/SB3/export rather
than exporting a frozen copy of the final object.

Fresh starts must rebuild the selected per-run constant records and glyph
Buffers. A cached text module must not leak a previous run's mutations. Printing
qualification must distinguish fields captured at entry from fields read while
advancing glyphs, including mutation during a yielding call where the selected
compiler permits it. This requires the existing owned SourceFrame continuation
contract; this proposal does not claim or modify a global scheduler.

## Frontend, source cells and portability

- Define constant, text-selection, scaling and live-field reporter words with
  real connected Font operands. Preserve the existing fixed-selector metric
  words and old printing menus.
- Give source-reference declarations a separately validated `image.Font` type
  authority. Preserve atomic declaration validation, before-initialization
  undefined, scalar/reference separation and lexical namespace ownership.
- Follow actual Font producer, alias, argument, return and class-field edges.
  A type annotation or assertion cannot erase a different actual producer.
  Generic/callback support remains in its separately qualified owner lane.
- Keep `typeof` Font as `object` only after the actual Font owner is admitted.
  Do not classify Strings or arbitrary managed objects by resource spelling.
- Rebuild constant/scaled resources from a versioned, source-bound recipe in
  Code and SB3. Never persist live heap IDs as portable identity. Preserve alias
  topology, shared data and actual source before-initialization behavior.
- Export genuine `image.font*`, `getFontForText`, `scaledFont`, `print` and
  `printCenter` calls with their current operands and types. Refuse stale,
  foreign, opaque or edited owner metadata rather than inventing selectors.
- Preserve standard saved-field edits with an explicit named gap when their
  resource sidecar is stale; a declaration must not silently restore it.

StatusBar stores a protected Font field; Carnival stores font aliases and
centers images; Football forwards a scaled Font through printing procedures and
captures it in a renderable. Font admission alone closes neither class/callback
nor screen-frame ownership gaps in those consumers.

## Decisive fixture plan

| Fixture | Required selected-original and native observations |
| --- | --- |
| Constants and selection | Exact object identity, all metrics, absent multiplier, boundary U+2000/U+2001, ASCII, accented text, surrogate pairs |
| Scaling | Sizes -1/0/1/1.9/2/2.9, repeated scaling, fresh-record inequality, same data Buffer identity, exact scaled metrics |
| Glyph authority | Buffer lengths and complete bytes/digests, compiler resource binding, missing-glyph fallback; retain applicable font notices |
| Printing | Complete pixel arrays for each Font, default/falsy arguments, clipping, fractional coordinates, newline/control units, centering, scaling and colors 0/17/-1 |
| Transport | Aliases, procedure arguments/results, stored class fields, early reads, Code, same/fresh SB3, edited original export and reimport |
| Ownership negatives | Stop/restart/reload/disposal, foreign owner, same-shaped objects, assertions, literal matching handles, stale recipes and standard-field edits |
| Mutation oracle before implementation | Constant-field mutation, optional multiplier writes, data replacement, old/shared Buffer aliases and scaling after mutation; full bytes/pixels and identity |
| First-slice write boundaries | Field replacement, shared glyph-buffer mutation and hidden historical alias writes receive named refusals until independently qualified |
| Full mutable slice | Same source controls through native/Code/SB3/export/reimport, fresh-start reset, print entry/live-read boundaries and actual cancellation ownership |

Freeze source, full expected pixels, actual compiler input/binary and owner
snapshots before qualification. Capture the actual native instance per VM.
No guest or product implementation has been run for this proposal.

## Selected simulator resource and Buffer behavior

The PXT 13.2.1 compiler retains the complete Font resource for simulator output.
Its Font JRES branch filters glyph records by used characters only when
`target.isNative` is true. Hardware resource subsets are therefore a separate
boundary. This rule is explicit in the pinned
[compiler emitter](https://github.com/microsoft/pxt/blob/c40f412dc5bebb915a5891cd62fe956e198fb194/pxtcompiler/emitter/emitter.ts#L2744).
The Font12 Buffer still belongs to the current resource and run; a matching
length alone does not grant resource ownership.

Compiled hex Buffers carry a static flag. `isReadOnly()` reports that flag,
while the simulator's `setNumber` writes bytes without checking it. `setByte`
and several other mutation operations check the flag. Preserve those individual
operations; the flag is not a universal mutation policy. See the pinned
[Buffer implementation](https://github.com/microsoft/pxt/blob/c40f412dc5bebb915a5891cd62fe956e198fb194/pxtsim/libgeneric.ts#L544).
A read slice must supply its own explicit refusal at every public write entry,
including writes through another handle sharing the glyph storage.

An unattached native preparation now preserves actual Font record identity,
integer scaling, shared Buffer views and static metadata. Its complete image
oracle covers ordinary, scaled, wide and missing glyph rendering, and mutation
of shared glyph bytes. The text icon adapter preserves eight-bit image colors.
These controls qualify the native boundary. Source declarations, connected Font
words, editable Blocks, Code, saved projects and export/reimport remain pending;
no complete live Font capability is admitted by this preparation.
