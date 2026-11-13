# Explicit internal-edge pairs

A model can select a moving source part and a track surface part with a main
model directive:

```text
0 !BW INTERNAL_EDGE_PAIR left_wheel_-1 hub
```

The compiler resolves each part to exactly one compiled body and retains that
source/surface order. Unknown parts, ambiguous body membership, a pair within
one body, and duplicate unordered pairs refuse simulation. Embedded submodels
cannot opt their receiving model in. Save, reopen, edits and undo retain the
setting; deleting a referenced part removes its selection in the new model.

RimRun and its swapped-ballast control select their two roller bodies against
the actual body containing the hub and track frame. Their LDR and MPD forms
carry the same directives. No native body IDs, geometry, mass, inertia, solver
thresholds, or part-pair collision exclusions are changed by this setting.

The core configures only those native pairs once, before any physics step.
Body enhanced-edge flags retain their previous values. Models without the
directive keep the existing collision path. An explicitly selected model
requires an engine exposing the selected-pair API; an older module is refused
before native allocation. A failed setup disposes its owning native world and
preserves the primary error if clearing or disposal also throws.

The pair list is immutable configuration for one core, like its shape filter.
Checkpoint/rollback records evolving state with that configuration unchanged.
A model edit or changed pair policy requires a fresh core and fresh checkpoints;
the list is not a separately restored state-registry entry. The experimental
`internalEdgeRemovalPairs: false` core option disables model selections for A/B
controls.

Source controls cover parsing, validation, body membership, LDR/MPD parity,
save/reopen/editor preservation and default metadata compatibility. Native
controls exercise real API setup, cleanup failures and unchanged-session
checkpoint replay. Native selected/unselected filter fixtures also cover both
creation orders, cache transitions, body-ID reuse and custom callback exclusion.
Actual direct-VM results are bounded to RimRun and its swapped control; they do
not establish browser, hardware, physical-accuracy or other-model qualification.

The integration requires a separately admitted Jolt fork release carrying the
native and binding changes. Do not silently keep an old engine pin or infer
release qualification from an experimental module.
