# Motor direction compatibility — issue #1460

Status: DONE source candidate; hosted qualification and guarded merge pending.
Owner: Codex delivery coordinator. Owner decision, 2026-10-28: add an explicit
per-model compatibility setting; preserve existing models and opt new or
deliberately migrated models into the corrected motor axis.
Branch: `fix/motor-direction-compatibility-20261028`, isolated coordinator checkout.
Base: `b9fa2e844` main. Preserve original diagnostic branch
`fix/motor-orientation-axis-1460` (`6fcdffe99`); do not merge its global reversal.

Scope: model-source directive parsing and its documented syntax, the compiler's
option plumbing, `mech/joints.js` grouped motor hinge axis/body selection, focused
compiler and native motion regressions, scope registration for a new test,
serialization/reload preservation of the explicit model setting, and the issue's
public handoff. No changes to existing model files, programs or expected physical
bounds. Unknown setting values must be rejected rather than silently changing
drive direction. Default/unflagged compilation must preserve legacy behavior.

Qualification: upright/flipped motor and both axle insertion directions under
the corrected setting; absent/legacy setting preserves prior joint identities
and native behavior in affected models. Run the previously affected behavioral
suites without changing their expectations. A model's migration is separate
work and requires its programs, lessons and mechanical law to be requalified.
No claim about physical SPIKE sign convention without hardware evidence.

Implemented `0 !BW MOTOR_DIRECTION legacy|motor-frame` in the main model section,
with no declaration preserving legacy compilation. Invalid or duplicate modes
refuse simulation. LDraw save/reopen and Build edits/undo retain the setting;
embedded submodels cannot override their receiving model. No existing model or
program bytes changed. The motor member leads only the opted-in grouped hinge.

Validation: 34 focused parser/editor/persistence/orientation controls passed.
The seven new compatibility controls and all previously affected behavioral
suites passed together: 95 tests, no skips, unchanged expectations and physical
bounds. Both ordinary and browser simulation cadences ran, including Atlas Six.
No native release or pinned hosted-worker cutover is implied by this source PR.
