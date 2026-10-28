## Heavy browser intermittent gates — 2026-10-20

CLAIMED and done in one PR to main by Claude, at the owner's request. Root causes of two
intermittent `browser (heavy)` failures: the debug panel let a replaced runner's late phase
overwrite the new runner's phase (fixed with `lib/bw-debug/runner-ownership.js`, the
destroyed-runner emit guard, and a gate that waits for the running phase), and the Arcade
physics-engine fixture's stall depended on frame timing. Details:
docs/ARCADE-888-OPEN-FAILURES.md. Tests: test/debug-panel-runner-ownership.test.mjs,
test/makecode-arcade-physics-engine-stall.test.mjs.
