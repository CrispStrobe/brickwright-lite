# Measurement threshold editing

Status: CLAIMED.

Allow users to enter negative angle thresholds in the Robot Lab fixed-step analysis controls without intermediate edits being coerced to zero. Preserve existing validation, bounds, disabled behavior and analysis semantics.

Scope: `overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-measurement-precision.jsx` and focused tests for its threshold input. No physics, collection, persistence or measurement-analysis changes.
