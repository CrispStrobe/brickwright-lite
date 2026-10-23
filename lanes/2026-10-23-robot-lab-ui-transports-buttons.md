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
or replaced scene. Supplier changes are limited to the send-failure amendment
below; do not change native or firmware.

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

## Radio notification ownership amendment

The HTTP BLE bridge uses the same model notification sink as Web Bluetooth.
An older peripheral currently clears that sink unconditionally on disconnect,
which can remove a newer connection's notifications. Before integrating this
route, also own the narrow sink-lifetime boundary in
`lib/virtual-hub/lab-ble-peripherals.js`,
`lib/bw-sim/hubs/lwp3/lwp3-virtual-hub.js` and
`lib/bw-sim/hubs/wedo2/wedo2-virtual-hub.js`: return an identity-guarded sink
release from the existing setter, and let each peripheral release only its own
sink. Preserve notification bytes, formats, motor/sensor behavior and existing
caller signatures. Qualify newer-owner preservation, idempotent disconnect and
real extension traffic. This does not add notification multicast, a new radio
protocol or a hardware connection-capacity claim. Do not edit those three paths
until this amendment merges. Existing authorized transport work stays isolated.

## Powered Up asynchronous send-failure amendment

Actual real-extension teardown exposes unobserved rejections from motor-stop
writes queued by `PROJECT_STOP_ALL`. Own the narrow producer boundary in
CrispStrobe/extensions `extensions/CrispStrobe/lego_poweredup.js`: observe and
report rejected sends while returning the original rejecting promise to awaiters.
Keep command bytes, rate limiting, stop actions and dispatch order unchanged.
Prove normal sends, awaited error identity, fire-and-forget stop reporting,
limiter failures and no unhandled rejection with actual extension controls and
meaningful mutants. No global rejection suppression or invented acknowledgement.
Do not edit this supplier source until the amendment is merged.

Carry only the directly affected scoped `legopoweredup` adoption through
`vendor-pins.json`, its canonical generated wrapper and upstream-byte receipt,
plus focused pin and real-extension transport controls. Other pins and the
global bundle baseline remain fixed. Supplier review requirements remain in
force; downstream pin movement follows qualified supplier merge. Keep existing
owners and all original failures. No unrelated extension or vocabulary changes.
