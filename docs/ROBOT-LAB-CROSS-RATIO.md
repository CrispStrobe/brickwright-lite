# Cross Ratio qualification candidate

Status: implementation candidate; hosted qualification has not run. The model
remains experimental. This work adds no change to the shipped model, program,
physics, motor controller, dependency pins or experimental registry.

The frozen contract is
[`contract.json`](../test/fixtures/bw-sim/cross-ratio/contract.json).
Four parallel hinge lines define a crossed four-bar in the XZ projection:
the ground and coupler spans are 80 LDU, and the input and output spans are
160 LDU. Origins along each hinge axis differ in Y; those offsets do not change
the projected link lengths. Thus k=(160+80)/(160-80)=3 and
`tan(phi/2)=3*tan(theta/2)`. The initial physical headings are 60°, 120° and
180°. World coordinates are `[x,-y,-z]*0.0004`, so heading is `atan2(-z,x)`.

The native candidate runs the original ten-stage BW program through the actual
Scratch VM, Robot Lab motor API and Jolt. It records fresh initial body poses,
then every 25 ms; the physics step remains 5 ms. Separate cases use no cold
interval and 1000 ms without powered input, followed by a 500 ms final hold.
The observation cap is 181000 simulated ms, allowing the original 180-second
watchdog to fire. Neither the program watchdog nor its arrival guards changes.

Input, output, coupler and chassis are identified by unique part membership.
The producer computes the half-angle prediction from actual body orientations;
it never uses requested motor targets as measured output. The standalone reader
uses rotation matrices and an independently derived rational full-angle circle
vector. It also reconstructs both sides of every true hinge from the compiled
world point and initial body transform. Its acceptance bounds are frozen before
engine observation: law/coupler/planarity 0.5°, closure 0.5 mm, axis agreement 1°,
and at least 119° of actual input motion. All ten physical arrival holds must occur in route order, each for the authored
1500 ms; actual program completion is required. The independent identity schema
requires the full declared source/SDK hash map, not just a commit label. Exactly
one static ground and four distinct dynamic roles are mandatory.

The causal control removes only `pivot_axle_P` from a test copy of the source.
It must retain all four moving roles and motor A, remove precisely the
input–coupler hinge, complete the same moving-input route, and lose the same
0.5° law criterion. A muted input or deleted assembly cannot count as a control.
Original records are emitted before assertions, including failed cases.

`test/bw-sim-cross-ratio.test.mjs` first validates the independent reader against
circle-intersection fixtures and corruption controls. Those analytic fixtures
are not engine evidence. The synchronous preflight precedes importing the native
harness, so a broken consumer cannot continue into engine qualification.
The existing unit artifact retains bounded NDJSON records inside the TAP log.
To audit an admitted original without importing the producer or replaying Jolt:

```sh
node scripts/verify-sim-cross-ratio.mjs ORIGINAL.log EXPECTED-CI-IDENTITY.json
```

The expected commit, tree and file hashes must be independently obtained from
the actual CI checkout. A branch name or the producer's own header is insufficient.
Acquire each official original once and retain the first failure.

The browser candidate now registers explicit experimental opt-in, passive law
and hinge checks, and a real project roundtrip. It checks the exported SB3 CRC,
model sidecar and the full serialized program graph/data before opening a fresh
context. The newly loaded graph/data must match again before pressing actual Run.
Opcode histograms are used only for loader readiness. These are source assertions, not executed browser evidence.
A dedicated eight-minute gate on existing `robotaddon1` and its exact inventory
controls are implemented. The existing 30-minute job cap and every old gate
remain unchanged. Zero-reading budget registration still awaits its scope
extension; no new runtime or historical timing is claimed.

Three lightweight analytic preflights (35 rejected corruptions, including the
four-case retained-TAP transport and same-opcode program edits) and 15 browser shard/inventory checks pass;
these checks import no engine and do not qualify motion.

Pending: complete budget registration; hosted native cases and independent
original readback; actual Chromium load/run and saved-project replay; all exact-head gates and normal matched-head merge. No native, browser,
WebKit, saved-file, physical buildability or hardware acceptance is claimed yet.
