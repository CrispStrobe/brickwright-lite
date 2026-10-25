## Native Arcade splash and long text — 2026-10-13

CLAIMED — Codex Arcade dialog integration, `work/arcade-native-text-dialogs-20261013`.
Envelope: Arcade native dialog lifecycle, controller event gating, dialog image
host and scene composition in `overlay/scratch-vm/src/extensions/crispstrobe/arcade/`;
`components/stage/arcade-dialog.jsx` and its dialog-only CSS/props in the GUI stage
component and container; affected tracked mirrors; focused original/native,
Code/blocks/export/SB3 and accessibility controls; this ledger and
`docs/compatibility/arcade-native-text-dialogs.md`.
Reuse the retained MIT text dialog classes. Render the live parent scene through
the child scene, preserve scene and epoch ownership, and route accessible controls
through actual controller edges. Preserve independent DEVICE/arena and question
flows. No local full GUI build, source/actor substitution or dialog-dismiss shortcut.
Initial and resumed scene frame timing remains a separately tracked scheduler gap.
