STEPWORKS - WALKING-BEAM TRANSFER CONVEYOR
Original Technic implementation / 21 October 2026

START HERE
Open stepworks.mpd for six named submodels and assembly steps.
Open stepworks.ldr for the same flat standard LDraw assembly.
Read stepworks_build_guide.pdf for the illustrated module guide, joint
stacks, gear datum, pallet placement and commissioning procedure.

REQUIREMENTS
One complete SPIKE Prime hub (45601c01, including rechargeable battery).
One SPIKE medium angular motor (54696p01) on hub port A.
240 total physical elements/assemblies, including the 22-part pallet.
No other motor or sensor is required. Match exact geometry and lengths in
parts_list.csv; colors may be substituted. Flexible cable geometry is omitted.

WHAT IT DOES
The motor turns a six-gear 1:1 train. Both end shafts turn in the same
phase and drive four one-stud-radius cranks. The yellow walking rails
stay level, rise between the fixed rails, lift the loose pallet, carry
it forward and lower it. They return underneath while the pallet rests.

The ideal advance is 40 LDU = 16 mm per cycle; maximum lift is 20 LDU = 8 mm.
The demonstration makes THREE transfers: pallet center X20 ->60 ->100 ->140
LDU, for 48 mm total travel. It then stops for MANUAL RELOAD. This is a
short transfer demonstrator, not an endless-feed or automatically returning
conveyor. Do not continue past the third step with the included pallet.

The geared crank motion follows exact rigid constraints. The loose pallet's
trajectory is separately constructed assuming quasi-static gravity support,
level rails and sufficient friction without slip. That contact assumption
is stated in the sources, guide, GIF and reports. It is not a dynamics result.

DATUM AND ASSEMBLY
Coordinates are X right, Y down, Z across the bed, positive toward the hub.
One stud is 20 LDU / 8 mm. The two driven axes are (0,0,0) and (160,0,0).
At motor phase zero, both cranks lean 11.25 degrees left from vertical down.
The motor/input cross is at its standard alignment. Do not use all gears at
zero or substitute straight-down cranks for this reference.

The input gear turns -phi and the three even inline gears turn 11.25+phi.
The two idlers turn -phi. All six gears are 16T at 40-LDU center spacing.
One forward motor revolution gives one walking-rail cycle.

The front free pivot contains, in order from the mechanism center outward:
  half bush Z35, thin crank Z45, full bush Z60, walking rail Z80,
  full bush Z100, all on ONE 4L axle centered at Z70.
The rear side mirrors these coordinates. The crank middle hole and walking
rail holes are round free pivots; they do not key the axle. Leave practical
endplay and check free turning. The unused far crank end remains physical.

The 10L motor axle is centered at Z-30: its rear bevel tip reaches Z-129.5,
19.5 LDU inside the 20-LDU socket opening at Z-110. Its bearing/retainer stack
is shown in the guide. Longer insertion is not a substitute for retention.

One owner per hole stack: all shared three-layer joints use one 3L pin.
Do not add opposing 2L pins to an already occupied middle hole. All vertical
floor pins are owned by the base submodel, even where an upright or hub foot
joins later. Fit all layers of those stacks together as you assemble.

The motor housing is fixed by eight actual stator pins; the complete hub is
fixed by four actual side pins. Three shortened inner base runners clear
the motor's lower housing. Two outer L-corner braces lock the fixed rails
against four-bar sway. The hub buttons remain approachable from the front.

PALLET PLACEMENT
At the start the pallet's two transverse 15L rungs are over X0 and X40, giving
center X20. Four OUTER feet sit over the fixed rails at Z+/-140. Four INNER
feet are over the walking rails at Z+/-80. The raised rungs clear the gear
train. The L-shaped top tie and straight tie must both be fitted; two
plain straight ties would leave a rackable parallelogram.

OPTIONAL PROGRAMS
stepworks_pybricks.py targets compatible Pybricks firmware. It is not a
LEGO SPIKE-app project. Read controller_notes.txt before using it. It uses
manual reference, short jogs, one full forward turn per RIGHT press, a
three-cycle limit, active-hold stop requests, stall detection and timeout.
The targets accumulate 360,720,1080 degrees; it never reverses to zero to
silently return the pallet. Remove the pallet before referencing.

stepworks.bw and brickwright/ contain an optional example using the ID,
port and source syntax observed in your corrected models. The app pair
uses the canonical body-only 45601 hub alias; standard CAD uses the complete
45601c01 assembly. The .bw source has not been compiled or run in Brickwright.
It drives one revolution but does not program or prove passive cargo contact.

FILES
stepworks.mpd / stepworks.ldr : standard CAD with the complete hub
stepworks_build_guide.pdf    : 8-page illustrated module and operating guide
stepworks_motion.gif         :finite three-transfer exact-mesh preview
stepworks_preview.png        :exact-mesh assembled view
parts_list.csv               :part/color quantities and official descriptions
controller_notes.txt         :reference, direction, controls and fault behavior
stepworks_pybricks.py         :optional hardware controller source
stepworks.bw                  :optional unexecuted application example
brickwright/                 :matching app-oriented LDR and MPD wrapper
validation_summary.txt       :plain-language evidence and remaining limits
lessons_applied.txt           :specific lessons from your fixed models
review/                      :machine-readable geometry and validation evidence
source/                      :generators, checkers and rendering source
package_manifest.json        :SHA-256 hashes of the complete bundle contents

DIGITAL STATUS
This design has not been physically built, load tested or run in Brickwright.
Exact meshes, connection geometry, sampled interference checks and mocked
controller logic do not establish stiffness, friction, wear, torque capacity
or reliable physical transport. The GIF is accelerated and is not a measured
cycle time. It stops at the last pallet position and has no loop/reset extension.

Nominal face contacts need a physical endplay check: inner pivot bushes
against bearing faces, unused crank ends against idler-bush faces, and two
unused crank ends against main diagonal-brace faces. Surface contact without
sampled volume overlap is not a positive running clearance. Start with a slow
empty turn, then use the included light pallet. No extra load rating is given.

FORMAT AND LIBRARY
The standard files reference official LDraw part IDs and do not embed the
parts library. Use an installed LDraw library containing the SPIKE assemblies.
Missing part files are a viewer-library issue; the supplied audit resolved all
references against the official local part tree. Standard and app exports have
identical placements apart from the explicitly documented hub alias.

PRIMARY REFERENCES
Walking-beam transfer principle:
https://patents.google.com/patent/US20080164123A1/en
Official 16T gear geometry:
https://library.ldraw.org/parts/14043
Official multipart format:
https://www.ldraw.org/article/47.html
Pybricks 4.1 motor and hub APIs:
https://docs.pybricks.com/en/stable/pupdevices/motor.html
https://docs.pybricks.com/en/stable/hubs/primehub.html

LICENSE
Original design, guide and example source: CC BY 4.0.
LDraw geometry retains its original authorship and licenses.
Independent implementation of a known walking-beam principle.
LEGO and SPIKE are trademarks of the LEGO Group; this is not an official set.
