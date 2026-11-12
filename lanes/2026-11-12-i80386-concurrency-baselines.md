# 386 workflow baseline reconciliation

Owner: delegated CI gate repair lane. Status: CLAIMED.
Base: ca1329ffb00e (main).

Own only `test/i80386-hdd-gui-actual.test.mjs`: reconcile its frozen workflow
byte guards with reviewed concurrency policy commit 4be93d2bfd422acdc3f776a73b72d099813538e1.
Preserve every original SHA-256 guard through an exact, closed reverse projection
of that policy; reject changed, missing or duplicate policy and unrelated drift.
No workflow file, trigger, job, one-shot route, threshold or dependency changes.
Qualification: focused lightweight Node tests and independent historical-byte
comparison plus mutation controls. Integrate into the existing Arcade PR as one
batch; no additional hosted run or claim-only PR.
