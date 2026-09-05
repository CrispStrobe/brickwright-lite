# Worktree reconciliation — 2026-09-05

The audit covered all 40 registered worktrees and their local branch or
detached tips against GitHub `main`. It was read-only until recovery refs were
created. No worktree was reset, cleaned, rebased, removed or pruned.

## Safety result

- The only dirty tree is `/mnt/volume1/code/lego/brickwright-lite`, whose local
  `main` is intentionally behind GitHub and contains owned edits to `PLAN.md`,
  `README.md`, `ROADMAP.md` and untracked
  `docs/SESSION-ROADMAP-2026-09-05.md`. This tree must not be updated or removed
  until its owning session commits those files.
- Every other registered worktree was clean at audit time.
- Detached paint/example commits were compared by patch, not merely ancestry.
  `bb84ef2e`, `6ed0f22e` and `70fd572b` are superseded by stronger changes on
  `main`; `e5123220` is patch-equivalent to a change already on `main`.
- The apparently unique pseudocode diagnostic commit `6ecc00e5` was replayed
  against current `main`; after retaining the newer chip metadata, the
  cherry-pick was empty. Its behavior is already present and no duplicate
  commit was made.
- Stale branch ahead/behind counts are not deletion evidence. Several older
  topic tips contain overlapping patch families, so none was merged wholesale.

## Remote recovery archive

Before any future cleanup, the following clean tips were pushed to dated
GitHub recovery branches:

- `recovery/milestone0-gate-truth-20260905` — `bd7729e6c`
- `recovery/waves-2-7-20260905` — `bc1eda1ac`
- `recovery/examples-deferral-20260905` — `bb84ef2e4`
- `recovery/extension-capability-broker-20260905` — `5635d6f38`
- `recovery/pseudocode-then-20260905` — `495de1639`
- `recovery/p10-codemirror-20260905` — `77d119d58`
- `recovery/p11-paint-baseline-20260905` — `6ed0f22e9`
- `recovery/p11-paint-final-20260905` — `e5123220e`
- `recovery/p11-paint-alt-20260905` — `70fd572be`
- `recovery/p6-preview-measure-20260905` — `1d16832b6`
- `recovery/paint-activation-bridges-20260905` — `60265a77d`
- `recovery/paint-activation-split-20260905` — `112cc9e04`

Other clean worktree tips were already reachable from a remote-tracking ref or
were ancestors/patch-equivalents of remotely retained work. Recovery refs are
an archive, not an endorsement for blind cherry-picking; each stale patch must
still be reviewed against current behavior and tests.

## Cleanup boundary

Physical worktree removal is intentionally deferred. It saves little compared
with the risk of deleting another session's useful checkout, and the one dirty
tree proves active ownership still exists. A later cleanup may remove only a
clean tree whose tip is still reachable from GitHub and whose owner has
released it.
