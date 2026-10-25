# CI: six required unit shards

Claimed 2026-10-25 by a Claude Code agent for the owner. Claim and change in one PR.

`unit (3/4)` ran 26–29.5 minutes of its 30-minute bound on main and was
cancelled at the bound twice. Change the unit matrix to modulo six
(`unit (n/6)`), same bound and audits, no test/assertion/skip change.

Owned paths: `.github/workflows/build.yml` (unit matrix name/shard list only),
`test/unit-shards.test.mjs`, `scripts/gen-ci-skips.mjs` (job-name set),
`scripts/verify-vercel-main-checks.mjs` (required names),
`test/vercel-main-checks.test.mjs`, `docs/ARCADE-CI-QUALIFICATION.md`,
`docs/ROBOT-LAB-AGENT-HANDOFF.md` (one name).

Qualification: all enabled exact-head checks green with `ci:full`, every
`unit (n/6)` leg well inside 30 minutes.
