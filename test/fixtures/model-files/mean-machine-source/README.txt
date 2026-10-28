MEAN MACHINE - TWO-INPUT MECHANICAL AVERAGER
Original Technic implementation / 21 October 2026

START HERE
Open mean_machine.mpd for seven named assembly submodels and steps.
Open mean_machine.ldr for the identical flat standard LDraw assembly.
Read mean_machine_build_guide.pdf for the illustrated assembly guide,
exact axle stacks, tooth phases, manual datum and operating examples.

REQUIREMENTS
One complete SPIKE Prime hub, 45601c01, including rechargeable battery.
Two SPIKE medium angular motors, 54696p01, on ports A and B.
212 physical elements / assemblies across 23 part shapes.
No additional sensor or motor is required. Colors may be substituted;
preserve the exact lengths, thicknesses, axle keys, pin types and stops.
Both flexible motor cables are omitted from the CAD, and must be routed
clear of moving gears on the physical build.

WHAT IT DOES
Two independent input axles drive the two side gears inside a real 6573
differential housing. Its third bevel gear is a freely spinning spider
on the molded round stud. For signed input angles A and B about the same
common axis, measured from home, the carrier angle is C = (A + B) / 2.
The spider absorbs the difference; relative spin from home is (B - A) / 2.

The carrier's 16T flange drives a 16T idler and then a 16T output gear.
Two equal external meshes reverse direction twice, so the pointer shows
the same deflection C. The unused 24T carrier flange remains physical.
The red pointer is a 11478 thin 5L beam with real keyed end holes.
Its radius is 80 LDU = 32 mm. A round-hole beam is not a substitute.

DEMONSTRATIONS
  ADD       A= +60, B= +60 : pointer +60 degrees
  CANCEL    A= +90, B= -90 : pointer   0 degrees
  UNEQUAL   A=+120, B= -30 : pointer +45 degrees
  NEGATIVE  A= -60, B= -60 : pointer -60 degrees
Each optional controller request runs one outward move, holds, returns
both inputs to their common home, and holds again. The preview loops
through all four illustrations with a return to home between cases.

The animation uses ideal synchronized normalized progress. Hardware
command timing, backlash and control error may make CANCEL wobble.
The software commands the inputs; the physical differential computes
the output. Encoder-derived mean is not a measured pointer reading.

COORDINATES AND HOME
World X is right, Y down and Z toward the front dial. One stud is 20 LDU
or 8 mm. Positive mean is clockwise when viewed from the front (+Z).
The yellow upper marker is zero; the white side markers mark the -90
and +90 directions. This three-reference dial is a mechanism demonstrator,
not a finely graduated or calibrated precision instrument.

The rear motor A is at (0,0,-150); its native CAD rotor angle is -A.
The front motor B is at (0,0,+150); its native CAD rotor angle is +B.
The motors' output faces oppose each other. Both logical input angles
use world +Z, not separate face-relative directions.

At home both input axle keys have the standard cardinal alignment and
the pointer is vertical up. The internal spider has a 15-degree tooth
stagger. The external idler is phased 11.25 degrees; the carrier and
output gear use zero. Preserve these phases when closing the bearings.
The home must be established manually on actual hardware before running.

CRITICAL SHAFT STACKS
Input A: 6L axle centered Z-60, nominal span -120..0, physical tips
-119.5..-0.5. Input B mirrors it. The inner tips leave a 1-LDU gap.
Each engages 19.5 LDU in a 20-LDU motor socket and the complete 7-LDU
keyed side-gear section. The rotating case has round shaft passages;
neither input axle keys to the carrier. Outside full bushes are Z-70/+70.

Idler, X40: one 4L axle centered Z-30; half bushes Z-65/+5; bearings
Z-50/-10; gear Z-30. No idler bush reaches the unused 24T flange at Z30.

Output, X80: rear 8L axle centered Z10; half bushes Z-65/+65; gear Z-30;
bearings Z-50/-10/+50; joiner Z90. Front 10L axle centered Z190; rear
half bush Z235; dial bearing Z250; thin pointer Z265; full bush Z280.
The joiner has a central stop. The two beveled axle tips at Z89.5/90.5
clear it by 0.25 LDU each and engage separate sockets by 19.5 LDU each.

