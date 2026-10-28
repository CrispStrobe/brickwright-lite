## Robot Lab: jolt-physics -> Brickwright fork 1.1.0-bw.2 (Jolt master) — 2026-10-19

CLAIMED and done in one PR — Claude (Robot Lab lane, owner request). The Sim
Lab engine moves from npm `jolt-physics` 1.1.0 to the JoltPhysics.js fork
release `v1.1.0-bw.2` (tarball sha256 e45f1c12...ac516, lockfile sha512
integrity): upstream Jolt master 01adafb plus the GearConstraint ratio fix and
GearMeshConstraint. Owns the pin surfaces only: scripts/integrate.mjs,
packages/scratch-gui/package.json and package-lock.json, the Jolt notice in
THIRD-PARTY-NOTICES.md, and the fetch-pinning census row. jolt-core.js and its
gear workarounds are unchanged (adopting GearMeshConstraint is a later step).
Non-gear physics changes come from upstream Jolt since v5.6.0 (control build
without the gear commits: JoltPhysics.js Actions run 39223975871).
