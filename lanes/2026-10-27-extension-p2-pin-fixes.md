# Extensions P2 block fixes: pin adoption — 2026-10-27

Status: CLAIMED and implemented in the same PR (small adoption, one owner).
Owner: Robot Lab measurement/handoff lane.
Base: current main at PR creation.

## Change

Adopt CrispStrobe/extensions `cc7b802cd4c149d401ef0d289baa975aed6ea443` (#68):
micro:bit+ `set pin pull` reads its declared `PULL` argument, and NXT
`raw value of sensor` returns the raw ADC word (GETINPUTVALUES bytes 8–9).

Owned paths: `scripts/spike/bundled-upstream.mjs` (UPSTREAM_COMMIT),
`vendor-pins.json` (`legonxt` only), the regenerated
`bundled-upstream-pins.json`, the `microbitplus` and `legonxt` bundles, `test/extension-p2-pin-fixes.test.mjs`, and the P1/P2 section of
`docs/ROBOT-LAB-AGENT-HANDOFF.md`. `scripts/spike/vendor-bundles.mjs` now
records a per-entry pin even when it equals the global commit, as
`test/bundled-extensions-match-upstream.test.mjs` already requires.

Every other vendored bundle is byte-identical after re-vendoring.

Gallery pins are not re-synced here: their drift check is advisory and the
current drift is other owners' upstream releases.

## Qualification

Every enabled exact-head check SUCCESS (declared skips only). No browser
tier is touched: two bundle bodies, pins and a sandboxed unit test.
The SPIKE `A+B` writer report was not reproduced; no change for it.
