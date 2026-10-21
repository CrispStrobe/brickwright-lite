# Pantographs, Cardan joints and an Oldham coupling

Seven original CrispStrobe/BSD-3-Clause machines extend the existing Robot Lab
library. Each has a real hub and one or two SPIKE medium angular motors. All use
ordinary LDraw parts, finite feedback programs and passive mechanical outputs.
Selecting their gallery card loads the matching Code/Blocks program and title.

| Example | Explicit placements | Physical principle | Experiment |
| --- | ---: | --- | --- |
| Pantograph Doubler | 83 | Planar dilation, displacement/speed gain and area scaling | One forward and reverse turn at 20°/s; 32 mm input circle → 64 mm output circle |
| Scale Studio | 101 | The same 2:1 relation in another construction; virtual work | Quarter-turn pauses at 30°/s; one circle forward and back |
| Ripple Relay | 191 | Nonuniform Cardan transmission and cancellation by correct phasing | Three forward turns at 45°/s, return, then a slow approach to zero |
| Crossglide | 216 | Oldham transmission between parallel offset shafts | Eight 45° poses, a second turn, and two turns back at 30°/s |

Ripple Relay's complete physical CAD has **193 components**. The native importer
infers the two universal-joint crosses from four properly placed forks, creating
actual cross bodies and hinges. The two inferred crosses are additional to the
191 explicit input placements and instruction inventory. The original complete
193-component CAD is retained beside the native source fixture. Purchasing two
complete universal-joint assemblies changes a shopping count again. These are
representations of the same assembly, not extra selectable mechanisms.

The pantographs demonstrate pointer trajectories, without a pen, paper contact
or simulated ink. Their scale relation is projected into the frame's horizontal
plane: the beam layers have different heights. Both paths must actually move;
encoder completion alone cannot qualify a passive output. Doubling both planar
coordinates doubles length and ideal speed and quadruples enclosed area. Ideal
virtual work implies half the corresponding output force; no payload rating was
measured here.

For Ripple Relay, cos β = 0.8 at the equal 36.87° bends. The middle angle follows
φ = atan2(sin θ, 0.8 cos θ), continuously unwrapped. Its speed ratio ranges from
0.8 to 1.25. The correctly phased second joint inverts the distortion, so ψ = θ.
The existing Phase Bridge and misphased variant provide the comparison; this
larger fixture supplies a different triangulated support arrangement.

Crossglide's shaft offset is 16 mm. The middle datum follows an 8 mm radius
circle twice per shaft turn, while its body and output rotate once. Each of the
two perpendicular interfaces has two separated guide axles, so its physical
carriage is restrained against rolling. Both sliding strokes are 32 mm. No
native gear coupling or prescribed output pose supplies the transmission law.

## Adaptation and checks

Raw model/program bytes, original notices and SHA-256 provenance live under
`test/fixtures/model-files/<id>-source/`. `scripts/adapt-physics-addons.mjs` refuses
unreviewed input hashes. It changes model identification/licence paths and
removes coarse source STEP groups so the existing connected planner supplies
small assembly steps. It preserves the original placement numbers, transforms,
part IDs and motor bindings. Programs remain byte-identical except Scale Studio and Bloom Gate:
their redundant `lab reset` is removed because gallery selection already restores
the saved pose. Its real starting-angle guard and every motor target, speed,
dwell and watchdog remain. `physics-addon-program.mjs` validates raw hashes
before that bounded adaptation. Archive generators and packaged
runtimes are reference data and are not run or installed.

At the current application baseline, ordinary CrispStrobe-authored preparation
already preserves the actual pantograph hinges. The source package's warning
about automatic loop assistance at an older revision does not require a hidden
per-model import policy, altered author header or new runtime override.

The 7-hole beam's previous rectangular collider falsely occupied its rounded
end corners. Its replacement is a central box plus two cylindrical end caps,
using the same representation already used for the 11-hole beam. Independent
controls enclose every official mesh vertex, clear an empty end corner, retain
central/end collisions and reject the old box. No collision pair is exempted.
The unchanged winding-number, pin-depth and shared-bore checks pass all four
source assemblies.

