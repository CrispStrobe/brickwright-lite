# bw-bundle — blocked items

## Rung 1.1: debugState.bwMs not available from runner snapshot

The debug-runner's `snapshot()` does not expose `target.bwMs()`. The runner holds the
target internally and does not make it available to consumers. `DebugStatus.jsx:33`
destructures `bwMs` from `debugState` and shows "—" when it's undefined.

**Needs:** coordinator to add `bwMs: target ? target.bwMs() : undefined` to
`debug-runner.js:snapshot()` (the returned object at ~line 118).

**Impact:** DebugStatus shows "—" for the cooperative-scheduler millisecond counter.
Halting, stepping, tasks, capabilities, and haltReason all work.

## Rung 1 note: activePartIds regex in CircuitDesigner

`CircuitDesigner.jsx:540` filters `debugState.tasks` by matching blockId against
`/setpin|toggle|writepin/`. Block IDs are opaque strings, not opcodes — the regex never
matches. The active-part highlight is dead. This is bw-circuit-ui's file; the right fix
is to derive active parts from pin state (`board.getPinStates()`), not from yield points.
Logged as "assumption, not wiring" — not blocking bw-bundle.
