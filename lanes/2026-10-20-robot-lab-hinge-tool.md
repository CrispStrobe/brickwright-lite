## Robot Lab hinge tool — 2026-10-20

CLAIMED and done in one PR to main — Claude (Robot Lab lane, owner request "yes do all that":
Robot Lab UX). editor/snap.js hingeCandidates: the round connection lines next to a selection
where it comes free with what hangs off it; [ ] turn that side 15° (collision-checked, one undo
step), N shows the hinge's axis and steps to the next, Shift+N back; the properties panel has
−15° / +15° / N. docs/ROBOT-LAB-UX.md §10. Tests: test/bw-sim-hinge.test.mjs; gate
scripts/lib/sim-lab-hinge-gate.mjs (--part=editor).
