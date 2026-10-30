# Passive-RC 5 ms / 1 MHz precision batch regression (campaign task 4)

CLAIMED and implemented in the same PR, 2026-10-28, by a Claude Code agent for
the reference-qualified instrument campaign (task 4, longer captures).

Owns only `test/circuit-passive-batch-5ms.test.mjs` and this file. No pins,
workflows, harness scripts or supplier source change.

The test runs the installed `bw-circuit-ui` `bwc measure` (pinned CUI
`da28bb8c`, Board `c7bcbe4b`) on three passive RC circuits (DC step, 10 us-edge
pulse, 1 kHz sine) at 5 ms / 1 MHz with `precision-v1` and zero state, and
compares all 5,000 raw points, a 0.5 V trigger crossing and both 0..T meter
integrals with closed forms that were frozen before observation and admitted
against ngspice-42 `.tran` references. It keeps the passive `--watch`,
50 ns step and over-budget refusals as negatives with no CSV written.

Limits: numerical conformance on three authored passive circuits only; no
active-domain, watch, physical-calibration or general long-capture claim. The
CLI's 32 MiB output cap cannot be reached through the CLI while the 20,000
attempt cap holds, so this test does not exercise that byte gate.
