TEMPO LOOP
One motor. Two full-turn cranks. A changing pace within every turn.

Tempo Loop is a four-bar double-crank linkage for Brickwright. A red input
crank, driven by one SPIKE medium angular motor on port A, moves a blue
output crank through a yellow coupler. Both cranks make complete turns in
the same direction. Their average revolution ratio is 1:1, but their
instantaneous angular-speed ratio varies with the mechanism's position.

The assembly has 85 LDraw part instances, including one motor and one hub,
arranged in five assembly stages.

WHAT TO WATCH
With an ideal steady input, the output slows to about 0.559903 times the
input speed and accelerates to about 2.013878 times that speed. It keeps
rotating in the same direction throughout. There is no ideal dwell or
reversal. Count complete turns, then compare how the blue crank moves
within a turn: matching turn counts do not imply matching speed at every
instant.

The optional step program makes this visible without a speed measurement.
It advances the red crank by 45 degrees eight times, pausing after each
step. The blue crank's third advance is about 25.612 degrees; its eighth
is about 79.279 degrees. The eight advances still add to 360 degrees.

QUICK START
1. Open/import models/tempo-loop.ldr in Brickwright. For an LDraw CAD viewer,
   open models/tempo-loop.mpd; both describe the same assembly.
2. Use a standard LDraw parts library, as with the supplied collection.
3. Reset the model. The red crank points right. The blue crank starts at
   about 78.463041 degrees counterclockwise from right in the common view.
4. Load programs/tempo-loop.bw and Run. The input makes two slow turns
   counterclockwise, waits two seconds, then makes two clockwise turns.
5. Reset before a new run or after stopping partway through a run.

For the step experiment, reset and load programs/tempo-loop-steps.bw.
After eight forward steps and their one-second pauses, one complete
clockwise input turn returns the mechanism to its starting pose.

Both programs use motor stop action hold and the native speed setting 5.
That setting is not a stated RPM or degrees-per-second value. Only motor A
is powered; the coupler mechanically determines the blue crank's motion.
The quoted speed ratios describe ideal geometry. The finite-step program
compares angle increments; it does not claim constant speed during pauses.

PROGRAMS AND LESSONS
programs/tempo-loop.bw          Continuous forward/reverse demonstration
programs/tempo-loop-steps.bw    Eight equal input steps and a return turn
lessons/tempo-loop.en.json      English explanation and experiments
lessons/tempo-loop.de.json      German explanation and experiments
catalog-entry.json             One selectable example for the default program
validate_programs.py           Reproducible standard-library program audit
program-validation.json        Saved results for the supplied programs
preview.html                   Standalone interactive mechanism and speed curve
motion-diagram.svg/.png         Original schematic and curve at reset
parts.csv                      Bill of materials by part and color
geometry.json                  Complete placed-part and linkage coordinate record

The optional step program is loaded manually and does not add another
catalog example. The lessons link to crank-rocker.ldr and ratio-workbench.ldr
in the supplied collection.

TO ADD IT TO THE COLLECTION
Copy the new model, program and lesson files into the corresponding folders
of the supplied collection. Append catalog-entry.json as one object in the
catalog.json array, preserving existing entries and notices.

The integration folder contains two complete catalog snapshots:
  catalog.supplied-plus-tempo-loop.json: original 43 selections plus Tempo Loop.
  catalog.with-all-three-additions.json: also includes Stride Lab and Twinpoint,
    for 46 selections. Those two earlier additions must already be installed.
Append the single catalog-entry object when preserving other local changes.

ASSEMBLY GEOMETRY
All stated lengths are between joint centers, not the overall beam lengths:
  Fixed pivot spacing AD: 16 mm (40 LDU)
  Red input crank AB:     32 mm (80 LDU)
  Yellow coupler BC:      40 mm (100 LDU)
  Blue output crank DC:   40 mm (100 LDU)

The red 9L beam uses its center hole at A and an end hole at B. The yellow
7L beam uses an end hole at B and the penultimate hole at C: its unused
end extends one 8 mm hole interval beyond C. The blue 11L beam uses its
center hole at D and one end hole at C; its other half extends past D.
Keep the input, coupler and output in their separate depth layers. The
output pivot needs the supplied braced support and frictionless pivot,
not an unsupported axle or a rigidly locked pin.

The fixed link AD is the shortest link. In millimetres, the shortest plus
longest is 16 + 40 = 56, less than the other pair's 32 + 40 = 72. This
strict Grashof condition, with the shortest link fixed, permits the
double-crank motion. Unlike a crank-rocker, neither moving crank is limited
to swinging back and forth.

