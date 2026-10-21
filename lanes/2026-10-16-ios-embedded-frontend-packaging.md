## iOS embedded frontend packaging — 2026-10-16

DONE candidate — Codex root, branch
`lane/ios-embedded-assets-only-20261016`, base main `664a37b57`.
The user requested a smaller iPad build and continued coding. The signed
192.21 MiB app contains an 82.45 MiB executable (76.21 MB of __const) plus
another full uncompressed frontend under `assets`. Tauri 2.11.5 release
protocol serves `manager.get_asset` from the generated embedded asset provider;
this application's mobile code does not open the copied frontend via filesystem.
Own only the generated iOS preparation script, its packaging regression test,
this ledger and narrowly necessary native packaging documentation. Remove the
redundant frontend Resources entry while preserving the build inputs, Rust
embedding, asset catalog, other resources and static linker entries. Refuse to
change behavior for a different generated project shape. No Rust features,
frontend/provider pins, runtime logic, desktop/Android packaging or CI budget
changes. Require repeat-preparation controls, real release archive inspection,
strict signing and an offline iOS simulator launch if available. Physical iPad
and WeDo acceptance remain pending hardware availability; no launch is inferred
from compilation. Merge this claim to remote main before implementation and
qualify all enabled final-head checks before landing source.

Claim PR1018 merged as 6420faaef before implementation. The preparation writer
now resolves the generated source-root frontend folder and removes only its
Resources build-file/phase references. Other identically named folders, asset
catalogs, static linker inputs and staged frontend files remain. Four packaging
controls pass on genuine Node22.23.3, including repeat preparation and refusing
an unknown folder layout without modifying its project. Real native archive,
signature and offline simulator proof are being run on this candidate; no new
size or runtime acceptance is claimed until those results exist. Final enabled
exact-head hosted checks remain required before source merge.
