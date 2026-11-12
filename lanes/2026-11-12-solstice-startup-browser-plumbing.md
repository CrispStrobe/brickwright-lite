# Solstice startup — optional session and browser recorder plumbing

Status: CLAIMED 2026-11-12. Owner: Codex, Robot Lab startup investigation.
Base: `8aa4a4d137d5e8cc748a782363d3fa69a34faa7e`.
Depends on the local optional worker diagnostic candidate; no solver change.

Scope: a new `overlay/scratch-gui/src/lib/bw-sim/measurements/startup-diagnostic-consumer.js`;
optional request forwarding in `overlay/scratch-gui/src/lib/bw-sim/physics/physics-client.js`;
opt-in selection and accepted-batch admission in `overlay/scratch-gui/src/lib/bw-sim/sim-session.js`;
an opt-in channel in `scripts/lib/sim-lab-browser-recorder.mjs`;
`test/bw-sim-startup-diagnostic-session.test.mjs` and
`test/sim-lab-startup-diagnostic-recorder.test.mjs`; this claim only.

Normal request/record shapes and ordering remain unchanged without the explicit
option. No changes to existing measurement selection/caps, startup telemetry bounds,
model, program, solver, engine APIs, pins, output thresholds or workflows.
No replacement of contact or anchor impulses by pair presence or motor effort.

Qualification: pure actual session/client/recorder tests using bounded fake worker
replies, including redo/disposal/stale revision, copied data, missing/invalid packets,
restoration and disabled-option parity; nonvacuous mutation checks. Actual engine,
native/browser trajectory and independent original qualification remain owed.
Source stays local pending review; this claim does not authorize a guest run.
