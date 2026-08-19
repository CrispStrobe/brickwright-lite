---
level: Einsteiger
age: 8+
prereqs: []
teaches: [Variablen, Steuerfeld, Matrix-Widget, Anzeige-Widget, Spike-Prime]
---

## Spike Prime Hub — Virtuelles Bedienfeld

Das Offline-Gegenstueck zur `spikeprime`-Erweiterung. Wenn kein Hub
verbunden ist, zeigt dieses Bedienfeld, was das Programm auf einem
echten Spike Prime (oder Robot Inventor) anzeigen und lesen wuerde.

- **5x5-LED-Matrix** — spiegelt `displayImage` / `setPixel` (Herz, Smiley, X, Balken)
- **Motor A Position** — spiegelt `getPosition A` (Grad, -180..180)
- **Distanz D** — spiegelt `getDistance D` (cm, 0..200)
- **Farbe C** — spiegelt `getColor C` (Lego-Farb-ID 0..10)

Die Variablennamen entsprechen den Bloecken der Erweiterung:
`spike_display`, `spike_position_A`, `spike_distance_D`, `spike_color_C`.

## Probiere das

1. Klicke auf die gruene Flagge — alle vier Anzeigen starten.
2. Beobachte die Matrix: vier Spike-Prime-Muster wechseln sich ab.
3. Beobachte die Motoranzeige: sie pendelt wie ein laufender Motor.
4. Distanz und Farbe folgen demselben Zyklus.

## Was passiert hier

Das Programm schreibt vier Variablen pro Takt. Die Matrix liest
`spike_display` (25-Bit-Maske, Bit `Zeile*5+Spalte` = LED an). Die drei
Anzeige-Widgets lesen die Sensor-/Motor-Variablen. Auf einem echten Hub
wuerden die Laufzeittreiber (Scratch Link / Web Bluetooth /
brickwright-bridges) diese Variablen von der Hardware befuellen.

## Andere Lego-Hubs

Jeder Lego-Hub ist ein eigenstaendiges Geraet mit eigener
Display-Hardware — jeder braucht sein eigenes Bedienfeld:

- **EV3** (`ev3comprehensive`): 178x128 Mono-LCD — braucht ein LCD-Widget (kuenftig)
- **NXT** (`legonxt`): 100x64 Mono-LCD — braucht ein LCD-Widget (kuenftig)
- **WeDo 2.0** (`wedo2unified`): nur RGB-Statuslicht — braucht ein RGB-Widget (kuenftig)
- **Boost** (`legoboostunified`): nur RGB-Statuslicht — braucht ein RGB-Widget (kuenftig)

Was geteilt wird, ist das Bedienfeld-Framework (Variablen-Bindung,
Widget-Pumpe, controller.json-Format). Jeder Hub bekommt sein eigenes
Beispiel mit den passenden Widgets fuer sein Geraetemodell.