FRAMES, PINS AND HUB
All three-layer shared joints use single 6558 3L pins. Never add two
opposing 2L pins into an already occupied center hole. The base submodel
owns every vertical floor pin, including later upright and hub feet.
Assemble all layers of those shared stacks together; submodel ordering
does not imply that every already-inserted friction pin is accessible.

Exact 6-8-10 diagonals brace both main bearing frames and motor stands.
A three-point L-corner brace locks the dial frame. Another L-brace locks
the standalone floor grid square, without relying on gear shafts to do so.
Its three joints include one spacer-filled stack. The hub wing connects
to the main runners through two crosslinks with multiple pin crossings.
Each motor stator has eight real mounting pins. Four real side pins
secure the complete hub to two rails and four perpendicular feet.

OPTIONAL CONTROLLER
mean_machine_pybricks.py requires compatible Pybricks firmware. It is not
a stock LEGO SPIKE-app project, and no firmware has been installed.
Read controller_notes.txt before use. Both motors actively hold. Reference
A using short powered jogs while B holds, then reference B while A holds;
both encoders reset only after both manual references are accepted.

Expected Pybricks CLOCKWISE sign adapters are A:+1 and B:-1. These are
different from native CAD angle signs. Verify each positive logical jog
by observing clockwise pointer motion with the other motor holding.
The script starts with a 30-degree/s input speed cap and has bounds,
timeout, stall detection and explicit hold requests. Physical operation
is untested; active holding depends on hub power and the running program.

FILES
mean_machine.mpd / .ldr      Standard CAD with the complete hub
mean_machine_build_guide.pdf Eight-page illustrated module/operating guide
mean_machine_motion.gif      Exact-mesh ideal four-case motion preview
mean_machine_preview.png     Exact-mesh assembled view
parts_list.csv              Part/color quantities and official descriptions
controller_notes.txt        Reference, signs, controls and fault behavior
mean_machine_pybricks.py     Optional two-motor controller source
motion_presets.json         Ideal input/output reference paths
brickwright/               App-oriented flat LDR and MPD wrapper
validation_summary.txt      Final evidence, scope and named limitations
lessons_applied.txt         Specific corrections carried into this model
parts_attribution.txt       Official part titles, authors and licenses
review/                    Machine-readable geometry/check evidence
source/                    Reproducible generators, reviewers and renderers
package_manifest.json      SHA-256 hashes of bundle contents

DIGITAL STATUS AND NOMINAL FITS
This machine has not been physically built, powered, load tested or run
in Brickwright. Sampled CAD and connection checks do not establish
stiffness, friction, wear, backlash, torque capacity or numerical accuracy.

The intended 6573 housing/three-6589 bevel assembly is shown in official
LEGO 8455 instructions, page 64, step 60. Current official LDraw parts
approximate its molded spider stud and cross bore differently, producing
a named local CAD incursion at that standard free-bearing interface.
Ordinary round-bore/axle and diagonal pin/socket faceting contacts are
also classified separately from unexpected body collisions. Full records
and geometric bounds are included; these are not positive-clearance claims.

Nominal case-end faces contact their bearings at Z+/-40. The red pointer's
rear face meets the dial bearing front face at Z260. Retainer stacks also
need practical endplay. Do not squeeze the rotating parts against fixed
faces. Check smooth, slow operation of the empty mechanism on a real build.

FORMAT AND LIBRARY
All standard CAD references use official LDraw IDs; the part library is
not embedded. Install a current official LDraw library with the SPIKE
assemblies. Standard MPD and flat LDR have identical expanded placements.
The optional app pair uses the observed body-only 45601 hub alias; standard
files and BOM use complete 45601c01. IDs and motor ports are consistent.
App import, automatic connection inference and runtime motion are untested.

PRIMARY REFERENCES
Differential equations, equal sun-planet gear ratios:
https://www.mathworks.com/help/sdl/ref/differential.html
Official LEGO differential assembly, 8455 page 64 step 60:
https://www.lego.com/cdn/product-assets/product.bi.core.pdf/4215846.pdf#page=64
Official LDraw multipart format:
https://www.ldraw.org/article/47.html
Pybricks motor API and direction convention:
https://docs.pybricks.com/en/stable/pupdevices/motor.html
https://docs.pybricks.com/en/stable/parameters/direction.html

LICENSE
Original design, guide and example source: CC BY 4.0 / OpenAI.
LDraw geometry retains its original authorship and licenses.
LEGO and SPIKE are trademarks of the LEGO Group. This is an independent
model and is not an official LEGO set.
