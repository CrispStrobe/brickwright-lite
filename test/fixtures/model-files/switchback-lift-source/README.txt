SWITCHBACK LIFT
An original LEGO Technic ball-handling machine
Version 1.0 | October 2026

ONE HUB. THREE MOTORS. A COMPLETE RETURN ROUTE.

A paired rack elevator raises a small soccer ball by eight studs (64 mm).
A motorized fork tips it onto the yellow outbound track. At the far end,
the ball drops into the red return lane. A third motor holds the returning
ball behind a gate until the fork reaches the bottom, then opens to reload.

This is an original digital prototype. It has not been assembled or run
on physical LEGO hardware. The CAD, nominal connections, sampled motion
clearances and controller logic were reviewed; real rolling friction,
rebound, motor loading, frame stiffness and cable behavior remain to be
established. The animation is a geometric motion illustration, not a
physics simulation or a measured cycle-time demonstration.

FILES

switchback_lift.mpd
  Primary LDraw multipart model, with ten named assembly groups,
  construction steps, comments and correctly posed integral motor rotors.

switchback_lift.ldr
  Flat LDraw alternative using complete motor shortcuts. External geometry
  is the same as the MPD. The shortcut's internal rotor phase is its stock
  default; use the MPD for the exact reference rotor orientation.

switchback_lift_build_guide.pdf
  Ten-page illustrated assembly and commissioning guide, including the
  inventory. It explains the modules and critical connections; it is not
  a one-part-per-page instruction book. Use the MPD as the geometry reference.

parts_list.csv
  Quantities by LDraw part number and color. Total: 340 physical elements
  or purchased assemblies, across 30 shapes and 40 part/color combinations.
  Each complete motor and the hub count once. Colors may be substituted.

switchback_lift_pybricks.py / controller_notes.txt
  Optional controller and setup notes for a compatible SPIKE Prime hub
  already running Pybricks 4.1. These are not a SPIKE-app project. The script
  requires manual motor referencing and defaults to one observed cycle.

switchback_lift_preview.png / switchback_lift_motion.gif
  Views rendered from the actual LDraw geometry. Flexible leads are omitted.

validation_summary.txt / controller_validation.json
  Review scope, results, limitations and simulated-controller checks.

review/
  Detailed machine-readable evidence supporting the validation summary.

source/
  Optional Python/NumPy geometry generators and the illustrated trajectory,
  with instructions for regenerating the CAD using an official LDraw library.

OPENING THE CAD

The models use the standard LDraw format and reference official parts by
filename. Use a current complete LDraw parts library, available from
https://www.ldraw.org/parts/latest-parts.html . No custom molded parts or
scaled LEGO elements are required. The MPD embeds its assembly groups and
motor orientation wrappers; the standard part geometry is not embedded.

The MPD opens at the lower loading position: lift at its low reference,
fork 10 degrees nose-up, gate 30 degrees forward from vertically down.
Construction groups 01 through 10 are named in their intended assembly
order. Local coordinates use X forward, Y down and Z across the machine;
20 LDraw units (LDU) equal one stud or 8 mm.

HARDWARE

1 x LEGO Education SPIKE Prime hub 45601
3 x LEGO Technic medium angular motor 45603
1 x 72824-type soccer ball, approximately 14.4 mm in diameter in the CAD
2 x 18940 rack housings and 2 x 18942 sliding racks
2 x 32270 double-bevel 12-tooth pinions
Other standard Technic beams, thin beams, axles, bushes and pins as listed.

The model uses a small soccer ball, not the larger Bionicle ball. The fork
and track openings were designed around that particular ball envelope.
It is a single-ball machine; a multi-ball queue and GBC throughput are
not specified. It has no separate ball-arrival or homing sensors.

PORT MAP AND MOTION

Port A: fixed lift motor. Paired racks move from 0 to 160 LDU. The full
        stroke is 600 motor degrees through the direct 12T pinion drive.
Port B: moving fork motor. Carry at 10 degrees nose-up; discharge at
        30 degrees nose-down.
Port D: stationary gate motor. Closed at 30 degrees forward from down;
        open at 90 degrees. Port C is unused.

The two return slopes are approximately 4.093 degrees. Each is set by
rigid 14-stud / 14-stud / 1-stud triangles, so no beam needs to be bent.

ASSEMBLY POINTS THAT MATTER

* Keep both rack teeth level and pinions in the same phase. The shared
  drive is a 7L axle, an inline 59443 axle joiner and a 6L axle.
* Use the pictured 5L cheek-retaining axles, bushes and half-bush offsets
  around the molded housing heads.
* The fixed motor cradle's 5L vertical ties use only their inner bushes.
  Extra outer bushes would obstruct the moving fork motor.
* The 12L cross axle keys both rack ends to the overhead bridge. Keep the
  two 6L vertical bridge ties and 11L beams in their exact planes.
* Long 3L pins span three structural layers. Some foot/lap joints use a
  1L spacer; other joints already have a lap beam in that layer.
* At the return extension, three vertical side guards also fill the
  spacer layer of the long pin joints. Do not duplicate those spacers.
* The gate motor sits on four 7L carrier beams and drives a 9L axle.
  Calibrate the actual 30-degree closed pose. A hypothetical vertical-down
  gate would touch the rail and is not an operating position.
* The hub rests on a shelf and is removable. Route the three leads outside
  the rack, gears and ball route. Give port B's moving lead enough slack
  for the full 64 mm stroke and inspect it throughout that travel.

FIRST RUN

Read the PDF's reference instructions and controller_notes.txt first.
Commission without a ball. Support the carriage as needed; the direct
rack drive can backdrive when unpowered.

During each setup stage, LEFT and RIGHT jog an axis. RIGHT should raise
the lift, lower the fork nose, or open the gate, respectively. If a motor
moves in the wrong physical direction, stop and change its SIGN setting
before continuing. Hold both buttons for 0.8 seconds at the pictured
reference to accept it. The script does not drive into hard stops to home.

At the blue R ready state, put one ball in the fork and press RIGHT for
one cycle. LEFT during motion requests an active hold and a fault state.
CENTER retains the normal firmware stop behavior. Active hold needs
power; it is not a mechanical brake. Keep repeat mode disabled until an
observed cycle has succeeded and the travel and ball handoffs are tuned.

The gate cannot open unless the lift is low and the fork is at its carry
angle; the lift cannot rise unless the gate is closed. Timing still needs
to be checked with real parts because there is no ball-arrival sensor.

REFERENCES

LDraw multipart format: https://www.ldraw.org/article/47.html
Official rack geometry: https://library.ldraw.org/parts/1295
Motor: https://education.lego.com/en-us/products/lego-technic-medium-angular-motor/45603/
Pybricks motors: https://docs.pybricks.com/en/stable/pupdevices/motor.html
Pybricks PrimeHub: https://docs.pybricks.com/en/stable/hubs/primehub.html

LICENSE

Original model, guide and controller: CC BY 4.0; attribution "OpenAI,
SWITCHBACK LIFT, version 1.0". See https://creativecommons.org/licenses/by/4.0/ .
Referenced LDraw part geometry retains its authors' licenses.
LEGO and SPIKE are LEGO Group trademarks. This independent design is not
an official LEGO product.
