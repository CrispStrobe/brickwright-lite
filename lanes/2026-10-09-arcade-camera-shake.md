## Arcade camera shake — 2026-10-09

Codex owns `lane/arcade-camera-shake-20261009`, stacked on PR754, and
producer `feat/arcade-camera-shake-20261009`, stacked on PR77.
Implement the PXT camera shake lifecycle, damping and draw offsets through the
native camera, with authorable Blocks/Code and MakeCode interchange. Compare
original PXT at controlled times/random inputs; keep logical camera/world
coordinates and camera-relative HUD stable. Preserve unsupported diagnostics
and remeasure unchanged corpus inputs. Hosted GUI qualification remains a gate.
Checkpoint `a2a096f78` /producer `88aa7123`: native shake, Info routing,
original camera/roundtrip, fresh extension bundles and affected scene/Info
checks pass. Corpus107/76/1 with184 unchanged hashes. Shipped browser journey
is prepared; fresh hosted GUI and producer full-suite gates remain pending.
