BUTTERFLY - CRANK-DRIVEN FLAPPING-WING AUTOMATON
Original Technic implementation / 21 October 2026

START HERE
Open butterfly.mpd for seven named assembly submodels with steps.
Open butterfly.ldr for the identical flat standard LDraw assembly.
Read butterfly_build_guide.pdf for the eight-page illustrated module,
joint-stack, manual-reference and operating guide.

REQUIREMENTS
One complete SPIKE Prime hub, 45601c01, including its battery.
One SPIKE medium angular motor, 54696p01, connected to port A.
225 physical elements / assemblies across 24 part shapes.
No separate sensor is needed. Colors may be substituted; keep all lengths,
thicknesses, keyed profiles and fastener types. The flexible motor cable
is not drawn. Route it behind the frame and clear of the moving links.

WHAT IT DOES
One continuously rotating crank drives a real guided crosshead. Two equal
links connect that crosshead to the keyed wing arms. Each hinge shaft
carries a rigid double-lobed wing made from exact 6-8-10 triangles.
Both wings rise and fall together. One complete motor revolution makes
one complete flap, from raised to level and back to raised.

The crank radius is 20 LDU, connecting-rod length 120 LDU, wing-link length
100 LDU and wing-arm drive radius 20 LDU. The crosshead travels 40 LDU
(16 mm); each wing moves through 53.130102 degrees. The wing transmission
has a continuous sine lower bound of 0.8 and does not approach a toggle.

DATUM AND CONVENTIONS
World X points right, Y down and Z toward the front. One stud is 20 LDU
or 8 mm. The front viewer is at +Z. Positive crank phase is clockwise in
that front view. Home phase 0 has the crank middle hole pointing UP,
crosshead center (0,40), and both wings 53.13 degrees above level.
Phase 180 places the crosshead at (0,80) and the wings level. Phase 360
returns to the same physical home. Hinge centers are (-80,0) and (80,0).

The motor center is (0,180,-150), with its long body pointing upward.
Its output face is Z-100 and its blind socket ends at Z-120. CAD native
rotor angle is -phi. The expected Pybricks clockwise adapter is +phi,
but the supplied program requires a visible direction jog and manual
reference. Wing descent alone cannot identify the crank rotation sign.

CRITICAL INPUT AND FREE-PIVOT STACKS
Z values below are layer centers in LDU, ordered rear to front.

Input shaft: 6L axle centered Z-60, physical tips -119.5 and -0.5.
It inserts 19.5 LDU into the 20-LDU motor socket. Full rear bush -90;
fixed bearing -70; full crank collar -30.5; keyed crank -15.5;
front half bush -5.5. The shaft and front-bush faces stop at Z-0.5,
leaving 0.5 LDU (0.2 mm) behind the rod's rear face Z0. The empty
interval ahead of the rear bearing does not need another packing bush.

Crosshead S: 5L axle centered Z0. Half bush -45; crosshead beam -30;
half spacer -15; right thin link -5; connecting rod +10; left thin
link +25; full bush +40. One axle owns this complete layered joint.

Crank pin Q: 4L axle centered Z5. Half bush -25.5; crank -15.5;
half spacer -5.5; rod +10; full bush +30. There is 0.5 LDU running
endplay between the spacer and rod; all holes remain fully engaged.

Left wing-link pin: 3L axle centered Z20. Half bush -5; arm +5;
half spacer +15; thin link +25; full bush +40.
Right wing-link pin: 3L axle centered Z0. Full bush -20; thin link -5;
half spacer +5; arm +15; half bush +25.

All four free pivots use actual ROUND holes. Their axle keys engage
only the retaining/spacer bushes. Each 6632 drive arm instead uses its
keyed end on the driving shaft and its round middle hole for the link.
The unused far end remains physical and is included in the sweep check.

GUIDES AND WING ROOTS
Two fixed 8L guide axles are centered at (X-40/+40,Y60,Z-50).
Fixed 15100 round sleeves are at Y0/120, with retaining half bushes at
Y-15/+135. Two moving 15100 sleeves slide along those axles and pin
directly into the opposite ends of the 5L crosshead at Z-30.
Each moving sleeve has 20 LDU of actual round-bore engagement.

