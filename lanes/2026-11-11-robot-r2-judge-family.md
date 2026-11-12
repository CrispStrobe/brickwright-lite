# Robot Lab — R2 judge family: Cadence, Equinox, Helios, Orion (judges, controls, browser gates, promotion)

Status: DONE 2026-11-12 (#1729) for Cadence, Helios and Orion — claim and change in one PR. Equinox stays
experimental: its native law and controls pass, but the browser gate's manual-control check stops every motor
(hold) and jogs each port alone, and a differential with both outputs held locks its carrier, so motor A cannot
reach a jog target. Its contract, registry move, fixture and shard were withdrawn; its judge stays registered.
Owner: Claude, Robot Lab promotion lane.
Branch: `lane/robot-r2-judge-family-20261111`.

Scope: the new judge module `scripts/lib/sim-lab-r2-judges.mjs` and its four ids in `QUALIFICATION_JUDGES`
(`geneva-index-v1`, `differential-sum-v1`, `willis-epicyclic-v1`, `double-cardan-offset-v1`; Phasekeeper's
`double-cardan-v1` and every other judge are unchanged); four contracts in `docs/data/robot-lab-qualification.json`;
source fixtures `test/fixtures/model-files/{cadence-geneva,equinox-differential,helios-transmission,orion-cardan}-source/`;
the `r2` disconnection branch and a wrong-model mutant test in `test/bw-sim-qualification.test.mjs`; the building
steps of the four shipped LDR/MPD files (STEP markers only, so every instruction step has at most six parts;
placements, colours and IDs unchanged); the registry move (`sim-session.js` MODELS after Obliquity Orrery,
`experimental-models.js`, dialect and extension model lists, all in MODELS order); catalogue, lesson and mechanism
entries and their generated outputs; registration tests that enumerate MODELS; the browser gate
(`scripts/lib/sim-lab-q5-browser-gate.mjs`, new shards `robotaddon16`–`robotaddon19` in `build.yml`, the shard tests
and the readings registration); the checkpoint review records, the handoff and the pending file. Programs, start
guards and every existing judge, threshold and gate are unchanged.

Laws (constants read from the compiled parts and catalogue tooth counts):
- `geneva-index-v1`: n = 4 external Geneva, crank 40 mm, centre distance 40/sin 45° mm; 90° per crank turn while
  the crank is within ±45° of the line of centres, dwell for 270°; dial = −star/3.
- `differential-sum-v1`: L + R = 2K, |K| = (12/28)|A|, |brake motor| = (20/12)|output|, a held output stays put.
- `willis-epicyclic-v1`: ω_out = 3ω_A − 2ω_c, ω_c = −(20/28)ω_B, standstill at ω_B = −63°/s for ω_A = 30°/s.
- `double-cardan-offset-v1`: equal bends β = 36.87°, in-phase middle forks: output = input, middle shaft
  tan θ_m = tan θ / cos β (12.76° peak to peak).

Controls: frozen-output and 1 cm shift; disconnections `driver_pin_axle`, `pinion`, `control_gear`,
`fork_middle_far`; one wrong-model mutant per model, each refused.

Qualification: hosted unit/build checks and the chromium browser gates, `ci:full` once on the final head.
