# Required hosted own-firmware lockstep and embedded Python qualification

DONE — Codex hub-coverage owner. Source landed in #1239 at 6da92497d2e8f51b2a75e137fab9e6946d3a3457
from qualified head `64949a78117a3937ad5241e8ec41d1b8fffca3b2` after every
enabled exact-head check succeeded; declared conditional jobs remained skipped.

The required `robot-lab-own-firmware.yml` builds the project’s own simulation
firmware with its source/TI, offline, resource, compiler archive/link and
addressed-sensor gates. It stages the explicit graph and refuses missing inputs.
The actual Lab compiler/upload/lockstep/Jolt route passes both the unchanged
timed-speed and degrees comparisons. Embedded MicroPython passes six cases:
computation/output and physical motor motion, retained restart, Stop during
sleep, sensor positive and wrong-scene refusal, OSError and distinct-source
recovery. Control ACKs, coherent status, output and storage remain independent.
Physical quanta, wall/virtual deadlines and acceptance thresholds are unchanged.

Qualified input graph: firmware `91cf0c07784441ac114b85a1705737327db2d9f8`,
NuttX `a67efb31cf4f236e456882589b91862f04594528`, apps
`55f0bc216565ccab8dee600a88f4485c7693bf8b`, Runtime merge
`0ff9e15d5fdd0ba755e4cb1773ebc3d3e79e3b3f`, paired Infrastructure
`181d9d45567d9afc66a47b57255d34aa51b5ffdd`, and support resources
`14b80cde0a136b684f316eb7f6a31aeaae0684bf`. No moving library fetch or
product/package pin substitution is inferred.

Official run 39892243464 passed all enabled build and acceptance steps.
Its original receipt archive and log were acquired once after admission; an
independent reader verified the source/input/output hashes, fixed graph and
real acceptance observations. Earlier boot, pipe, stream, monitor and paused
publication failures remain retained; none was relabelled as success.

The matrix’s two firmware cells are green for this own-NuttX Lab boundary.
Standalone/raw-REPL firmware, installed native lifecycle, reference firmware,
hardware accuracy and performance qualification remain separate. No heavy
local build, hardware flashing or firmware binary publication occurred.
