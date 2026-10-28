STRAIGHT EIGHT
One hub, one motor, a straight line made entirely by rotating joints
Original LEGO Technic digital design | Version 1.0 | 21 October 2026

START HERE

Open straight_eight.mpd in a compatible LDraw editor or viewer with the
standard LDraw parts library. It contains five named assembly groups and
construction steps. straight_eight.ldr is the same complete assembly as
one flat model, for importers that prefer a single part-placement list.
The illustrated PDF explains the assembly, especially the shared shafts.

This is a digital prototype, not a physically tested building instruction
set. The supplied animation is an exact-mesh kinematic illustration of the
closed linkage. It is not a recording of a hardware or Brickwright run.

WHAT IT DOES

A motor swings the blue crank through a restricted sector. The yellow and
red four-sided cell changes shape, while the two long gray arms keep its
outer corners on circles about O. The red joint Q travels vertically along
an ideal straight line, with no sliding rail, rack or linear actuator.

The mechanism is a Peaucellier linkage: seven moving links and the fixed
ground link make eight. This Technic implementation uses two 11L beams,
four 7L beams and a 9L driving beam. Hole-to-hole distances, rather than
overall molded lengths, determine the geometry.

HARDWARE

  1 complete SPIKE Prime hub, including its rechargeable battery
  1 SPIKE medium angular motor, connected to port A
  113 physical elements / assemblies, across 15 part shapes

The CSV lists colors separately. The hub and motor each count as one
complete assembly. Their internal rendered components are not extra
purchase items. Colors distinguish functions and can be substituted;
beam thickness, hole spacing, axle length and pin length must be preserved.
No sensor, extra motor, pen or paper is required. Flexible leads are not
modeled; route the one motor lead clear of the moving links.

GEOMETRY AND HOME

World X is right, Y is down and Z points toward the front of the machine.
20 LDraw units (LDU) equal one stud, or 8 mm.

  Fixed O = (0, 0)
  Fixed S = (120, 0) LDU
  OC = OD = 200 LDU, or 10 studs between the ends of an 11L beam
  CP = CQ = DP = DQ = 120 LDU, or 6 studs across a 7L beam
  OS = SP = 120 LDU

Home is theta=0: S-to-P points horizontally right. The CAD, diagram,
controller and app example use this same reference. The crank's motor
center is its third hole from the short end, leaving six studs to P.

For the selected assembly branch:
  OP * OQ = 200^2 - 120^2 = 25600 LDU^2
  Qx = 25600 / (2*120) = 106.666667 LDU = 42.666667 mm
  Qy = Qx * tan(theta/2)

Within -60 to +60 degrees, the ideal total stroke is 49.267223 mm.
This is a nominal geometry calculation, not a hardware straightness or
load rating. Joint clearance and frame flex will affect a real model.
The input must not make full revolutions. The operating sector avoids the
degenerate geometry approached when the driving point goes toward O.

ASSEMBLY ORDER

1. Make the base, including the lower lap beams and ground feet.
2. Add the paired O-bearing posts and their front diagonal. Leave the
   upper O shaft and front bearing accessible until the moving arms fit.
3. Build the motor stand and its four side carriers. Attach the motor body
   with all eight mounting pins. The output faces the linkage.
4. Make the hub's two rails and four feet. Fit the four real side pins.
5. Assemble the linkage using the rear-to-front stack order below. Fit
   both half bushes to each axle while leaving practical running clearance.
6. Put the crank at home, install the two rotor-face pins and close O.
   Gently check the working sector, then commission the motor slowly.

REAR-TO-FRONT AXLE STACKS

Each item separated by / is one full-thickness beam or 1L spacer layer.
Every stack has one half bush at each end, outside the listed layers.

  O, 5L axle: rear fixed bearing / OC / OD / front fixed bearing
  C, 4L axle: CP / CQ / OC
  P, 5L axle: crank / spacer / CP / DP
  Q, 4L axle: DQ / CQ / red 1L output marker
  D, 5L axle: DQ / DP / spacer / OD

