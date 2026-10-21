## Native speech scrolling clock — 2026-10-10

Codex owns `lane/arcade-native-speech-scroll-20261010`, stacked on PR772.
Record original frame deltas and completed render planes, then replay those
frames through native VM events. Qualify beginning/end holds, scrolling and
loop restart, including speech created in update callbacks. Keep timed expiry,
scene/modal changes and shipped GUI qualification separate until exercised.
Checkpoint `7b158d559`:45 distinct checks pass, zero failures/skips. Final
three-case replay compares915 bubble images and41 complete original stage
planes, including persistent restart, duration-dependent speed and both fonts.
The initial coarse pass missed a current-frame constructor delta bug; the
strengthened replay failed both cases before the fix. Preserve those failures.
