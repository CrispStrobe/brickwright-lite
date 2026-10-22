# Integral — a friction-wheel computer

Integral has 155 stock placements, one SPIKE Prime hub and two motors. Motor A
turns a tiled platter through a 20:60 reduction. Motor B moves a gravity-loaded,
unmotorized rubber wheel across the platter. The output wheel receives no motor
command or prescribed gear relationship: frictional contact makes it turn.

Choose Integral in Robot Lab's Examples, then Run. The program visits contact
radii of +28, +14, 0 and −28 mm for six seconds each, returns to the centre and
finishes in approximately 35.7 simulated seconds. Reset before another run.
The wheel's nominal radius is 28 mm. Ideal rolling predicts a speed ratio x/R;
its accumulated angle approximates the integral of x over platter angle.
Shifting the tyre sideways and finite contact width introduce slip and creep.

The current native program measures speed ratios of approximately +1.006,
+0.503, +0.040 and −0.992. Near neutral is not an exact stop. The final output
angle differs from the measured-motion ideal integral by about 18.15 degrees;
these are finite demonstration measurements, not calibration guarantees.
The complete native station windows retain positive reported contact load.
A separate control changes only output-body friction to zero: sustained speed
ratio falls from about +1.016 to −0.016 while physical contact remains. Freezing
the observed wheel pose is also rejected by the functional judge.

The supplied generic import originally enabled foreign-model rescue, adding
passive bearing friction that prevented the intended response. This original
user-owned design now carries the requested CrispStrobe author credit and uses
the application's existing authored-model path. The original model also shared a carriage hole between a bridge pin and the
fork mount’s integral pin. The corrected fork uses the clear left carriage hole
and an additional retaining bush. Its tyre centre and Y/Z geometry, motor
operations and physics engine are unchanged. Native tests prove ordinary/strict equivalence and that
LDraw serialization preserves authorship and the same import behavior. No new
project setting or special contact solver is needed.

The base and platter retain two inherited rigid-assembly notes: multiple pins
fix those assemblies together. They do not lock the free roller or its fork.
English and German lessons explain the ideal relation and simulation limits.
The library export supplies LDraw and equivalent MPD files, program and notices.
The native and browser checks do not establish physical LEGO buildability or
hardware accuracy; tyre compliance, tile seams and bearing drag need bench tests.

Original design, program and lessons: CrispStrobe, BSD-3-Clause. Sixty-three
placements reuse CrispStrobe's Orbital Loom base, drive, hub and platter.
Referenced LDraw geometry retains its individual attribution and licences.
