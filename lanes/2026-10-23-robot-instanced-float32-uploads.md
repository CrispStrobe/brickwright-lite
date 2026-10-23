# Preserve float32 instance bytes without redundant uploads

CLAIMED — bounded Robot Lab rendering repair, Codex, owner-authorized model
qualification continuation, 2026-10-23. Base
`7acf95cc1d223d82301690f7419d43d052065f0c`; isolated source branch
`lane/robot-instanced-upload-20261023`.

Own only `overlay/scratch-gui/src/lib/bw-sim/view/instanced-parts.js`, its
generated package mirror when integration materializes it, the existing
`test/bw-sim-instancing.test.mjs`, and this claim. Other renderer, measurement,
transport, model intake and API owners retain their scopes. No new import
allowlist, dependency pin, shader, geometry, clock, VM, solver, model or oracle
changes are included.

The instance cache uses Float32Array values but compares them directly against
double-precision Matrix4 and Color components. A component unchanged in GPU
precision can compare unequal on every sync and repeatedly mark attributes for
upload. Compare at the existing stored float32 precision, preserving the exact
GPU bytes, while retaining genuine movement, tint/emissive/dim/visibility
changes and explicit forced uploads.

Before implementation: merge this claim. Verify the actual source defect with
a non-float32-exact transform and color; unchanged repeated sync must retain
bytes and attribute versions, while real representable changes must propagate.
Add meaningful matrix/color omission or comparison mutations and preserve all
existing instancing controls. This source defect does not establish its cost,
an FPS improvement or the cause of the retained WebKit deadline failures.

Before landing: normally compose the model successor and qualified main,
preserve protected source/model inputs, obtain affected actual frontend/browser
qualification with the existing viewport, rendering, physical assertions and
deadlines, and require every enabled exact-head check to succeed. Use a normal
matched-head merge and verify predicted/landed trees and parents. Retain the
original failures and bounded diagnostic; no shortened diagnostic PASS,
performance, hardware or physical-accuracy claim.
