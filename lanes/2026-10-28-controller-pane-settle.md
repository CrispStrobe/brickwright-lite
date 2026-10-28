# Controller-pane layout gate: read after the layout settles

- Owner: Robot Lab measurement lane
- Scope: `scripts/verify-controller-pane.mjs`, the P5 line in `docs/ROBOT-LAB-AGENT-HANDOFF.md`.
- Change: wait for a stable layout (fonts ready, ten identical frames, 15 s bound) before the
  coverage and hit-test reads; an unsettled layout fails. Assertions unchanged.
