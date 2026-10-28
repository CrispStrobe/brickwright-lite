# Debugger run-to inspection gate: observe states, do not poll past them

- Owner: Robot Lab measurement lane
- Scope: `scripts/verify-debug-run-to-inspection.mjs` only.
- Change: latch the brief `running` phase with a MutationObserver armed before the run-to
  click; wait for the run-to control to be enabled and for the selected inspection's panes to
  render recorded evidence before reading them. Assertions unchanged.
