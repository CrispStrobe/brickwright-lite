# RimRun contact-order diagnostic

E1 investigates the speed loss at joints between abutting track tiles. The
instrumented run enables Jolt's enhanced internal-edge removal for every body
for this diagnostic only. It records body IDs, part membership, motion types,
flag values, contact callback order and world-space normals, as well as the
existing programme track. It does not change the shipped simulation.

From a checkout with the normal installed dependencies and Node 22, run:

```sh
node --experimental-loader ./scripts/robot-lab-e1-contact-loader.mjs \
  --import ./scripts/lib/register-gui-scope.mjs \
  ./scripts/robot-lab-e1-contact-capture.mjs capture.json
node ./scripts/robot-lab-e1-contact-summary.mjs capture.json
```

The output file must not already exist. The loader refuses source that does not
match its exact instrumentation anchors. Keep raw output outside the repository.
The capture is a diagnostic run with altered edge-removal settings; it is not a
replacement for the unmodified model's qualification or a browser run.

An actual direct-VM run using the bw.9 SIMD module completed the programme at
7380 ms, without model preparation issues. The frame and both rollers were
all dynamic and reported the flag enabled. The frame had a lower native ID;
all 2,020 left and 2,029 right roller–frame contact callbacks listed the frame
first. The raw capture contains normals and fixed-step indices. These are
callback observations, not direct instrumentation of the narrow-phase call.
The result supports investigating body ordering but does not establish why the
speed loss occurs or prove that enhanced removal fixes it. The original RimRun native judge passed on a subsequent capture containing the
programme variables (acceleration ratio 1.07846 and lead 21.23 mm). This
checks the instrumented flag-on run, not the unmodified browser or a seam fix.

Next, instrument the actual native narrow-phase entry and the joint crossing,
then compare with a suitable reversed-order control while preserving the
part-pair filter. Qualify any engine or model change separately; do not widen
the RimRun judge or enable the flag globally to claim a fix.

## Actual RimRun reversal experiment

A paired actual direct-VM experiment rebuilt the pinned native source with the
exact Emscripten toolchain. It compared trace-only and selected-pair reversal
with enhanced removal enabled. Both unchanged native RimRun judges passed. For
both frame–roller pairs, the native trace recorded 2,076 frame-first entries;
the reversal variant recorded 2,076 reversed queries for each pair. Selected
part-pair allow/reject controls passed on both modules.

In one-tyre-radius neighborhoods around the four matched tile ends, the
integrated velocity residual against the ideal rolling model changed from
−4.007, −5.206, −3.531 and −5.371 mm/s to −0.029, −0.101, −0.042 and
−0.267 mm/s, respectively. These are finite model comparisons, not measured
contact impulses. The diagnostic uses selected native body IDs; it is not a
reusable collision policy. The later opt-in implementation and its additional
controls are described below; browser qualification remains open.

The paired experiment also ran the swapped model and an enhanced-removal-off
control on both modules. All six actual runs passed their saved-output audits;
the two flag-off model tracks were identical. These controls apply to the
experimental modules and do not qualify a general collision policy.

## Opt-in pair policy

The bw.10 engine adds a per-world, explicit source/surface body-pair policy.
RimRun and its swapped variant declare the frame and rollers as selected pairs;
other model pairs retain their normal contact handling. The declaration is saved
with the model and survives editor round trips. Callback replacement and world
teardown also guard against reentry, and Node multithreaded modules initialize
their workers correctly.

Fresh direct-VM runs of RimRun and the swapped model passed with enhanced
removal both on and off, using each of the scalar and SIMD package modules.
The package's eight export variants passed their filter, legacy and native
lifecycle controls. These are simulation checks; they do not establish physical
accuracy or qualify a browser run.
