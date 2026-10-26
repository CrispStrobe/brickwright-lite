# Cable Compass

Two independently controlled 24:1 worm winches position one passive payload
using four direct cords. The main model has 175 rigid LEGO placements plus
four additional cords; the comparison has 174 placements and the same cords.
Both use the original finite program and motors A/B on one SPIKE Prime hub.

Select either example to load its saved model and program into Blocks. Run
visits home, 16 mm left, home, 16 mm up, 16 mm right and home, with three-second
arrival dwells. Reset before a repeated run or after manual movement. The
bounded manual controls retain the original safe free-length range; they are
not mechanical end stops. The disconnected comparison removes only the left
worm and retains all six bearing interfaces and the complete shaft collars.
Its motor still completes the input route, while the unheld drum loses the
passive position. Restore the main example before normal operation.

## Principle

This is a cable-driven parallel robot with inverse kinematics. In millimetres,
with `h` positive down from the anchor plane:

```
L_A² = (x + 64)² + h² + 24²
L_B² = (x − 64)² + h² + 24²
wound length = 2.8 × motor radians / 24
```

At home `x = 0`, `h = 100`. The front/rear offset matters. Equal winding keeps
the payload on the centre line; unequal winding moves it laterally. Motor
arrival, actual payload position, geometric closure and load support are
separate observations. The free chassis can make a small reaction movement;
positions in this experiment are relative to that chassis, with its initial
world registration and complete displacement independently checked/reported.

## Intake and verification

The original BSD-3-Clause source is credited to CrispStrobe. Original r1/r2
failed force receipts remain preserved with their exact input hashes. A native
Jolt distance constraint could clear its live lambda during position correction
after the corresponding impulse had changed momentum. The published bw.7
producer adds a separate retained velocity-impulse observation; the existing
solver, live getter and drum-feedback path remain unchanged. Both scalar and
SIMD packages and their packed tarball pass native impulse balance and exact
body-trajectory comparisons with bw.6. Producer changes are in
[JoltPhysics #1](https://github.com/CrispStrobe/JoltPhysics/pull/1) and
[JoltPhysics.js #2](https://github.com/CrispStrobe/JoltPhysics.js/pull/2).

The reviewed native suite retains all original route, winding, startup,
return, hold, hinge, axis, force-support and momentum limits. It checks ordinary
25 ms, strict 25 ms and strict 30 Hz program observation with unchanged 5 ms
physics. All six original external bearing interfaces are observed, including
those merged into representative solver joints. Independent shaft poses and
payload markers reject frozen input/output observations; all-zero rope loads
fail momentum, weight-support and both-side participation gates. A plain run
and the full-rate observer have exactly equal body/joint trajectories.

Ordinary 25 ms results: maximum position-law error 0.304 mm, return error
0.027 mm, and settled upward rope support approximately 99.96–99.97% of weight.
The chassis peak reaction displacement is about 1.15 mm. Native simulation
qualification is not a physical LEGO build or a cord/motor capacity rating.
Full current browser/import/export acceptance remains a separate delivery gate.

Use four low-stretch cords in a physical prototype; about 250 mm each leaves
attachment and calibration allowance. Cord thickness, knots and effective drum
radius need a physical build check. Instructions include cord attachments in
assembly connectivity without turning those attachments into rigid physics
joints. The placement BOM counts rigid LEGO pieces; cords and motor leads are
additional accessories.
