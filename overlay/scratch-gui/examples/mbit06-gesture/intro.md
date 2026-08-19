---
level: beginner
age: 8+
prereqs: [mbit01-display]
teaches: [accelerometer, gestures, random, micro:bit]
---
## What you see
Shake the micro:bit to roll a virtual die. The display shows a random
number from 1 to 6 when the accelerometer detects a strong shake.

## Try this
1. Click **Run on Simulator** — the display shows "?".
2. In the simulator, press the shake button to trigger a roll.
3. Change `1500` to a lower value for a more sensitive shake detection.

## What is going on
`read accel strength` returns the magnitude of acceleration in milli-g
(1000 = 1g = stationary). A shake produces values above 1500. When
detected, `pick random 1 to 6` generates a die roll and `show text`
displays it.
