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


## Implementation checkpoint

The whole-project deserializer now clears prior hardware metadata before reading
new metadata. Importing a sprite preserves its host project's declarations.
An installed GUI publisher observes the completed project-load event, publishes
the saved device and resolves its canonical core without allowing a late result
to mutate a replaced project. Explicit board-choice events for the current
project remain authoritative; choices from an older Stage are discarded.

The Stage header reads committed device flags again after subscribing, closing
the mount/load race, and preserves an explicit empty device selection. Twelve
focused controls pass, including real SB3 save/reload, hardware-free loading
with an Arcade extension still present, sprite import, late metadata resolution
and the existing multi-board controls. Production fresh-session GUI acceptance
remains pending on the exact new official build; headless loading is insufficient.
