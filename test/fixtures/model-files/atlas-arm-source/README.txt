ATLAS ARM
Original LEGO Technic articulated grabber / digital prototype v1.0
20 October 2026

START HERE

Open atlas_arm.mpd in an LDraw-capable editor with a current official LDraw
parts library. It contains nine named assembly groups and STEP markers.
Use atlas_arm_build_guide.pdf beside the CAD model while assembling.

The design uses one SPIKE Prime hub and three medium angular motors:
two motors operate the shoulder and elbow through 24:1 worm drives; the
third operates a direct-drive pincer. The base is fixed. The arm moves in
a vertical plane; there is no powered base yaw or wrist rotation.

This is an original digitally reviewed design, not a physically tested
building instruction set. Grip force, payload, axle stiffness, backlash,
motor loading, cable bends, and stability under load have not been measured.
Start with the empty arm and keep the supplied movement limits.

PACKAGE CONTENTS

atlas_arm.mpd                 Main multipart LDraw model
atlas_arm.ldr                 Flat LDraw alternative
atlas_arm_build_guide.pdf     Eight-page illustrated assembly/setup guide
parts_list.csv               Physical bill of materials, by part and color
atlas_arm_preview.png        Exact CAD render at the open-jaw home pose
atlas_arm_motion.gif         Illustrated reach/close/lift/lower/release cycle
atlas_arm_pybricks.py         Optional three-axis Pybricks controller
controller_notes.txt         Firmware, wiring, calibration, and controls
validation_summary.txt       Digital checks and their limits
README.txt                   This document

HARDWARE

1 x LEGO Education SPIKE Prime hub, product 45601
3 x LEGO Technic Medium Angular Motor, product 45603
231 physical elements/assemblies total, in 24 different part shapes.
The hub and each complete motor count as one physical assembly.

Wiring: hub port A = shoulder, B = elbow, D = gripper. Leave C unused.
The third actuator is called motor C in the CAD assembly names; that is
its assembly label, not its final hub socket. Plug this motor into D.
Port D gives the wrist lead more routing slack from this hub position.

LDraw uses 45601c01.dat for the hub and 54696p01.dat for the motor. These
are CAD identifiers, not the product numbers printed above.

This is not claimed to be a one-set alternate build. Check the CSV against
your own inventory. In particular, it uses two molded 6588 worm gearboxes,
two 4716 worms, two 3648b 24-tooth gears, long axles, and specific short
32002 pins for the shallow gearbox mounting sockets. Equivalent colors
may be substituted; part-and-color retail availability was not checked.

MECHANISM AND GEOMETRY

Positive shoulder angle lifts the red upper arm above horizontal.
Elbow angle is measured relative to the upper arm, not to the bench.
Positive gripper angle closes the moving finger toward the fixed finger.

Shoulder: 35 to 60 degrees; worm reduction 24:1.
Elbow:   -75 to -35 degrees relative to the upper arm; reduction 24:1.
Gripper: -15 degrees open to +30 degrees empty close; direct 1:1 drive.

Upper-arm joint spacing: 13 studs / 104 mm.
Elbow-to-wrist mounting center: 12 studs / 96 mm.
Nominal jaw-tip opening: about 25.1 mm open, 0.8 mm at empty close.
The jaw does not have a mechanical hard stop at either software limit.

The whole sampled movement envelope is approximately 326 x 128 x 317 mm
(forward length x width x height), including the base and hub. This is
the union of the inspected poses, not a claim of continuous collision
certification. The gripping position remains above the bench; present a
small, very light object at the fingers if trying a loaded demonstration.
No tabletop workpiece stand is included.

ASSEMBLY POINTS

Use each one-piece 3L pin shown at a three-layer connection. Do not insert
two shorter pins from opposite sides into the same middle hole.

The housing side sockets require 32002 short pins: short end into the
gearbox, full end through the outer cheek. Ordinary 2L pins extend too far
into the gear cavity at these locations.

Each driven link root is two thin 5L beams on each side of the joint.
Their end axle holes key the link to the output shaft; two round-hole
pins connect each thin pair to a thick main rail. Fit the outer output
bushes only after these thin roots are on the shaft. Leave slight running
clearance at all moving bearing stacks.

The motor-support cross-axles sit above their motor housings. The wrist
cross-axles sit below its motor. These offsets are deliberate clearances.

The hub rests on the raised front platform and can be lifted off. Motor
cables are flexible and are omitted from the CAD. Follow the final wiring
and routing notes, with loose bends throughout the whole movement.
For the wrist lead, keep the flat ribbon oriented across the arm while
its loose loop drops through the forearm center and under the link.
Approach port D from the hub's right side. The candidate route uses about
209 mm of the specified 250 mm lead; real bends and slack still need a
physical check. Do not pull the cable taut or twist it edge-on at the
close bend behind the wrist motor.

MANUAL REFERENCE AND CONTROLLER

The optional script requires Pybricks firmware and its PrimeHub/Motor API.
It is not a stock SPIKE app project and does not install firmware.

On every program start, use slow LEFT/RIGHT motor-input jogs to establish:
1. Shoulder +45 degrees above horizontal.
2. Elbow -60 degrees relative to upper arm: forearm 15 degrees below level.
3. Gripper 0 degrees: both fingers parallel and pointing forward.

Hold LEFT and RIGHT together for 0.8 seconds to accept each reference.
After setup, the jaw opens to -15 degrees and the display shows a blue R.
RIGHT runs one cycle. LEFT repeats setup while ready. During a cycle,
RIGHT aborts and holds. CENTER retains the normal program-stop behavior.
Read controller_notes.txt before use.

Do not force the output arm backwards through the worm drive. Establish
positions by input jogs or during assembly. The program does not seek an
end stop automatically. Initial torque caps are untested setup values,
not measured contact-force limits or payload ratings.

The GIF is a kinematic illustration. Its 9.6-second playback is faster
than the deliberately slow controller. It does not simulate forces,
flex, cable dynamics, grasped objects, or measured hardware behavior.

LDraw FORMAT NOTES

The MPD poses the integral motor rotor separately from its housing, so
geometry-only readers may count 234 leaf parts rather than 231 purchased
assemblies. The parts CSV is the physical inventory and is authoritative.
The flat LDR uses three ordinary complete-motor shortcuts; their internal
rotor phase is cosmetic. All external structural placements are identical.

Standard part geometry is referenced, not duplicated into this package.
Update your LDraw library if an application reports a missing part. The
files were parsed against the official library with no missing references
or syntax warnings; no particular third-party editor's import was tested.

PRIMARY REFERENCES

LDraw multipart specification:
https://www.ldraw.org/article/47.html

Official LDraw part library:
https://library.ldraw.org/

LEGO medium angular motor technical sheet, including 250 mm wire length:
https://assets.education.lego.com/v3/assets/blt293eea581807678a/blt692436dd1e8fa71c/5f8801d5c8a27c1d9614c27e/techspecs_technicmediumangularmotor.pdf?locale=en-us

Pybricks motor and PrimeHub documentation:
https://docs.pybricks.com/en/latest/pupdevices/motor.html
https://docs.pybricks.com/en/latest/hubs/primehub.html

LICENSE

Original model, guide, controller, documentation and renders: CC BY 4.0.
Attribution: ATLAS ARM, an original design generated by OpenAI, 2026.
Referenced LDraw parts retain their authors' own licenses. The parts
library itself is not included in this package.

LEGO, Technic, and SPIKE are trademarks of the LEGO Group. This is an
independent model and is not an official LEGO product or instruction set.
