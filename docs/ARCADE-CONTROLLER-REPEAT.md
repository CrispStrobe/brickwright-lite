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

## Implemented candidate and bounded checks

The native block and Code vocabulary has three forms:

```text
arcade player 2 button B repeat property repeatDelay
arcade set player 2 button B repeat property repeatInterval to (20)
arcade set button repeat defaults delay (100) interval (40)
```

Player, button and property are fixed dropdown fields. The write and default
values accept connected primitive reporters; numeric palette shadows are
numeric. An unset property remains undefined, and explicit undefined restores
default selection. Zero, NaN and null are retained rather than replaced by a
default. Negative and fractional property values are stored without clamping.
Nonprimitive values and invalid fixed fields are explicitly refused.

The advertised button fields are A, B, up, down, left and right for players
1–4. Selected `game/controller.ts` publicly provides these six getters, and
`game/controlleroverrides.ts` provides the four fixed instances. All 24 pairs
were compiled and exercised by original and native read/write controls. A
player 2 B hold/release/repress control observes the same eight callbacks in
native source, Code, same and fresh saved SB3, exported original and reimport.
The ordinary, zero-interval and changed-while-held controls also match these
routes. A compound assignment reads the old property once before its RHS,
which runs once; property state survives scene push/pop. Restart restores
unset properties and the original defaults.

The fixed source paths accept `controller.A.repeatDelay` and
`controller.player2.B.repeatInterval`, with the corresponding write and
`controller.setRepeatDefault` calls. Lexically shadowed controller names,
dynamic button expressions and Button aliases remain explicit gaps. The SDK
menu button is a separate unqualified domain; start/select spellings are not
advertised public repeat-property paths. The original-supported global
`isNaN()` reporter remains an unrelated named conversion gap; numeric NaN
property behavior was qualified with an explicit self-inequality observation.

These are bounded headless source and native checks. Actual palette authoring,
controller-pane holding, edited Blocks and installed saved/reopened project
journeys still require the matching official production GUI artifact. This
candidate does not establish whole-game or hardware compatibility.
