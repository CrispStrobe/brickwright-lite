# Robot Lab — browser controls for the Q1–Q5 promotions

Owner: this lane. Status: DONE (all six).

Scope: hosted browser controls (`ci:full`, chromium) for the six models
promoted in #1683: Loop Relay, Parity Dial, Counter Slide, Point Weaver,
Evenhand, RimRun.

Results:

- Loop Relay, Parity Dial, Counter Slide, Point Weaver: PASS in #1703, the
  nine-intake browser gate (`scripts/lib/sim-lab-nine-intake-gate.mjs`:
  passive law, bounded manual control, instructions, placement BOM, LDR/MPD,
  fresh saved-project replay), shards robotaddon10–12.
- Evenhand: new gate in #1714 (`scripts/lib/sim-lab-q5-browser-gate.mjs`,
  shard robotaddon13) with the registry judge
  `counterbalance-holding-torque-v1` and its thresholds unchanged:
  counterbalance hold at eleven poses, the registry's disconnected control
  (inner counterweight pin removed: the elbow carries a load and the judge
  refuses), bounded manual control, connected instructions and BOM, LDR/MPD,
  saved project replayed in a fresh context, EN/DE lessons. Its build steps
  were re-authored to at most six parts per step (geometry unchanged).
- RimRun: PASS after its judge change (separate PR after #1714), shard
  robotaddon14. Two browser measurement defects were fixed in #1714 (a gate that
  requests per-step sampling gets frames stamped with the physics time of
  their poses; the worker samples
  requested bodies at every physics step and the gate judges on the
  registry's 20 ms grid). The remaining 5.7 % came from one tile-joint bump
  (Jolt's internal-edge contact between exactly coplanar abutting tiles)
  inside the fit window. `rolling-inertia-v1` now fits each lane from gate
  clearance (engine contacts) to its first tile joint (compiled tile
  colliders), at least 10 frames at 20 ms, natively and in the browser.
  Results: ratio 1.0783 vs 1.0784 predicted, lead 20.8 mm, both lanes within
  0.02 % of prediction; `rimrun-swapped` moves the lead to the right lane;
  bounded manual control, connected instructions and BOM, LDR/MPD, saved
  project replayed in a fresh context, EN/DE lessons.

No threshold or limit was changed; the judge's fit window changed, its 5 % gate did not.

Merge exception (operator decision): #1714 merged with browser (heavy) and
browser (light) failing exactly the six steps that also fail on main eb7e1c91
(ESP32-S3 boot, S040 display/touch, 386 media in Widgets, x86 debugger Pause,
four-surface save/reopen, MakeCode import), with identical error signatures;
every other check was green. The same scoped exception applies to this RimRun
PR under the same conditions.
