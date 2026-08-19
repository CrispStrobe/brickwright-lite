---
level: beginner
age: 8+
prereqs: []
teaches: [variables, controller-panel, matrix-widget, gauge-widget, spike-prime]
---

## Spike Prime Hub — Virtual Face

The offline visual complement to the `spikeprime` extension. When no hub
is connected, this faceplate shows what the program would display and
read on a real Spike Prime (or Robot Inventor — same hardware).

- **5x5 LED matrix** — mirrors `displayImage` / `setPixel` (heart, smiley, X, bar)
- **Motor A position** — mirrors `getPosition A` (degrees, -180..180)
- **Distance D** — mirrors `getDistance D` (cm, 0..200)
- **Color C** — mirrors `getColor C` (Lego color ID 0..10)

The variable names match the extension's block opcodes: `spike_display`,
`spike_position_A`, `spike_distance_D`, `spike_color_C`. A program
written with the spikeprime blocks maps onto the face 1:1.

## Try this

1. Click the green flag — all four faces start animating.
2. Watch the matrix cycle through four Spike Prime display patterns.
3. Watch the motor gauge sweep back and forth like a running motor.
4. The distance and color gauges follow the same cycle.

## What is going on

The program writes four variables each tick. The matrix widget reads
`spike_display` (a 25-bit row-major bitmask, bit `row*5+col` = LED on).
The three gauge widgets read the sensor/motor variables. On a real hub
the runtime drivers (Scratch Link / Web Bluetooth / brickwright-bridges)
would populate these same variables from the hardware.

## Other Lego hubs

Each Lego hub is a genuinely different device with its own display
hardware — each needs its own faceplate, not a variant of this one:

| Hub | Display | Extension | Faceplate widget needed |
|-----|---------|-----------|------------------------|
| **Spike Prime** | 5x5 LED matrix | `spikeprime` | matrix (this example) |
| **EV3** | 178x128 mono LCD | `ev3comprehensive` | mono LCD widget (future) |
| **NXT** | 100x64 mono LCD | `legonxt` | mono LCD widget (future) |
| **WeDo 2.0** | RGB status light | `wedo2unified` | RGB light widget (future) |
| **Boost** | RGB status light | `legoboostunified` | RGB light widget (future) |

What IS shared is the faceplate framework (variable binding, widget pump,
controller.json format). Each hub gets its own example built on that
framework with the right widget set matching its extension's device model.
