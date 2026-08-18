---
level: beginner
age: 10+
prereqs: [mbit01-display]
teaches: [gpio, pins, digital-output, tone, micro:bit]
---
## Was du siehst
Eine LED an Pin P0 blinkt, während der micro:bit bei 440 Hz (Kammerton A)
piept. Ein Punkt auf dem Display zeigt, wann der Ausgang aktiv ist.

## Probier das
1. Klicke auf **Im Simulator ausführen** — die LED blinkt und der Summer piept.
2. Ändere `440 hz` auf `880 hz` für einen höheren Ton (eine Oktave höher).
3. Füge eine zweite LED an Pin P1 hinzu und lasse sie mit der ersten abwechseln.

## Was passiert hier
`turn on led1` ruft `pin0.write_digital(0)` auf — die LED ist active-low,
also schaltet 0 sie ein. `set buzzer to 440 hz` ruft `music.pitch(440)` auf,
um eine 440-Hz-Rechteckwelle an Pin P0 zu erzeugen.

## Warum das wichtig ist
GPIO-Pins sind die Verbindung des micro:bit zur Außenwelt. Eine LED an
einem Pin ist der einfachste Aktor, ein Summer der einfachste Audioausgang.
