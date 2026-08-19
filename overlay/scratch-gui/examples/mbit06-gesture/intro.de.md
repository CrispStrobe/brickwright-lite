---
level: beginner
age: 8+
prereqs: [mbit01-display]
teaches: [accelerometer, gestures, random, micro:bit]
---
## Was du siehst
Schüttle den micro:bit, um einen virtuellen Würfel zu werfen. Die Anzeige
zeigt eine Zufallszahl von 1 bis 6.

## Probier das
1. Klicke **Im Simulator ausführen** — die Anzeige zeigt "?".
2. Drücke im Simulator die Schütteln-Taste.
3. Ändere `1500` auf einen niedrigeren Wert für empfindlichere Erkennung.

## Was passiert hier
`read accel strength` gibt die Beschleunigung in Milli-g zurück. Ein
Schütteln erzeugt Werte über 1500. `pick random 1 to 6` erzeugt den Wurf.
