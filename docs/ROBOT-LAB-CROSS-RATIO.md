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
0.5° law criterion. The compiler preflight first refused an incorrect assumption
that this edit would retain five bodies. It actually frees seven capture
collars: twelve bodies, three hinges and seven specific loose-part warnings.
The contract now freezes both complete body-part groupings and those exact
warnings; every dynamic body must have finite recorded poses. All other warnings
refuse. The single-part source edit is unchanged. Its physical effects include
contacts by the freed collars, so it does not isolate the missing hinge as the
sole possible cause. The first refusal is preserved; no motion case ran before
this structural correction. A muted input or deleted assembly cannot count as a control.
Original records are emitted before assertions, including failed cases.

`test/bw-sim-cross-ratio.test.mjs` first validates the independent reader against
circle-intersection fixtures and corruption controls. Those analytic fixtures
are not engine evidence. The synchronous preflight precedes importing the native
harness, so a broken consumer cannot continue into engine qualification.
The existing unit artifact retains bounded NDJSON records inside the TAP log.
Evidence uses a direct stream that awaits every write callback and rejects
pending-write errors/closure, bypassing the VM helper's
console capture. Four supplementary Node 24 motion cases passed their internal
checks at an earlier candidate, but its console-based raw records were not
retained. That TAP is preserved and supplies no standalone record acceptance;
the successful motion cases were not replayed to recover output. The transport
fix is validated with analytic records and a real backpressured Writable; fresh
hosted qualification remains required.
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
Opcode histograms are used only for loader readiness. Both browser runs must
contain a nonzero actual motor-A API command, no refused commands, the authored
minimum 15000 simulated ms for ten holds, a completion inside 181000 ms and a 500 ms final
hold. These are explicit checks because the shared completion-hold mode bypasses
its fixed-duration setting. These are source assertions, not executed browser evidence.
A dedicated eight-minute gate on existing `robotaddon1` and its exact inventory
controls are implemented. The existing 30-minute job cap and every old gate
remain unchanged. Zero-reading budget registration still awaits its scope
extension; no new runtime or historical timing is claimed.

Six lightweight analytic preflights (45 data corruptions plus receiver failures, including the
four-case retained-TAP transport and same-opcode program edits) and 15 browser shard/inventory checks pass;
these checks import no engine and do not qualify motion.

Pending: complete budget registration; hosted native cases and independent
original readback; actual Chromium load/run and saved-project replay; all exact-head gates and normal matched-head merge. No native, browser,
WebKit, saved-file, physical buildability or hardware acceptance is claimed yet.