Each wing shaft is a 10L axle centered Z0. Fixed round bearing rails
are at Z-70/+70, full outer bushes at -90/+90, half bushes at -55/+55,
and keyed 6536 wing blocks at -40/+40. A full inner spacer is at -20.
The left arm is at Z5, with half bushes -5/+15. The right arm is at
Z15, with half bushes +5/+25. Keep the left Z20..30 and right Z-10..0
root gaps empty: the thin wing links sweep through those depth planes.

Two separated pins tie each pair of wing blocks to a 13L root spine.
Two 9L ribs and two 11L diagonals form each double-lobed wing. One 3L
pin owns the common waist; another 3L pin owns the spacer-filled rear
root corner. The remaining lobe corners use single 2L pins.

FRAME AND SHARED FASTENERS
The floor is squared by a three-point 3x5L corner brace. Front and left
side tower faces use exact 6-8-10 triangles. A second three-point corner
brace stiffens the rear face while clearing the motor carriers.
The side ties are at Y60/220, below the unused arm's maximum Y49 extent.
The upper tie's top is Y51, giving 2 LDU nominal slab clearance.

The base owns every vertical floor pin. Shared foot/runner/crossbar
stacks use ONE 6558 3L pin, never two opposing 2L pins. Assemble all
layers of each shared stack together; MPD module ordering does not imply
that a friction pin can always be inserted after every later part.
The motor has eight real stator mounting pins; the complete hub has
four real side mounting pins, two rails and four perpendicular feet.

OPTIONAL CONTROL
butterfly_pybricks.py requires a compatible hub already running Pybricks.
It is not a stock SPIKE-app project and no firmware has been installed.
Yellow H: LEFT/RIGHT give short slow reference jogs. From crank-UP,
RIGHT must move the throw to the viewer's RIGHT. Set the crank exactly
UP and hold BOTH buttons 0.8 s to accept encoder zero, then release.
Blue 1/2: LEFT chooses one or two flaps; a fresh RIGHT press and release
runs that selection. The initial speed cap is 30 degrees/s. Each full
turn returns to raised home and holds. LEFT during movement or dwell
requests hold and ends the session; restart and reference again.
CENTER keeps normal firmware stop. Active hold requires power.
Read controller_notes.txt for sign checking, limits and fault behavior.

FILES
butterfly.mpd / .ldr       Standard complete-hub CAD
butterfly_build_guide.pdf  Eight-page illustrated module/operating guide
butterfly_motion.gif       Exact-mesh one-cycle motion preview
butterfly_preview.png      Exact-mesh assembled view
parts_list.csv            Official part/color quantities and descriptions
butterfly_pybricks.py      Optional finite-flap controller
controller_notes.txt      Manual reference, controls and limits
motion_presets.json       Explanatory phase/wing motion data
brickwright/              App-oriented LDR and MPD wrapper
validation_summary.txt    Final evidence and practical limits
lessons_applied.txt       Corrections carried into this design
parts_attribution.txt     Part titles, authors and source licenses
review/                   Machine-readable geometry/check evidence
source/                   Generators, reviewers and renderers
package_manifest.json     SHA-256 hashes of bundle contents

STATUS AND COMPATIBILITY
This is a checked DIGITAL PROTOTYPE, not a physically tested machine.
The render follows closed rigid kinematics; it does not measure torque,
friction, manufacturing tolerances, guide binding, shaft flex or wear.
The guides must be parallel and all moving stacks need practical endplay.
Check an entire slow unpowered turn before a first powered trial.
No hub, firmware or Brickwright execution has been performed here.

The standard MPD/LDR and BOM use complete hub 45601c01. Optional app
exports use the observed 45601 body-only alias and document the difference.
The physical model still requires the complete hub. Stable physical IDs
and port-A metadata are present. App import/automatic linkage inference
are not claimed as tested. LDraw describes the physical parts and pose;
the supplied source implements the analytical animation separately.

Use an official LDraw parts library containing the SPIKE assemblies;
the complete parts library is not embedded in this bundle.

PRIMARY REFERENCES
LDraw multipart format: https://www.ldraw.org/article/47.html
Official LDraw geometry: https://library.ldraw.org/
Pybricks motor API: https://docs.pybricks.com/en/stable/pupdevices/motor.html
Direction convention: https://docs.pybricks.com/en/stable/parameters/direction.html

LICENSE
Original design, guide and example source: CC BY 4.0 / OpenAI.
LDraw geometry retains its original authorship and licenses.
LEGO and SPIKE are trademarks of the LEGO Group. This independent model
is not an official LEGO set.
