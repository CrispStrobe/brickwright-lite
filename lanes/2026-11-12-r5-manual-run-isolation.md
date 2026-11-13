# Shared workflow manual-run isolation

Status: CLAIMED. Owner: shared concurrency and guard continuation.

The owner authorizes this lane to reconcile the workflow-level concurrency
policy across the 23 workflows changed by policy commit
`4be93d2bfd422acdc3f776a73b72d099813538e1`. Keep superseded push and pull-request
cancellation, including existing label-group distinctions. Isolate manual, tag
and other non-superseding events by unique run identity so queued or running
runs cannot displace one another.

Scope includes the exact affected concurrency group lines and focused policy
tests. The existing i80386, Rust notices, vendor, Pages, cycle, model API,
debug efficiency and pin-history guard tests may admit the reviewed policy while
preserving their historical byte hashes, security checks, trigger coverage,
dependency pins and deployment-ordering protections. A focused helper or fixture
may be added where needed for closed, reversible projections. The old expectation
that every superseded push retains a verdict is replaced by the requested
supersession policy; manual and tag protection remains a positive requirement.

Do not change other workflow jobs, commands, actions, product code, dependency
pins, one-shot events or thresholds. Qualification requires source-bound
cross-event group matrices, negative controls, exact historical projections,
affected tests and all enabled exact-head checks. This does not establish browser,
physical-hardware or model qualification.
