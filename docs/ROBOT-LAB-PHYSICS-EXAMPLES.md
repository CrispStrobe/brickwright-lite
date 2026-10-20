# Robot Lab physics examples

The Robot Lab toolbar's **Examples** button opens a searchable model browser in Simulate and Build.
Each card shows its physics topic, piece count, motor count, hub family and licence. **Open model**
replaces the current build; **Open model + program** also loads the example into blocks and the Code
editor. English and German are supported. Filter **More than 50 pieces** to find the larger builds.
The compact model dropdown remains available in Simulate.

## New original builds

| Model | Pieces | Motors | Experiment |
|---|---:|---:|---|
| Survey rover | 28 | 3 | Two drive motors and a motorised distance-sensor head; travel out and back while scanning ±30°. |
| Chain transmission | 59 | 1 | A 42-link chain links 16- and 24-tooth sprockets. Three input turns produce two output turns, in the same direction, then return home. |
| Flywheel differential | 56 | 2 | Brake one output to observe the other turning at twice the carrier speed; release and drive both outputs. Six large wheels provide measurable rotational inertia. |

These are original Brickwright models under BSD-3-Clause. Pieces are physical part instances after
flattening the model, including pins, axles and individual chain links; motors and hubs count as
pieces. Motor counts are separately compiled actuator counts. The existing 85-piece excavator is
also included by the larger-model filter.

`gen-physics-workshops.mjs` builds the two workshop files from our existing chain and differential
modules. The additional parts form bearings, cross-bracing and flywheels. It refuses disconnected
or overlapping builds. These models have complete generated instructions with every part included
once. Their digital validation does not substitute for a physical LEGO build.

The physics tests execute the actual example programs through the VM and Jolt, rather than only
checking model text. They measure the chain ratio, the differential identity
`(left speed + right speed) / 2 = carrier speed`, the doubled output when one side is held, and
lower acceleration under equal torque with the six flywheel wheels installed. A separate full-motor
stress check verifies finite poses and that the assembly stays together. These are regression checks
for the simulator's implemented physics, not precision predictions for real motor friction.

## Catalogue maintenance and verification

Model registrations live in the simulator, Robot Lab dialect and VM extension. Keep all three in
sync. The browser's bilingual lesson descriptions live in `scripts/gen-robot-lab-catalog.mjs`;
counts and hub metadata are generated from the actual compiled models:

```sh
node --import ./scripts/lib/register-gui-scope.mjs scripts/gen-robot-lab-catalog.mjs
node --import ./scripts/lib/register-gui-scope.mjs scripts/gen-robot-lab-catalog.mjs --check
node --import ./scripts/lib/register-gui-scope.mjs --test test/bw-sim-physics-workshops.test.mjs test/bw-sim-example-catalog.test.mjs test/robot-lab-model-intake.test.mjs
node scripts/verify-sim-lab-browser.mjs --part=examples --examples=physics-workshops
```

The browser gate chooses and runs the chain through visible controls in the real physics worker,
checks its measured ratio and return, opens the differential from Build with its program, exercises
search, size/topic filters, empty results, Escape and focus restoration, and checks the German
browser on a touch tablet viewport.

## External model intake

The supplied Philo/BrickHub notebook was inspected before running its extracted downloader. Its
default manifest requested 44 models: 21 BrickHub downloads succeeded, and 23 Philo requests were
blocked with HTTP 403. Five additional BrickHub candidate downloads succeeded. All 26 downloaded
files were already native LDraw MPDs, so **zero format conversions were needed or performed**.

SHA-256 comparison against the peer's 148-model benchmark list found 19 identical downloads and
seven additional files. The corpus benchmark and parts-gap ranking remain owned by that lane;
this work reuses its loader/benchmark and published physics fixes rather than starting another
148-model run. Older timings, timeouts or NaNs from before the Jolt binding fixes must not be used
as current model qualification evidence.

The seven additional files were checked on the corrected core using the peer's headless loader
and benchmark, with all detected motors at 60% for two simulated seconds (75-second process limit).
Five completed and two timed out. None meets the shipped-example standard yet:

| BrickHub ID | Recognised physical pieces | Result |
|---|---:|---|
| 299 | — | Process limit exceeded; unqualified. |
| 296 | 647 | 67 unknown parts, 127 loose issues, bodies displaced over 0.5 m. |
| 462 | 249 | 12 unknown parts, 3 loose issues, non-finite poses; also missing licence. |
| 446 | 411 | No motor in the compiled assembly, 3 unknown parts, 9 loose issues. |
| 426 | 264 | Motor turns and poses stay finite, but 12 unknown parts and 2 loose issues remain. |
| 111 | — | Process limit exceeded; unqualified. |
| 304 | 751 | 73 unknown parts, 131 loose issues, bodies displaced over 0.5 m. |

These recognised-piece counts omit unsupported/decorative geometry and are not full recursive
inventories. The machine-readable results are in `docs/data/robot-lab-additional-model-checks.json`.

Downloading, parsing, deriving unknown parts, turning a motor and correctly reproducing an intended
mechanism are separate milestones. No downloaded model is added to the shipped examples by this
change. The original workshop models above are the new qualified examples.

Only MIT/ISC/BSD/Apache, CC0/public-domain declarations, CC BY and CC BY-SA model sources may be
considered for bundling. Preserve publisher attribution, source links, every embedded section's
notice, and any share-alike obligations. Unknown/custom terms require review; NC content is
excluded even inside an otherwise compatible MPD. `scripts/lib/model-license.mjs` and its tests
encode this intake policy; they do not infer permission from availability or a download manifest.

In particular, [SPIKE Prime Rodent](https://brickhub.org/i/560) has a CCAL notice on its publisher
page but the downloaded file contains `0 !LICENSE Free for non-commercial use.` in an embedded
section. It is excluded as downloaded. The [GBC Pump 3M candidate](https://brickhub.org/i/462) has
no established publisher licence and remains review-only. The receipt in
`docs/data/robot-lab-notebook-intake.json` records file hashes and notices without redistributing CAD.
Recreate that receipt with `node scripts/audit-robot-lab-downloads.mjs
--peer-list=bench-list.txt <download-run>/manifest.json <candidate-run>/manifest.json`. The audit
checks the retained bytes against the downloader's SHA-256 and compares them with the existing
corpus; it does not execute any downloaded model code or treat the manifest's licence label as
permission overriding embedded restrictions.
