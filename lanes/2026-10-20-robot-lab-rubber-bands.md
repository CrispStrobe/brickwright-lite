## Robot Lab rubber bands — 2026-10-20

CLAIMED and folded into the flexible-parts PR #1116
— Claude (Robot Lab lane). The model's `belts` (validated, `0 !BW BELT` in LDraw, addBelt /
removeBelt, a band goes with its part); editor/belt-path.js (circles, path, band size);
kinds/belt.js ('band' drive that slips, 'spring'); jolt-core band drive and DistanceConstraint
spring; view/belt-layer.js draws bands in Build and Simulate; properties panel "Rubber band
round" / "Take off rubber band". Tests: test/bw-sim-belt.test.mjs; gate step 5 of
scripts/lib/sim-lab-chain-gate.mjs (--part=editor).
