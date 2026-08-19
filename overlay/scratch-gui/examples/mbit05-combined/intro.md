---
level: intermediate
age: 10+
prereqs: [mbit01-display, mbit02-sensor, mbit03-pins]
teaches: [conditionals, sensors, actuators, combined-io, micro:bit]
---
## What you see
A temperature alarm: when the sensor reads above 25 °C, the LED lights,
the buzzer sounds at 880 Hz, and the display shows a diamond. Below 25 °C,
everything is off and the display shows a square.

## Try this
1. Click **Run on Simulator** — the program reads the simulated temperature.
2. Change the threshold from 25 to a lower number to trigger the alarm.
3. Add a second condition for cold (below 10 °C) with a different pattern.

## What is going on
This combines four micro:bit capabilities: reading a sensor (`temperature`),
controlling a GPIO pin (`turn on led1`), generating audio (`set buzzer to
880 hz`), and updating the LED display. The `if` block makes decisions
based on sensor data — the core pattern of any embedded controller.
