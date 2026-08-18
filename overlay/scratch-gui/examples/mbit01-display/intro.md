---
level: beginner
age: 8+
teaches: [led-matrix, display, animation, micro:bit]
---
## What you see
A beating heart on the micro:bit's 5×5 LED matrix. The display alternates
between a large heart and a small heart every half second.

## Try this
1. Click **Run on Simulator** on the MicroPython tab to see the heart beat.
2. Change the pattern strings to draw your own shapes — each digit is one
   LED (0 = off, 9 = brightest), five digits per row, five rows separated
   by colons.
3. Change the wait time to make the heart beat faster or slower.

## What is going on
`show pattern` sends a 5×5 image to the micro:bit's LED matrix using
MicroPython's `display.show(Image(...))`. The `FOREVER` loop alternates
between two images with a half-second pause, creating an animation.

## Why it matters
The LED matrix is the micro:bit's primary output — no wiring needed, no
external parts. Learning to draw patterns on it is the first step to
building games, status indicators, and visual feedback.
