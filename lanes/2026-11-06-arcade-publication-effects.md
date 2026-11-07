# Arcade publication frontier: effect framing controls

Status: ACTIVE. Owner: Arcade integration. Base: main `daa01cceeac31c2490edfcf378c715910ddf60bc`.

Scope: clarify the effect model comment in
`overlay/scratch-gui/src/lib/bw-makecode/project-conditional-array-entry.js`;
add focused positive and negative controls for its existing publication
frontier in `test/project-array-publication-frontier-effects.test.mjs`, and
adjust the existing directly related test fixtures if required. Reconcile
`lanes/2026-11-03-arcade-pending-after-1638.md` and this claim. No change to
admission rules, runtime semantics, dependency pins or workflows is implied.

Trace the actual sound, splash, wait and restart behavior before documenting it.
Controls must cover admitted pure effects and refused receiver reads, early
registration, game over and additional event entries. Verify meaningful cuts
of the receiver, registration and game-over guards. Run affected focused
controls and every enabled exact-head check; obtain affected original-PXT or
VM qualification where behavior is exercised. Preserve failures and bounds.
