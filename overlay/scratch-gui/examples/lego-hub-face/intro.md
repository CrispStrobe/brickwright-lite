---
level: beginner
age: 8+
prereqs: []
teaches: [variables, controller-panel, matrix-widget, gauge-widget, lego-hub]
---

## Spike Prime Hub — Virtual Face

A virtual faceplate for the Spike Prime hub (also Robot Inventor — same
hardware). The controller panel shows what the hub's sensors and motors
are doing — no physical hub needed.

- **5x5 light matrix** — the Spike Prime's LED grid, showing a rotating line
- **Motor gauge** — angle readout sweeping -180° to +180°
- **Distance gauge** — simulated ultrasonic sensor, 10–190 cm
- **Colour gauge** — cycling through Lego colour IDs (0–10)

## Try this

1. Click the green flag — all four faces start animating.
2. Watch the matrix: the line rotates through four positions.
3. Watch the motor gauge: it sweeps smoothly back and forth.
4. The distance and colour gauges follow the same cycle.

## What is going on

The program writes four variables each tick: `hub_matrix` (a 25-bit
bitmask), `motor_angle`, `dist_cm`, and `colour_id`. The matrix and
gauge widgets read those variables and render them live.

On real hardware the output side would route through the Lego runtime
drivers (remote or on-device via brickwright-bridges) rather than a
circuit board. The widget faces are the same either way — they show
whatever the variables hold, regardless of how those variables are set.

## Other Lego hubs

The other Lego hubs are genuinely different devices — each needs its
own faceplate with different display and I/O widgets:

| Hub | Display | I/O | Faceplate needs |
|-----|---------|-----|-----------------|
| **Spike Prime** | 5x5 LED matrix | 6 ports, center button, IMU, speaker | this example (matrix widget) |
| **EV3** | 178x128 mono LCD | 4 in + 4 out, 6 buttons, speaker | LCD display widget (future) |
| **NXT** | 100x64 mono LCD | 4 sensor + 3 motor, 4 buttons | LCD display widget (future) |
| **WeDo 2.0 / Boost** | RGB status light only | 2 ports | RGB light widget (future) |

A matrix face and an LCD face are different widgets — one cannot cover
all of them. What IS shared is the faceplate framework: the
display-widget / input-widget binding model, the variable pump, and
the controller.json format. Each hub gets its own example built on
that framework with the right widget set for its hardware.
