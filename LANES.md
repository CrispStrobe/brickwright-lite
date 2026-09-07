# Concurrent-work lanes

Use this file as a protocol, not a diary. Active claims belong in the table and
are removed when released. Results belong in [HISTORY.md](HISTORY.md).

## Mandatory protocol

1. Fetch the remote and inspect recent commits and remote branches.
2. Create a dedicated worktree from the requested base and a feature branch.
3. Add one claim below in the first pushed commit. State exact files or contract
   boundaries; broad component names are not exclusive claims.
4. Before editing generated or mirrored files, identify their producer and work
   there first.
5. Rebase or merge the current integration tip before handoff, then inspect the
   full name-level diff and tree shape.
6. Run focused tests and every gate named by the task contract.
7. Push the reviewed commit, remove the claim, and add only durable evidence to
   `HISTORY.md`.

Never share a checkout between agents. Never use `git stash -u` in a directory
another process may use. Never overwrite unrelated dirty files. Do not assume a
small diffstat proves the base tree is intact.

For dual-tracked overlay/package pairs, change the owned overlay, run the
integration script, and commit the resulting tracked mirror together. For
external producers, land and verify the producer commit before changing its
pin here.

## Active claims

None.

If a claim is stale and its owner cannot be reached, inspect its branch and
worktree before releasing it. Do not infer abandonment from silence alone.
