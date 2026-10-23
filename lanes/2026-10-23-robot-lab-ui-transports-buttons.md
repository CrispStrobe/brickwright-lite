# Robot Lab UI transports and brick interaction (WP9 / WP5)

CLAIMED — Codex hub-coverage continuation, isolated branch
`lane/robot-lab-ui-transports-buttons-20261023`, base
`0e11f66d5ae1a9c5788756986c715bf86049ff16`. User requests the recommended
follow-on work after the 43-cell coverage closure. Preserve all existing owners.

Own WP9: a bounded Lab virtual-transport lifecycle module under
`lib/bw-sim/transports/`, the six existing serial/WebSocket/HTTP transport
adapters where ownership-safe installation, routing and active-session teardown
require repairs, and focused transport/real-extension controls. Connect the
existing serial, bridge, ev3dev, BLE HTTP and SPIKE text routes to the current
Lab session through explicit virtual routing. Preserve physical fallthrough,
other owners' wrappers and non-Lab requests. Dispose only owned endpoints and
connections; stale sessions and asynchronous replies must not revive a closed
or replaced scene. Do not change supplier sources, pins, native or firmware.

Own WP5: `hubs/ev3/ev3-virtual-hub.js`, `ev3-direct-commands.js`, the button
capability adapters for already-modelled bricks, and `api/robot-lab-api.js` for
bounded button discovery/press/release. Qualify EV3 turn-ratio semantics from
open-source firmware facts; copy no GPL implementation. Preserve NXT's closed
Button IOMap and model estimates. Add visible brick-button controls with
release-on-cancel/unmount; prove actual WAIT_FOR_PRESS guest completion and
wrong-brick/index refusal. No new physical-accuracy claim.

Shared integration is limited to transport lifecycle exports in `sim-lab.js`,
new connection/button UI components and their narrow wiring in
`components/tw-pseudocode/sim-lab-pane.jsx`. PR1255's owner retains measurements,
worker telemetry and their current qualification; claim1259 retains measurement
refinements. Do not edit those active shared integration files until the
qualified parent composes normally or explicit owner coordination resolves the
boundary. Independent controller/protocol tests may proceed first. Preserve all
measurement behavior and their controls.

Own focused Node/actual VM/Jolt controls, removal of the six now-wired entries
from `test/no-dead-overlay-modules.test.mjs`, exact dependency-scope declarations,
a new browser journey helper called by the existing Robot Lab verifier, and
its focused preservation/negative controls; relevant coverage, EV3/NXT, usage
and handoff paragraphs plus this claim. Do not alter acceptance bounds, known
failure baselines, physics solver, compiler, model library or release workflows.
Require real extension traffic and physical/button consequences, wrong-input
and stale-owner controls, meaningful mutations, and affected clean browser/guest
qualification. Merge only after every enabled exact-head check succeeds and
reviewed/predicted/landed tree and parents agree. Keep raw evidence private.

Model PR1235/1236, native PR1224/1099/1100 and Arcade PR1128 remain with their
existing owners. Review current failures and retained originals without duplicate
acquisition or dispatch; carry their qualified composition through normal
landing only after their owning acceptance requirements are met.
