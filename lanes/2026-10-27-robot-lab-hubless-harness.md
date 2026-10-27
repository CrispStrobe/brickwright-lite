# Robot Lab qualification harness: hubless and motorless models

Status: CLAIMED and implemented in the same PR (claim and change together).
Owner: Robot Lab qualification harness lane, isolated worktree.
Base: main `62489568202`.

## Owned scope

- `scripts/qualify-robot-lab-models.mjs` and the validation logic and helpers in
  `scripts/lib/robot-lab-qualification.mjs`. A model-batch lane may still add
  one judge import line and its judge ids to `QUALIFICATION_JUDGES`.
- `test/bw-sim-qualification.test.mjs` (hold check, disconnection control,
  negative controls for the new path).
- New `scripts/lib/sim-lab-hubless-judges.mjs` (Phasor Twin and Pivot Exchange
  judges).
- Promotion of `phasor-twin` and `pivot-exchange` through the contract, MODELS,
  catalogue, mechanisms, lessons, dialect lists, source fixtures and checkpoint.
  Model and program bytes stay unchanged. `phasor-twin-control` and
  `pivot-exchange-wide` stay experimental.

## Rules

- A hub model keeps exactly its reviewed hold check (hub controller `hold`,
  port not busy). Only a contract that declares `hubless` reads the Robot Lab's
  own lab-direct controller, and must name its observation base part. Only a
  contract that declares `motorless` may have no port.
- No threshold, baseline or existing contract is changed.
