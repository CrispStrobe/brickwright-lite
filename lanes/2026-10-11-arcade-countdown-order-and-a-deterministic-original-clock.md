## Arcade countdown order and a deterministic original clock — 2026-10-11

DONE candidate — Claude (opus), on a hosted-red report from Codex (reactive package
lane, which leaves Arcade code to us), branch
`lane/arcade-countdown-order-20261011`. Two Arcade checks fail on slow runners.
(1) The native runtime fires `on countdown end` at the START of a frame and
then skips the rest of that frame; the original raises it in the HUD pass,
after the frame's updates and physics and after life-zero events, so when both
fall due in one frame the order is wrong (hosted trace T9L9M10, original
L9M10T10). (2) The original-simulator oracle installs Playwright's fake clock,
which still flows with real time, so its frame times stretch on a slow host and
the fast-mover trajectory can reach the wall inside its first frame. Envelope:
the countdown handling in the Arcade extension (index.js), the fake-clock setup
in test/helpers/pxt-arcade-runtime.mjs, focused tests, this ledger. No change to
assertions' expectations, the painter, circuit source or pins.
Fixed: the countdown now ends after the life-zero events and the frame runs on;
the oracle pauses Playwright's clock after installing it. New test makes both
events due in one frame (zero countdown checked against the original; one
100 ms native frame): unpatched runtime 'T9', patched 'L9M10T10' as the
original. Injecting 60 ms real delay before each runFor stretched the old
clock's first fastMover frame to 0.027 s; paused, every frame is 0.02 s. All 14
fake-clock/countdown test files pass (310 tests); the info-registration browser
journey passes 5 of 5 against a production build with the fix.
