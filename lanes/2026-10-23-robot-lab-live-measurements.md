# Robot Lab live physical measurements

CLAIMED — Codex, user-requested live measurement overlays; isolated branch
`lane/robot-lab-live-measurements-20261023`, base `1d9ed3ddd`.

Own a read-only measurement layer over the existing Jolt-backed session:
configured body mass, body speed, distances, three-point angles, hinge/slider
readings, and available rope tension / rolling normal-load diagnostics. Show
units and provenance; unavailable readings never become invented zero forces.
Offer useful model-derived presets plus user-defined measurements attached to
stable model part IDs, saved with the model. Optional updating overlays belong
beside the existing component badges and cable visibility controls.

Scope: new `lib/bw-sim/measurements/` modules, narrow integration in
`sim-session.js`, `sim-worker-protocol.js` and `physics/physics-{host,client}.js`
(read-only telemetry transport and its existing message forwarding),
`sim-lab.js`, `model/sim-lab-persist.js`,
`view/sim-view3d.js`, `components/tw-pseudocode/sim-lab-pane.jsx`, a new
measurement panel there, focused measurement tests/browser journey and usage
documentation. Preserve concurrent model, cable, compiler and solver work.
No Jolt core/bindings, physics equations, dependency pins, firmware, workflows,
existing physical thresholds or third-party source adoption in this envelope.

Qualification: analytical units/geometry and invalid-target controls, actual
Jolt session motion/force diagnostic controls, save/load and model replacement,
normal run/pause/reset and replay behavior, useful presets, custom add/remove
and rendered-overlay browser checks; meaningful negative/mutation proof and
all enabled exact-head hosted checks before matched-head landing. Diagnostics
are simulation observations, with no hardware-accuracy claim. Evaluate proposed
MIT/Apache teaching libraries independently; an additional solver is unnecessary
for observing the current simulation.
