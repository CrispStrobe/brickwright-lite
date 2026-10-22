STRIDE LAB
One motor. A nearly straight working stroke. A looping return.

76 LDraw part instances. One SPIKE medium angular motor on port A.
Five assembly stages, with unique part IDs and standard LDraw parts.

WHAT IT DOES
A motorized Hoeken-type four-bar linkage converts continuous crank rotation
into a repeated working and return path. A highlighted coupler tip follows a
nearly straight 64 mm stroke, then loops around an arch to return.

The crank rotates continuously while the rocker oscillates. The tip changes
speed throughout its path: nearly straight motion is not constant-speed motion.

QUICK START
1. Open/import models/stride-lab.ldr in Brickwright. For an LDraw CAD viewer,
   open models/stride-lab.mpd instead; both files describe the same assembly.
2. Use a standard LDraw parts library, as with the supplied Brickwright models.
3. Reset the model and load programs/stride-lab.bw.
4. Run. Motor A makes two slow forward turns, holds for two seconds, then
   makes two reverse turns and holds again. Reset before repeating.
5. Follow the highlighted tip. Compare its nearly straight working stroke
   with the curved return, and observe the changing spacing between its
   positions at equal time intervals.

The program uses the SPIKE motor speed setting 5. That setting is not a stated
RPM or degrees-per-second value. Motor A is the only powered joint.

INCLUDED MODEL FILES
models/stride-lab.ldr        Brickwright model with part IDs and motor port A
models/stride-lab.mpd        Single-model LDraw MPD wrapper of the same assembly
programs/stride-lab.bw       Slow forward/reverse demonstration
lessons/stride-lab.en.json   English explanation and experiments
lessons/stride-lab.de.json   German explanation and experiments
catalog-entry.json          Entry to add to the supplied catalog.json array
integration/catalog.merged.json  Your supplied catalog plus Stride Lab
preview.html                Offline interactive ideal-kinematics preview
stride-lab-render.png        Static render of the actual assembled CAD
parts.csv                   Quantities by part and LDraw color
geometry.json               Exact part placements and linkage dimensions
generate_model.py           Reproducible model generator (Python 3)
validation.json             Recorded static and kinematic validation
SOURCES.txt                 Source links, provenance and calculation notes

TO ADD IT TO THE SUPPLIED COLLECTION
Copy the new model, program and lesson files into the corresponding folders
of your original collection. Append catalog-entry.json as one object in its
catalog.json array. Alternatively, integration/catalog.merged.json is the
complete supplied catalog with this one entry appended: use it as catalog.json
if your collection is still the supplied 2026-10-21 version. This produces
36 distinct assemblies and 44 selectable examples. It retains all original
catalog entries. For a newer collection, append only the new entry.

Open preview.html directly in a browser to explore the ideal motion offline.
Play one cycle or scrub the crank angle. This preview illustrates the exact
link lengths; it does not run the Brickwright physics engine.

ASSEMBLY STAGES
1. Pinned black chassis rails and gray crossmembers form the base.
2. Four black 13L posts support the single motor on both sides.
3. A braced, double-sided bearing supports fixed pivot D. D is four hole
   intervals from the motor axis A. Do not leave this pivot floating.
4. Attach the red crank, yellow 11L coupler and blue 7L rocker in separate
   layers. Use the gray frictionless pins at B, C and D. On the blue rocker,
   D is the end hole and C is the penultimate hole: their spacing is five
   intervals, even though the beam has seven holes. The red marker covers
   the last three coupler holes; its outermost hole identifies P.
5. Attach the SPIKE hub to the pinned rear cradle and connect motor port A.

The LDR/MPD includes standard STEP markers for these five stages. These are
assembly groups, not a physically tested brick-by-brick instruction booklet.
Use a compatible hub battery and the motor's integral cable in a real build;
their geometry is omitted in the same style as the supplied models.

The existing crank-rocker.ldr and tidal-trio.ldr models are related examples;
the lesson links resolve when Stride Lab is added to the original collection.

THE GEOMETRY
All dimensions below are pivot-to-pivot, in millimetres:
  Fixed pivots: A = (0, 0), D = (32, 0)
  Crank: AB = 16
  Coupler: BC = 40
  Rocker: CD = 40
  Coupler extension beyond C: CP = 40, with B, C and P collinear
  Tip: P = 2C - B

At the reference crank angle zero, B = (16, 0), C = (24, sqrt(1536)),
and P = (32, 2 sqrt(1536)). Use the upper assembly branch continuously.

Over analytical crank angles 90 to 270 degrees, the tip moves from
(64, 64) through (32, 64) to (0, 64), approximately following y = 64.
The maximum ideal vertical deviation in that interval is about 0.1561 mm.
The other half of the crank revolution gives the curved return.

This is an approximation to a straight line, not an exact straight-line
mechanism. The small deviation is a geometric calculation for ideal rigid,
planar links. Real LEGO joint clearance, flex and part tolerances will affect
an actual build. The dimensions do not establish a payload rating.

VALIDATION STATUS
The model follows the file conventions in the supplied Brickwright export.
The ideal linkage dimensions and near-straight trajectory can be checked
numerically. This addition has not yet been run in the Brickwright runtime:
the supplied archive contains models, programs and lessons, but no runtime
or application source. A successful static check does not substitute for
loading and running the assembly in the app or building it physically.

CREDITS AND LICENSE
New Stride Lab mechanism design and educational material: ChatGPT, 2026.
Mounting arrangements adapted from the supplied work of Brickwright
contributors and CrispStrobe. Distributed under BSD-3-Clause; preserve the
included notices. Referenced LDraw part geometry retains its own authors
and licenses and is not included in this package.
