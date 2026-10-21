# Preserve archived source measurement pins — CLAIMED

Owner: Codex school-circuit delivery, isolated
`docs/archived-source-pin-receipts-20261022`, base `6f74e0cf0`.

The composed model library contains an original source README describing checks
at a fixed app snapshot and its historical compiler pin. The fetch-pinning gate
already preserves its exact source checkout; replacing the README's compiler
SHA with today's pin would falsify the recorded measurement. The current
pin-move guard recognizes JSON run receipts but treats this archived textual
receipt as active code.

Own only the role classification and focused positive/negative controls in
`test/pin-move-chain.test.mjs`, plus this claim. Classify README.txt/README.md
under original `test/fixtures/model-files/<name>-source/` captures as receipts:
allow only current or previously shipped supplier pins, and continue rejecting
supplier commits that were never pins. Retain strict current-pin checks for
sibling executable/model/JSON files, generated evidence and active configuration.
Do not add an individual file/hash waiver or exempt entire fixture directories.
Keep all original fixture bytes, source-admission rules and measurement claims.

Merge claim before implementation. Verify the real historical README passes
without modification, never-pinned supplier SHA mutations still fail, and the
same past pin in active code remains a failure. Run complete pin history and
fetch-pinning controls and the final composed candidate's hosted qualification.
No numerical threshold, corpus allowance, runtime or workflow change is scoped.
