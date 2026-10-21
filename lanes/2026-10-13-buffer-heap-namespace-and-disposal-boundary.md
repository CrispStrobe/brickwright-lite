## Buffer heap namespace and disposal boundary — 2026-10-13

CLAIMED — Codex, `lane/arcade-buffer-lifetime-20261013`, stacked on PR850.
Own Buffer/music registry namespace and disposal/replacement boundary only.
Preserve within-owner aliases, original song byte sharing and same-VM project
replacement. Existing import/shared value helper ownership remains separate.
Live root tracing and aggregate allocation budgets remain explicit next work;
no whole-app corpus promotion follows from reset/disposal controls. Lower
Arcade integration branches are landing separately by normal merges.
