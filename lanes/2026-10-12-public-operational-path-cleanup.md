## Public operational-path cleanup — 2026-10-12

DONE candidate — Codex, branch `fix/public-operational-paths-20261012`.
Envelope: this ledger, `docs/PACKAGE-MIGRATION-TAKEOVER.md`,
`docs/TANG-NANO.md`, `docs/VENDOR-DIRECTION-2026-09-06.md`,
`scripts/gen-bw-board-census.mjs`, its focused census tests and
`docs/generated/bw-board-census.json`. Remove machine-specific locations from
public prose and census presentation; preserve original private receipts,
source identities, pins, census observations and stable qualification fields.
No simulator, engine, peer lane or workflow changes. SPIKE installer
qualification continues in its existing separate adoption lane. Nine census
checks pass, including portable-path projection and unchanged observation/source
facts. Hosted exact-head checks and publication remain pending.
