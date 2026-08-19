---
level: intermediate
age: 10+
prereqs: [mbit01-display, mbit02-sensor, mbit03-pins]
teaches: [conditionals, sensors, actuators, combined-io, micro:bit]
---
## Was du siehst
Ein Temperaturalarm: über 25 °C leuchtet die LED, der Summer piept bei
880 Hz und die Anzeige zeigt einen Diamanten. Unter 25 °C ist alles aus.

## Probier das
1. Klicke **Im Simulator ausführen**.
2. Ändere den Schwellwert von 25 auf einen niedrigeren Wert.
3. Füge eine zweite Bedingung für Kälte (unter 10 °C) hinzu.

## Was passiert hier
Kombination aus vier micro:bit-Fähigkeiten: Sensor lesen, GPIO steuern,
Audio erzeugen und LED-Display aktualisieren. Das `if`-Block trifft
Entscheidungen basierend auf Sensordaten.
