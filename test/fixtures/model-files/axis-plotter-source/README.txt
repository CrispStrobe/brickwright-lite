AXIS PLOTTER
Three motors. Two drawing axes. A separate pen lift.

Axis Plotter is a native Brickwright Technic assembly and an offline SVG-to-
program companion. Motors A and B drive two perpendicular rack stages. Motor C
raises and lowers the marker carriage. The generated program moves those
motors; Robot Lab's pen layer records the marker's resulting physical pose.

The usable drawing area is 40 x 40 mm. The default artwork fits inside a
36 x 36 mm box, leaving a 2 mm margin and preserving its proportions. A
calibration square and diagonal, a curves drawing, and an original sprite
costume are included.

ASSEMBLY RECORD
The native assembly contains 256 LDraw part instances, including three
SPIKE medium angular motors and one SPIKE Prime hub. It uses three native
sliders, three motor hinges and three rack-and-pinion couplings. The removable
simulator marker cassette accounts for three of those parts.

models/axis-plotter.mpd contains the same assembly with 11 stages: base;
A frame, carriage and platform; B frame, carriage and platform; C frame and
carriage; pen channel; removable marker cassette. Follow assembly/BUILD-STEPS.md
for guide threading, connector order and replacement of the simulation marker
with a real pen. Use the .ldr file for the native Robot Lab example.

START WITH THE SUPPLIED DRAWING
1. Open models/axis-plotter.ldr in Robot Lab and use the plain mat. Keep the
   model at its supplied orientation and use the app's standard LDraw library.
2. Reset the model. Reset establishes the supplied encoder zeros, raised
   marker position and empty drawing surface.
3. In Code, use the three-dot menu -> Open to open programs/calibration.bw,
   then click To blocks.
4. Click the green flag. The program draws a square and a separate diagonal,
   raises the marker between them, and finishes with the marker raised.
5. Reset before the next example or after stopping a drawing partway through.

Also try programs/original-curves.bw and programs/original-pixel-costume.bw.
These use the same model and motor calibration. They are loaded manually;
the catalog adds one default selection rather than one entry per artwork.

DRAW A COSTUME FROM THE EXISTING EDITOR
1. In Brickwright's Costumes editor, select your artwork. If you have pending
   pixel edits, click the pixel editor's Save first. Then use Save file in
   Costumes to save the stored costume as SVG. This workflow also accepts a
   suitable SVG saved by a vector graphics editor.
2. Open plotter.html in a browser, then open the saved SVG in that companion.
   The page works offline and reads the file locally.
3. Choose a drawing size and inspect the planned pen-down lines and pen-up
   travel. The default box is 36 mm and the default drawing feed is 3 mm/s.
   The preview uses the same plan that will generate the motor program.
4. Download the .bw program. The companion can also download the supplied
   .ldr model.
5. Load and Reset the model in Robot Lab. In Code, use the three-dot menu ->
   Open to open the .bw program, click To blocks, then click the green flag.

The companion exports native Robot Lab blocks. It is a separate local tool
used with the editor's existing Save file command. It does not add a Plot
button to the app or upload a program to physical LEGO hardware. The Code
tab's JavaScript or Python console does not control this Lab program; convert
the native words to blocks and use the green flag.

WHAT THE PREVIEW AND THE ROBOT SHOW
The companion shows the intended geometry. The actual Robot Lab trace comes
from the marked part's collider after the real motor controllers, sliders,
rack constraints and Jolt physics have moved it. The program does not insert
the preview path into the simulator's ink layer.

Each SVG subpath becomes a separate pen-down stroke. Between strokes, C lifts
the marker, A and B travel to the next start, and C lowers it again. Motor
completion is checked through encoder feedback. Short waits allow the lift
to settle; they do not substitute for measuring whether a motor move ended.

The native marker is the removable Technic 12L axle named z_pen_proxy, marked
with !BW PEN. It is a geometric stand-in for a pen. Robot Lab records its
lowest collider point near the fixed floor and breaks the stroke when it is
lifted. A physical build needs an actual pen in the cartridge and a separate
height/contact adjustment. The LEGO axle itself does not put ink on paper.

For a physical pen, remove the three-part simulation cassette: the 3708 axle,
its 32039 holder and its 43093 axle pin. The remaining structure has 253 LEGO
parts and needs a felt-tip pen and two small rubber bands. The channel is
intended for a 7-8 mm pen barrel, with clamp stations 64 mm apart. The supplied
geometry requires a reach of 118.4 mm from the upper clamp band to the tip.
These dimensions describe a construction provision, not a tested pen fit.
Trial-fit the pen and adjust its height/contact independently; a physical
build has not been assembled or tested here.

