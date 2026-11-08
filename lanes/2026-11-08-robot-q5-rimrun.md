# Robot Lab — RimRun hub mount, catch/watchdog checks, judge and promotion (Q5)

Status: ACTIVE — claim and change in one PR.
Owner: Claude, Robot Lab qualification lane.
Branch: `lane/robot-q5-rimrun-20261108`.

Scope: `rimrun.ldr`/`.mpd` and `rimrun-swapped.ldr`/`.mpd` (hub mount only, plus any
root-caused catch/watchdog repair), `programs/rimrun.bw` only if the root cause is in the
program; a RimRun judge module and its import/judge id in `QUALIFICATION_JUDGES`; the contract
in `docs/data/robot-lab-qualification.json` and its source fixture; the registry move and
regenerated catalogue/lesson outputs if promoted; RimRun entries in
`test/bw-sim-models-solid.test.mjs` and the qualification test; the checkpoint record, the
handoff section 000 and the Q5 line of `lanes/2026-11-03-robot-lab-pending.md`.

Not in scope: other Q tasks, thresholds, gates, the harness's validation logic.
