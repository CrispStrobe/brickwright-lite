---
level: beginner
age: 8+
prereqs: [mbit01-display]
teaches: [sensors, temperature, variables, micro:bit]
---
## Was du siehst
Der micro:bit liest seinen eingebauten Temperatursensor und scrollt den Wert
alle zwei Sekunden über die LED-Anzeige.

## Probier das
1. Klicke auf **Im Simulator ausführen** — die Temperatur scrollt über die Anzeige.
2. Ersetze `read temperature` durch `read light` für die Umgebungshelligkeit.
3. Ersetze es durch `read compass` für den Kompasskurs in Grad.

## Was passiert hier
`read temperature` ruft MicroPythons `temperature()` auf, das die
CPU-Temperatur in °C zurückgibt (typischerweise 2–3 °C wärmer als die
Umgebung). `show text` scrollt jeden Wert über die 5×5-Matrix. Die
`FOREVER`-Schleife aktualisiert die Messung alle zwei Sekunden.

## Warum das wichtig ist
Sensoren lesen und ihre Werte anzeigen ist die Kernschleife jedes
Datenloggers oder Umweltmonitors. Der micro:bit hat Temperatur-, Licht-,
Kompass- und Beschleunigungssensor eingebaut — keine Verkabelung nötig.
