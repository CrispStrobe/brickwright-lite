## Robot Lab chains and treads round gears — 2026-10-20

CLAIMED and done in one PR to main — Claude (Robot Lab lane, owner request "yes do all that":
flexible parts, chains first). Part 3711 (Technic chain link) vendored from the 2026-09-30
library. kinds/chain.js: a 'chain-link' connector and a 'chain' coupling detector (links joined
pivot on pivot, round two or more spur gears in one frame: same sense, teeth ratio; links welded
to the frame); physics/jolt-core.js chainDrive (GearConstraint on both hinges). editor/chain-path.js
lays a closed chain round the selected gears (or a 57518 tread round 57519 sprockets: links
drawnOnly, each sprocket a wheel of the tread's outer radius); view/chain-motion.js runs the links
round; properties panel "Chain or tread round". Tests:
test/bw-sim-chain.test.mjs; gate scripts/lib/sim-lab-chain-gate.mjs (--part=editor).
