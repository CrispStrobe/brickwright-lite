# Worktree value integration — 2026-09-06

This ledger follows the read-only audit of 64 registered worktrees across
Brickwright Lite, Brickwright and the SPIKE firmware repository. Work is rebuilt
from current remote heads in clean integration trees; owner worktrees with staged,
untracked or conflicted files are evidence sources only and are never cleaned or
rewritten.

Heavy browser, corpus, compiler and firmware-platform qualification runs in GitHub
Actions. Local verification is limited to focused unit, protocol, source-boundary
and short live tests.

| stage | candidate | acceptance | state |
| --- | --- | --- | --- |
| 1 | source-only test infrastructure recovered from the interrupted main worktree | explicit dependency/Node preflight; no implicit ancestor dependencies; bounded source suite; integrated suite remains authoritative; CI contract and focused tests | complete locally — reconstructed without the conflicted debugger file; 6/6 focused tests pass; hosted Node 22 verdict pending |
| 2 | virtual SPIKE simulator series `9f544c49a..248b1db76` | rebased coherent series; protocol/state ownership audit; Prime and Classic extension end-to-end tests; bounded UI; hosted Build | planned |
| 3 | bundled-example deferral `bb84ef2e` | lazy-load boundary remains fail-closed; browser performance receipt; no missing examples or retry regression | complete as rejected — superseded by the more complete `96be712f1` already on main |
| 4 | empty pseudocode control-body warning `495de1639` | warning is syntax-aware, localized and covered without changing valid generation | complete as no-op — patch-equivalent `eb62f2a77` is already on main |
| 5 | display/input recovery commits `ee45c77a2`, `4fb7ee0bc` | split from broad recovery checkpoint; current-main comparison; focused behavior tests; reject unrelated residue | complete as rejected — useful behavior is consolidated and fixed on main in `25ac2959e` and later integration waves; mixed checkpoint `4a01d431c` is not cherry-picked |
| 6 | SPIKE firmware legacy failsafe `ea1c6d4` | review against firmware `origin/main`; motor/link-loss safety invariants; host tests and platform CI | planned |
| 7 | superseded worktree cleanup | confirm clean, remote/recovery reachability and patch equivalence immediately before removal; preserve all dirty/owned trees | planned |

The detached session-bundle residue in `wt-asm-dialect` is not a separate feature:
current Lite main contains the tested superset, including schema-v1 normalization,
canonical boundary validation, bounded public inspections and manifest-inclusive
size accounting. The `lite-n3c` artifact link and firmware NuttX board link are build
conveniences, not source candidates.