THE CONTINUOUS ASSEMBLY BRANCH
Use mathematical x to the right and y upward. LDraw model Y has the opposite
sign. A = (0, 0), D = (16, 0), and the input angle is alpha. Then
  B = (32 cos alpha, 32 sin alpha)
  q = |B - D|
  u = (B - D) / q
  C = D + (q/2) u + sqrt(1600 - q^2/4) (-u_y, u_x).

This chooses one continuous signed orientation of triangle DBC. It is the
upper intersection at reset, but C legitimately moves below the fixed
pivots later in the cycle. Choosing the higher world-y intersection at
every instant would switch assembly branches and is not this mechanism.

At reset, B = (32, 0) and C = (24, sqrt(1536)) mm, approximately
(24, 39.191836) mm. The output angle beta is about 78.463041 degrees.
The distance q ranges from 16 to 48 mm, strictly between the equal-circle
degeneracies at 0 and 80 mm. This preserves geometric closure; it does
not itself establish physical clearance between all parts.

ANGLE AND SPEED RELATIONSHIP
For continuous angles in radians, the following expression tracks complete
turns without resetting the angle at 360 degrees:
  beta = alpha + atan2(16 sin alpha, 32 - 16 cos alpha) + acos(q/80).

When alpha increases by 2 pi, beta also increases by 2 pi. For nonzero
input speed, the instantaneous output/input angular-speed ratio is
  d beta / d alpha
    = (1024 - 512 cos alpha)/q^2
      - (512 sin alpha)/(q sqrt(6400 - q^2)).

On the chosen branch its minimum is approximately 0.5599033104 at input
angle 118.5854 degrees; its maximum is approximately 2.0138780849 at
356.0872 degrees. Both are positive, so the output does not reverse.
The mean revolution ratio remains 1:1 despite that variation.

For the eight 45-degree forward steps, the ideal output advances are:
  1: 68.070952 degrees       5: 33.203883 degrees
  2: 33.466007 degrees       6: 40.535913 degrees
  3: 25.611598 degrees       7: 52.313995 degrees
  4: 27.518504 degrees       8: 79.279148 degrees
Their sum is 360 degrees, apart from displayed rounding.

Speed increase alone is not a power gain. These kinematic relationships
specify motion; they assume neither constant motor torque nor constant
motor power. Friction, inertia and loading require a separate force and
energy analysis.

VALIDATION STATUS
Run the reproducible program audit with Python 3:
  python validate_programs.py
It parses the actual scripts using their demonstrated native statement
forms, expands finite REPEAT blocks, tracks motor commands and waits, and
checks the ideal linkage and output angles. See program-validation.json
for sampled closure, branch, same-direction rotation and step results.

The supplied export contains no Brickwright runtime. The files have not
been executed in that application here and have not been physically built.
The analytical calculation assumes rigid planar links and the prescribed
motor angle. It does not establish actual timing, joint friction, flex,
motor tracking, collision-free motion or load capacity. Native-app and
physical checks remain separate from source and geometric checks.

Recreate the native LDR/MPD assembly and BOM with:
  python generate_model.py
Check native serialization, metadata and the specified joint centers with:
  python validate_model.py
These scripts also use only Python's standard library. The saved
connection-review.json records the separate 85-part connection graph and
continuous conservative clearance analysis. preview-validation.json records
the schematic's analytical and interaction checks. The external geometry
manifest contains 194 resolved files; their geometry is not bundled here.

The base diagonal, left landing and hub rear landing reach a common ground
plane. The output support is braced separately and stands entirely in front
of the moving beam layers, keeping the full-turn coupler path clear.

CREDITS AND LICENSE
New Tempo Loop arrangement, control programs, calculation code and
educational material: ChatGPT, 2026. Mounting arrangements are adapted from
the supplied BSD work of Brickwright contributors and CrispStrobe; retain
the included notices. Newly authored material is under BSD-3-Clause.

No external mechanism drawing, model, photograph, animation, control code
or explanatory text was copied into these programs, lessons or validator.
The equations and step results were derived for the dimensions above.
Standard LDraw part geometry is referenced by part number, not bundled,
and retains its own authorship and license terms.

See SOURCES.txt and THIRD-PARTY-NOTICES.md for provenance and license scope.
The BSD archive contains the independently drawn HTML/SVG/PNG schematic.
The actual LDraw CAD illustration is delivered separately with its own
attribution record and is not included in that source archive.
