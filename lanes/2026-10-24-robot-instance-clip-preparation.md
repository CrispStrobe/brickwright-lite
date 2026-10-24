# Prepare Robot Lab line clip matrices per instance before attribute upload

DONE (source candidate; actual qualification pending) — Codex Robot Lab integration continuation, owner-authorized, 2026-10-24.
Isolated claim branch `lane/robot-instance-clip-claim-20261024`, reviewed base
`0bcff2c03cd0ffe2d1416e3aba36cc088eac9831`. Source will use a separately named
normal continuation of frozen combined PR #1312; preserve all consumed sources.

Own only per-instance line projection preparation and its early frame hook in
`overlay/scratch-gui/src/lib/bw-sim/view/instanced-parts.js`, the camera argument
to the existing scene callback in `view/sim-scene3d.js` and
`editor/editor-view3d.js` under the same directory, their generated package
mirrors when integration materializes them, the already registered
`test/bw-sim-instancing.test.mjs`, and this claim. Other editor, scene, transport,
measurement, model, API and native behavior remains with its current owners.

Comparison #1320 passed runtime readiness and the complete Sine save/reopen
journey, but Quartermaster again hit the unchanged 324-second deadline before
100 simulated seconds. Its last retained sample was 75.47 simulated seconds,
stage 83, done 0 and fault 0. This is a failure, not a causal measurement or
performance acceptance. Preserve its terminal originals and closed-unqualified
consumer. The previous per-draw preparation remains in the frozen source.

Investigate repeated per-vertex clip/instance matrix products. Prepare current
camera × object × instance transforms once per line instance before Three's
attribute upload boundary. Material draw callbacks occur after geometry upload
and must not supply new instance-buffer data there. Use the existing earlier
scene callback in both simulation and build views, with current camera/world
matrices and batch-owned buffers. Retain genuine movement, colors, visibility,
bounds, material sharing, disposal, regular projection and conditional-edge
visibility. Preserve geometry, resolution, appearance, camera navigation,
model bytes, dependency pins, physics, VM/clock, viewport, browser launch,
resource bounds, physical assertions, deadlines, baselines and thresholds.

Merge this claim before implementation. Require actual retained Three controls
for noncommuting camera/object/instance transforms, camera and part movement,
early upload timing, independent batches, both view hooks and conditional edge
visibility; detect meaningful stale/missing/reversed-transform mutations. Keep
controls in the registered instancing suite without broadening its allowlist.
Then admit a fresh official source-bound frontend and a separately named actual
comparison completing both original Sine/Quartermaster mechanics, manual
interaction, save and fresh-context reopen journeys. Refresh native impact
explicitly; earlier installed evidence stays tied to its exact source/package.
All enabled exact-head checks and affected actual qualification precede normal
matched-head merge and reviewed/predicted/landed tree and parent verification.
No release, hardware, physical-accuracy or measured speed-gain claim follows
from source preparation.

## Source controls and remaining qualification

Source continuation `lane/robot-instance-clip-source-20261024` normally includes
the frozen combined source and merged claim #1321. Each line geometry owns its
clip attribute, derived from the effective Float32 world-instance buffer and
current camera/object matrices in the two existing early scene callbacks.
The shaders consume that prepared matrix directly; face buffers and the
conditional visibility predicate remain intact. Source review found no blocker.

Eight focused controls pass against actual Three 0.186.1. They cover both real
scene callbacks before material preparation, independent point projections,
camera/projection/parent changes, shared geometry and materials, unchanged-frame
upload stability, hide/unhide, conditional sides and disposal. The unfixed
parent and ten authored source cuts are detected, including missing camera,
world or instance transforms, reversed multiplication, shared clip storage,
missing uploads, double-precision dirty comparisons, both omitted early hooks
and a reversed conditional predicate. Product source was restored exactly.
Controls remain in the existing registered suite without allowlist expansion.

Reassociated CPU/GPU products are mathematically equivalent, not guaranteed
bit-identical. A fresh official frontend, complete unchanged actual Sine and
Quartermaster journeys, changed-frontend-bound native executable and affected
installed handover remain required, as do all enabled final-head checks.
The failed #1320 result and unlaunched intermediate native image stay separate
finite evidence; no speed-gain, resolution or installed acceptance is inferred.
