TIDAL TRIO
==========
An original three-motor Technic kinetic sculpture -- digital prototype v1.0

Three independently driven cranks turn continuously while tall colored
rockers sweep back and forth. Changing their relative phases produces a
traveling wave, synchronized movement, or alternating movement. The motors
stay on the chassis; only the lightweight links and flags move.

Each four-bar mechanism has a 2-stud crank radius, 6-stud coupler, 4-stud
rocker joint radius, and 6-stud fixed pivot spacing. The nominal rocker
sweep is 63.06789 degrees. The full 9L rocker extends the visible motion
beyond its coupling point. This is an original CAD design, not a physically
built or hardware-tested machine.

HARDWARE AND SIZE

The inventory contains 218 LEGO elements/assemblies, 16 part shapes, and
23 part/color combinations, including one SPIKE Prime hub 45601 and three
medium angular motors 45603. Electronics count as complete assemblies.
Everything used is Technic or LEGO electronics; no extra craft supplies
are required. The exact inventory is parts_list.csv.

The conservative CAD envelope is approximately 376 mm wide, 208 mm deep,
and 168 mm high, including the detached hub console and full motion.
Allow additional space for handling and the motor leads. Modules sit
14 studs apart; their nominal moving envelopes remain at least 13.3 mm
apart even with arbitrary independent phases. This geometric clearance
does not include bending, loose connections, or cables.

Part colors are visual choices, and availability in every shown color has
not been verified. Substitute colors freely while preserving part shape
and pin function. A friction pin and a smooth pivot pin are not equivalent.

FILES AND OPENING THE MODEL

- tidal_trio.mpd: main LDraw model, displayed at crank phases 0/180/0.
- tidal_trio_home.mpd: the same build with all cranks pointing right at 0;
  use this pose for the controller's manual startup setup.
- parts_list.csv: quantities grouped by LDraw part and color.
- tidal_trio_build_guide.pdf: illustrated assembly and mechanism guide.
- tidal_trio_preview.png: rendered view of the main model.
- tidal_trio_motion.gif: simulated traveling wave, phases 0/120/240,
  at 6 rpm. It is a CAD animation, not filmed hardware.
- tidal_trio_pybricks.py, controller_notes.txt, motion_presets.json:
  optional control program, operating notes, and readable motion settings.
- validation_summary.txt: scope and results of the digital checks.

Use an LDraw-compatible editor/viewer with a current official parts library.
Each MPD contains the root assembly and five assembly submodels: chassis,
left module, center module, right module, and console. STEP commands and
comments organize assembly. The PDF supplements these CAD steps; it is
not a separately verified brick-by-brick instruction sequence.

The MPDs reference official part files rather than embedding their meshes.
The current smooth long-pin reference is 32556a.dat, introduced in the
2026-01 library update; older libraries may know the 32556.dat alias instead.
Update your library if a part is missing. The electronic references are
45601c01.dat for the hub and 54696p01.dat for each motor. Their LDraw
filenames differ from LEGO's retail hardware numbers.

ASSEMBLY DETAILS THAT MATTER

1. Build the common chassis from its two rows of 15L rails and underside
   splice beams. Keep the intentional gaps bridged by those splices.
   Where a module foot, rail, and underside splice share one hole, use
   the single blue 3L friction pin shown through all three layers. Do not
   insert two opposing 2L pins into that same occupied hole.

2. Build each stationary motor cassette. Four 13L vertical columns attach
   to the motor's side sockets with twelve black friction pins. Perpendicular
   connectors support its four 9L floor runners. All motor output faces
   point toward the front, with the motor bodies extending downward.

3. Make the grounded rocker support with two 9L upright cheeks, a diagonal
   11L brace, and the additional 9L spacer runner above the floor runner.
   The two long pins beneath the rocker feet each pass through connector,
   spacer runner, and floor runner. Keep this three-layer arrangement.
   The diagonal's 6-8-10 stud triangle locates the fixed support.

