# Signed RL scope and meter consumer check

Status: MERGED, 2026-11-12 (claimed 2026-11-06). Owner: circuit measurement integration.

Add a bounded, newly authored transient consumer regression for a series
1470-ohm resistor and 0.073-henry inductor driven by +2.3 V and -2.3 V.
Use the installed, pinned `bwc measure` CLI with zero-state initialization,
precision mode, a 5 ms duration and a 1 MHz output rate. Compare every finite
scope sample against the independently stated exponential response and check
both resistor terminal-current signs, units and complete-window averages. Check
capture length, sample timing and the existing work budget; prove the current
comparator rejects a sign reversal and a nonfinite value.

Independent ngspice 42 and the closed-form response have already been compared
on these newly authored circuits, 5,001 points per polarity including time
zero. The installed Brickwright consumer subsequently passed both signed captures. Existing
supplier tests cover different 200 µs signed RL cases; this adds a longer,
different-value application consumer check, not a claim of first RL support.
Do not rerun completed cohort inputs or weaken existing tolerances.

Own only this claim and a focused new test. Preserve package pins, production
source, workflow policy and existing evidence. The focused test has run against the installed packages; retain its actual
failures and unchanged numeric limits. No physical
instrument or arbitrary-circuit accuracy claim follows from these fixtures.

Implementation: `test/circuit-signed-rl-5ms.test.mjs` scopes the inductor
terminal against `source * exp(-t * R / L)` and checks both resistor terminal
meter signs against the closed-form complete-window mean current. A comparator
test plus the actual captures reject a sign flip, a doubled time constant,
swapped R and L, a reversed current and a nonfinite sample.


PR #1735 merged as `aef4bde3b441` after all 16 enabled final-head checks
passed. An earlier capture run passed both polarities but its encompassing
job failed a stdout transport control; that original failure remains retained.
For each polarity that capture reported a worst inductor-voltage error of
2.6941e-7 V against 1e-5 V, and terminal-current errors of 5.3545e-12 A
against 1e-8 A. The final merged test preserves those limits and diagnostics.
This finite software comparison does not establish physical accuracy.
