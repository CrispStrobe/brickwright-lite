# Widgets pane must not cover the docked debugger (x86 machine GUI)

Owner: x86 lane (Claude Code agent for the repository owner).

Change: layout only. In dock mode "controller" with the debugger docked right,
the Widgets pane (`zIndex: 10`) painted above the circuit stage host
(`z-index: 0`), so a real click on the debugger's Pause hit the Widgets
"Full screen" button. The controller dock wrapper becomes a `zIndex: 1`
stacking context, and the stage host takes `z-index: 2` only while it shows
the debugger docked right (still below the stage header). The in-stage
circuit portal keeps `z-index: 0`, so dock panes still cover it as before.
No behaviour change.

Paths: `overlay/` and `packages/` copies of
`scratch-gui/src/components/gui/gui.jsx` (controller dock wrapper style only)
and `scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx` (stage host
z-index only); new `test/widgets-debugger-pause-hit-test.test.mjs`.

Claim and change in one PR because the files belong to other lanes' areas and
the edit is two style values.

Qualification: the hit-test fails on the old styles (mutation check) and passes
with the fix; full exact-head CI including browser tiers before merge.
