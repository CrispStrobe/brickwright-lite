# Arcade canonical Array OP Code reader

Owner: Codex, Arcade compatibility lane.
Branch: `lane/arcade-array-menu-reader-claim-20261021`.
Base: `9ca0002579e6bd0891a4b34ea28400115a51e512`.
Status: claim only; merge after every enabled exact-head check succeeds.

Extend the canonical Array export lane with only the two Array OP reader cases
in `overlay/scratch-gui/src/lib/extension-menu-args.js` `readableView`.
The generic Code reader consumes these OPs as values; canonical dropdowns
currently become opcode text. Decode through the strict Array helper against
the original physical target/block, then provide a text input in the reader
clone. Never pass that clone to export proof authority. Preserve the original
project, malformed/computed/shared selector refusals and unrelated menus.
No broad normalizer, generated-table, vendor, runtime, pin or dependency change.

The existing lane owns the helper, exporter readers and complete regression
module. Correct its removal-selector negative to select and assert the actual
removal block, rather than an earlier construction push; retain the original
null/unsupported assertions. Add positive and malformed Code-reader coverage
without dropping complete groups or existing affected modules.

Preserve the first four-pass/four-failure result. Three failures occur at the
first Code-feedback export before exported-file reimport; the fourth is the
incorrectly selected fixture. Root runs the complete corrected eight-group
module, then complete affected source/native modules under real prerequisites
or the hosted gate. Native, original MakeCode, visible editing and fresh-SB3
acceptance remain separate. No corpus count or new full-CI label/dispatch.
