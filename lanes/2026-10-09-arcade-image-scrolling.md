## Arcade image scrolling — 2026-10-09

Codex owns `lane/arcade-image-scroll-20261009`, stacked on PR762, and producer
`feat/arcade-image-scroll-20261009`, stacked on PR81. Implement native mutable
Image.scroll with dedicated x/y Blocks inputs, pseudocode and MakeCode
interchange. Compare original PXT pixels, coercion/clipping, aliases and scenes;
retain original input hashes and partial diagnostics. Full shipped browser
checks remain required.
Checkpoint `d490487de` /producer `bacacdbed`: five final scrolling checks,
15 unchanged regression checks and327 producer checks pass without skips;
198 original PXT pixel/coercion cases agree. Real keyboard steering passes;
full rendered controller-pane journey is prepared and pending. Corpus109/74/1
and184 hashes remain unchanged. Screen cloning/drawing dependencies remain open.
