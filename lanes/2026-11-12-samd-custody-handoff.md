# SAMD retained-evidence custody handoff — 2026-11-12

Owner: Codex SAMD custody continuation. Status: DONE in this documentation change.
Base: `faf1aa0ef95614b44bb094634dcc992e3144da4b`.
Branch: `docs/samd-custody-handoff-20261112`, isolated worktree.

Scope: this claim and new `docs/SAMD-EVIDENCE-CUSTODY-2026-11-12.md` only.
Record verified custody of retained frontend/native/engine input originals,
the outstanding browser/installed result custody, and the exact successful and
failed historical run/job contexts. Preserve the original PR1533 failed gate
and distinguish the later PR1536 fast checks from its separate full-run failures.
Existing owners' documents, source, workflows, pins and original artifacts stay
outside this scope. No original download, guest replay or new qualification run.

Qualification: independent retained-input bytes/SHA256 readback against existing
manifests; exact public metadata; added-prose privacy, links and whitespace;
all enabled documentation/source-policy checks before matched-head merge.

Result: the standalone retained-input readback matched 24 files and 284,547,326
bytes. The handoff records both missing consumer-result custody and the exact
full-run heavy/light failures, preserving the original failed PR1533 gate.
Public metadata, scope, privacy, relative links and whitespace checks passed;
this is documentation and input-byte custody verification, not a new guest audit.

Two already-retained full-run failure logs also match their prior SHA256 digests.
The handoff identifies their exact UI transitions and separately bounds the
later main run's successful step metadata; product causes remain unproved.
