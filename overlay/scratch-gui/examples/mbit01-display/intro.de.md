---
level: beginner
age: 8+
teaches: [led-matrix, display, animation, micro:bit]
---
## Was du siehst
Ein schlagendes Herz auf der 5×5-LED-Matrix des micro:bit. Die Anzeige
wechselt alle halbe Sekunde zwischen einem großen und einem kleinen Herz.

## Probier das
1. Klicke auf **Im Simulator ausführen** im MicroPython-Tab.
2. Ändere die Musterzeichenketten, um eigene Formen zu zeichnen — jede
   Ziffer ist eine LED (0 = aus, 9 = hellste), fünf Ziffern pro Zeile,
   fünf Zeilen durch Doppelpunkte getrennt.
3. Ändere die Wartezeit, um das Herz schneller oder langsamer schlagen
   zu lassen.

## Was passiert hier
`show pattern` sendet ein 5×5-Bild an die LED-Matrix des micro:bit über
MicroPythons `display.show(Image(...))`. Die `FOREVER`-Schleife wechselt
zwischen zwei Bildern mit einer halben Sekunde Pause und erzeugt so eine
Animation.

## Warum das wichtig ist
Die LED-Matrix ist der Hauptausgang des micro:bit — keine Verkabelung
nötig, keine externen Bauteile. Muster darauf zu zeichnen ist der erste
Schritt zu Spielen, Statusanzeigen und visuellem Feedback.
