---
level: intermediate
age: 10+
prereqs: [mbit01-display, mbit02-sensor]
teaches: [radio, communication, variables, micro:bit]
---
## Was du siehst
Drücke Taste A, um einen Zähler hochzuzählen und ihn über das
micro:bit-Radio zu senden. Der Zählerstand scrollt jedes Mal über die
Anzeige.

## Probier das
1. Klicke auf **Im Simulator ausführen** — drücke die simulierte Taste A.
2. Ändere `group 1` auf eine andere Gruppennummer (0–255) — nur micro:bits
   in der gleichen Gruppe hören sich.
3. Ändere `power 6` auf `power 0` für minimale Reichweite.

## Was passiert hier
`radio on group 1 power 6` initialisiert das Radio auf Gruppe 1 mit
Sendeleistung 6 (ca. 10 Meter Reichweite). Jeder Druck auf Taste A
erhöht den Zähler und sendet ihn per `radio.send()` über das 2,4-GHz-
Funkmodul.

## Warum das wichtig ist
Radio ist die Kommunikation zwischen micro:bits ohne Host-Computer.
Spiele, Fernsteuerungen und Sensornetzwerke nutzen es.
