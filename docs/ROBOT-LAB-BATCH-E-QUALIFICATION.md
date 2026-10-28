# Tipline, TwistSpan and SwayShift qualification

The three primary entries move into the established model registry in this
candidate. Tipline Swapped, TwistSpan Inner and SwayShift In Phase remain
experimental comparisons. Existing model and program bytes are unchanged.

The source fixtures retain the original BSD-3-Clause programs, models, observer
code, contracts and lessons, with archive and per-file SHA-256 provenance.
The maintainer judges use repository-relative imports and the original physical
thresholds. Observation wrappers delegate unchanged calls to the actual VM,
motor controller and physics engine; they never prescribe body motion.

## Native evidence

- Tipline: high ballast tips before the low-ballast tower slides. The comparison
  exchanges only 16 ballast heights; both outcomes follow ballast height rather
  than lane. Actual deck/load poses, native velocities and contacts distinguish
  tipping, sliding and later wall contact.
- TwistSpan: two real fixed cords suspend a passive payload. Independent
  zero-crossings measure its period; native inertia and attachment geometry
  provide the separate prediction. Halving the attachment spacing reproduces
  the approximately 1.976 period ratio with identical rigid placements and
  program bytes.
- SwayShift: the same machine and waypoint algorithm compare half-period and
  full-period timing. The reproduced common-window residual is about 0.265°
  versus 10.465° RMS; an arrival-relative comparison separately limits the
  advantage from earlier arrival.

The maintained gate runs ordinary and strict imports, a separate 2.5-second cold
start, actual comparison runs, frozen-output recordings and a one-centimetre
world translation. Real physical drive removals must also destroy the measured
output law while the real motor completes. A topology warning alone cannot
satisfy the disconnection test.

Ordinary observations use 1000/60 ms. The second cadence is 20 ms for Tipline
and TwistSpan and 10 ms for SwayShift. The attempted 20 ms SwayShift recording
failed the unchanged requirement of at least 40 samples per period; that failure
is retained. No sampling threshold was relaxed.

## Admission boundary

Before merge, `scripts/qualify-robot-lab-models.mjs --models=tipline,twistspan,swayshift
--mode=full` must pass every stage on the final candidate. The matching source
PR retains its source fingerprint and full qualification receipt, including
Chromium/WebKit example runs, saved-project replay, manual controls and export.
Hosted final-head build and all six unit shards are separate required checks.

The earlier experimental checkpoint observations remain historical. Neither
those observations nor a successful generic browser shard qualify this source.
These are simulation results; physical construction, cord/contact behavior on
hardware and releases remain outside this promotion.

CI catalogue follow-up: the retained SwayShift comparison shares the primary model geometry but has its own example ID. The experimental catalogue control now uses `entry.id || entry.file`, matching the Examples UI, and still requires experimental details for every comparison. The full runner includes this control in its registration stage. Model, program, judge and threshold bytes are unchanged; the source PR records the fresh committed-head receipt.
