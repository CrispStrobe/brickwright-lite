---
level: beginner
age: 10+
prereqs: [mbit01-display]
teaches: [gpio, pins, digital-output, tone, micro:bit]
---
## What you see
An LED connected to pin P0 blinks while the micro:bit beeps at 440 Hz
(concert A). A dot on the display shows when the output is active.

## Try this
1. Click **Run on Simulator** — the LED blinks and the buzzer beeps.
2. Change `440 hz` to `880 hz` for a higher pitch (one octave up).
3. Add a second LED on pin P1 and make it alternate with the first.

## What is going on
`turn on led1` calls `pin0.write_digital(0)` — the LED is active-low, so
writing 0 turns it on. `set buzzer to 440 hz` calls `music.pitch(440)` to
generate a 440 Hz square wave on pin P0. The display dot at (2,2) provides
visual feedback even without an external LED.

## Why it matters
GPIO pins are how the micro:bit talks to the outside world. An LED on a pin
is the simplest actuator; a buzzer is the simplest audio output. Together
they teach digital output, timing, and the active-low convention that most
real circuits use.
