---
level: Einsteiger
age: 8+
prereqs: []
teaches: [Variablen, Steuerfeld, Matrix-Widget, Anzeige-Widget, Lego-Hub]
---

## Lego Hub — Virtuelles Bedienfeld

Ein abstrahiertes virtuelles Bedienfeld fuer einen Spike Prime / Robot
Inventor Hub. Das Steuerfeld zeigt, was die Sensoren und Motoren des
Hubs gerade tun — ohne echten Hub.

- **5x5-Lichtmatrix** — das LED-Gitter des Hubs, mit rotierender Linie
- **Motor-Anzeige** — Winkel von -180° bis +180°
- **Distanz-Anzeige** — simulierter Ultraschallsensor, 10–190 cm
- **Farb-Anzeige** — Lego-Farb-IDs durchlaufend (0–10)

## Probiere das

1. Klicke auf die gruene Flagge — alle vier Anzeigen starten.
2. Beobachte die Matrix: die Linie dreht sich durch vier Positionen.
3. Beobachte die Motoranzeige: sie pendelt gleichmaessig.
4. Distanz und Farbe folgen demselben Zyklus.

## Was passiert hier

Das Programm schreibt vier Variablen pro Takt: `hub_matrix` (25-Bit-Maske),
`motor_angle`, `dist_cm` und `colour_id`. Die Matrix- und Anzeige-Widgets
lesen diese Variablen und stellen sie live dar.

Auf echter Hardware wuerden die Ausgaben ueber die Lego-Laufzeittreiber
(Remote oder On-Device ueber brickwright-bridges) laufen. Die Widget-Anzeigen
sind identisch — sie zeigen, was die Variablen enthalten.
