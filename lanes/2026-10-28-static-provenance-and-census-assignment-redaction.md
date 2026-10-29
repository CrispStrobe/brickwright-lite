# Static-asset provenance transaction and assignment-prefixed census redaction

CLAIMED and implemented in the same PR — campaign task 6, first half only
(`docs/CIRCUIT-INSTRUMENT-REGRESSION.md` row 6). Envelope:

- `scripts/admit-static-provenance.mjs` (new) and `test/static-provenance.test.mjs` (new):
  the three retained bw-board static records (MS-DOS base image, CP/M ROMs,
  free-386 BIOS) re-admit together to the pinned bw-board or refuse by name
  before writing. Omission, absent record, stale pin, changed asset byte,
  changed supplier blob, changed DOS construction input and stale tracked
  mirror each refuse. Supplier bytes are read from local Git objects only: no
  fetch, no rebuild. Only `bwBoardPin` is ever rewritten.
- `scripts/lib/vendor-forward-packages.mjs`: the package-forward transaction
  runs the admission after the installed-byte proof and before integrate;
  staging admits the three overlay records and only the two tracked mirrors
  (the ignored free-386 mirror is never force-added).
- `scripts/gen-bw-board-census.mjs`, `test/bw-board-census.test.mjs`,
  `docs/generated/bw-board-census.json`: `=` is a location delimiter, so
  `TOOL_DIR=/x` and `--root=/x` are omitted from public output. New
  `--reproject` re-applies the projection to the committed observation without
  re-probing a host; only the one leaking `via` changed.

Not in scope: the bandwidth/coupling realism half, `docs/OPEN-TASKS-*` prose,
history, binaries, licences, pins. No asset, notice or source hash changed.
