# Arcade controller repeat properties

## Goal and source boundary

Support reading and writing `repeatDelay` and `repeatInterval` on the selected
Arcade controller buttons, including multiplayer buttons. The public APIs are
[repeat delay](https://arcade.makecode.com/reference/controller/button/repeat-delay)
and [repeat interval](https://arcade.makecode.com/reference/controller/button/repeat-interval).

Selected original: Arcade 4.2.1, PXT 13.2.1, target commit
`2d7d59b5226e8a1a1e05e8042dd9f5248ed68fea`.
The MIT-licensed bundled `game/controllerbutton.ts` has SHA-256
`05b31c22405dfdab100d57b6916bfa7b4328bbe448551068b012ba79d375ff2c`.
Review actual selected source and execution; documentation examples alone do
not establish timing or coercion semantics.

## Required implementation

- Use explicit authoring words for property reads and writes, fixed validated
  player/button fields, and the canonical supplier grammar. Preserve values
  through Blocks, Code, save/reload and original export.
- Preserve initially undefined properties. The selected original uses global
  defaults only when a property is undefined; getters must not replace that
  undefined value with a guessed effective default.
- Implement the original elapsed/repeat-count calculation, press/release
  resets and event delivery using existing Arcade frame and controller
  authority. Do not invent a separate timer or clamp unusual values.
- Qualify global defaults and per-button lifetime across scene transitions,
  Stop, restart and a newly loaded program before admitting those operations.
- Preserve numeric typing and assignment evaluation order. Explicitly diagnose
  dynamic or unsupported button expressions and unqualified coercion domains.
  Do not silence a missing assignment or substitute an unrelated operation.

## Acceptance and evidence

1. Compare selected-original and native traces for ordinary values, undefined
   fallback, changed properties while held, release/repress, multiplayer,
   scene changes, defaults and selected unusual numeric values. Preserve first
   failures and exact compiler artifacts.
2. Run the same authored program through native source import, edited Code,
   edited Blocks, fresh saved SB3, original export and reimport. Confirm getters
   and repeat handlers observe the same values and order.
3. Exercise real controller-pane input in the hosted production GUI, including
   held buttons and saved/reopened projects. Capture visible block fields and
   Code plus event observations; a private test VM is not GUI qualification.
4. Publish exact reviewed supplier/consumer identities, enabled check results,
   merge tree equality and bounded limitations. Keep machine paths and raw
   operational receipts private. Update the capability and GUI ledgers only
   for the routes actually observed.

## Coordination

This lane owns narrow repeat-property and repeat-calculation hunks only.
Coordinate supplier publication with source-reference and callable additions;
retain their separate admission gates. Existing control-event dispatch, frame
phases, dialogs and physical controller input are shared dependencies. No
whole-game equivalence or corpus-count reduction follows from this contract.
