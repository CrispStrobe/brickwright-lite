## A13 CPX production browser gate registration — 2026-10-16

CLAIMED — Codex,
branch `lane/a13-cpx-face-adoption-20261016`; amendment based on canonical
`d544efb23`. Merge this claim before implementation. Extend the existing A13
claim only to `.github/workflows/build.yml` for a standalone light-shard CPX
production browser gate and its failure/success receipt upload, plus canonical
`scripts/gen-gate-budgets.mjs --register` output in
`docs/generated/browser-gate-readings.json` and focused registration controls.
Reuse the existing browser job, server and immutable artifact action; introduce
no workflow or job. The new gate uses the existing provisional three-minute
floor; preserve every existing measured reading, timeout and threshold.

The gate drives the real native CPX program, pane and circuit face through
`scripts/verify-cpx-circuit-face.mjs`; it must retain actual VM output and input
assertions and upload its JSON observations. This amendment permits registration
work now, while preserving the A13 adoption order: qualified upstream CUI and
the earlier serialized STM32/translator integrations precede the final supplier
pin and full application qualification. It transfers no other owner's paths,
changes no runtime semantics, and claims no physical hardware acceptance.
