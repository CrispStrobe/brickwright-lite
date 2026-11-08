# Robot Lab P4/P5 — piece minimum removal, small-model qualification, Loop Relay disconnection

Status: DONE 2026-11-08 — P4 harness fix landed in #1669; P5 validator change
and Helixgate promotion in #1668. Loop Relay, Parity Dial and Counter Slide
stay experimental: they fail the construction gate (see the checkpoint).
Claimed 2026-11-07. Branch `lane/robot-piece-minimum-20261107`
(P4 may land separately on `lane/robot-looprelay-20261107`).

Scope (section 00 of `docs/ROBOT-LAB-QUALIFICATION-HANDOFF-20261028.md`):
- P5: drop the `>50` bound from the contract validator in
  `scripts/lib/robot-lab-qualification.mjs` (integer/positive kept), add
  `test/robot-lab-qualification-parts.test.mjs`; after PR #1639 merges,
  qualify Helixgate, Parity Dial and Counter Slide through the normal
  pipeline including the construction gate and promote those that pass.
- P4: diagnose why Loop Relay's disconnection run loses the hub
  observation base; fix with a justified removal or a separately reviewed
  harness change. No part swaps to get green.

Paths: the validator and its test, `docs/data/robot-lab-qualification.json`,
the experimental list and checkpoint, the handoff, this file.