WHAT THE SVG IMPORTER DOES
Paths support M, L, H, V, C, S, Q, T, A and Z, in absolute or relative forms.
Lines, polylines, polygons, circles, ellipses, rectangles and rounded
rectangles are supported too. Nested group transforms and the root viewBox
are applied before fitting the artwork to the drawing area.

Curves become short straight moves. The companion tightens its curve
flattening tolerance when the fitted drawing would magnify the error. The
motion planner further subdivides drawing moves to at most 0.75 mm by
default. The two axes use speeds proportional to their required travel.

A single pen follows paths and outlines. Fills become boundary outlines;
source colors and stroke widths are not reproduced. Pixel costumes exported
as rectangle runs therefore become multiple closed outlines. The original
pixel-costume example demonstrates this behavior.

Text must be converted to paths before import. Raster images, clipping,
masks, filters, use references, external resources, CSS stylesheets, nested
SVG viewports and dashed strokes are rejected with an explanation. The page
does not silently treat unsupported artwork as a successful plot. Its
default input limit is 2 MiB; detailed artwork can also reach point or
motion-phase limits and require simplification. See SVG-IMPORT.md for the
complete import contract and editor-export provenance.

CALIBRATION AND KINEMATICS
The coordinates used by the artwork are paper X to the right and paper Y
downward. They need not match the 3D viewer's screen directions.

Motor A: paper X, positive 14.32394487827058 degrees per millimetre.
Motor B: paper Y, positive 14.32394487827058 degrees per millimetre.
Motor C: lift, raised at 0 degrees; drawing position -73.05211887917996 degrees.

These values are stored in calibration.json. The nominal raised tip gap is
5.6 mm. The C move lowers the tip by 5.1 mm, placing its nominal lowest
point 0.5 mm above the simulator's floor, inside the native drawing-contact
threshold. The actual measured gap is recorded by the runtime validation.
This floor-proximity rule belongs to the simulator and is not a physical
paper-contact calibration.

An 8-tooth pinion has a 4 mm pitch radius in the supplied native part model.
For a shaft angle theta in radians, ideal rack travel is s = 4 theta mm.
Consequently:
  One full turn:  8 pi = 25.132741229 mm.
  One millimetre: 180 / (4 pi) = 14.323944878 degrees.
  A 40 mm move:   572.957795131 degrees.

Targets remain unwrapped encoder angles, so a move can exceed 360 degrees.
For each axis, the generated block asks for target minus its current encoder
reading. It does not accumulate a succession of assumed relative moves.
The native angle reporter resolves 0.1 degree, about 0.007 mm on this rack;
that is a reporting increment, not a claim of physical plotting accuracy.

For a straight displacement (dx, dy), length L and drawing feed v, the ideal
component speeds are v*dx/L and v*dy/L. Equal speeds only describe a 45-degree
diagonal. Separate native motor controllers accelerate and settle, so the
planner uses short coordinated segments and waits for both axes at each
segment end. Actual path quality is measured from the resulting trace.

Every native move finishes with hold. A remaining encoder error greater than
2 degrees, approximately 0.140 mm for one drawing axis, makes the generated
program hold all motors and execute Scratch stop-all. That is an encoder
postcondition: the current native blocks do not expose the controller's
completion-status string. The direct API verifier additionally checks that
every command reports completed, and rejects stalled or interrupted moves.

Reset establishes this model's calibration; the program does not search for
limit switches or physically home an unknown carriage position. Changing the
mechanics, marker length, gearing or initial pose requires a new calibration
and another native validation run.

VALIDATION RESULTS
All three drawings passed on the final 256-part native model. Each exported
.bw program completed all of its motor commands, produced the expected
number of separate strokes and finished with the marker raised. The model
reported no warnings or errors, and no endpoint guard stopped a run.

Drawing          Strokes  Commands  Simulated s  Path max mm  Ends max mm  Final gap mm
Calibration       2 / 2      281       84.97       0.034947     0.044304       5.589
Original curves   3 / 3      591      118.53       0.036167     0.481464       5.598
Pixel costume    24 / 24     727      362.37       0.051456     0.466449       5.714

