# Counterturn and Snapgate

Both are original CrispStrobe designs under BSD-3-Clause, with one SPIKE Prime
hub and one motor on port A. Their original archives, hashes and notices are
retained in the model-file fixtures. Select an example to load its model and
program together; use Run and Reset before repeating after manual motion.
English and German lessons are available alongside the simulation.

Counterturn has 120 placements. Its horizontal input turns a vertical flywheel
through a 12:20 bevel pair. The freely yawing carrier counter-rotates: its angle
is an observed output, never calculated from the encoder to animate the model.
Four input turns produce about 864 degrees of relative rotor motion and 111
degrees of opposite carrier yaw. A separate unadvanced inertia diagnostic
predicts a native gain of about 0.1282; shape-only inertia predicts 0.1343.
The difference comes from the retained numerical gear inertia floor. The
horizontal reflected motor inertia contributes negligibly to vertical yaw.
This is a level constrained-yaw experiment; native gyroscopic forces are off.
The test also runs the supplied removable 14-piece locking brace: the same
motor and rotor travel complete while the carrier remains locked.

The turntable's collider now preserves its measured central opening, rather
than filling it with a solid cylinder. A free shaft clears that opening and
still contacts the surrounding ring. No broad collision suppression is used.
Two gear retainers move outward by 0.8 mm; the original assembly stays connected.

Snapgate has 205 CAD placements representing 204 stock items. Its cylinder and
rod are the two moving components of one complete factory-sprung 9L shock.
A 24:1 worm drive moves the anchor; the spring and physical roller stops select
the passive rocker's state. The finite program centres the input, performs two
opposite-excursion memory cycles, then returns to its saved datum. The centre
is encoder 45 degrees; the saved datum is zero. They are different positions.
The native test samples real body poses every 5 ms, including an unpowered
500 ms startup and a final hold. Four switches take about 75–80 ms; central
output states remain near opposite 19.5-degree angles with matching inputs.
Observed shock separation stays approximately 56–62.4 mm. Native stop contact
has a small penetration error, bounded by the unchanged source contract; this
is not physical LEGO deformation or a calibrated shock-force measurement.

Small axial changes remove the supplied assembly's coarse and detailed
intersections: move the shock plane 1 mm, retain the anchor on a 12L axle,
seat the bearing pin at the beam face, and connect the rod eye using a retained
5L axle with two half bushes. The in-plane pivot radii and switching prediction
remain unchanged. Automatic building instructions cover every CAD placement.

Native motion and nominal CAD checks do not establish a physical build. Real
backlash, friction, spring stiffness and cable forces need separate measurements.
