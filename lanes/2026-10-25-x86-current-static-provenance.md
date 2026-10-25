# Current static provenance identity for the qualified Board adoption

CLAIMED — Codex x86 owner, coordinated with the meter/ADC package owner.
This documentation-only claim must merge before implementation. The package
owner retains its pin, lockfile, dependency, generator and installed-GUI scope.

Own only this claim and the `bwBoardPin` field in these existing records:

- `overlay/scratch-gui/static/dos/msdos200-base.provenance.json`
- `overlay/scratch-gui/static/roms/cpm-roms.provenance.json`
- `overlay/scratch-gui/static/roms/free-386-bios.provenance.json`

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

Compose the reviewed three-field contribution normally with the package
owner's actual qualified pin and dependency update; do not land it against
the previous package pin in isolation. Require complete supplier histories,
the full pin/provenance gates, all fourteen current GUI groups and every
enabled exact-head check on the final joint source before adoption. Preserve
original failures. The separate finite-V7/V8 migration, historical-role policy
and actual-event selection remain outside this task.