These are axles turning freely inside round beam holes. Only their half
bush retainers are keyed. Do not substitute keyed-hole beams at the pivots
or squeeze the retainers hard against the arms. The depths differ at P
and D; the two 1L spacers are required for the intended clearances.

The base includes eight three-layer pin stacks. Each uses ONE 3L pin.
Do not insert two opposing 2L pins into one shared middle hole. The exact
ownership of these fasteners is recorded in the MPD comments and review.

CONTROL OPTIONS

straight_eight_pybricks.py is optional source for a compatible SPIKE Prime
hub already running Pybricks 4.1. It is not SPIKE-app Python. Refer to
controller_notes.txt for the complete setup and fault behavior.

In brief: use port A; start near horizontal-right home; use short manual
jogs; RIGHT must move P and Q down. If it moves up, stop and change the
MOTOR_SIGN setting. Hold LEFT and RIGHT for 0.8 seconds to accept home.
From the ready screen, RIGHT runs one 0, +60, -60, 0 cycle. LEFT during
motion requests hold and a fault. CENTER keeps the normal firmware stop.
Automatic repetition is disabled. There is no hard-stop homing.

The GIF uses a smooth sinusoidal input angle. The controller instead uses
limited-speed moves and endpoint dwells. Both use the same geometric
working sector, but the GIF duration is not a measured operating time.

BRICKWRIGHT EXPORT

brickwright/straight-eight.ldr and its .mpd wrapper use the ID and PORT
annotations observed in the user's corrected bundle. Every part has a
unique stable ID, and the motor is explicitly on port A. Their type-1
part-placement lists agree exactly with one another.

The app export uses the bundle's canonical hub identifier, 45601.dat.
That identifier is the hub body without battery geometry. The primary
MPD and LDR use the valid complete assembly, 45601c01.dat, and the physical
requirement remains one complete hub with battery in both cases.

straight_eight.bw and straight_eight.en.json are an example program and
lesson. Their source follows the supplied bundle's observed conventions.
They have not been compiled or executed in Brickwright. In particular,
an importable static model and part IDs do not establish that the app
recognizes and solves this new closed eight-link mechanism. No invented
joint, animation or constraint directives have been added.

REVIEW AND THE USER'S CORRECTIONS

lessons_applied.txt records the concrete differences found in the user's
fixed models and how they changed this design's checking workflow.
review/ contains the final model's numerical, connection, mesh, export
and controller evidence, together with the regression against the old and
fixed Orbital model. validation_summary.txt is the compact overview.

Digital review establishes nominal part geometry, references, linkage
closure and the sampled checks described in those files. It does not
establish physical torque, friction, stiffness, tolerance, durability or
continuous collision freedom. The intended first physical run is slow,
unloaded and observed, after checking that each free pivot moves easily.

REFERENCES AND CREDIT

The user supplied brickwright-fixed-models.zip for comparison. The fixes
are credited in lessons_applied.txt; the attached collection is not copied
into this package.

Peaucellier geometry:
Hyung Ju Nam and Kim Christian Jalosjos, "Parametric Representations of
Polynomial Curves Using Linkages", Parabola 52(1), 2016, section 2.
https://www.parabola.unsw.edu.au/sites/default/files/2024-03/vol52_no1_2.pdf

Official multipart format:
https://www.ldraw.org/article/47.html

Official Pybricks motor and PrimeHub API documentation:
https://docs.pybricks.com/en/stable/pupdevices/motor.html
https://docs.pybricks.com/en/stable/hubs/primehub.html

Original STRAIGHT EIGHT assembly design, explanatory text, illustrations
and example controller: OpenAI, licensed under CC BY 4.0.
https://creativecommons.org/licenses/by/4.0/
The historical linkage principle is not claimed as a new invention.
Referenced LDraw part geometry retains its original authors and licenses.
LEGO and SPIKE are trademarks of the LEGO Group. This is an independent
design, not an official LEGO product.
