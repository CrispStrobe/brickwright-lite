# Robot Lab — browser controls for the Q1–Q5 promotions

Owner: this lane. Status: DONE for five of six; RimRun HELD (judge change
pending, separate PR).

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
- RimRun: HELD. The gate exists (`--examples=rimrun`) but is not wired into
  CI. Two browser measurement defects were fixed in #1714 (frame timestamps
  now carry the physics time of their poses; the worker samples requested
  bodies at every physics step and the gate judges on the registry's 20 ms
  grid). On that clean data the left roller fits 5.7 % below its prediction
  (limit 5 %, right lane 2.7 %): one tile-joint bump (Jolt's internal-edge
  contact between exactly coplanar abutting tiles) falls mid-window. Next: a
  separate PR changes `rolling-inertia-v1` to fit within a single tile
  segment for native and browser alike, then re-enables the gate
  (robotaddon14).

No threshold or limit was changed.
