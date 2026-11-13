# Held Solstice source control console capture

Owner: Robot CI source-control reviewer. Base candidate:
edaff13473434aa58b570a279593a3a63883e320.

Scope: test/robot-lab-held-solstice.test.mjs only. Capture stdout-bound console
messages from the final mocked intake/export source control with the existing
quiet-console helper, and assert the exact captured messages. Preserve actual
capture calls, source-byte checks, primary-error checks, census/output guards,
all guest thresholds and production logging.

Qualification: original census evidence retained, affected test passes with
24 test records and zero raw stdout under the actual census reporter, and
removing capture must fail the raw-output control. No source push, CI rerun,
dispatch, build or guest execution before review of this local candidate.
