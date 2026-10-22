# Scale Echo and Turnwise

Both original CrispStrobe designs are bundled under BSD-3-Clause with their native
programs, English/German lessons and connected building instructions. The source
fixtures retain the supplied files and Scale Echo's original CC0 dedication. The
application adapters check the source hashes and preserve every placement. Archive
runtimes, generators and claimed results are references, not application code.

Scale Echo has 148 pieces and two motors, A and B. B rides on the long arm. The
five-hinge parallelogram enforces **D − O = 2(C − O)** in the horizontal plane,
using equal 48 mm pivot steps. Its eight guarded moves demonstrate two independent
inputs and mechanical scaling. The coloured caps mark paths in space; there is no
ink mechanism. Reset before the program. Its bounded workspace avoids the flattened
linkage. A physical build still needs cable routing, torque and stiffness checks.

Turnwise has 127 pieces and one motor, A. A retained tie rod steers two suspended,
freely spinning wheels. The 80 mm kingpin spacing, 16 mm inward and 32 mm rearward
arm offsets and 48 mm tie give a four-bar approximation to Ackermann steering.
At 25 degrees inner lock the outer angle is about 17.255 degrees, compared with
17.641 degrees for the ideal 80 mm virtual reference distance. There is no physical
rear axle or tyre-ground experiment. The motor always drives the left wheel, so
mirrored turns require asymmetric targets. Do not substitute symmetric ±25-degree
motor commands: the negative left-input toggle is near −19.93 degrees. Reset to
the saved straight-ahead pose before each finite program; use small manual jogs.

The wheel's full-width cylinder falsely reported bushes intersecting its recesses.
A bounded wheel-recess kind admits only aligned standard bushes outside the real
±10 LDU hub faces. An independent test clips every official wheel polygon at
those faces and checks the minimum radius of all remaining material. Controls
still reject intrusion into the hub or tyre and reject an incorrectly oriented
bush. This rule changes overlap diagnostics; it adds no weld or prescribed pose.

Ordinary and strict runs execute the actual programs through the compiler,
Scratch VM, Robot Lab extension and native Jolt engine. Independent observers
read rigid-body positions and rotations; frozen output controls must fail.
The pantograph observer checks its open branch, both input excursions, doubled
marker displacement, shaft agreement, hinge closure and home return. The steering
observer independently intersects the linkage circles, checks the passive wheel
against that prediction, verifies all six held teaching locks and checks return
to straight ahead. It does not equate the approximate linkage with ideal Ackermann
steering or claim transient tyre-contact performance.

Standard mesh, shaft, pin and shared-hole checks pass for both assemblies, and
both have complete connected manuals. These are simulation and nominal geometry
results, not measurements from physically assembled LEGO models.
