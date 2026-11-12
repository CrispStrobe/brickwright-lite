# CI policy control reconciliation

Owner: Arcade CI control reviewer. Base: 9075221c4224.

Scope: test/vendor-freshness-concurrency.test.mjs,
test/cycle-core-qualification.test.mjs, test/pin-move-chain.test.mjs,
test/model-api-protocol.test.mjs, test/pages-deploy-ordering.test.mjs,
test/debug-ci-efficiency.test.mjs and a
focused test helper under test/helpers/ if needed. Reconcile the intentional
workflow concurrency policy and the already reviewed HDD control helper with
historical source guards. No workflow, dependency pin or product source changes.

Qualification: preserve original historical hashes through exact reverse
projection, independently compare projected bytes, run focused controls and
negative mutations. Keep source candidates local pending the active CI batch.
