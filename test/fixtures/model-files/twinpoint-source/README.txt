TWINPOINT
Two fixed motors. One closed loop. A circle and a straight line.

Twinpoint is a five-bar parallel positioning mechanism for Brickwright.
Two SPIKE medium angular motors, on ports A and B, turn equal 32 mm cranks.
Two passive links, each 64 mm between joints, meet at a common tip. The
fixed motor axes are 80 mm apart. Both motors stay on the base.

117 LDraw part instances include the two motors and one hub. Five assembly
groups separate the base, left motor, right motor, moving links and hub.
The left crank is red, the right crank blue, the left distal link yellow
and the right distal link orange.

WHAT IT DOES
The default program demonstrates two different coordinated movements:
  - Equal crank angles move the tip around a circle of radius 32 mm.
  - Crank angles that sum to 180 degrees move the tip along a vertical
    line. The bounded sweep in the program travels about 27.801 mm.

These are results for ideal rigid links with exactly coordinated angles.
The line is geometrically straight, but the tip speed along it varies.
Motor tracking error, pin clearance and flex can change the actual path.
The program coordinates commands; it does not measure the tip position or
provide feedback that corrects an error in that position.

QUICK START
1. Open/import models/twinpoint.ldr in Brickwright. For an LDraw CAD viewer,
   open models/twinpoint.mpd; both describe the same assembly.
2. Use a standard LDraw parts library, as with the supplied collection.
3. Reset the model. Both cranks must point right in the common front view.
4. Load programs/twinpoint.bw and Run. It traces one circle, enters the
   vertical-line posture, makes two down-and-up strokes, and returns to
   the same physical starting pose. Pauses separate the phases.
5. Reset before a new run or after stopping partway through a run.

The two motor bodies face opposite ways. With mathematical angles measured
counterclockwise from the same right-pointing reference, port A increases
its world angle with a counterclockwise command; port B increases its world
angle with a clockwise command. This mounting detail is why opposite named
motor directions produce the circle, while matching named directions
produce the line stroke.

The scripts use the native motor speed setting 5. This is not a claimed
RPM or degrees-per-second value. A broadcast-and-wait starts one receiver
for each motor and waits for both before advancing to the next phase.
Finite relative turns avoid ambiguous absolute encoder positions.

PROGRAMS AND LESSONS
programs/twinpoint.bw          Default circle-and-line demonstration
programs/twinpoint-circle.bw   Two circle turns forward, then two in reverse
programs/twinpoint-line.bw     Bounded line experiment with setup and return
lessons/twinpoint.en.json      English explanation and experiments
lessons/twinpoint.de.json      German explanation and experiments
catalog-entry.json            One selectable example for the default program
preview.html                  Standalone interactive circle/line schematic
motion-diagram.svg            Original editable schematic at reset
parts.csv                     Bill of materials by part and color
geometry.json                 Full instance and linkage coordinate record

The two optional programs are loaded manually; they do not add duplicate
catalog examples. Reset before loading either program. The lesson links to
positioning-arm.ldr and parallel-lift.ldr in the supplied collection.

TO ADD IT TO THE COLLECTION
Copy the new model, program and lesson files into the corresponding folders
of the supplied collection. Append catalog-entry.json as one object in the
catalog.json array. Keep the existing examples and notices.

The integration folder also contains two ready-merged catalog snapshots:
  catalog.supplied-plus-twinpoint.json: the supplied 43 selections plus this one.
  catalog.supplied-plus-stride-plus-twinpoint.json: also includes the preceding
    Stride Lab addition. Its model/program/lesson files must already be installed.
Use the snapshot that matches the installed additions, or append the single
catalog-entry.json object to preserve subsequent local catalog changes.

ASSEMBLY GROUPS
1. Pin the base rails, crossmembers and diagonal braces together.
2. Mount the left motor A between its four supporting posts. Fit its two
   rotor attachment pins.
3. Mount motor B on the right, facing the opposite way, with its supporting
   posts and rotor pins. The motor axes are 80 mm apart in the front view.
4. Fit the red and blue cranks, yellow and orange distal links, and the
   three frictionless hinge pins. Keep the links in their distinct depth
   layers, with both cranks pointing right at reset.
5. Attach the hub on its rear mounting rails and connect ports A and B.
   Fit the rear landing beam underneath so the hub cradle reaches the
   same ground plane as the diagonal braces.

The LDR/MPD groups are separated by standard STEP markers. These are assembly
stages, not a physically tested brick-by-brick instruction booklet. A real
build uses a compatible hub battery and the motors' integral cables; their
geometry is omitted in the same style as the supplied collection.

