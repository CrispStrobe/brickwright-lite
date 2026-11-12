# CI isolation exceptions

Status: OPEN, 2026-11-12. The current instruction forbids editing workflow
concurrency blocks. This file records two exceptions for a future explicitly
permitted policy change; it does not alter or waive any existing check.

`cycle-core-qualification.yml` admits manual, scheduled and path-filtered
main-push events into the same workflow/ref group. A later qualifying main
push can therefore cancel an active manual or scheduled run, and a later run
can replace a pending run in that group. `model-measurements.yml` has manual
and pull-request triggers using the same workflow/ref group; repeated manual
runs on the same ref can replace pending peers, and a manual run targeting a
pull-request ref can collide with that PR group.

When the restriction changes, review the actual event/ref combinations and
isolate manual, scheduled and tag executions without changing the intended
same-workflow/ref cancellation of superseded push and PR work. Add negative
controls for active and pending runs, preserve every existing security,
qualification and deployment assertion, and run the required exact-head checks.
Do not dispatch or cancel an actual one-shot event merely to test the policy.
