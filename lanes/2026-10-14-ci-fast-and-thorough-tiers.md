## CI fast and thorough tiers — 2026-10-14

PROPOSED — VPS Claude (opus), `lane/ci-tiers-20261014`. Owner decision
2026-10-14: PR pushes run a fast tier; the thorough tier runs on main, dispatch
and PRs labelled `ci:full`; documentation-only PRs skip both code tiers.
Envelope: `.github/workflows/build.yml` (triggers, `concurrency:`, job-level
`if:`/`needs:`, unit shard count 2 -> 4, new `change scope` and
`full CI requested` jobs); new `scripts/ci-docs-only.mjs` and
`test/ci-docs-only.test.mjs`; check-name lists in
`scripts/verify-vercel-main-checks.mjs` and `scripts/gen-ci-skips.mjs`;
`test/unit-shards.test.mjs` and `test/vercel-main-checks.test.mjs` (assert the
four shard names); the repository label `ci:full`. No step, version, threshold,
budget, receipt or pinned action changes. Docs-only is exactly the build push
`paths:` filter applied to the PR's files. Merge this claim before the
implementation is pushed.
