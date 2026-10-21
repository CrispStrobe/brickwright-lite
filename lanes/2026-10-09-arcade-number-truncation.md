## Arcade number truncation — 2026-10-09

Codex owns `lane/arcade-truncate-number-20261009`, stacked on PR750, and
sb3-creator `feat/arcade-truncate-number-20261009`, stacked on PR75.
Implement Math.trunc as a native authorable reporter in Blocks/pseudocode and
MakeCode import/export. Qualify original PXT numbers, signed zero/non-finite
values, argument evaluation and saved-project roundtrips. Remeasure unchanged
inputs and preserve diagnostics; full browser qualification remains required.

Checkpoint implementation `6f312b838`, final producer `ef312b0a`, pin source
`fbc9c5265`: 20 implementation/adoption checks, seven final pin checks and322
producer dialect/Boolean-census checks pass. Corpus106 translated /77 partial /
1 malformed across184 unchanged inputs. Fresh browser/controller journey and
producer circuit-model fixture adoption are pending hosted qualification.
See `docs/receipts/2026-10-09-arcade-truncate-number.json`.
