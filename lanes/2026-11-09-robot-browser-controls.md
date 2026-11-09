# Robot Lab — browser controls for the Q1–Q5 promotions

Owner: this PR. Status: IN PROGRESS.

Scope: run the hosted browser controls (`ci:full`, added once on this PR's
head) for the six models promoted in #1683: Loop Relay, Parity Dial,
Counter Slide, Point Weaver, Evenhand, RimRun, and record the results.

- Loop Relay, Parity Dial, Counter Slide, Point Weaver: covered by the
  nine-intake browser gate (`scripts/lib/sim-lab-nine-intake-gate.mjs`:
  passive law, bounded manual control, instructions, placement BOM, LDR/MPD
  export, fresh saved-project replay) in shards robotaddon10–12, chromium.
- Evenhand, RimRun: `scripts/verify-sim-lab-browser.mjs` has no gate for
  them, so no browser control exists to run. Recorded in
  `docs/data/robot-lab-qualification.json` `notRun`; not run here.

No geometry, judge, threshold or gate change.
