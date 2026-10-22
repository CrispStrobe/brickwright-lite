# Robot Lab cables at actual sockets and device cable exits

CLAIMED — owner: Robot Lab model delivery, isolated
`lane/robot-lab-cable-sockets-20261022`, base `45c8dc8e4`.

The owner reports cables appearing away from their ports. Both views currently
use bounding-box centres for both endpoints. Correct the visual attachment at
the selected hub socket and the motor/sensor socket or captive-cable exit.

Own a small shared visual endpoint/route helper under `bw-sim/view/`,
`view/insight-layer.js`, `view/sim-view3d.js`,
`editor/editor-view3d.js`, and `mech/insight.js` only as needed to carry resolved
hub/device endpoint data. Include focused endpoint/transform/rendering controls,
the existing insight browser gate, canonical scope declarations/mirrors if
required, and this claim. Derive/measure anchors from the vendored official
LDraw geometry, keeping part-local coordinates and socket identities explicit.
Preserve other owners' worktrees, the statistics-overlay lane, scheduler,
physics/compiler files, device behavior, wiring assignments and dependency pins.

Keep badge/picker behavior independent of cable attachment. Respect named hubs,
sensor versus motor ports, rotations, moving housings, editor transforms,
hide/isolate, unplug/replug and visibility/disposal. Unsupported parts must not
invent a connection at a centre or an unrelated hub socket.

Merge the claim before implementation. Prove the old centre anchors fail,
check socket identity and geometry in independent controls, and inspect actual
Chromium/WebKit Simulate and Build rendering, including a running/moved model.
Run the affected model-insight/editor/view tests, normal production build and
applicable exact-source hosted qualification before normal matched-head merge.