THE GEOMETRY
All dimensions below are pivot-to-pivot, in millimetres. Use a front-view
coordinate system with x to the right and y upward. LDraw's model Y axis
has the opposite sign. Motor port B is distinct from geometric point B.

  Fixed left pivot:  A = (-40, 0)
  Fixed right pivot: D = ( 40, 0)
  Left elbow:        B = A + 32 (cos alpha, sin alpha)
  Right elbow:       C = D + 32 (cos beta, sin beta)
  Link constraints:  |P - B| = |P - C| = 64

Choose the continuous upper intersection for tip P. At reset, alpha = beta
= 0, B = (-8, 0), C = (72, 0) and P = (32, sqrt(2496)), approximately
(32, 49.959984) mm. The link dimensions include five links when the fixed
base segment AD is counted: base, two driven cranks and two passive links.

CIRCLE
For alpha = beta = theta, both elbows translate together and their distance
stays 80 mm. The upper tip position is
  P = (32 cos theta, 32 sin theta + sqrt(2496)).
The circle center is (0, 49.959984) mm and its diameter is 64 mm.
Port A runs counterclockwise while port B runs clockwise for increasing
theta. Reversing both retraces the same circle.

VERTICAL LINE
For beta = 180 degrees - alpha, the elbows are mirror images across x = 0.
Their upper intersection therefore has
  xP = 0
  yP = 32 sin alpha + sqrt(4096 - (40 - 32 cos alpha)^2).

The supplied sweep restricts alpha to 75 through 120 degrees. Its upper
endpoint is (0, 86.497231) mm at (alpha, beta) = (75, 105); its lower
endpoint is (0, 58.696680) mm at (120, 60). Travel is about 27.800551 mm.
Both motors run counterclockwise for the downward stroke and clockwise
for the upward stroke. Equal motor speeds do not give constant tip speed.

The setup and return are deliberately bounded. From reset, both world
angles first move together from 0 to 90 degrees. Then alpha falls to 75
while beta rises to 105. After the paired sweeps, both return through
(90, 90) to (0, 0). The default script first makes one complete circle;
its final encoder readings can differ from reset by complete turns while
the mechanical orientation is the same.

REACHABILITY AND COORDINATION
The distance q between the elbows must be less than 128 mm for two distinct
tip intersections. At 128 mm the distal links become straight and the two
branches meet. The chosen base and crank lengths also keep q at least
16 mm, so coincident elbows cannot occur in this model.

The supplied circle uses q = 80 mm. The line sweep uses q = approximately 63.436 to 112 mm,
leaving a 16 mm geometric margin to the straight-distal-link posture.
The 75-to-120-degree range also keeps the vertical stroke monotonic.
Some arbitrary angle pairs are unreachable: alpha = 180 degrees and
beta = 0 degrees would require q = 144 mm. Do not extend the programmed
angle ranges or turn one motor through a whole revolution while holding
the other. The closed loop requires both motor commands to agree with
an achievable configuration.

A full circle passes postures in which a crank and its own distal link
align. The prescribed paired motion still has a defined tip path, but
these individual-leg alignments are singularities for general positioning.
The circular demonstration is not a claim of uniformly well-conditioned
operation. The elbow-separation margin above concerns the distal-link
closure constraint; it does not rule out other singularities.

VALIDATION STATUS
This addition follows the model, program and lesson conventions in the
supplied Brickwright export. Its circle and line are derived from the
stated dimensions. The export does not include the Brickwright runtime,
so these files have not been executed in that application here. They have
also not been physically built. Static checks and ideal geometry do not
establish collision-free operation, real servo accuracy or payload capacity.

Reproduce the native-file and ideal-program checks with Python 3:
  python validate_model.py
  python validate_programs.py
Recreate the native assembly and BOM with:
  python generate_model.py
These scripts use only Python's standard library. The supplied validation.json,
program-validation.json, connection-review.json and preview-validation.json
record the checks actually performed. The independent connection review uses
modeled socket locations and conservative envelopes from official LDraw geometry;
it does not replace a runtime or physical test. The external geometry manifest
records 182 referenced geometry files, all with CC BY 4.0 in their license headers.

CREDITS AND LICENSE
New Twinpoint mechanism arrangement, control programs and explanatory text:
ChatGPT, 2026. Mounting arrangements are adapted from the supplied BSD work
of Brickwright contributors and CrispStrobe; preserve the included notices.
The newly authored material is distributed under BSD-3-Clause.

No external mechanism drawing, model, photograph, animation, program or
explanatory text was copied into these programs or lessons. The geometric
relationships above are derived directly for this model. Standard LDraw
part geometry is referenced by part number, is not bundled here, and keeps
its own authorship and license terms.

See SOURCES.txt and THIRD-PARTY-NOTICES.md for the exact provenance and license
scope. The BSD source archive contains no .dat part definitions, external
textures, fonts, libraries or images. Its HTML/SVG preview is independently
drawn and uses no external assets. A separate CAD render, when provided,
has its own LDraw attribution and is not included in the BSD source archive.
