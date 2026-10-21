## C9 — AVR instruction-cost layout investigation — 2026-10-17

DONE within the recorded native-code boundary — C9.1 intake, the bounded C9.2
explanation and C9.3 no-implementation decision are complete. Keep qualified controller branch
`lane/c9-avr-layout-20261017` frozen in the owned LabWired Core fork. This is the C9 measurement/explanation
lane, independent
of A13, the SAMD replacement work and the existing C10/STM32 adoption owners.

Own only a diagnostic profile producer and its pure controls under
`scripts/perf/avr_layout_profile.py` and `scripts/perf/test_avr_layout_profile.py`,
a separate manually dispatched `.github/workflows/avr-layout-profile.yml`,
the corresponding Core engineering report, and this task's documentation.
Keep the existing Core Perf gate, baselines, tolerances, source fixtures,
release profiles, engine/model semantics, pins, captures and ACKs unchanged.
No upstream workflow dispatch, issue/status automation or local heavy build.

First compare fixed source snapshots from the owned fork: pre-sync `f1ca219d`,
sync merge `6e03dd12`, current `715e1272`, and the already retained upstream
source `49f656f5`. Hosted CI must retain each exact compiler/build identity,
authored AVR firmware identity, step/batch counts, raw Callgrind profile and
per-function annotation, using the existing measurement's fixture and bounds.
The standalone reader must not execute a guest or import the producer.
Freeze metadata/original admission before the first diagnostic dispatch and
acquire each official original once. Keep original failures visible.

This claim authorizes measurement and source explanation, not a decoder or
profile optimization. A proposed implementation needs a separately reviewed
precise scope and must improve both prescribed source trees without worsening
any existing baseline row beyond its unchanged tolerance. No per-chip waiver,
rebaselining, repeated unchanged run or release/physical-timing claim.
