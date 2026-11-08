# Robot Lab Q1+Q2 — Loop Relay, Parity Dial, Counter Slide geometry and promotion

Status: ACTIVE — claim and change in one PR.
Owner: Claude, Robot Lab Q1/Q2 lane.
Branch: `lane/robot-q12-20261108`.

Scope (section 000 of `docs/ROBOT-LAB-QUALIFICATION-HANDOFF-20261028.md`,
`lanes/2026-11-03-robot-lab-pending.md` Q1 and Q2): `.ldr`/`.mpd` geometry of
`looprelay`, `paritydial` and `counterslide` (static/sim-lab/models); their
contracts in `docs/data/robot-lab-qualification.json` with the trial values
recorded in the checkpoint (input floors 178°, 88°, 98°; frozen outputs
`indicator_hand`, `dial_left`, `rack_low`); then, for models that requalify,
the promotion surfaces #1668 used (registry move, generated catalogue and
lessons, mechanisms, source fixtures, enumerating tests) and checkpoint records.
`test/bw-sim-models-solid.test.mjs`, judges and thresholds are not loosened.
