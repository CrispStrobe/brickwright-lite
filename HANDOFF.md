# Agent handoff

This file defines what a fresh agent must know and return. It contains no
session log.

## Read before acting

1. Read [README.md](README.md) for product boundaries and supported workflows.
2. Read [PLAN.md](PLAN.md) for task contracts and acceptance gates.
3. Read [ROADMAP.md](ROADMAP.md) for dependency order.
4. Read [LANES.md](LANES.md), inspect the remote, and claim a non-overlapping
   scope.
5. Read only the architecture document linked by the selected task.
6. Check [BLOCKED.md](BLOCKED.md) before interpreting an unavailable external
   resource as a code defect.

Historical narrative is never required to start. Consult
[HISTORY.md](HISTORY.md) only to avoid repeating a decision or to locate prior
evidence.

## Repository invariants

- Application code is BSD-3-Clause; shipped dependencies must match the
  repository licensing policy and notices.
- `overlay/` is owned source. `packages/` is a validated generated mirror.
- Network inputs are pinned by immutable identity and content hash.
- GPL/AGPL tools may be developer-side oracles but cannot enter the shipped
  product or dependency graph.
- Official LEGO, Pybricks, and TI firmware is user-supplied local test input;
  never commit, redistribute, log, or upload it.
- Firmware simulation and physical-hardware verification are distinct verdicts.
- Real-silicon flashing is outside simulator tasks unless separately and
  explicitly authorized.
- Unsupported behavior must be reported, not silently approximated.

## Required handoff payload

Return all of the following:

- repository, worktree, branch, and exact commit;
- files and contracts changed;
- commands run and their outcomes;
- remote workflow URLs or run identifiers when remote checks are required;
- skipped gates and the exact prerequisite for each;
- remaining risks or follow-up tasks;
- confirmation that unrelated changes were preserved;
- before/after line counts for documentation-rewrite tasks.

A handoff is incomplete while its branch is unpushed, its lane is still claimed,
or its current-state documentation contradicts the implementation.
