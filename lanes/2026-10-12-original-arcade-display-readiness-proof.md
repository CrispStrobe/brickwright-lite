## Original Arcade display readiness proof — 2026-10-12

DONE candidate — Codex, continuing `fix/painter-installation-proof-20261011`.
Build38198014926 passes both browser shards, corpus and FPGA but fails the
seven-segment exact-screen comparison (19200 pixels different). Program-global
completion does not prove a presented frame: original ScreenState initially
fills its buffer black, while the authored scene draws a white background.
Envelope: LANES.md, test/helpers/pxt-arcade-runtime.mjs and
test/makecode-arcade-sevenseg.test.mjs only. Add opt-in observation of a real
screen update after the existing completion marker; preserve default callers,
original call semantics and exact pixel equality. No fabricated image, native
renderer change, timeout increase, changed expected palette or engine pin.
The current candidate remains rejected until replacement hosted qualification.
Opt-in waitForDisplay observes the pinned simulator's real updateScreen call
and its actual lastImage publication, after the existing completion boundary.
The seven-segment oracle uses the existing paused clock and waits for a real
post-completion frame; exact pixels, palette and reporter values stay unchanged.
Default callers do not install an observer or wait for this additional boundary.
Persistent observer controls cover allocation/null/refused-image rejection,
receiver/arguments/result/exception preservation and restoration. The same
contract catches four executable mutants in pure controls; syntax and whitespace
checks pass. Qualification complete: exact
ede781d5613057037b29a2554e6bc26e624975ae passes Build38205559775, all six
enabled jobs (build/corpus/FPGA/two browser shards/guard). Unit6852/6831/0/21;
original seven-segment exact pixels and actual post-completion presentation
pass. Conditional deploy/verify-gui skips do not qualify publication. Later
main reconciliation changes only this ledger and docs/OPEN-TASKS-2026-09-29.md;
executable inputs retain the tested tree's bytes. Publication is a separate gate.

Created 2026-08-24, after two sessions independently did the same repair.
