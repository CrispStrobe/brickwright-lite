ADP7118 finite precision stream package adoption — **DONE candidate 2026-10-04**,
Codex; branch lane/adp7118-stream-package-adoption-20261004.
Exact main base f246c712a63e510d106266f806a3c2caeb6b4f3c; canonical claim 2bb56e40a
merged first. Candidate moved from wt-lite-adp-stream-20261004 to isolated
[local path omitted] because shared-volume ENOSPC
prevented safe lock/ledger writes; the code and package scope did not change.
Board 31c6499a617e274505386dbbc9d3a955e8f527ac (CI 37146153959/Harris 37146153948)
and CUI e3a3ffe6fa5eca6edac7aef249a90c46efb6a514 (CI 37176374150/37176864926)
are landed upstream and green. Root/GUI exact specs and locks, package notices,
census, 8086/matrix reports and pin-stale controller/ROM provenance regenerated;
locks change only these two packages' specs/resolved identities/integrities.
Root installed npm-pack bytes match all 10,367 Board/1,301 CUI files and resolve
one engine. Installed CLI tests preserve interactive/batch cases and prove two
loads at 100kHz/45kHz: provisional actual clocks, real scope sample timestamps
including the short final chunk, analytic waveform/window mean, signed output
current and terminal KCL, exact native limits/work/step/count and final receipts.
Real 90kHz cumulative budget refusal and ordinary-advance bypass both refuse
success artifacts; the existing zero-sum/stale-VIN mutation stays load-bearing.
Final focused consumer/provenance checks: 102/102 pass, zero skips. All seven
generator checks plus package notices pass. History-aware pin/fetch/mirror
checks: 30/30; ROM/build sources across 0f009205..31c6499 are byte-unchanged,
as are the controller bundle and firmware binaries. Three additional firmware
pin fields were repaired after the full-history gate exposed them. Only exact
pin assertions move in the five other physical-part package tests. No source
fork, model/solver/tolerance, other pin, corpus, application wrapper/UI, browser
harness, workflow or deploy-policy change. Actual entrypoint remains installed
bw-circuit-ui/bin/bwc.mjs; this is not a GUI precision-streaming claim. One final
exact-head hosted Build precedes guarded normal landing; publication remains
a separately verified step. GUI installed-byte/browser proof is hosted, not
claimed locally; the implementation commit identifies its own candidate head.
