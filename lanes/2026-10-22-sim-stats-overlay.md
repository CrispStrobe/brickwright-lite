# Optional Robot Lab statistics overlay — DONE (source candidate)

Owner: Codex school/performance delivery, isolated
`lane/sim-stats-overlay-20261022`, based on `c015fd7fca`.

Add a Show statistics switch beside Show ports, Show how it moves and Show
sensor rays. The optional overlay exposes measured simulation pace, simulated
time, execution route and available physics-worker timing/counters. Retain the
last measured pace while paused and show missing measurements explicitly.

Own the Robot Lab pane, toolbar action/icon and bilingual text, a small
statistics presentation helper/component, their canonical generated GUI mirrors
and focused controls. Preserve all other owners' worktrees and active scopes.
No scheduler, physics, package pin, fidelity, timing budget or hardware changes.

Merge this claim before implementation. Qualify actual menu toggle, running,
paused, close/reopen, narrow layout, missing samples and unchanged simulation
counters. Check actual Chromium/WebKit rendering and normal build/hosted checks.

The optional English/German Show statistics switch uses the existing Show group
and compact-toolbar overflow. It displays measured and selected speed, simulated
time, execution route, available worker averages and step/replay/dropped-time
counters. Near-real-time readings remain visible; Pause retains the last measured
speed. Missing samples remain unavailable rather than appearing as measured zero.
The display reads existing telemetry without changing physics or scheduling.

Three presentation controls and 21 composed presentation/catalog/mirror controls
pass without skips. The initial production build passes; final composed browser,
production build and exact-head hosted qualification remain required.
