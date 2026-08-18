---
level: intermediate
age: 10+
prereqs: [mbit01-display, mbit02-sensor]
teaches: [radio, communication, variables, micro:bit]
---
## What you see
Press button A to increment a counter and broadcast it over the micro:bit
radio. The count scrolls across the display each time.

## Try this
1. Click **Run on Simulator** — press the simulated button A to send.
2. Change `group 1` to a different group number (0–255) — only micro:bits
   on the same group hear each other.
3. Change `power 6` to `power 0` for minimum range or `power 7` for maximum.

## What is going on
`radio on group 1 power 6` initialises the radio on group 1 at power level 6
(about 10 metres range). Each button A press increments a counter and calls
`radio.send(str(count))` — the number is sent as a string over the 2.4 GHz
radio. In the simulator, there is no peer to receive it, but the program
structure and MicroPython are identical to what runs on real hardware.

## Why it matters
Radio is how two or more micro:bits communicate without a host computer.
Games, remote controls, and sensor networks all use it. Understanding group
numbers and power levels is essential for real-world deployments.
