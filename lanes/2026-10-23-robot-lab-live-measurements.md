# Robot Lab live physical measurements

Implementation DONE (source candidate) — Codex, user-requested live
measurement overlays; isolated branch
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


## Candidate controls

The implementation observes native body velocities, relative joint readings,
rope impulses and the existing rolling-load estimate through both execution
routes. Saved definitions use authored part IDs and bound joint/rope identities.
Missing targets, unavailable diagnostics and pose replay never publish invented
zero values. The panel and SVG overlays remain separate from component/cable
visibility; overlapping measurement labels are separated.

48 focused controls pass, including real Jolt worker parity through batch redo,
native wheel/rope loads, Robot Lab API behavior and actual project bundle save/load.
Five source mutations are detected (units, target binding, unavailable zero,
worker forwarding and persistence); original source bytes restored. Guarded
frontend builds pass. The first full Chromium journey passed measurements,
Reset and Build/Simulate, then exposed an existing Challenges test assumption
about a button moved into More. Its original failure is retained; the same
assertion now uses the existing overflow-aware toolbar reader without changing
its deadline. Full Chromium and WebKit UI journeys now pass, along with focused custom
measurement/model-switch checks in both browsers. Every enabled exact-head
hosted check remains required before landing. No dependency or solver
change and no hardware-accuracy claim.


A separate cold standalone WebKit Simulate-UX run failed its unchanged half-speed
ratio (0.16 versus 0.50 of wall time). The default full UI sequence passes the
same timing assertion in both browsers; no general cold-start timing closure is
claimed. The measurement-only diagnostic now invokes the measurement journey
alone, while default UI coverage retains the full speed/readings/rays/replay
journey. Its new model-switch check also waits for the actual replay control's
published frame count before pausing; the initial fixture wait failure is retained.
