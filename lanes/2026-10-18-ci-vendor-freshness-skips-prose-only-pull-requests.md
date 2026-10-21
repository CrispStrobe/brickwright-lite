## CI: vendor-freshness skips prose-only pull requests — 2026-10-18

CLAIMED and done in one PR — Claude. Free-tier runner slots: the `pull_request`
trigger of `.github/workflows/vendor-freshness.yml` gets the same nine-file
`paths-ignore` list its `push` trigger already has (BLOCKED, BUILD, CLAUDE,
HANDOFF, LANES, MBIT-BUILD, PLAN, README, ROADMAP .md at the root). Such a PR
cannot change vendor-pins.json, overlay/** or scripts/**. The push run, the
nightly schedule, concurrency and the check itself are unchanged.
