# Arcade HUD visibility

`info.showScore(on)`, `info.showLife(on)` and `info.showCountdown(on)` import
and export through the command `arcade set hud score visible (condition)`.
The Blocks extension exposes a fixed score/life/countdown menu and a Boolean
connector. The commands call retained SDK visibility functions; score and life
also retain the SDK's explicit-visibility flags, so later value changes do not
undo a hidden display.

The source is MakeCode Arcade's bundled `game/info.ts`, retained by
`scripts/generate-arcade-hud.mjs` with its existing provenance and MIT notice.
Upstream implementation: [Microsoft pxt-common-packages game/info.ts](https://github.com/microsoft/pxt-common-packages/blob/master/libs/game/info.ts).
The selected bundled source, rather than current upstream HEAD, defines the
runtime behavior and generated source.

Hiding countdown keeps its deadline running but postpones expiry delivery until
the HUD is visible again. Hiding life does not suppress the life-zero event.
Multiplayer retains the SDK's player drawing behavior rather than inventing
independent per-player visibility methods.

`test/makecode-arcade-hud-visibility.test.mjs` compares complete 160 by 120
original/native frames for hidden and shown score/life, multiplayer and hidden
countdown. It checks countdown/life event behavior through Code, same and fresh
VM SB3, MakeCode export and prepared reimport. Ordinary source variables named
`score` and `lives` are renamed consistently to avoid the legacy exporter's HUD
storage aliases; an original compiler/runtime regression checks collisions and
forward function references.

These are focused authoring and runtime controls. Full hosted IDE interaction
and original MakeCode Blockly import remain separate acceptance gates. No
arbitrary imported game or corpus compatibility promotion follows.
