## Robot Lab physics 2: jolt-physics 1.1.0-bw.3, pair restitution, static rolling resistance — 2026-10-20

CLAIMED and done in one PR — Claude (Robot Lab lane, owner request "fix it all"; follow-up to #1126).
jolt-physics 1.1.0-bw.2 -> 1.1.0-bw.3 (JoltPhysics.js fork release `v1.1.0-bw.3`, tarball sha256
112f6281...df890c, lockfile sha512 integrity; JoltPhysics fork commit a40ff0b): a CCD impact that would
bounce while the body touches a second body is left to the discrete solve (a brick on two beams turned
over), and a MaterialPairs restitution table. Owns the pin surfaces (scripts/integrate.mjs,
packages/scratch-gui/package.json and package-lock.json, THIRD-PARTY-NOTICES.md, the fetch-pinning row)
and bw-sim's materials and rolling resistance (contracts.js MATERIALS, physics/rolling.js,
physics/materials.js), plus jolt-core.js's material table install and light-body iterations.
