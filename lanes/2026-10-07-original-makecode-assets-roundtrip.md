## Original MakeCode Assets roundtrip — 2026-10-07

Codex continues the claimed Arcade integration lane on
`lane/arcade-original-assets-20261007`, stacked on PR710. Own native `.mkcd`
project envelope export/import, current PNG envelope decoding, corresponding
Code controls and CLI, live-original-editor qualification and capability ledger.
The live editor rejected the prior uncompressed source HEX. The original PNG
contains `{meta, source}`, which the earlier flat-map-only reader missed.
The first original editor unedited return retained both animation companions;
actual rename/timing/pixel edits invalidate only the changed resource companion.
Product source `86935c2d7d5fe4f6fae378c847d17ba2819fd18e` passes123 focused
tests,18 existing browser journeys and4 live-original-editor journeys. Final
live editor and Brickwright return have zero page errors; visible edited
playback passes. Build has zero errors and4,360,502 initial bytes. See
[the receipt](docs/receipts/2026-10-07-original-makecode-assets-roundtrip.json).
PR710 merged after all9 enabled checks passed; PR711 now targets refreshed
main. Hosted repair covers stale HEX browser/file-dialog assertions and explicit
opt-in live-editor registration:30 affected tests,7 background journeys and12
rotation phases pass locally. Final candidate CI remains pending; the corpus
still has93 partial inputs.
