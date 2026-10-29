# LM741 startup-window acceptance record

This record tracks the preserved `v1-instant-settling` TODO in
`test/lm741-bias-supply-package-acceptance.test.mjs`. It records a measurement-
window error in the original acceptance predicate, not a new electrical law.

## Original failure

The authored unity-gain follower uses the nominal 25 C bias/supply domain,
positive and negative 15 V rails, and zero-state initialization. The original
predicate compares the mean over 0–20 microseconds with steady-state currents.
With a 10 kilohm load returned to negative 1 V, its first observed failure was:

```text
sign 1, load 10000 ohm to -1 V: V+ pin -0.0018000219515663727 expected -0.00180007
```

The difference is about 48 nA. The window includes the load-step startup
transient; it is not a steady-state mean. The original predicate and its
observed failure remain preserved as a TODO. Its bounds are not relaxed.

## Separately frozen settled-window check

The `v2-post-settling-window` predicate was frozen before its first execution.
It computes the 10–20 microsecond mean from two deterministic captures:

```text
windowMean = (20 * meanOver20us - 10 * meanOver10us) / 10
```

For the pinned nominal linear-pole card, the closed-loop time constant is
`1 / (2 * pi * 1 MHz)`, about 159 ns. Ten microseconds exceeds 60 time
constants. The check retains its original current tolerances, tests both
input-offset-current polarities and three loads, and asserts terminal KCL,
rail-source currents, power and energy. This covers six parameter combinations
of the authored follower, not six distinct circuit topologies.

At candidate `e85dc904`, the
[actual packaged unit-shard check](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40744838545/job/123035439624)
passed v2, named refusals, default-off behavior and GUI non-exposure while
retaining the v1 TODO. Successful per-load JSON was not retained separately;
this is CI assertion evidence, not an independent raw-value recount. That
job's success does not qualify the entire candidate.

## Scope and documentation dependency

The domain uses nominal typical values at the stated operating conditions.
These results do not establish physical calibration, guaranteed device limits,
a new GUI domain selector or a newer installed release.

The TODO points here so its failure record remains an explicit build input
under the existing receipt-directory rules. The broader
[campaign handoff](../CIRCUIT-INSTRUMENT-REGRESSION.md) records current progress;
its routine status edits do not change this frozen numerical predicate.
