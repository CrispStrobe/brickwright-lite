# Signed current in a 5 ms passive capture

Owner: Circuit/instrument integration maintainer. Status: CLAIMED, 2026-11-05.
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