Strokes gives expected / measured counts. Path max is the largest distance
from a sampled ink point to its corresponding intended polyline. Ends max
is the largest start or end gap of any stroke. Final gap is the marker tip's
measured height above the native floor. Simulated time is the deterministic
test clock, not a prediction of real hardware or browser execution time.

The largest measured command-end encoder error was 0.470788 degree. The
2-degree native guard remained unchanged. Every command returned completed.
The release checks require the correct stroke count, path and endpoint errors
within 1 mm, at least 90 percent of each planned stroke's length, and a raised
marker at the end. All three cases meet those criteria. Their reports contain
the full per-stroke measurements and motor-command records.

All three reports identify this exact model SHA-256:
  2a67c5cddeed7b7480635cf4f593ff4ceea215a356e99a2064d576b8eb6dc934
The recorded native validation used the default 36 mm drawing box, 2 mm
margin and 3 mm/s drawing feed. Different artwork, feed settings or mechanical
changes require their own checks.

The validation pipeline is the exported .bw program through the pinned app
compiler, its generated .sb3, the real Scratch VM green-flag scheduler, the
actual Robot Lab extension, the native motor API, Jolt and the native pen
layer. The same source/calibration generates the companion's downloadable
program. validation/*-runtime.json stores the measured trace and command
records; validation/*-plan.json stores the corresponding intended path.
validation/measured-traces.svg and validation/measured-traces.png show the
planned lines and measured native ink for all three release drawings.

The maximum sampled distance measures how far a recorded ink point is from
the intended polyline. The start/end gap is a separate measure and can be
larger: the native pen layer records another point only after about 0.5 mm
of travel, and lifting does not add a final short tail. Those two measurements
describe the saved native trace, not a single claim of overall accuracy.

The headless tests use a deterministic shared simulated clock and the real
VM scheduler. They exercise the native motor/physics/pen route; they do not
constitute a browser layout test or a physical construction test. Friction,
backlash, structural flex, paper drag, pen mounting and actual hub deployment
need physical evaluation. No physical build is claimed.

FILES
plotter.html                         Offline SVG companion
models/axis-plotter.ldr               Native assembly
models/axis-plotter.mpd               Same assembly in 11 build stages
assembly/BUILD-STEPS.md              Construction order and pen replacement
programs/calibration.bw              Square and separate diagonal
programs/original-curves.bw          Original curves example
programs/original-pixel-costume.bw   Actual editor-export example
examples/calibration.svg             Original calibration artwork
examples/original-curves.svg         Original curve artwork
fixtures/original-pixel-costume.svg  Original pixels through the app exporter
calibration.json                     Motor signs, scale, lift and workspace
parts.csv, geometry.json             BOM and complete placed-part record
lessons/axis-plotter.en.json          English lesson
lessons/axis-plotter.de.json          German lesson
catalog-entry.json                   One default collection entry
integration/catalog.with-all-four-additions.json
                                    Collection snapshot with all four additions
src/svg.mjs                          Original bounded SVG importer
src/motion.mjs                       Shared path planner and API runner
src/program.mjs                      Native program exporter
runtime/rig.mjs                      Real physics and pen test rig
runtime/program-vm.mjs               Real compiler/VM/extension execution
runtime/package.json, package-lock.json
                                    Exact external verification dependencies
verify-runtime.mjs                   Regenerates and measures one SVG example
validation/*-runtime.json            Final native execution and trace records
validation/*-plan.json               Corresponding intended paths
validation/measured-traces.svg, .png  Three measured traces beside their plans
tools/render_validation.py           Recreates the measured trace figure
tools/check_release.py               Checks release hashes and consistency
build-companion.mjs                  Builds the offline HTML
SVG-IMPORT.md                        Detailed import/export behavior

ADD TO THE EXISTING COLLECTION
Copy the model, programs and lessons into the corresponding collection
folders and append catalog-entry.json as one object to catalog.json.
The integration snapshot has 47 selectable entries: the supplied 43 plus
Stride Lab, Twinpoint, Tempo Loop and Axis Plotter. It assumes the three
earlier additions are already installed. Appending the single entry preserves
other local catalog changes. Keep the earlier authorship and license notices.

REPRODUCE THE NATIVE CHECKS
Using plotter.html needs no installation. The following setup is only for
repeating the native development tests. It keeps the app source unchanged
and places prepared runtime dependencies in a separate sibling directory.

The source revision is:
  https://github.com/CrispStrobe/brickwright-lite
  df32b7ff33595406ce7356d249ec61baec1fecf6
The app's pinned sb3-creator revision is:
  7d3f8be7c13091a635d919c1af5c456230eed8fd
The checks here used Node 24.19.0; the app requires Node 22 or newer.

From a directory containing the extracted axis-plotter folder, create a
fresh source checkout and the external dependency registry:

  AXIS_WORK="$PWD"
  git clone https://github.com/CrispStrobe/brickwright-lite.git brickwright-lite
  git -C brickwright-lite checkout df32b7ff33595406ce7356d249ec61baec1fecf6
  mkdir -p plotter-runtime
  cp axis-plotter/runtime/package.json axis-plotter/runtime/package-lock.json plotter-runtime/
  npm ci --prefix plotter-runtime --ignore-scripts
  mkdir -p plotter-runtime/packages
  ln -s ../brickwright-lite/overlay plotter-runtime/overlay
  ln -s .. plotter-runtime/packages/scratch-gui
  cd plotter-runtime
  NODE_PATH="$PWD/node_modules" node "$AXIS_WORK/brickwright-lite/scripts/apply-vm-overlay.mjs" --vm-only
  cd "$AXIS_WORK"
  export BW_INTEGRATED_ROOT="$AXIS_WORK/plotter-runtime"
  export BRICKWRIGHT_SOURCE="$AXIS_WORK/brickwright-lite"

The unchanged app overlay script prepares its normal VM changes in the
external installed scratch-vm package. The source checkout itself is not
edited. The compiler, VM, Jolt, Three.js and other runtime dependencies retain
their separate licenses and are not part of this BSD source package. The two
included package files record the tested versions and transitive resolution;
they do not bundle those dependencies or change their license terms.

Run the focused tests and final drawing checks:

  node --import "$BRICKWRIGHT_SOURCE/scripts/lib/register-gui-scope.mjs" axis-plotter/test/program.test.mjs
  node --import "$BRICKWRIGHT_SOURCE/scripts/lib/register-gui-scope.mjs" axis-plotter/test/program-vm.test.mjs
  node --import "$BRICKWRIGHT_SOURCE/scripts/lib/register-gui-scope.mjs" axis-plotter/test/motion.test.mjs
  node --import "$BRICKWRIGHT_SOURCE/scripts/lib/register-gui-scope.mjs" axis-plotter/test/svg.test.mjs
  node --import "$BRICKWRIGHT_SOURCE/scripts/lib/register-gui-scope.mjs" axis-plotter/test/companion.test.mjs
  node --import "$BRICKWRIGHT_SOURCE/scripts/lib/register-gui-scope.mjs" axis-plotter/verify-runtime.mjs axis-plotter/examples/calibration.svg calibration
  node --import "$BRICKWRIGHT_SOURCE/scripts/lib/register-gui-scope.mjs" axis-plotter/verify-runtime.mjs axis-plotter/examples/original-curves.svg original-curves
  node --import "$BRICKWRIGHT_SOURCE/scripts/lib/register-gui-scope.mjs" axis-plotter/verify-runtime.mjs axis-plotter/fixtures/original-pixel-costume.svg original-pixel-costume

Recreate the assembly with python3 axis-plotter/generate_model.py. Rebuild the
offline companion with node axis-plotter/build-companion.mjs. The companion
builder requires a calibration marked native-verified after the model tests;
its separate test-only mode is for UI fixtures, not a validated model release.

LICENSE AND PROVENANCE
The new Axis Plotter arrangement, importer, planner, exporter, companion,
tests, lessons and original example artwork are BSD-3-Clause under LICENSE.
Retain THIRD-PARTY-NOTICES.md and the notices for any reused BSD mounting
arrangements. The original pixel fixture was made from newly authored pixels
and passed through the app's actual SVG export helper; its provenance JSON
records that process. No existing costume artwork was taken from the app.

The generated program header licenses the control template and identifies
its author. Imported artwork keeps its own authorship and license; using this
tool does not grant permission to relicense that artwork. The bundled example
SVGs and their generated programs are original BSD-3-Clause material.

Standard LDraw parts are referenced by number. Individual LDraw geometry,
app compiler/VM sources, runtime packages, external artwork, mechanism
drawings and noncommercial material are not bundled into the BSD model
archive. Runtime dependencies used to test the model remain external and
retain their existing licenses. See SOURCES.txt for the source record.
