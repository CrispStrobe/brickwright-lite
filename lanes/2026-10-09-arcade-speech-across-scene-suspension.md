## Arcade speech across scene suspension — 2026-10-09

Codex owns `lane/arcade-speech-global-clock-20261009`, stacked on PR767.
Use the existing global simulated clock for speech creation, rendering and
expiry; original control.millis/game.runtime continues across scene pushes.
Compare long suspended parent expiry and later child creation against original
PXT. Preserve scene-local physics/update clocks and the explicit legacy bubble
identity gap; no modal/wall-clock or completed screen API claim.
Checkpoint `e85bc17e9`:32 checks pass, including four clock checks and three
complete original19200-pixel expiry/retention planes. Later child deadlines use
global time while parent frame clocks remain suspended. Active native legacy
bubbles and animated/modal clock qualification remain open.
