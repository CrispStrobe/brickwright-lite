## Arcade device frame lifecycle — 2026-10-09

Codex owns `lane/arcade-pane-frame-lifecycle-20261009`, stacked on PR752.
Repair zero-size stage canvas transitions without suppressing browser errors;
clear the device display while the source is unavailable and resume drawing
when its backing dimensions return. Preserve controller and dialog assertions.
Use visible panel navigation for narrow-screen graphics editing and stage Run.
Producer checkout correction is isolated on `fix/arcade-producer-checkout-20261009`.
Checkpoint source `c0c707f7f`: real Chromium unavailable/restored canvas pixels
and five contract/pin checks pass. PR752 build/heavy shard pass; light failures
are preserved. Fresh full-app checks and producer sibling gates remain required.
