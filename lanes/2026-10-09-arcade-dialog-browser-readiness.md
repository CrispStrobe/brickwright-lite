## Arcade dialog / browser readiness — 2026-10-09

Codex owns `lane/arcade-dialog-browser-readiness-20261009`, stacked on PR749.
Fix the actual question guard publication defect observed in PR748: publish
new dialog identity at readiness so the pure stage container enables Yes/No.
Qualify the regression against a preserved failing baseline. Repair stage
reload waits to tolerate the real absent-stage interval, and navigate visibly
back from graphics authoring before running the palette startup block. Keep
semantic assertions and original hosted failures; no unrelated pins change.

Checkpoint `7c05309b9`: preserved baseline 7 pass /1 expected failure; fixed
source 23 pass /0 fail/skip. Native immutable dialog notifications address the
pure-container guard defect; reload and graphics-navigation harness repairs
retain their semantic checks. Parent build succeeded, both browser jobs failed.
Fresh exact-head hosted qualification remains pending; see the readiness receipt.
