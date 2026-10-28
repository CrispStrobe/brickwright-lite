### C9 bounded closeout — 2026-10-19

Diagnostic source delivered in [Core PR248](https://github.com/CrispStrobe/labwired-core/pull/248),
merge `5b470d61`. Retain only
[run 39001605287](https://github.com/CrispStrobe/labwired-core/actions/runs/39001605287) at qualified controller `2201716d`.
All four source jobs and the independent source/cohort audits passed. The four
archives/logs were acquired once; **reuse retained originals, never download or
dispatch again**. C9.1 is complete. Measured step costs are pre-sync 913.558531,
sync 987.746057, current 1004.746098 and retained upstream 995.746146 Ir/step.
The [Core native-code review and decision](https://github.com/CrispStrobe/labwired-core/blob/main/docs/engineering/avr-layout-cost.md#causal-native-code-review-and-implementation-decision--2026-10-19)
identifies the exact extra nine timer-frame instructions, 17.1875 Ir/step of
combined central-clock outlining overhead, and eager advance setup. Some net
advance differences remain unassigned to individual source expressions, and
LLVM's triggering source perturbation is not established. These limits remain
explicit; the report does not claim a complete compiler-decision proof.

No further runtime optimization is justified: earlier broad attempts have not
supplied qualified gains across both prescribed source families, and the old
task-current timer shape is absent from the retained issue-251 fixed candidate.
That supplementary static observation has no new raw profile counts. The
separately qualified issue-251 full gate reports no regressions across all
unchanged 82 modes. Retain every baseline, tolerance, clock, profile and waiver;
no C9 engine release or Lite pin change follows. A future compiler-trigger
experiment or optimization needs a new precise current-source scope and its
own unchanged qualification. This finite investigation's source ownership is
released; preserve the controller and all original packets/failures.
