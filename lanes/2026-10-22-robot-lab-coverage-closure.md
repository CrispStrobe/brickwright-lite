# Robot Lab hub coverage closure — 2026-10-22

Owner: Codex, isolated coverage-closure worktree; base `6db3cb1c3`.
Status: PARTIALLY COMPLETE. WP1–WP3 and NXC have source-bound closure tests;
NXT sync/button/listen APIs and WP6 remain open, requiring their dedicated
source claims and qualification. Continue the coverage matrix gaps, WP1–WP4 and WP6 of
`docs/HANDOFF-2026-10-21.md`, sequentially in bounded implementation PRs.

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
finite evidence and remaining boundaries. Final enabled exact-head hosted checks
must pass before landing; no firmware, installed native or hardware closure is
claimed by these tests.

The reader now acquires its compiler through the registering entry point. Both
fresh-process import orders and the unchanged registration/lazy-load guards
pass. Final affected suite: 99 tests, plus CI-example manifest and lazy policies.
The official earlier raw-import guard failure is retained; it is repaired at
source without broadening its allow-list.
