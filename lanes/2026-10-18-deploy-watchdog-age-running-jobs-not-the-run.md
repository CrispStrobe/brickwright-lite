## deploy-watchdog: age running jobs, not the run — 2026-10-18

CLAIMED and done in one PR — Claude. Issue #1074: the watchdog's stuck-run
step cancelled main Build 60f747223 although every finished job had passed;
on the starved free-tier queue the run's first jobs finished early and the
test shards waited for runners, and the selector aged the RUN from its
earliest job start. Owns scripts/watchdog-stuck-runs.mjs (only jobs still
running count, each from its own start), the jq field list in
.github/workflows/deploy-watchdog.yml that feeds it, and new fixtures in
test/deploy-watchdog-age.test.mjs. Budget, red-streak check, permissions and
main-only scope unchanged; no existing assertion changed.
