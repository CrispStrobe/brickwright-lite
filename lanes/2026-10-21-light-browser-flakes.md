## Light browser intermittent gates — 2026-10-21

CLAIMED and done in one PR to main by Claude, at the owner's request. Root causes of two
intermittent `browser (light)` failures: the debug panel booted every assembled ROM twice
(a repeated `bw-asm-rom-ready` delivery is now dropped while its runner lives), and a
workspace reload echoed its own Blockly delete/create events into the VM one task later,
replacing the blocks a just-started Arcade source prelude had bound (the reload's events
now carry a reserved group the VM ignores, `lib/workspace-reload-events.js`). Details:
docs/ARCADE-888-OPEN-FAILURES.md. Tests: test/debug-asm-delivery-once.test.mjs,
test/workspace-reload-vm-roundtrip.test.mjs.
