## Stratified CLI instrument regression harness — 2026-10-17

SCOPED HANDOFF — implementation not started; no active implementation owner
after this documentation closeout. Preparation branch
`lane/instrument-regression-20261017`, exact base
`e2225bb05eb2464e31100de3a8060f59ab6f3062`. The user explicitly permits
preparing this harness in parallel with iOS release work. Execution of the
actual campaign remains after TestFlight; no mobile/release ownership takeover.

The closing session releases this prospective implementation lane. A fresh
agent must refresh main and PR1043, check overlapping claims, then publish and
merge its own implementation claim before coding. This is not a finished
harness or an executed campaign. The current status, case grid, file boundary,
negative controls and follow-up acceptance are specified in
[the implementation handoff](docs/CIRCUIT-INSTRUMENT-REGRESSION.md).
This closeout changes only this ledger, `PLAN.md`, `ROADMAP.md` and that handoff;
the future implementation boundary below is unchanged.

Bounded envelope: this ledger; `PLAN.md`;
`.github/workflows/circuit-instrument-regression.yml`;
`scripts/circuit-instrument-regression.mjs`;
`scripts/lib/instrument-regression-cases.mjs`;
`scripts/lib/instrument-regression-compare.mjs`;
`test/circuit-instrument-regression.test.mjs`;
`docs/CIRCUIT-INSTRUMENT-REGRESSION.md`. No package, lock, pin, production model,
GUI, existing workflow, iOS helper, private corpus payload or deployment edit.

Implement a deterministic manifest of 312 parameter cases across 12 authored
topology templates: resistive 64, RC 64, RL 64, explicit diode DC 48, explicit
NPN DC 24, nominal LM741 24 and ADP7118 startup 24. Preserve distinct direct
ngspice (264) and analytic model (48) reference classes. These are planned
parameter cases, not 312 imported schematics, predicted passes or physical
accuracy evidence. Freeze clocks, signs, selectors, model cards and tolerances
before results; preserve all refused, failed and not-run cases in denominators.

Use the actual installed consumer CLI and independently verified pinned package
sources, never a sibling checkout override. Keep raw input/reference/output
and source/work receipts. Pure tests must reject numerical, current-sign,
clock, missing/duplicate observation and aggregate denominator mutations, not
merely unrelated parser refusals. Manual-only hosted campaign; no automatic
campaign or dispatch during preparation. Merge this claim before implementation;
require focused controls and all enabled exact-head qualification before landing.
