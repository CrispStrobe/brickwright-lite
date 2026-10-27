# Existing experimental-model audit, 26 October 2026

The source-bound records in [the audit data](data/robot-lab-main-audit-20261026.json)
cover 61 existing example choices from main at
`b6f39a12348b984dc9c5f59b826e7680539b6148`. These are separate from the nine new
Technic intakes. Model and program SHA-256 values identify the exact inputs.

The diagnostic used a normal start (no artificial cold-settle interval), the
actual VM/native simulator and a 90-second simulation limit followed by two
seconds of observation. It does not establish each example's proposed passive
law, instruction quality or browser acceptance. Program completion alone is
not a qualification result.

Of 58 saved summaries, 43 completed their program, 11 remained unfinished within
the simulation budget, and four reported a program fault:
`equal-share`, `equal-share-even-springs`, `impulse-line` and
`impulse-line-missing-middle`. All four were enabled experimental gallery entries
at the audited source. None contains the 3L axle involved in the separate
CounterSlide collider repair; that repair cannot be claimed to fix them.
Equal Share stopped around 3.708 degrees against a 15-degree target; Impulse Line
stopped around -23.348 degrees against -24.542 degrees. The saved observations
and program variables retain the actual outcomes.

Fifteen acquisitions hit their 150-second wall limit during severe filesystem
stalls. Twelve had already saved a summary, so these counts overlap the summary
categories. The acquisition exit code remains attached to every saved row.
Three produced no summary: `ghost-pivot-unequal-link`, `afterturn` and
`afterturn-fixed-masses`. Timeouts are inconclusive and must not be reported as
passes or mechanical failures. These cases need a fresh acquisition on a healthy
filesystem before further diagnosis.

This audit preserves the existing examples and their owners' work. Follow-up
should first reproduce the four faults from their recorded source hashes, then
add independent passive-output and physical counterfactual checks. The eleven
unfinished and three missing-summary cases remain explicit validation gaps.
A later main revision requires a source comparison before inheriting any result.
