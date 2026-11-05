# Signed current in a 5 ms passive capture

Owner: Circuit/instrument integration maintainer. Status: DONE in this source candidate, 2026-11-05; hosted qualification pending.
Base: `5922efcb237223f1a8ef9eb935eb7397a71e7aec`.

Own one new `test/circuit-signed-current-5ms.test.mjs` and this claim leaf.
Use two newly authored RC cases with opposite source polarities, a 5 ms / 1 MHz
capture, actual installed `bwc measure`, and current meters at both resistor
terminals. Freeze the component values, clock, whole-capture limits, signed
terminal convention and tolerances before observing the CLI. Compare all 5,000
voltage samples and both signed meter-window readings against independent analytic
expectations. Include a meaningful nonzero reversed-current negative; preserve
CLI refusals and output handling.

An independent ngspice 42 comparison of the new reference covers 5,001 time-grid
points per polarity including t=0; it is reference evidence only. Report actual
CLI outcomes separately. Do not replay the earlier completed circuit cohort,
change historical seals or source pins, or infer physical calibration. The Lite
S040 package/binding owner keeps its existing paths. Qualify the installed-pinned
CLI test on hosted CI and keep sample count, budget and tolerances unchanged;
no model, importer, runtime, workflow, pin, lock or deployment change is owned.

Reference preparation: analytic signed current and a separate trapezoidal
integral agree for both polarities. Frozen newly authored ngspice 42 inputs agree
with analytic voltage and source current over 5,001 points per polarity; worst
errors are 8.54 nV and 10.2 pA, and integrated current differs by 41.1 pA.
These are independent reference observations, not installed CLI results. The
source comparator rejects reversed nonzero current and nonfinite readings; the
two actual CLI cases must still pass on the qualified installed pin.
