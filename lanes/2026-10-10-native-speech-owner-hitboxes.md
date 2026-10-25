## Native speech owner hitboxes — 2026-10-10

Codex owns `lane/arcade-speech-hitbox-20261010`, stacked on PR771.
Use the native PXT-compatible scaled/rotated hitbox for legacy constructor
placement rather than guessing a mask row from display width. Qualify original
full frames, transparent artwork, scale/rotation and yielding callbacks.
Checkpoint `f6b48a499`:38 checks pass without skips: nine new hitbox/authoring
checks and29 native ownership/camera/fresh-bundle regressions. Eight initial
full-frame cases, an authored roundtrip plane and the original exported plane
match PXT. Preserve the initial seven placement failures. Scrolling, broader
live-image hitbox cache timing and complete GUI/screen support remain separate.
