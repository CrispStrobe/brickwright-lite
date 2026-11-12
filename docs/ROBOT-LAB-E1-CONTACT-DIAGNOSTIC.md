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
speed loss occurs or prove that enhanced removal fixes it. The original RimRun
qualification judge was not evaluated by this capture: its extra observation
fields are not part of this diagnostic.

Next, instrument the actual native narrow-phase entry and the joint crossing,
then compare with a suitable reversed-order control while preserving the
part-pair filter. Qualify any engine or model change separately; do not widen
the RimRun judge or enable the flag globally to claim a fix.
