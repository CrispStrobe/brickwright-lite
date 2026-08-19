---
level: Einsteiger
age: 8+
prereqs: []
teaches: [Variablen, Steuerfeld, Matrix-Widget, Anzeige-Widget, Lego-Hub]
---

## Spike Prime Hub — Virtuelles Bedienfeld

Ein virtuelles Bedienfeld fuer den Spike Prime Hub (auch Robot Inventor —
gleiche Hardware). Das Steuerfeld zeigt, was die Sensoren und Motoren des
Hubs gerade tun — ohne echten Hub.

- **5x5-Lichtmatrix** — das LED-Gitter des Spike Prime, mit rotierender Linie
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

## Andere Lego-Hubs

Die anderen Lego-Hubs sind eigenstaendige Geraete — jeder braucht sein
eigenes Bedienfeld mit passenden Anzeige- und Eingabe-Widgets:

- **EV3**: 178x128 Mono-LCD, 4 Ein- + 4 Ausgangsports — braucht ein LCD-Widget (kuenftig)
- **NXT**: 100x64 Mono-LCD, 4 Sensor- + 3 Motorports — braucht ein LCD-Widget (kuenftig)
- **WeDo 2.0 / Boost**: nur RGB-Statuslicht, 2 Ports — braucht ein RGB-Licht-Widget (kuenftig)

Ein Matrix-Widget und ein LCD-Widget sind verschiedene Dinge — eines
kann nicht alle abdecken. Was geteilt wird, ist das Bedienfeld-Framework:
das Anzeige-/Eingabe-Widget-Bindungsmodell, die Variablen-Pumpe und das
controller.json-Format. Jeder Hub bekommt sein eigenes Beispiel auf
diesem Framework mit den richtigen Widgets fuer seine Hardware.
