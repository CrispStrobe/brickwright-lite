# Pinned carnival source

Original package: Microsoft arcade-carnival v0.0.7, commit
`915caca4a2d83a7071df59407a9987992c083750`.

- [Source](https://github.com/microsoft/arcade-carnival/blob/915caca4a2d83a7071df59407a9987992c083750/carnival.ts)
- [MIT notice](https://github.com/microsoft/arcade-carnival/blob/915caca4a2d83a7071df59407a9987992c083750/LICENSE)

`carnival.ts` and `LICENSE` retain the original bytes. Source SHA-256:
`6530f15cbddbc41419a59a41e8c13276eb6ac65645c04d02e899826c08e3f765`.
The generated scoring/dialog module selects WinTypes, ScoreTypes, countdown
initialization, startCountdownGame, saveLowScore, newGameOver, init,
GameOverDialog, onGameOverExpanded and customGameOverExpanded. This does not
implement the package's throwable sprites, tracers, labels or timer HUD.

Regenerate with `node scripts/generate-arcade-carnival.mjs`; use `--check` to
verify exact output. The generator retains selected domain expressions and
control flow, adapting blocking PXT fiber operations to awaited host Promises
(newGameOver, pause, scene push/pop, button wait, core game.over and melody play).
Each initializer call creates one program's countdown-registration state.

The host must supply game, info, effects, settings, control, scene, music, screen,
image, img and pause, with original-compatible semantics. Host promises must
settle in the correct program/scene lifetime; persistent number settings must
use real program storage. Contract checks use observing host doubles, so they
do not qualify VM rendering, storage, fiber scheduling or game equivalence.
Native conversion continues to diagnose carnival until its complete host and
authoring/export paths are implemented and qualified.
