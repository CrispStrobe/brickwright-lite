# Debugger Pause beside the x86 Widgets: real-page fix and gate

Owner: x86 lane (Claude Code agent for the repository owner).

Follow-up to the 2026-11-07 Widgets/debugger overlap claim. On the real page
the debugger reaches the stage host through the coding-path solo portal, not
the dedicated Circuit-tab "right" path, so the host stayed at z-index 0 under
the Widgets wrapper (z-index 1). The host now takes z-index 2 whenever it shows
the debugger for a 'right' or 'solo' dock; the circuit designer portal stays 0.

Paths: `overlay/` and `packages/` copies of
`scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx` (host z-index rule
only); new `scripts/verify-debugger-pause-hit.mjs` and its light-shard step in
`.github/workflows/build.yml` with its budget/runner-audit rows; the fixture
test `test/widgets-debugger-pause-hit-test.test.mjs` is removed (it did not
load the real page).

Qualification: the new real-page gate fails on a main build and passes on the
PR build; full exact-head CI including Arcade and phone controller gates.
