## Arcade image copying and screen frame contract — 2026-10-09

Codex owns `lane/arcade-image-copyfrom-20261009`, stacked on PR763, and producer
`feat/arcade-image-copyfrom-20261009`, stacked on PR82. Implement dedicated
Image.copyFrom with original same-dimensions semantics, alias/buffer identity,
Code/Blocks and MakeCode interchange. Screen snapshots and paint/shade need a
shared indexed frame model with ordered background, tiles, sprites and HUD;
background-only snapshots must not be substituted. Keep their diagnostics until
that render contract and original-PXT pixel checks pass.
Checkpoint `9523aa4c6` /producer `eca752b7`: five final copying checks and20
unchanged regression checks pass, including16 original pixel comparisons;
producer328 passes. Corpus109/74/1 with184 unchanged hashes. Rendered GUI
journey remains pending. See docs/ARCADE-SCREEN-RENDER-CONTRACT.md for the
ordered S01-S05 screen/authoring acceptance plan.
