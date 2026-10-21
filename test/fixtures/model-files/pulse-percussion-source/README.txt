PULSE PERCUSSION
One motor. Three gravity beaters. A mechanically stored rhythm.
Original digital LEGO Technic design, version 1.0
20 October 2026

START HERE

Open pulse_percussion.mpd for the named assembly groups. Use the illustrated
seven-page PDF guide alongside it. The flattened pulse_percussion.ldr is the
same 120-piece assembly without nested submodels, for simpler importers.

Hardware: one SPIKE Prime hub (45601) and one medium angular motor (45603).
The motor is referenced as LDraw 54696p01.dat; the hub as 45601c01.dat.
There are no sensors, other motors, rubber bands, or non-LEGO strike targets.
The hub is a separate console on the same bench, not structurally mounted.

This is an original digital prototype. It has not been assembled, recorded,
or run on LEGO hardware. Its intended output is plastic tapping percussion;
there is no promise of tuned pitch, volume, resonance, or a measured tempo.
Geometry and a simplified motion model were checked. These cannot establish
real friction, bounce, stiffness, pin retention, motor load, or acoustic quality.

FILES

pulse_percussion.mpd                Multipart LDraw model, preferred CAD file
pulse_percussion.ldr                Flattened version of the same assembly
pulse_percussion_build_guide.pdf    Seven-page illustrated assembly guide
pulse_percussion_preview.png       Render of exact LDraw part geometry
pulse_percussion_motion.gif        Slowed simulated motion, without audio
parts_list.csv                     Exact quantities by LDraw part and color
pulse_percussion_pybricks.py        Optional forward-only Pybricks controller
controller_notes.txt               Controller setup, modes, limits, and behavior
validation_summary.txt             Digital checks and their practical scope
README.txt                         This document

The complete ZIP contains those ten files. Images are rendered from the
parts used in the model; they are not AI-generated pictures of a hypothetical
build. The animation is an idealized motion illustration, not footage.

MODEL AND COMPATIBILITY

The assembly uses 120 elements/assemblies, 14 distinct part shapes, and 20
part/color combinations. The hub and motor each count as one assembly.
Including the separately placed hub, the checked model envelope is 172.0 mm
wide, 215.6 mm deep, and 103.6 mm high. Allow extra room for cable slack and
access; approximately 18 x 22 x 11 cm describes the CAD envelope rounded up.
The MPD references standard LDraw parts rather than embedding replacement
meshes. Use a complete LDraw parts library with the referenced SPIKE electronics.
If an importer lacks 54696p01 or 45601c01, update its part library; removing the
electronics would make the displayed model incomplete.

MPD is the LDraw multipart format. The main file references nine named groups,
with STEP markers and comments. LDR contains the same rigid transforms and
part inventory in a single file. These files are static CAD assemblies; the
GIF is a separate preview of the intended motion. A CAD viewer will not
automatically simulate gravity or pin/beam contact when opening either file.

The guide describes a practical assembly sequence and important joints.
It is not a full commercial instruction book with every individual part added
on its own page. Inspect the submodels to see the layered pin connections.
Changing colors is cosmetic; changing part shapes or axle lengths can affect
the mechanism. Red, yellow, and blue distinguish the three channels.

HOW THE MACHINE WORKS

The medium angular motor directly turns a 16L camshaft. No external gear
reduction is used: one motor revolution is one pattern cycle.

Each rotor consists of two thin 5L beams (11478), stacked face to face and
keyed to the shaft through an end axle hole. A 2L friction pin (2780) passes
through the round hole three stud intervals from the shaft. Its exposed
half reaches into the adjacent beater's plane.

The three 9L beaters (40490) pivot independently on their end round holes
around a second, unpowered 16L axle. A rotating peg approaches below a
beater, lifts it near the free end, then passes beyond that finite end.
The released beater falls onto a fixed 15L Technic crossbar. All relative
timing comes from the three rotor phases, not three software-controlled motors.

The supplied phases are red 0, yellow 90, and blue 180 degrees. Because the
phase is an angular lead, steady-state strikes repeat blue, yellow, red,
then a longer gap. Consecutive event separations are 90, 90, and 180 shaft
degrees. Each channel strikes once per shaft revolution. Starting from an
arbitrary angle may begin partway through that repeating pattern.

At steady 30 rpm, one complete pattern takes two seconds. The smaller gaps
are nominally half a second, and the longer gap is one second. Impact timing
is an ideal prediction; real friction and rebound will change it. Acceleration
and stopping ramps make a finite start-to-stop cycle take longer than the
steady-state period.

BUILDING SEQUENCE

1. Build the main floor rails, eight bearing towers, and both braced side
   assemblies. Their feet share one bench plane. Include the rigid 3 x 5
   L braces; the long side rails alone would not adequately resist racking.

2. Build the four-column motor support and its two floor runners. Use the
   two 8L axle cross-ties and their full/half bushes to join it to the left
   lower side rail. The cross-ties accommodate the motor's half-stud offset.
   Do not force its columns onto an incompatible hole grid.

3. Prepare the three beater/rotor groups. Each rotor uses two 11478 plates
   with matching end axle holes, one 2780 lifting pin, and two half bushes.
   The beater is a separate part and is not pinned to the rotor.

