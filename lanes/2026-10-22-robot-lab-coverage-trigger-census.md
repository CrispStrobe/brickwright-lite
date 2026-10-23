# Retire the completed coverage TODO's stale Build trigger

SOURCE COMPLETE — Codex hub-coverage owner, base `0e76a4713`, continuation of #1233.
Own only removal of the stale `docs/ROBOT-LAB-HUB-COVERAGE.md` push-path entry
from `.github/workflows/build.yml`, plus this claim's result. The completed
hub-reader TODO was that document's last executable mention; remaining mentions
are comments. Exact-head unit shard 4 correctly reports the now-stale entry in
both its census and mutation controls.

Preserve the complete existing `build-trigger-paths` assertions and their
mutation checks; do not invent an executable reader just to satisfy the census.
Run that complete suite and docs-only routing controls, preserve the original
failed job, and require all enabled exact-head checks before normal merge.
No unit/browser setup or qualification changes, no weakening thresholds, and no
changes to the motor-power, native or Arcade owners' implementation envelopes.

The stale trigger is removed without changing the census or its assertions.
The original final-head unit failure and the local six-pass/two-fail baseline
are retained. The complete trigger and docs-only routing controls must pass;
all enabled checks on the final combined head remain required before merge.
