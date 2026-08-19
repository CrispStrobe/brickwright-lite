---
level: intermediate
age: 10+
prereqs: [arcade01-dodge]
teaches: [game-loop, physics, paddle, bounce, micro:bit]
---
## Was du siehst
Ein Einzelspieler-Pong auf der 5×5-Matrix. Ein Ball prallt umher. Dein
Schläger ist ein 3-Pixel-Balken rechts — bewege ihn mit A (hoch) und
B (runter).

## Probier das
1. Klicke **Im Simulator ausführen** und nutze A/B.
2. Ändere `0.2 seconds` für einen schnelleren Ball.
3. Mache den Schläger kleiner (1 Pixel) für mehr Schwierigkeit.

## Was passiert hier
Der Ball hat Position und Geschwindigkeit. Bei Wandkontakt kehrt die
Geschwindigkeitskomponente um. Am rechten Rand prüft er den Schläger —
Treffer = Abprallen + Punkt, Verfehlt = Spielende.
