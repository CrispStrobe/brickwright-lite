## Arcade signed integer division through existing value blocks — 2026-10-15

CLAIM — Codex Arcade integration, branch `lane/arcade-idiv-claim-20261015`.
Implement exact selected `Math.idiv` import and current export through existing
primitive divide and bitwise value operations. Convert both actual Number
operands to signed32 before dividing, then convert the quotient; preserve each
argument once, left to right. No new opcode, word, menu item or dependency pin.

Envelope: this ledger; [the bounded contract](docs/ARCADE-INTEGER-DIVISION.md);
a focused helper under `overlay/scratch-gui/src/lib/bw-makecode/`;
coordinated narrow `arcade-translate.js` and actual shared source-producer hooks
if needed; affected current-export validation only if needed; focused tests and
a self-authored freely licensed original/export fixture. Reuse actual Number
proof and complete SDK root/member write checks. No broad Math return seed,
annotation producer, Text/reference coercion or unrelated Array/callable/default
change. Merge this claim before product edits. Acceptance: signed/fractional/
wrapped inputs, zero divisor, computed nonfinite inputs, effect order,
source/Code/Blocks/same-fresh SB3/current export/reimport, meaningful refusal
controls, exact selected-original and edited-export execution, and every enabled
exact-head hosted check. This API alone does not close a whole stopwatch game.
