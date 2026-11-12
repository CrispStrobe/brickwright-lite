# Held Solstice — route optional startup telemetry to its base recorder

Status: LOCAL SOURCE CANDIDATE 2026-11-12; actual observations pending.
Owner: Codex, Robot Lab startup investigation.
Base: `ecdd977b88cf69971b3a20bf3ba8fce5ac2b8141`.
Depends on the held controller and optional worker/session telemetry candidates.

Scope: `scripts/lib/sim-lab-q5-held.mjs`,
`scripts/lib/sim-lab-q5-browser-gate.mjs`,
`scripts/lib/sim-lab-mechanics-gate.mjs`,
`test/robot-lab-held-startup-telemetry.test.mjs` and this claim only.
Coordinates with the held-controller owner for this one observational addition.

Only the already explicit held-Solstice base diagnostic requests a bounded startup
recorder selection from its actual cold worker's compiled body/joint IDs. Ordinary
cases, disconnected controls and fresh-project replay keep their existing recorder
options and behavior. Existing startup limits, judges, programs, models, thresholds,
registries, pins and workflow/concurrency blocks are unchanged. No new engine API.

Qualification: actual-source forwarding and serialized selection controls with fake
page/worker boundaries, default-option absence, bounds and cold-worker refusal, plus
nonvacuous mutations. These do not qualify browser execution or a solver fix. Source
stays local; affected actual observations and independent source/build admission are
still required before any runtime claim or promotion.

Local controls: five focused held-routing tests plus 26 existing telemetry/API
controls pass. Six source mutations are detected. The actual held base forwards
the bounded selection, while the disconnected recorder and ordinary gate preserve
their prior options. Routing tests use fake pages, refuse archive execution and
omit rendering; they establish no browser, dependency or engine qualification.
