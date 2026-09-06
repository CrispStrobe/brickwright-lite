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
| 1 | source-only test infrastructure recovered from the interrupted main worktree | explicit dependency/Node preflight; no implicit ancestor dependencies; bounded source suite; integrated suite remains authoritative; CI contract and focused tests | complete — reconstructed without the conflicted debugger file; 6/6 focused tests pass; hosted Node 22 build, corpus, light-browser, debugger and vendor gates pass; the pre-existing heavy-browser no-engine gate remains wedged and is tracked separately |
| 2 | virtual SPIKE simulator series, integrated as `0f0745fbe..6a426331f` | rebased coherent series; protocol/state ownership audit; Prime and Classic extension end-to-end tests; bounded UI; hosted Build | complete locally — explicit opt-in, strict loopback interception, bounded BLE/Classic input, real-Bluetooth delegation, full peripheral cleanup, atomic profile/disconnect failsafe, accessible modal controls, and sequential focused tests pass; hosted verdict pending |
| 3 | bundled-example deferral `bb84ef2e` | lazy-load boundary remains fail-closed; browser performance receipt; no missing examples or retry regression | complete as rejected — superseded by the more complete `96be712f1` already on main |
| 4 | empty pseudocode control-body warning `495de1639` | warning is syntax-aware, localized and covered without changing valid generation | complete as no-op — patch-equivalent `eb62f2a77` is already on main |
| 5 | display/input recovery commits `ee45c77a2`, `4fb7ee0bc` | split from broad recovery checkpoint; current-main comparison; focused behavior tests; reject unrelated residue | complete as rejected — useful behavior is consolidated and fixed on main in `25ac2959e` and later integration waves; mixed checkpoint `4a01d431c` is not cherry-picked |
| 6 | SPIKE firmware legacy failsafe `ea1c6d4`, hardened through `e73fdaf` | review against firmware `origin/main`; motor/link-loss safety invariants; host tests and platform CI | exact-tip candidate pushed as `integration/legacy-failsafe-20260906` — generation-bearing commands reject disconnect-first and stale work; ordered motor I/O closes reconnect races; deterministic pthread and focused host gates pass; private source and ARM/NuttX CI dispatched before main promotion |
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

A final census found three firmware worktrees created after the initial audit. They
are preserved as owner work. `feat/imu-modern-snapshot` committed coherent bounded
IMU telemetry as `2d7ff175` and should follow the failsafe platform base.
`feat/classic-motor-ops` has useful timed-motor behavior but must first adopt the
generation and I/O-ordering contract. `feat/finite-services` adds bounded sound but
must follow the motor scheduler integration and remove callback-under-lock and
stale-timer races. Their focused tests pass; none is safe to transplant directly
onto the old firmware `main`.
