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
| 1 | source-only test infrastructure recovered from the interrupted main worktree | explicit dependency/Node preflight; no implicit ancestor dependencies; bounded source suite; integrated suite remains authoritative; CI contract and focused tests | complete — reconstructed without the conflicted debugger file; 6/6 focused tests pass; hosted Node 22 build, corpus, browser, debugger and vendor gates pass; one superseded wedged run was canceled before a later full green receipt |
| 2 | virtual SPIKE simulator series, integrated as `0f0745fbe..6a426331f` | rebased coherent series; protocol/state ownership audit; Prime and Classic extension end-to-end tests; bounded UI; hosted Build | complete — explicit opt-in, strict loopback interception, bounded BLE/Classic input, real-Bluetooth delegation, full peripheral cleanup, atomic profile/disconnect failsafe, accessible modal controls; focused tests and hosted unit/build/corpus/heavy-browser gates pass |
| 3 | bundled-example deferral `bb84ef2e` | lazy-load boundary remains fail-closed; browser performance receipt; no missing examples or retry regression | complete as rejected — superseded by the more complete `96be712f1` already on main |
| 4 | empty pseudocode control-body warning `495de1639` | warning is syntax-aware, localized and covered without changing valid generation | complete as no-op — patch-equivalent `eb62f2a77` is already on main |
| 5 | display/input recovery commits `ee45c77a2`, `4fb7ee0bc` | split from broad recovery checkpoint; current-main comparison; focused behavior tests; reject unrelated residue | complete as rejected — useful behavior is consolidated and fixed on main in `25ac2959e` and later integration waves; mixed checkpoint `4a01d431c` is not cherry-picked |
| 6 | SPIKE firmware legacy failsafe `ea1c6d4`, hardened through `e73fdaf` | review against firmware `origin/main`; motor/link-loss safety invariants; host tests and platform CI | complete on firmware `main` — generation-bearing commands reject disconnect-first and stale work; ordered motor I/O closes reconnect races; deterministic pthread, private source/host CI, and full containerized ARM/NuttX build pass |
| 7 | superseded worktree cleanup | confirm clean, remote/recovery reachability and patch equivalence immediately before removal; preserve all dirty/owned trees | complete for adjudicated candidates — removed the clean superseded examples, display/input, and integrated simulator working directories; retained their commits on `archive/examples-deferral-20260906`, `feat/display-input-blocks`, and `feat/spike-firmware-simulator`; preserved every dirty or unexplored tree |

The detached session-bundle residue in `wt-asm-dialect` is not a separate feature:
current Lite main contains the tested superset, including schema-v1 normalization,
canonical boundary validation, bounded public inspections and manifest-inclusive
size accounting. The `lite-n3c` artifact link and firmware NuttX board link are build
conveniences, not source candidates.

Cleanup deliberately preserved the interrupted primary checkout, the two-file ASM
session-bundle residue, the `lite-n3c` artifact link, the firmware NuttX link, and
all unique feature branches not accepted by this ledger. Worktree removal deleted
only disposable checkouts; no candidate commit was deleted.

## Newly active firmware worktrees

A final census found three firmware worktrees created after the initial audit. The
owner trees remained untouched while their value was reconstructed on the reviewed
platform base. Coherent distance/IMU snapshots (`a5c1b95..e8650ca`) and bounded,
generation-safe Classic timed motors (`a13d717..2edc928`) are now on firmware
`main`, each after independent review, focused gates, private source CI, and a full
containerized ARM/NuttX build. Finite sound (`5bbfadb`, hardened by `7e905f7`) is
preserved on `integration/finite-sound-20260906`: independent concurrency review
and exact-tip source CI pass, but the real ARM image reports 98,448 bytes of
userspace static RAM against the reviewed 98,304-byte ceiling. It is deliberately
not promoted; changing that budget or trading another retained buffer is a future
resource-design decision. The original dirty owner worktrees remain preserved.
