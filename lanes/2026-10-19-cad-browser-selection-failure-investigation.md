## CAD browser selection failure investigation — 2026-10-19

CLAIMED / candidate — Codex integration, explicit user request to fix the CAD browser error.
Branch `docs/cad-browser-selection-claim-20261019`. Own only the browser aiming
and selection helper in `scripts/lib/sim-lab-cad-gate.mjs`, focused controls in
`test/sim-lab-cad-pointer.test.mjs`, this ledger and
`docs/INTEGRATION-NEXT-STEPS.md`. Coordinate a separate
extension before changing the Sim Lab owner's editor, rendering or physics.

Retained robotlab failure: paletteInteractions calls focusOn after dropping a
beam; its real mouse click leaves selection empty instead of selecting the
expected placed part. Diagnose against the retained production frontend. Keep
real pointer interactions, exact part identity, assertions and existing budgets;
no direct editor selection, blind sleeps, retry-to-green or waived checks.
Require an affected real-browser regression and all enabled exact-head CI before
normal matched-head merge. The narrow helper repair and this lane entry ship together; preserve other lanes
and SPIKE qualification holds. No Sim Lab product or physics source is changed.

Candidate detail: wait two animation frames for hover/resize publication, then
reproject the same authored face point. Re-aim at most three times per existing
candidate before trying the next face point; never click to probe or retry a
failed selection assertion. Require the pointer's DOM target to be the canvas.
Five source controls cover normal aiming, layout resize, stale status, occlusion
and finite refusal; original source and three cuts are detected. An authored
real-browser layout counterexample retains trusted mouse input: original selects
nothing, candidate selects the expected part. This is helper coverage, not a
product guest result. The unchanged production frontend's full core/CAD journey
and all final-head enabled CI checks remain the integration qualification.
