# Vercel validated-main deployment review and repair

Status: DONE source candidate; hosted qualification and live publication pending.
Owner: Codex delivery coordinator, continuing the requested delivery loop.
Branch: `ci/vercel-newest-validated-20261028`, isolated coordinator worktree.
Base: `b9fa2e844` main; existing proposal head `b347912a6`.

Scope: `.github/workflows/deploy-daily.yml`, its existing deployment policy and
main-validation tests, and the exact fetch-site census rows in
`test/fetch-pinning.test.mjs` affected by replacing main-tip resolution. Preserve
the immutable-content rule, single production publish site, validation gate,
and the ancestry checks that prevent replacing newer production with an older
tree. Retain the original failed CI logs and reproduce failures before repairs.
Review executable selection and publication cases, qualify the final source on
the fast PR tier, and verify the live production version after a guarded merge.

No native release, unrelated CI policy, package pins or other owners' lanes.

Review: reproduced the original fetch-pinning failure before repair. Removed
only the two census rows for resolver lines deleted by the proposal; the scan
and its set-equality assertions are unchanged. The actual workflow shell now
runs in six executable fixture scenarios against real Git history, including
pending tips, already-current production, unknown lineage, malformed identity
and concurrent production advances. The validation service and publisher are
fixture doubles, so these are orchestration controls, not a Vercel publish.
All 35 focused controls pass. The fetch-pinning prover caught all 11 mutations
and restored its seven touched files byte-for-byte. Original CI and local
failure receipts remain retained. Merge only after the final source's hosted
fast tier is green; then confirm the live production version.
