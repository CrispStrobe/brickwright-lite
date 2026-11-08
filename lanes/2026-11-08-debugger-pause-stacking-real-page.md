# Debugger Pause beside the x86 Widgets: real-page fix and gate

Owner: x86 lane (Claude Code agent for the repository owner).

Follow-up to the 2026-11-07 Widgets/debugger overlap claim. On the real page
the debugger reaches the stage host through the coding-path solo portal and
fills the whole stage column, as does the Widgets dock, so one always covers
the other: stacked as before, Full screen sat over Pause; raised (first head
of this PR), the debugger hid the machine display, Arcade and controller panes.
Layout change: while the debugger has a live machine or program and the
Widgets dock is open, the column is split: Widgets on top (max half), the
debugger host below (z-index 2). Everything else keeps the full-column host
at z-index 0 under dock panes, as before.

Paths: `overlay/` and `packages/` copies of
`scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx` (host split layout) and
`scratch-gui/src/components/gui/gui.jsx` (dock marker attribute); new `scripts/verify-debugger-pause-hit.mjs` and its light-shard step in
`.github/workflows/build.yml` with its budget/runner-audit rows; the fixture
test `test/widgets-debugger-pause-hit-test.test.mjs` is removed (it did not
load the real page).

Qualification: the new real-page gate fails on a main build and passes on the
PR build; full exact-head CI including Arcade and phone controller gates.
