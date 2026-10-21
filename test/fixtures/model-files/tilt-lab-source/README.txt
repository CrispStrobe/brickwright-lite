TILT LAB
Two-axis powered marble maze
===========================

One LEGO SPIKE Prime hub and two medium angular motors tilt a compact maze
tray about perpendicular axes. The mechanism is primarily Technic; standard
LEGO plates, bricks and tiles make the smooth maze surface. A loose LEGO
soccer ball is the payload.

The final model lists 139 parts/assemblies, counting the hub and each motor
as one assembly. Its level-pose bounding size is approximately 184 mm wide,
219.8 mm deep and 147.2 mm high, excluding cables.

This is a different mechanism from Orbital Loom in the supplied collection.
Orbital Loom rotates paper and a pen to draw a curve. TILT LAB changes the
slope beneath an independent ball. Its interesting behavior is the interaction
between two nested rotations, gravity, walls and the ball's momentum.

WHAT MOVES
----------
Port A drives the outer yellow gimbal about its X axis. Motor B is fastened to
that moving gimbal and drives the maze tray about the gimbal's local Z axis.
The hub remains on the fixed base. With LDraw's Y pointing down, the tray's
geometric orientation is Rx(a) Rz(b), not two unrelated world-axis rotations.
The intended operating envelope is -12 to +12 degrees on each axis.

The supplied program uses only 10-degree single-axis moves and one combined
8-degree pose. It returns both axes to the level reference position.

FILES
-----
tilt_lab_build_guide.pdf
  Six-page illustrated assembly overview with the important connection
  details, motor ports, level datum and bounded control sequence.

tilt-lab.mpd
  Main standard LDraw model, organized into construction modules/steps.
  It references the complete official 45601c01.dat hub assembly.

tilt-lab.ldr
  Equivalent flat standard LDraw model.

parts_list.csv
  Final bill of materials by LDraw part and color. It includes the complete
  hub as an assembly and the loose ball. Use this file for the final counts.

brickwright/tilt-lab.mpd and brickwright/tilt-lab.ldr
  App-facing variants using the supplied collection's canonical 45601.dat
  hub identifier. This represents the hub body rather than the complete
  standard LDraw hub-with-battery assembly. Use the main files for a standard
  LDraw view of the complete hub. Both variants retain stable part IDs,
  explicit motor ports and the free-ball declaration.

brickwright/tilt-lab.bw
  A gentle bounded tilt demonstration in the native block-program text syntax
  used by the supplied Brickwright examples. It is not a maze-solving program.

PROGRAM_NOTES.txt
  Program sequence, reference-position requirements and execution status.

lessons_applied.txt
  Specific construction lessons taken from the supplied fixed models, with
  the source notices identified.

VALIDATION.txt and review/
  Readable validation summary, machine-readable check results, the complete
  inventory of the 38 reviewed assemblies, and assembly-detail views.

tilt_lab_preview.png, tilt_lab_rear.png and tilt_lab_motion.gif
  Previews rendered from the actual LDraw part geometry. The motion preview
  tilts each axis through +/-8 degrees and omits the free ball.

source/
  Geometry builders, independent checks and rendering source, with rebuild
  instructions. The external official LDraw part library is not bundled.

LDRAW_ATTRIBUTION.txt
  Referenced part authors and licenses, plus the dependency attribution file.

Any preview motion is an illustration of the machine's prescribed joint
motion. The animation leaves out the ball so it does not falsely attach a
free payload to the tray. The level CAD model includes the ball at its start.

ASSEMBLY ORDER
--------------
1. Join the two base frames and their rails.
2. Build the port-A motor stand and the opposite bearing stand. The opposite
   tower's L brace fixes its rectangular frame against shearing.
3. Fit the outer gimbal, its rotor-pin bridge and the opposite axle support.
4. Attach motor B and its braced support rails to the outer gimbal.
5. Fit the inner drive axle, keyed bridge, rear support axle and retainers.
6. Add the Technic anchor bricks and eight half-stud jumper adapters beneath
   the tray. Their offsets reconcile the Technic bore grid with the plate grid.
