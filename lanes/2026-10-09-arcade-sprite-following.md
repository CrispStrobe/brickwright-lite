## Arcade sprite following — 2026-10-09

Codex owns `lane/arcade-sprite-follow-20261009`, stacked on PR758, and producer
`feat/arcade-sprite-follow-20261009`, stacked on PR79. Implement original PXT
steering before physics, frame timing, momentum, snapping, replacement,
cancellation, destruction and scene ownership. Expose follow/unfollow in Blocks,
Code and MakeCode interchange. Verify exact original source and unchanged
corpus inputs; full shipped controller/browser checks remain required.
Checkpoint `3c4493c1e` /producer `e41906fe`:13 follow/scene/interchange and
8 fresh bundle/pin/dialect checks pass; producer325 pass. Corpus109/74/1 across
184 unchanged inputs. Original source steering and recovered tutorial movement
pass locally. Producer CI37946563913 passes every enabled exact-head check.
Lite gallery CI found31 stale vendored provenance stamps; synchronized them
from the unchanged producer pin, with every other byte unchanged and the
whole gallery freshness check passing. Full shipped browser checks remain pending.