4. Position the three beaters and thread the unpowered rear 16L axle through
   the rear towers and their round end holes. Add the full bushes shown.
   The lever planes must stay aligned with the exposed lifting pins. Leave
   slight endplay so each lever falls under its own weight.

5. Position the rotor pairs at their quarter-turn phases and thread the front
   16L axle through the front towers and keyed rotor holes. Insert its motor
   end one stud into the output socket. A half bush sits between the motor
   face and the first bearing; a full bush retains the outer end. Do not press
   those retainers tightly against the bearings.

6. Attach the 15L strike bar to the two upright target posts with the already
   shown 2L pins. The bar belongs behind the rotor sweep. The beaters settle
   slightly below horizontal onto its front upper edge.

7. Put the hub beside the motor, clear of the frame. Connect motor port A.
   Route its lead around the outside of the frame, below the moving pegs,
   with relaxed bends at each end. The flexible lead is omitted from CAD.

8. With power off, rotate the mechanism slowly through one complete forward
   revolution. Every peg should lift, pass clear, and release its beater.
   Stop and fix any binding before powering it. Then start at 15 rpm.

IMPORTANT GEOMETRY

The front camshaft and rear pivot shaft are parallel. For each beater:
- Pivot to free-end hole: 8 stud intervals = 64 mm.
- Pivot to camshaft: 10 studs forward, 1 stud down.
- Camshaft to lifting-pin center: 3 studs = 24 mm.
- Rotor body to beater body: nominal 5 LDU = 2 mm of axial clearance.
- Lifting pin overlap with beater plane: 15 LDU = 6 mm.

Use 2780, the 2L pin, for each lifting peg. A 3L pin would have an unnecessary
rear tail that interferes with the neighboring bearing tower. Structural
3L pins elsewhere in the frame should remain as specified.

Use 11478, whose end holes accept an axle. An ordinary thick 5L beam with
round holes would spin freely on the shaft. The beater has the opposite
requirement: it must have a round pivot hole so it can swing independently.

The strike bar top is not on the same surface level as a perfectly horizontal
beater. The modeled rest angle is 1.271619 degrees downward from horizontal,
with the free end about 1.42 mm below its horizontal position. This small
settlement is intentional. The ideal maximum tip rise from rest is 17.61 mm.

REINDEXING THE RHYTHM

Power off before withdrawing the camshaft. Slide it only far enough to free
the desired rotor pair, turn both thin plates together by a quarter turn,
reinsert the axle, and restore every retaining bush. The cross axle permits
90-degree indexing; do not force intermediate angles such as 120 degrees.

Example phase sets:
- 0 / 90 / 180: three separate taps followed by a longer gap.
- 0 / 0 / 180: two beaters together, then the third half a turn later.
- 0 / 0 / 0: all three beaters together once per revolution.

These are physical rotor arrangements. Changing speed in the controller
changes tempo, not the relative phase pattern. Check a full forward hand
turn after every reindexing. Simultaneous lifts also change motor loading.

CONTROL

The optional program uses Pybricks 4.1 APIs and requires compatible firmware.
It does not install firmware and cannot be pasted into the stock SPIKE app
as a compatible project. A simple stock motor program can also turn the
shaft forward slowly; no stock-app project file is supplied.

LEFT while stopped cycles the displayed mode. RIGHT starts or requests a
gentle stop. CENTER remains the normal program-stop action.
1 = continuous 15 rpm (initial selection)
2 = continuous 30 rpm
3 = continuous 45 rpm
4 = one 360-degree shaft cycle at 30 rpm, relative to the current position

The controller has one-second speed ramps, a stall check, and a finite-move
timeout. It does not home or park at a particular rotor position. Forward
motion lifts the peg on the side nearest the beaters, then carries it past
their tips. Reverse operation is not included or validated.

See controller_notes.txt for the detailed interface and practical limits.

VALIDATION AND SOURCES

validation_summary.txt records the final checks. They include standard-part
resolution, transform/inventory consistency, selected mounting interfaces,
exact-mesh contact checks and sampled full-motion clearances. Sampling is
not a proof that every imaginable configuration is free of interference.

The preview uses actual LDraw meshes. Gravity animation treats a beater as
a uniform rigid rod with unilateral peg contact and a non-bouncing stop.
It permits physical detachment before the geometric end-cap singularity.
It does not simulate sound, real mass distribution, friction, backlash,
material flex, cable movement, motor loading, or rebound.

Primary references used for part/format/API verification:
LDraw MPD specification: https://www.ldraw.org/article/47.html
Official parts library: https://library.ldraw.org/
11478 catalog: https://library.ldraw.org/parts/list?tableSearch=11478.dat
LEGO motor 45603: https://education.lego.com/en-us/products/lego-technic-medium-angular-motor/45603/
Pybricks motor API: https://docs.pybricks.com/en/latest/pupdevices/motor.html
Pybricks PrimeHub API: https://docs.pybricks.com/en/latest/hubs/primehub.html

LICENSE

Original assembly design, guide, controller, and previews: CC BY 4.0,
attribution to OpenAI / PULSE PERCUSSION. Referenced LDraw parts retain the
licenses and author attribution in their own source files; their geometry
is not republished in the CAD assembly files. LEGO, Technic, and SPIKE are
trademarks of the LEGO Group. This independent model is not an official set.