`test/bw-sim-physics-addons.test.mjs` runs the actual supplied programs through
the compiler, Scratch VM, Robot Lab controller and native Jolt engine in ordinary
and strict modes. `sim-lab-addon-judge.mjs` carries physical part-local points
with observed body poses, removes measured chassis movement and compares them
with independent equations. Frozen passive-output copies must fail the same
motion checks. Ripple Relay reuses the existing Cardan judge rather than adding
a second implementation of its angle law. Native tests, browser workflows,
source integration and released binaries are separate evidence checkpoints.

The in-app English/German lessons explain the observations, predictions and
related examples. Browser checks exercise actual worker motion, manual A,
Stop/hold, framing, lessons, connected instructions and complete explicit bills
of materials. Real file imports and automatic program/title loading are checked
on the built application. Simulation does not establish physical buildability,
real bearing friction, cable clearance, tool contact or hardware execution.

## Reaction wheels, aperture geometry and a slower pantograph

Three subsequent original BSD-3-Clause examples add 450 placements:

| Example | Pieces | Motors | Observable principle |
| --- | ---: | --- | --- |
| Momentum Twins | 125 | A, B | Reaction torque turns a passive platform; opposite rotor momenta nearly cancel |
| Bloom Gate | 170 | A | Eight perimeter gears synchronize four physical leaves; opening area is nonlinear in shaft angle |
| Amplify | 155 | A | A hinge-only pantograph doubles displacement and point speed while preserving orbital frequency |

Momentum Twins' hub and stators ride the moving platform. Both rotors carry
balanced wheel pairs. Its four finite stages compare matching and opposing
720-degree spins, then return the rotors. The lower frame remains dynamic on
the floor. Native qualification observes both wheel bodies and the passive
platform, including concurrent movement; freezing either wheel or the platform
in an analysis copy must fail the same judge. Central platform motion is never
commanded. A wheel-recess rule now also recognizes the stock smooth half bush
32123b: its official mesh fits the existing coaxial recess envelope. Hub, tyre,
misalignment and penetration refusal controls remain active.

Bloom Gate uses different leaf heights so its six-by-six plates can overlap.
Motor A moves between 0 and −45 degrees. Two sweeps use 9 and 18 degrees per
second. For leaf angle θ = −motor angle, ideal clear width is
64(cos θ + sin θ − 1) mm and area is its square. The judge carries all sixteen
real plate corners, subtracts their finite projected polygons from a fixed
18.8 mm viewing window and measures the actual clear diameter. It checks the
area curve, full opening and return; reaching a motor angle is insufficient.
Closed return has finite controller error and is not a guaranteed optical seal.
Its redundant in-program reset is removed through the same hash-gated adapter
as Scale Studio, preserving its datum guard, targets, dwells and watchdog.

Amplify uses a 16 mm input radius and 32 mm output radius. Eight 45-degree
teaching pauses precede a second forward turn and two reverse turns at 10°/s.
Every native sample checks actual point dilation and radius; actual adjacent
samples during movement check doubled point velocity. Closure, parallel axes,
forward/reverse coverage and return retain the source's declared bounds. This
is a displacement demonstration, without a measured payload or force rating.

All three retain their original placements and IDs, raw source hashes, owner
notices, English/German lessons and automatically loaded programs. Native and
browser qualification are separate; physical LEGO construction remains untested.

Offset Orbit and Ellipsa extend this batch to nine original BSD machines.
Offset Orbit retains 141 placements and one motor: its 16 mm shaft offset
produces an 8 mm radius middle-marker orbit at twice the shaft frequency.
The output shaft remains in phase with the input. Ellipsa retains 187 placements
and one motor carried by a slider: its independent marker traces a 32 × 96 mm
ellipse. Both carriages travel 64 mm. Constant motor speed produces a varying
marker speed, with an ideal 3:1 maximum/minimum ratio.

Both exact programs complete with ordinary and strict preparation. Independent
body observations and frozen passive-output controls pass (four cases). The two
source geometries pass eight targeted standard winding-mesh, fastener-depth,
shared-bore and negative controls. Gallery/menu registration and EN/DE lessons
are additive; existing models are preserved. Browser qualification is pending.
No physical LEGO construction or payload capacity is claimed.
