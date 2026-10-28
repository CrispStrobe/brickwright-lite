## Arcade AshFactory seeded-entropy unit fix — 2026-10-20

CLAIMED and CHANGED in this PR (test only). Envelope:
`test/makecode-arcade-particle-effects.test.mjs`, `test/helpers/pxt-arcade-runtime.mjs`
(new opt-in `fixedEntropy` option) and the intermittent-gates section of
`docs/ARCADE-888-OPEN-FAILURES.md`. No product, generated particle runtime,
workflow, pin or expected-value change. Root cause and evidence are in that doc.
