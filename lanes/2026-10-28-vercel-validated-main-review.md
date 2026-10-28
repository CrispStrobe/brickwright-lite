# Vercel validated-main deployment review and repair

Status: CLAIMED; review of existing PR #1507, implementation after claim landing.
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
