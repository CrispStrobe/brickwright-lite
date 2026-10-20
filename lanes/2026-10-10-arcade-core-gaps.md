## Arcade core gaps — 2026-10-10

Continues the Arcade lane on `lane/arcade-core-gaps-20261010` from main after
PR780: remaining translator gaps that need no third-party extension. Terrain
physics measured frame by frame against the original (blanket terrain
qualification removed), namespace tile constants in tile maps, immediately
invoked functions, statement-level `forEach`/`filter().forEach`/`map`, ragged
image literals, numeric `for` counters. No producer change. Next: bundled
extensions from the pinned target, then third-party extensions.
