# CI input census and ULA adoption — 2026-09-09

Base: Lite `ca069deb9`; candidate branch `ci/immutable-inputs-wip`.
Policy: [UPSTREAM-WIP.md](UPSTREAM-WIP.md). Update an adoption SHA when taking
reviewed upstream work, not on every upstream push. This remains active WIP.

## Input ownership and census

| Consumer | Authority and outcome |
| --- | --- |
| bw-circuit-ui | Existing PR 16 already pinned the sibling helper. PR 19 extends discovery to every workflow and invoked script imports; `.github/ci-siblings.json` remains authoritative for bw-board/bw-parts and `CORPUS.json` for sb3-creator. Five helper invocations plus one corpus clone. |
| sb3-creator | Two external checkouts retain `test/fixtures/siblings.json` authority. PR 12 rejects a new unpinned checkout or clone in another workflow or an invoked script. |
| bw-board | Existing `test/ci-external-input-pins.test.mjs` derives seven external sites, including the labwired build script; four pin/action mutation tests pass. No duplicate pin registry added. |
| Lite | Nine Actions external checkout sites across 13 workflows. Three vendor checkouts now read validated `vendor-pins.json` outputs directly; missing/fetch-failed pins cannot fall back to HEAD. stc-compiler is fixed at reviewed green `79df4b6d37c78e463f5c1d8caa3cfaa7712935ad`. Existing whole-tree fetch census retains individually named graph/discovery operations; its 11 mutation probes all fail for their intended reasons. |

The shared workflow scanner is owned by bw-circuit-ui; sb3-creator and Lite
carry byte-identical copies. These are tooling copies, outside vendored source
roots. Its scope is recognized workflow checkouts, direct script invocations
and relative imports. It does not claim to interpret arbitrary dynamic shell or
JavaScript. New syntax requires explicit fixtures and execution-path review.

## Complete ULA contract

Upstream PR 4 merged as `fe523c1ae10cb566e2d50862fd0ff0ab593975c0`.
Exact merged-head CI run **34314765284** passed test, vectors, corpus and
vectors186; the optional vectors-full job was skipped by its normal condition.
The machine save/load consumer already delegates to the ULA: no additional
machine implementation is needed upstream.

The ULA snapshot now owns held-key rows, speaker-edge records, EAR edge records,
consumed-edge index and EAR level. New machine-level tests prove continuation
and detached nested storage; all three fail against the previous source.
Historical snapshots missing all five fields retain the former reset behavior.
Partial modern snapshots are refused. Focused upstream suite: 16 pass, zero
failures, four existing missing-ROM skips.

Lite adoption moves `8deff2a2f` to the exact merged SHA. The intervening source
range also carries the already-green emu8051 exact-address contract at
`facef91`; Lite already enforced the same range and published run-to support.
The graft shares the upstream named maximum and refusal text while retaining
Lite's other debugger changes. Only zx-ula.js leaves the divergence inventory:
15 to **14** declared bw-board source forks. Both production mirrors agree.

Regenerated census, capability report, language matrix, vendor index and BIOS/
demo provenance. BIOS source and all ROM binaries are byte-unchanged. BIOS
`--record` initially found an identical binary on an unrelated history branch;
rebuilding with `--write` from the exact adopted source reproduced the existing
hash and generated correct provenance, without weakening the ancestry check.

Local adoption suite: 44 pass / 0 fail / 1 existing environment skip; focused
Z80 checkpoint plus CI-input tests: 7 pass before the additional duplicate-ref
fixture. Polarity re-derived on the candidate: seated 745 attempted / 54
undecided / 691 agreeing / 0 inverted; flat 674 / 49 / 625 / 0. All four
mutations caught on each surface. Hosted Lite verification is required before
landing; PR receipts record the final exact candidate and results.

Upstream test-only CI changes do not require changing Lite's shipping CUI or
sb3 pins. Their source payload did not change. This is an example of avoiding
unnecessary SHA churn while still publishing shared improvements upstream.
