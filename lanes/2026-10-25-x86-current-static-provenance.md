# Current static provenance identity for the qualified Board adoption

CLAIMED — Codex x86 owner, coordinated with the meter/ADC package owner.
This documentation-only claim must merge before implementation. The package
owner retains its pin, lockfile, dependency, generator and installed-GUI scope.

Own only this claim and the `bwBoardPin` field in these existing source records:

- `overlay/scratch-gui/static/dos/msdos200-base.provenance.json`
- `overlay/scratch-gui/static/roms/cpm-roms.provenance.json`
- `overlay/scratch-gui/static/roms/free-386-bios.provenance.json`

Also own the existing tracked mirrors of the DOS and CP/M JSON records:

- `packages/scratch-gui/static/dos/msdos200-base.provenance.json`
- `packages/scratch-gui/static/roms/cpm-roms.provenance.json`

Preserve exact overlay/mirror equality. The package free-386 provenance mirror
is ignored: refresh it through the normal integration copy or the equivalent
bounded JSON-only mirror copy, verify it, and never force-add it. There is no
dedicated writer for these three static identity records; the unrelated i8086
ROM generators must not be used, as they may assemble or replace binaries.

The target is the already qualified Board
[`836867513c3e7fac420ddaa32c17e1c7b6d3e513`](https://github.com/CrispStrobe/bw-board/commit/836867513c3e7fac420ddaa32c17e1c7b6d3e513).
Before updating a field, independently compare the recorded inputs and existing
binary bytes with the old and target supplier Git objects. Identify the actual
canonical provenance producer or document that these are static identity
records. Require exact blob, mode, byte-count and SHA-256 agreement for the
retained ROMs and all relevant DOS construction inputs. Verify the existing
DOS image against its unchanged recorded hash. If the inputs or bytes differ,
stop this identity-only task and scope the discrepancy separately.

Change no binary, assembly, builder, origin description, source hash, licence,
notice or other metadata field. No build, media acquisition, disassembly or
new guest run is authorized. Check ignored package mirrors as appropriate,
without force-adding them. Historical originals retain their exact source and
cannot be relabelled as a new observation. No broader licence or guest claim.

Compose the reviewed three-record contribution and its two tracked mirrors normally with the package
owner's actual qualified pin and dependency update; do not land it against
the previous package pin in isolation. Require complete supplier histories,
the full pin/provenance gates, all fourteen current GUI groups and every
enabled exact-head check on the final joint source before adoption. Preserve
original failures. The separate finite-V7/V8 migration, historical-role policy
and actual-event selection remain outside this task.

## Local static-identity contribution

Prepared locally for review: the three overlay records and two tracked
metadata twins now declare the qualified Board. Each tracked JSON differs
only in its single forty-character `bwBoardPin` value. The three bounded
JSON mirror copies agree exactly; the free-386 mirror remains ignored and is
not force-added. Every other field, origin, notice, source hash, binary body
and tracked mode is unchanged.

Independent old/target Git comparisons found the four retained ROMs identical
to both supplier revisions. The existing DOS image still matches its recorded
hash. Board's `scripts/build-dos-image.mjs`, `dos/iosys.asm` and
`scripts/fetch-free-dos.mjs` are unchanged. This is retained byte/source identity, not a fresh DOS image build,
media acquisition, firmware run or broader licence conclusion.

Both unchanged App Store copyleft source-reader controls pass locally, and
JSON validity, pin-only differences and tracked/ignored mirror checks pass.
The original package failure remains preserved. The package owner's joint
source, pin/provenance gates, installed graph, all current GUI groups and
exact-head hosted qualification remain pending; this component is not landed
or adopted independently and authorizes no actual event.
