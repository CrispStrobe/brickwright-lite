## Arcade negative sprite kinds — 2026-10-09

Codex owns `lane/arcade-negative-kind-20261009`, stacked on PR769. Preserve
fixed negative numeric kinds across creation, callbacks, kind changes, queries,
Code/Blocks and MakeCode/SB3 interchange. PXT negative kinds retain sprite and
callback identity but are excluded from kind collections. Keep dynamic and
unsupported positive numeric kind diagnostics. This is a prerequisite for
native legacy bubble ownership; native bubble allocation is still separate.
Checkpoint `183f5376d`:38 distinct checks pass without skips;32-check shared
batch plus15-check final batch with nine repeated/strengthened new checks.
Original PXT and exports preserve negative/fractional identities, yielding
callbacks, closures, overlaps, local projectiles and three full pixel planes.
Code/SB3 replay and both fresh extension bundles pass. Native bubbles, runtime
kind expressions and numeric kind reporters remain separate work.
