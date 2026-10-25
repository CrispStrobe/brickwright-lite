# Robot Lab teaching presets and bounded measurement plots

Implementation DONE (source candidate) — Codex educational-measurement continuation, requested by the user.
Isolated branch `lane/robot-lab-measurement-plots-20261023`, base
`e3be735b3d6ac7a864491a46572ab29712bcf91f`. Merge this claim before implementation.
Compose the qualified measurement successor PR1265 normally; its exact parent
readers, compact identities, mass semantics and existing failures stay intact.
No production activation or qualification follows from this claim.

Own new `lib/bw-sim/measurements/history.js` and `teaching-presets.js`, a new
`components/tw-pseudocode/sim-lab-measurement-plot.jsx`, the existing measurement
panel for plot toggles and teaching-preset selection, measurement usage docs,
focused history/preset/UI tests and one bounded real-browser journey helper.
Paths are under `overlay/scratch-gui/src/` unless otherwise stated; generated
GUI mirrors must follow the existing integration mechanism. Keep the API model
submission owner and current model-library, firmware and transport owners intact.

Plots observe existing scalar reading rows, their units/provenance and actual
simulation time. Limit to four selected traces and128 samples per trace, at
most one regular sample per100ms of simulated time; paused final refresh may
replace the same-time sample. Use a finite rolling window and SVG plotting,
with labelled time/value axes and accessible current/min/max text. Reject
nonfinite time/values. Unavailable readings make gaps, never zeroes or connected
interpolations. No wall-clock substitution, solver changes or new dependency.
Replay hides plots and suspends sampling; returning live starts a fresh window.
Reset, backward time, model/session replacement and changed definition/binding
clear affected histories. Hidden/removed traces stop collecting. Histories are
bounded runtime observations, not saved project data or a hardware-accuracy claim.

Add a small teaching-preset table for at most two existing shipped examples.
Verify each named target against authored IDs in the shipped model and actual
compiled mechanism; resolve current bound joint/rope IDs through existing readers.
Refuse stale/missing/mismatched targets rather than choosing the first joint.
Imported or unknown examples retain structural recommendations. Preserve custom
saved definitions; applying a named recommendation is an explicit user action.
Do not edit model geometry, catalogue/lesson names, compiler, readers/schema,
physics/worker telemetry, pins, transport source or release workflows.

Narrow pane integration needs explicit coordination with the measurement and
transport owners before editing `sim-lab-pane.jsx`: expose only simulation time,
model/session generation, shipped-example key and reset/replay lifecycle to the
measurement panel. No transport/button/connection logic belongs to this lane.
Source work can use PR1265 as a stacked parent after this claim merges; final
retarget/qualification requires its normal landing and reviewed composition.

Require independent bounded-history/reference controls, exact sample-time and
finite-cap tests, unavailable/replay/reset/model/definition isolation, shipped
model target and binding checks, real existing Jolt movement and actual browser
plot/preset journeys. Meaningful mutations must detect wall-clock sampling,
missing resets, unavailable-as-zero and wrong targets. Preserve old failures and
bounds. Every enabled final-head check and affected clean browser/guest evidence
precede matched-head landing with reviewed/predicted/landed tree and parents.
Keep raw evidence private; never duplicate an existing successful official run.


## Candidate controls and integration

The claim merged in PR1269 before implementation. Source branch `lane/robot-lab-measurement-plots-source-20261023` composes its main
ancestry and PR1265's exact `d3babf0aa1` normally. Final landing remains dependent
on PR1265 and every enabled final-head check; no automatic merge is requested.
The measurement owner explicitly handed off the narrow pane sample-time/session
identity/shipped-file integration. Each timestamp is assigned beside an actual
reader call; arbitrary renders cannot retimestamp old rows.

Local controls pass: 62 focused history, preset, measurement, UI, worker, rope,
persistence and frame-queue tests; 17 dependency-scope and unused-module checks.
Nine semantic source mutations are detected, including missing freshness,
wall-clock substitution, missing bounds/reset/binding and fabricated zeroes.
Both shipped models move under actual Jolt; SIMD and baseline Wasm readers pass
(the baseline path uses a controlled capability-probe refusal, not hardware).
The exact measured native-test redirects are declared in
`scripts/lib/gui-scope-allowed.json`; no new dependency is installed or pinned.

One clean production GUI build and actual Chromium/WebKit journeys pass, covering
named presets, real motion/units, finite time plots, paused presentation, replay,
Reset and model switching, with no page errors. A new helper is called from the
existing measurement journey. Its first WebKit attempt exposed missing replay
readiness; the corrected helper also waits for published replay frames and
paused overlay/panel agreement, preserving the original deadlines and failure.
These are bounded simulated observations, not physical-accuracy or peak-force
qualification. History/plot choices stay temporary; existing saved definitions
and structural recommendations remain intact.
