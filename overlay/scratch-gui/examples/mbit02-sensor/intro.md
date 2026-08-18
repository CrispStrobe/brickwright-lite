---
level: beginner
age: 8+
prereqs: [mbit01-display]
teaches: [sensors, temperature, variables, micro:bit]
---
## What you see
The micro:bit reads its built-in temperature sensor and scrolls the value
across the LED display every two seconds.

## Try this
1. Click **Run on Simulator** — the temperature scrolls across the display.
2. Replace `read temperature` with `read light` to show the ambient light level.
3. Replace it with `read compass` to show the compass heading in degrees.

## What is going on
`read temperature` calls MicroPython's `temperature()`, which returns the
CPU die temperature in °C (typically 2–3 °C warmer than ambient). `show text`
scrolls any value across the 5×5 matrix. The `FOREVER` loop refreshes the
reading every two seconds.

## Why it matters
Reading sensors and displaying their values is the core loop of any data
logger or environmental monitor. The micro:bit has temperature, light, compass,
and accelerometer built in — no wiring needed.
