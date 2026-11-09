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

Result (2026-11-09):
- Construction: the hub is pinned to the motor posts (four 2780 pins). The hosted construction gate
  also found the supplier's eight half bushes 7.5 LDU inside their wheels; they are seated flush now.
- Supplier checks: the runner and judge are not in the repository. Post-finish catch and fault-stop
  hold were measured on the real VM with the virtual SPIKE hub; both behave correctly (values in the
  checkpoint). The likely cause of the declared catch failure is a check taken at the instant of
  finish, while a late roller is still rebounding.
- Judge `rolling-inertia-v1` (`scripts/lib/sim-lab-rimrun-judge.mjs`): a = g·sinθ/(1+I/mr²) less the
  engine's default 0.05/s damping, with I from the compiled colliders. Measured ratio 1.0816 against
  1.0778 predicted. `rimrun-swapped` moves the lead to the other lane. Removing the ballast gives
  ratio 1.0006 (law lost).
