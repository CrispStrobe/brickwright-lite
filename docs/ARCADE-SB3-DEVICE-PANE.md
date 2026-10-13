# Arcade saved-project device and pane restoration

The owned game browser journey fails after saving and opening its SB3 in a fresh
editor: its targets and Arcade primitives load, but the Game Console selector
is absent. Diagnose actual saved hardware metadata, VM load lifecycle and pane
state before choosing a fix. A runtime primitive being present is insufficient
to establish that the editor selected the saved board.

Own saved-project device publication and the Stage header's device observation.
Preserve explicit selected-board state for multi-board projects, retain generic
Scratch projects and avoid classifying arbitrary projects from extension names.
Restore state through the normal load lifecycle, without controller test helpers
setting a device or preferences after loading. Coordinate board-strip files with
the independent multi-board owner.

Acceptance: save a genuine Arcade project through File, open it in a fresh
production editor, observe the selected device and use the visible Game Console
A/B controls. Verify Code and Blocks, ordinary Scratch loading and multi-board
selection; repeat save/reopen and export/reimport. Preserve initial failures.
Headless VM loading alone does not establish this editor contract.
