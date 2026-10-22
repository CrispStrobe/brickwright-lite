# Preserve sensor protocol identity at the Robot Lab hub boundary

CLAIMED — Codex coverage-closure owner; base `b056a20e6`.
Continuation of the merged coverage closure claim #1230. Its new real-extension
WeDo test exposed a product defect: `hubBindings` replaces every device's
protocol IDs with `{}`, so WeDo announces a 45305 tilt sensor as motion (0x23)
instead of its catalogue identity 0x22. Existing direct protocol tests bypass
this bridge. The scene's physics correctly reports the tilted sensor body.

Own `overlay/scratch-gui/src/lib/bw-sim/hub-bridge.js` only at sensor PortBinding
identity propagation, its tracked mirror, and focused hub-bridge/WeDo tests.
Copy the compiled device IDs just as motor IDs are copied; do not invent IDs,
change protocol defaults, catalogue facts, physics or extension behavior.
Prove actual compiled model → bridge → real extension discovery/tilt/light/tone
on both BLE routes and a wrong-threshold control, plus source identity/mutation
controls and existing affected hub tests. All enabled exact-head checks must
succeed before matched-head normal merge. Keep original failures. No takeover
of pane Run, motor-power or native owners; no pins or firmware changes.
