## Robot Lab challenges on the mats — 2026-10-20

CLAIMED and done in one PR — Claude (Robot Lab lane, owner request "yes do all that": Robot
Lab UX). Pushed to the combined branch (#1108). world/challenges.js: one challenge per mat
(One lap, Stop at the wall, Stay in the ring, Through the maze, Four corners), each a judge
of what anyone watching the mat could see (the robot's outline on the floor, its contacts
with the mat's obstacles, the simulated time), so it works for every hub and program; 1-3
stars for a time, a gap or a margin, the shipped examples earning 2. Simulate's Challenges
button (sim-lab-challenges.jsx) starts one on its mat with the robot at the start; a result
pauses the world and the best is kept on this device. Robot Lab API: partOutline(part).
Tests: test/bw-sim-challenges.test.mjs; gate scripts/lib/sim-lab-challenges-gate.mjs
(--part=ui).
