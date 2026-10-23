# Robot Lab hub coverage closure — 2026-10-22

Owner: Codex, isolated coverage-closure worktree; base `6db3cb1c3`.
Status: PARTIALLY COMPLETE. WP1–WP3 and NXC have source-bound closure tests;
WP6 is qualified through own NuttX and embedded Python. NXT sync/button/listen
supplier adoption remains open, pending the required supplier reviews. The
remaining step is WP4’s reviewed supplier adoption; the other matrix work is
closed within `docs/HANDOFF-2026-10-21.md`’s stated boundaries.

Scope: Code-tab hub-call readers in `robot-lab-pseudocode.js` and their tracked
mirror; hub runtime round-trip and real-extension Lab tests; SPIKE Essential
part metadata/generator and fixtures; WeDo tilt/light/tone and NXT extension
coverage; coverage matrix and handoff. Investigate the own-firmware Renode
lockstep/MicroPython CI route and coordinate with the existing native lane
before editing shared native or firmware paths. No takeover of the motor-power,
hub Run transition, native cancellation/startup, or Arcade lanes.

Qualification: real emitted-call round trips and named wrong-call refusal;
real-extension physics/hub observations and wrong-program controls for each
newly covered route; verified LDraw connector provenance for Essential;
affected clean own-firmware guest qualification for firmware claims. Preserve
failures and all existing assertions. Merge only after all enabled exact-head
checks succeed, then verify predicted and landed merge trees and parents.
No hardware, reference firmware, dependency pin changes or large local builds.

Completed here: ten default-exporter round trips across five real hub families,
argument preservation/refusals, Essential on both BLE routes, WeDo tilt/light/tone
on both routes after the separately claimed sensor-ID repair, exact-source NXC
recorded reply and rejection controls. The full 22-test LDraw connector suite
passes; the complete affected suite passes 140 tests with no skips or TODOs.
Four reader mutations and the sensor identity mutation are detected. See the updated matrix/handoff for
finite evidence and remaining boundaries. Enabled exact-head checks passed
before landing; firmware qualification is supplied by the separate WP6 guest
evidence. These source tests do not establish installed native or hardware closure.

The reader now acquires its compiler through the registering entry point. Both
fresh-process import orders and the unchanged registration/lazy-load guards
pass. Final affected suite: 99 tests, plus CI-example manifest and lazy policies.
The official earlier raw-import guard failure is retained; it is repaired at
source without broadening its allow-list.

Source composition landed in #1239 at 6da92497d2e8f51b2a75e137fab9e6946d3a3457 after all enabled
exact-head checks passed. The matrix now records 42 green cells, one NXT partial
and no gaps. The firmware cells use the dedicated real hosted qualification,
not the source controls described above.
