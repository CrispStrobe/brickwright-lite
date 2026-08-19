---
level: intermediate
age: 10+
prereqs: [mbit01-display]
teaches: [game-loop, collision, buttons, variables, micro:bit]
---
## Was du siehst
Ein Ausweichspiel auf der 5×5-LED-Matrix. Steuere einen Pixel mit den
Tasten A (links) und B (rechts). Feinde fallen von oben — weiche ihnen aus.

## Probier das
1. Klicke **Im Simulator ausführen** und nutze Tasten A/B.
2. Ändere `0.3 seconds` auf `0.2` für ein schnelleres Spiel.
3. Füge einen zweiten Feind hinzu.

## Was passiert hier
Die Spielschleife: Display löschen → Spieler und Feind zeichnen → Feind
bewegen → Kollision prüfen → Eingabe lesen → wiederholen.
