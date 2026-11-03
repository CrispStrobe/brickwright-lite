# Afterturn re-run under the native rotor (#1573)

Status: CLAIMED, 2026-11-02. Owner: Claude, at the request of CrispStrobe.
Branch: `lane/robot-afterturn-rotor-20261102`.

Owns the Afterturn and Afterturn-control rows in
`docs/data/robot-lab-experimental-checkpoint.json` and
`docs/ROBOT-LAB-QUALIFICATION-HANDOFF-20261028.md`. Records only; no model,
program, engine, judge or threshold change.

Result: both models already opt in (`0 !BW ROTOR_INERTIA native`, #1573). The
cycle now measures −1.275° (inverse −0.043°, control −0.009°), against the
supplier's 4.6625°, which was the #1494 artefact. No Afterturn judge exists, so
both stay experimental until a reviewed judge and corrected claims/lessons land.
