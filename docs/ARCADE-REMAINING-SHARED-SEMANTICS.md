# Remaining shared Arcade semantics and authoring contracts

This plan complements [the agent handoff](ARCADE-AGENT-HANDOFF.md). Refresh
branch heads and `LANES.md` before taking files. Each area is a sequence of
bounded implementations, not permission to remove unsupported diagnostics.

## Evidence and denominators

At clean `1813c7721dc55a4a633b1ae6ae2c592b5291213f`, the immutable raw corpus
is 147 translated / 36 partial / one parse failure out of 184 original inputs.
All input Git blobs match the declared corpus commit. Complete project contexts
are separate: 29 retained selected-original-valid, 19 structurally strict,
10 blocked; 12 selected-invalid remain recorded. Structural success does not
establish original/native behavior, exported-game execution or visible editing.

Four complete contexts with retained MIT inputs expose shared missing behavior:
`5d0c02f598d4eda3` (Arrow), `90a0e61d3299702c` (Horse),
`c2576ea38bf22bfe` (Birthday), and `7cf6f6fa5b8ff423` (Football).
Additional private contexts have unresolved input licences and are excluded
from this public fixture scope. No individual slice below promises to clear a
whole project: fonts, timers, scene APIs and other diagnostics remain explicit.

## Ordered implementation

| Area | Runtime and conversion requirement | Blocks, Code and graphics requirement | Acceptance |
| --- | --- | --- | --- |
| Genuine callable values | Preserve callable identity, mutable capture cells, lexical `this`, actual signatures/defaults and initialization; reconstruct real source functions from current edited blocks | Editable callable body and parameters, explicit current bindings, genuine call reporter/command; retain metadata through Code and project save | Start with observable `makeCounter`; compare source/native/Code/same and fresh SB3/export-original/reimport. Reject stale, foreign, malformed and mismatched owners; Stop/reload controls. |
| Callable fields and generic forwarding | Typed class callback fields and `StatusBarSprite.applyChange<T>` forward actual arguments/results without scalar/reference contamination | Class/field/signature declarations must remain editable and diagnostic; do not hide missing callback semantics behind generic data wrappers | Actual callback mutation/identity/default/order controls before admitting complete helper contexts |
| Callback array operations | `filter`, `find`, `forEach`, `sort`, `map` use genuine shared references and selected-SDK callback arguments, order, return types and mutation semantics | Equivalent typed collection and callable operations in Arrays/Arcade vocabulary; accessible signatures and callback body editing in Blocks/Code | Fresh outer arrays preserve element identity; alias snapshots, nested iterations, comparator behavior, authored waits and lifecycle; original and exported-original controls |
| SDK subclass ABI | Real `game.BaseDialog` and `sprites.ExtendableSprite` constructors, base ownership, inherited methods and virtual draw/update dispatch | Editable image/font/frame inputs and callable overrides; retain actual graphics assets through all portable routes | Current screen/camera, scene priority/z/hitbox/lifecycle and full terminal pixels; genuine controller input and visible graphics edits |

The existing typed query fix is a prerequisite for composed array expressions;
it does not implement higher-order callbacks. Likewise the String `typeof`
reporter lane does not admit callable ownership or arbitrary Sprite handles.

### First intrinsic controls

Carnival's `GameOverDialog` requires `clearInterior`, `drawTextCore`,
`drawCursorRow`, `printCenter`, and its real parent-scene lifetime. Its `Ball`
requires typed Sprite identity and live draw/update overrides; projectile and
crosshair behavior must retain actual controller ownership. Establish minimal
original controls for these mechanisms before running the complete games.
Do not substitute a generic Sprite or remove helper methods to obtain a pass.

## Retained primary source identities

These source hashes identify the examined retained files; they do not claim
that another revision or an unexecuted complete project is qualified.

- [https://github.com/jwunderl/pxt-status-bar/blob/v0.4.1/status-bar.ts](https://github.com/jwunderl/pxt-status-bar/blob/v0.4.1/status-bar.ts)
  - Retained licence: MIT; SHA-256: `9ed010b411b1b529b2a608b6f1777d181c4b47046ab1ca87212b9e5da0d78a8e`.
  - Required behavior: StatusBarSprite.applyChange<T>(action) at311.
  - Required behavior: statusHandlers.filter at477.
  - Required behavior: handler callback retention at702.
- [https://github.com/jwunderl/arcade-sprite-util/blob/v0.3.1/spriteutils.ts](https://github.com/jwunderl/arcade-sprite-util/blob/v0.3.1/spriteutils.ts)
  - Retained licence: MIT; SHA-256: `fd6b2baa84f55ef95afe51c66debbd3665a2d2a99465536571834b80193ff45f`.
  - Required behavior: SpriteUpdateHandler at73.
  - Required behavior: SpriteKindUpdateHandler at84.
  - Required behavior: updatingSprites.filter at130.
  - Required behavior: allSprites.filter and sort at221.
- [https://github.com/microsoft/arcade-carnival/blob/v0.0.7/carnival.ts](https://github.com/microsoft/arcade-carnival/blob/v0.0.7/carnival.ts)
  - Retained licence: MIT; SHA-256: `6530f15cbddbc41419a59a41e8c13276eb6ac65645c04d02e899826c08e3f765`.
  - Required behavior: GameOverDialog extends game.BaseDialog at506.
  - Required behavior: Ball extends sprites.ExtendableSprite at789.
  - Required behavior: scene.createRenderable live target/camera callback.
- [https://github.com/microsoft/pxt-kickoff/blob/c2c7f8193af1dafaebda3a7cda235df4c42b87ae/team.ts](https://github.com/microsoft/pxt-kickoff/blob/c2c7f8193af1dafaebda3a7cda235df4c42b87ae/team.ts)
  - Retained licence: MIT; SHA-256: `07c29c4cc23a1f6a30572cb980f42a0805a9a440ce1f349589318b4265b87649`.
  - Required behavior: Team callback retention at19.
  - Required behavior: players.forEach at78/92/119.
  - Required behavior: animationFrames nested forEach at1147/1148.

## Promotion rules

Keep original failures, source hashes, exact compilation inputs/binaries and
actual observations. Bind a new source or renderer change to new affected
controls. Current edited code/artwork must drive the comparison; retained
metadata must not replace the edited body. Add operations only through the
canonical supplier and actual native schema, with an explicit qualified pin.

A lane closes after its source/runtime, portable conversion and declared GUI
gates pass. A full project closes only after all of its named unsupported
behaviors have real implementations and original/native/exported-original
behavior matches within stated observations. Never replace raw inputs, count
invalid source as working, or substitute structural admission for execution.
Private corpus paths, SDK caches and receipts belong in the gitignored local
handoff and private evidence repository.
