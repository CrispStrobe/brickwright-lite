# Bounded CI cost reporting for long browser jobs

Owner: Codex SAMD continuation. Status: CLAIM ONLY; merge before implementation.
Base: `835e96acb9557df07f8e7eb0797b895bded9592a`.

The completed CI-cost run40061586196 fails because browser(robotlink) exceeds
its legacy reporter's200-step-per-job bound. Preserve that failed original and
leave `scripts/report-ci-run-metrics.mjs`, its bounds and behavior unchanged.

Own new `scripts/lib/ci-run-metrics-windowed.mjs`,
`scripts/report-ci-run-metrics-windowed.mjs`,
`test/ci-run-metrics-windowed.test.mjs`,
`docs/CI-COST-WINDOWED-REPORT.md`, `.github/workflows/ci-metrics.yml` and this
claim only. Other CI classifiers, qualification census, workflows and owners
retain their boundaries.

Introduce a separately named report/profile that traverses every actual step
through windows of at most200. Keep input8MiB and1000jobs ceilings; constrain
the new profile to at most1000nonempty windows/200000total steps, no more than
the legacy profile's global worst case. Never truncate/filter steps, discard
failed/cancelled jobs, invent absent times or treat pagination as complete.
Keep runner cost per real job, not per window; first-debugger verdict ranges
over the complete original union. Admit exact input digests/counts and preserve
first errors. The legacy over200 refusal remains a required negative control.

Require actual legacy-CLI parity for admitted small inputs, multiwindow early/
late debugger and timestamp/job-cost controls, and refusal of incomplete input,
extra counts/windows, oversize/overflow and malformed metadata. Only after these
pass switch the reporting command to the new explicit profile. Keep all input
bounds and product/guest performance gates unchanged; no branch build rerun,
label/dispatch or guest/model/pin change is authorized by this lane. Validate
all enabled exact-head source checks before normal matched-head merge.
