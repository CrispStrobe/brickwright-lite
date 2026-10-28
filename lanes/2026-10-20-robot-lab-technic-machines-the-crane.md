## Robot Lab Technic machines: the Crane — 2026-10-20

CLAIMED and done in one PR — Claude (Robot Lab lane, owner goal: Technic projects driven by the hubs).
The differential and the shifting gearbox already ship (differential.ldr, gearbox.ldr, kinds/transmission.js,
relativeGear): not rebuilt. New: the Crane (static/sim-lab/models/crane.ldr, scripts/gen-crane-model.mjs,
programs/crane.bw): a SPIKE hub on the floor, the Excavator's 28T turntable slewed by an 8T on A at low speed,
a 15L boom luffed by a small linear actuator on B, a hook hanging free on a frictionless pin. No winch (ropes,
PR #1123, not on main). Tests: test/bw-sim-crane.test.mjs. No physics-core change.
