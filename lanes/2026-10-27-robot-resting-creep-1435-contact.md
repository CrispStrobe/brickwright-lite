# Robot Lab resting-frame creep #1435 — contact stage

Status: CLAIMED — diagnostic contact stage (claim and change in one PR).
Owner: Claude Code, resting-creep successor.
Branch: `lane/robot-resting-creep-1435-contact-20261027`.
Base: `b2e419acc406af3335b6078256cc8d5925b7fdac` (Main with the step-5 baseline, PR #1472).
Continues [the baseline claim](2026-10-27-robot-resting-creep-1435.md) and
[the handoff](../docs/ROBOT-LAB-RESTING-CREEP.md), step 6 (diagnosis only).

Owned paths: `test/fixtures/resting-creep-1435/contact-manifest.json`,
`test/fixtures/resting-creep-1435/observe-contact.mjs`,
`test/bw-sim-resting-creep-contact.test.mjs`,
`scripts/verify-sim-resting-creep-contact.mjs`, the contact-stage section of
`docs/ROBOT-LAB-RESTING-CREEP.md`, this claim, and appending the new test to
the two existing Jolt consumer lists in `scripts/lib/gui-scope-allowed.json`.

No core, solver setting, engine pin, model, workflow or floor-contact change.
The manifold-reduction cases toggle `mUseManifoldReduction` through a
test-only wrapper of the Jolt namespace; the product core is untouched. A
correction needs its own claim, coordinated with the closed floor-contact
lane ([docs/ROBOT-LAB-FLOOR-CONTACT.md](../docs/ROBOT-LAB-FLOOR-CONTACT.md)),
and full qualification of every currently qualified model. Issue #1435 stays open.