7. Join the two 4 x 12 plates, then the lower walls, smooth floor tiles and
   upper walls. End walls and several floor pieces bridge the plate seam;
   the two wall courses lap the perimeter corners.
8. Pin the hub and its rails to the fixed base; connect the motors to A and B.
9. Leave the loose ball out for the initial clearance check. Place it on the
   green pad only after the empty mechanism returns to its level datum.

Use the model's module steps and exact part orientations while assembling.
Motor cables are electrical connections, not geometric parts in these CAD
files. Leave enough cable freedom for motor B's bounded movement with the
outer gimbal; keep the cables clear of the moving tray and both pivots.

CONSTRUCTION DETAILS THAT MATTER
-------------------------------
- The red 7229.dat part is a Technic 3L beam with a CENTER AXLE HOLE. This
  center hole is keyed to the inner drive axle. An ordinary 32523.dat 3L
  beam has a round center hole and is not an equivalent substitute here.
- The inner motor's 5L drive axle engages 19.5 LDU of its 20-LDU-deep front
  socket. The axle length was chosen from the actual socket face and tip
  positions, not from the appearance of a connection in the render.
- Shared three-layer joints use one 3L pin. Do not add a second 2L pin into
  an already occupied coaxial stack.
- Keep the specified half-bush positions and small end clearances. A full
  bush is not an interchangeable replacement where only half-bush space
  is available.
- The hub is pinned to its rails. Both motor housings have physical mounts;
  the output shafts are not being used to hold otherwise free motor bodies.
- The eight 3794b.dat jumper plates are intentional half-stud adapters.
  Removing their offsets would put the studded tray on the wrong grid.
- The smooth floor contains no exposed studs and no floor tiles beneath
  the wall bricks. Both plate halves are tied together by spanning parts.

LEVEL REFERENCE AND FIRST RUN
-----------------------------
Load/reset the model at the saved level pose before running the native demo.
For a physical build, first establish the same level datum in the controller
being used. An encoder reading of zero is only meaningful after that datum
has been established; do not drive an unknown starting pose to zero blindly.

With the ball removed, make a slow small move of each axis and return level.
Check that each shaft, retainer, support and cable can move through the planned
range. Run the bounded demonstration. Keep later edits within +/-12 degrees
on each axis and preserve the return to level. This gimbal is not intended
for full rotations, especially because motor B's cable moves with the frame.

Then place the ball on the green start tile at level. Individual small tilts
can move it toward a passage; reversing the tilt helps slow it. The included
program demonstrates the two rotations, but does not measure the ball's
position and does not guarantee travel through the maze.

MAZE GEOMETRY
-------------
The outside of the tray is 8 x 12 studs, or 64 x 96 mm. Inside the perimeter
walls, two alternating baffles create an S route. The passage width is 16 mm.
The ball's nominal diameter is 14.4 mm, leaving about 0.8 mm of side clearance
when centered. This is a compact, close-fitting maze, not a high-speed track.

The available center route, viewed from above in the level tray, runs from
the green pad to the right opening, across the middle lane to the left
opening, and then toward the red pad. In local LDraw X/Z coordinates:

  Start     (-40, -79.5)
  Right     ( 40, -79.5)
  Mid-right ( 40,   0.5)
  Mid-left  (-40,   0.5)
  Left      (-40,  80.5)
  Finish    ( 40,  80.5)

These coordinates describe available clearance, not a forced ball path.
The ball is a separate payload marked with 0 !BW LOAD. Its actual trajectory
depends on gravity, friction, impacts and the timing of the tilts.

QUALIFICATION
-------------
This is a CAD design with a bounded control example. The accompanying review
files describe the geometric and attachment checks that were actually run.
The native Brickwright program has not been executed in Brickwright or on
physical LEGO hardware. The mechanism preview is kinematic; it is not a
validated ball simulation. No physical build, calibrated friction value,
measured load capacity or demonstrated maze-solving result is claimed.

The original assembly arrangement is provided under the licence stated in
the model headers. Referenced LDraw part definitions retain
their own authors and licences. If a viewer cannot find 7229.dat or another
part, use an official LDraw library containing that part rather than silently
substituting a different connection type.
