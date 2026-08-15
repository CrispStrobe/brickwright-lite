# Multi-wiring sweep ledger

Per `reference/arduino-cc0-campaign.md`: every part kind in the bw-board device
registry, at least THREE distinct circuits each, through `audit-solve.mjs` with
real voltage assertions. Vary: polarity, pull-up/down, series/parallel, and
deliberate wrong wirings (expected refusals).

**Coverage: `layers: engine`.** Each circuit is built programmatically and
solved on the real engine. Findings are `pass` (voltages match theory) or
`engine-bug` (escalated with netlist).

---

