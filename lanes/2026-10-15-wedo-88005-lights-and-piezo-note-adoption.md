## WeDo 88005 lights and piezo note adoption — 2026-10-15

DONE — Codex, isolated branch `lane/wedo-lights-adoption-20261015`,
worktree `wt-wedo-adoption-sparse`, base `5f790c24ae91931d51617ddd1e4c69e2d1e8cfeb`.
User authorized publication of the upstream fixes and this adoption claim.

Envelope: this ledger; a dedicated `wedo2unified` entry in `vendor-pins.json`
and `scripts/spike/bundled-upstream.mjs`; the WeDo bundled source and its
`bundled-upstream-pins.json` record; focused WeDo protocol tests. No other
extension or package pin moves. Upstream: CrispStrobe/extensions PR49,
`2cda0cf` (88005 brightness/off on A/B/both, Stop All, reliable piezo notes).

Validation: 25 focused tests pass (light/tone packets, existing Scratch Link
sessions, bundled extension identity including the planted-divergence negative);
immutable targeted vendoring check passes. Production compilation is being
qualified locally. iPad installation verifies app deployment; real 88005
brightness and audible-tone verification remain explicitly pending. Claim
landed as `10edc699d` before Lite implementation changes.