4. Fix the 5L crank to the rotor using two black friction pins, one stud
   on either side of its axis. The free crank joint is two studs from the
   axis. Connect the 7L coupler using a smooth 2L 3673 pin. The other end
   connects to the colored 9L rocker with another smooth 2L pin, four studs
   from the rocker's grounded end. Preserve the upper assembly branch
   shown in the CAD; the linkage should sit above the fixed pivot line.

5. Sandwich the rocker's grounded end between the two fixed cheeks and
   insert the smooth 3L 32556a pivot through all three layers. The crank,
   coupler, and rocker occupy successive depth layers; their joint faces
   meet without extra washers. Black 2780 and blue 6558 pins fix structure;
   smooth 3673 and 32556a pins serve the moving pivots.

6. Attach each thin 99773 triangle with two 32002 three-quarter pins.
   Their full-length ends enter the thick rocker; their short ends face
   forward into the thin flag. Use the centerline round holes shown, not
   the triangle's outer axle holes. The flag is half a stud thick
   and sits immediately in front of the rocker.

7. Attach all three completed modules to the shared chassis. The hub is
   a detached console resting on the bench behind the sculpture; it has
   no hidden structural connection. Connect left/center/right motors to
   A/B/C. Leads are omitted from the CAD. Route them down and rearward,
   clear of every moving link. Lead C passes across the open space in
   front of the hub and around its left edge into port C; a straight
   line from the right motor to C would cross the hub body. Leave slack
   and keep every plug free of tension. Turn every crank through a full
   revolution by hand before powering it.

OPERATING THE OPTIONAL CONTROLLER

The supplied Python program requires Pybricks firmware. It does not install
firmware and is not a stock SPIKE-app program. See controller_notes.txt
for full setup and tuning instructions.

At the orange Z prompt, position every crank joint directly to the right
of its motor axis, matching tidal_trio_home.mpd. Press and release RIGHT
to record zero. LEFT selects 1 Wave, 2 Together, 3 Alternating, or 4 Reverse
wave. Press and release RIGHT again to align gently and start. The default
running preset is Wave, even though the main CAD presentation is Alternating.

RIGHT during motion ramps to rest and returns to the menu. CENTER retains
the normal Pybricks program stop. The default is 6 rpm with three-second
speed ramps; try 2 rpm and Together for the first direction check. All
right-pointing cranks should initially rise. A detected stall or sustained
phase lag brakes all motors and reports an error. Restart and manually
zero after a program stop or fault.

With stock LEGO software, a possible programming approach is to set the
three crank positions, then drive A/B/C at equal angular speed with the
chosen phase offsets. That is a concept only; no tested stock-app program
is included, and simple independent speed commands may drift out of phase.

VALIDATION AND RIGHTS

Digital checks cover LDraw references and transforms, inventory, linkage
closure and sweep, representative exact-part connections and clearances,
and controller mathematics with a simulated interface. They do not establish
physical stiffness, friction, cable behavior, motor loading, or reliability.
No physical prototype or hardware control run has been performed.

The original TIDAL TRIO design, controller, and documentation are licensed
CC BY 4.0. Credit TIDAL TRIO / OpenAI and identify modifications. Referenced
LDraw parts retain their own authorship and license notices.
https://creativecommons.org/licenses/by/4.0/

SOURCE REFERENCES

LDraw file format and MPD structure:
https://www.ldraw.org/article/218.html
https://www.ldraw.org/article/47.html
Current official parts library:
https://library.ldraw.org/library/updates/complete.zip
LEGO hardware:
https://education.lego.com/en-us/products/lego-technic-large-hub-for-spike-prime-/45601/
https://education.lego.com/en-us/products/lego-technic-medium-angular-motor/45603
Pybricks motor and hub APIs:
https://docs.pybricks.com/en/latest/pupdevices/motor.html
https://docs.pybricks.com/en/latest/hubs/primehub.html
