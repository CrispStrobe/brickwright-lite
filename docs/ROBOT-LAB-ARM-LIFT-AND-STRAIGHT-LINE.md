# Atlas Arm, Switchback Lift and Straight Eight

These original CrispStrobe designs are bundled under BSD-3-Clause. Their English
and German lessons open from Robot Lab’s Examples dialog or the lesson icon.
Selecting an example loads its model, project title, program and blocks; Run
starts it. Reset before rerunning a sequence from its original mechanical datum.

| Assembly | Pieces | Motors | Observable experiment |
|---|---:|---|---|
| Atlas Arm | 237 | A shoulder, B elbow, D gripper | Two 24:1 worm reductions, joint coordinates, tool path and holding. |
| Switchback Lift | 341 including the ball | A lift, B tipping fork, D gate | Rack transmission, gravitational energy, rolling and sequential control. |
| Straight Eight | 113 | A crank | Peaucellier inversion: straight output motion using rotating joints. |

The library has 46 selectable examples over 38 assemblies, including 17 choices
above 50 pieces. All 46 choices have offline EN/DE lessons.

## Adaptations and controls

Atlas retains the supplied arm geometry. Four pins connect the previously
removable hub to its rails. Two thin beams key each motor mount’s pair of axles
together, making the motor and its worm gearbox share a rigid frame. The native
program moves the shoulder 15°, elbow 25° and gripper across 45°, then returns.
A full shoulder motor turn corresponds to 15° at the arm. The worm drives resist
backdrive; the gripper uses powered holding. Use short manual jogs within the
supplied arm envelope rather than continuous rotations.

Switchback’s hub moves 4 mm along its shelf and is retained by two pins. Three
keyed braces rigidify the lift motor, housing support and moving fork motor.
Two full bushes become half-bushes; four other half-bushes are replaced by two
of the braces. The total rises from 340 to 341 pieces. The ball remains free:
`0 !BW LOAD` declares an intentional payload, not an attachment. Instructions
explain placing it in its cradle. A LOAD declaration is accepted only for a
free island consisting wholly of declared payload parts; structural detachment
and an incorrectly declared hub still produce issues.

The supplied lift conversion was slightly inaccurate: a 12-tooth pinion has a
6 mm pitch radius, so 600° produces 62.83 mm. The bundled program uses 611.155°
for 64 mm. It lifts, tips the fork down 40°, waits for the ball, restores and
lowers the fork, opens the gate through 60°, waits for reload, then closes it.
The low carriage has a physical lower stop: commanding A down from home stalls.
Negative manual A raises it. Short negative B and D jogs tip and open the gate.
No ball sensor is fitted; fixed waits do not themselves confirm arrival.

Five supplied motor outputs need nonzero initial angles to align their keyed
sockets with the shafts. `0 !BW ROTOR` declares that angle independently of the
motor housing: Atlas A/B = 45°, D = −15°; Switchback B = 10°, D = −30°. Shaft
positions are preserved. The graph rotates only output connectors/colliders;
the 3D view and instructions rotate only the LDraw motor’s moving insert.
Encoder zero still means the loaded model’s starting pose. Flat exports include
adjacent motor-pose part files; MPD exports embed them, preserving the original
LDraw authors and CC BY licence. Mesh controls reject incorrect key clocking
and over-insertion even when a rotor angle is declared.

The adapters check exact source hashes. Raw fixtures retain their initial
bytes and headers; the source ledger records the owner’s CrispStrobe /
BSD-3-Clause correction.
Straight Eight retains all 113 supplied placements. The example uses 5% speed,
active holding and the sequence home → +60° → −60° → home. Keep it in that sector;
a full revolution takes the linkage toward singular configurations. With long
arms L = 80 mm, rhombus sides r = 48 mm and OS = SP = 48 mm,

```
OP × OQ = L² − r²
xQ = (L² − r²)/(2 OS) = 42.6667 mm
yQ = xQ tan(θ/2)
```

The ideal ±60° stroke is 49.267 mm; constant crank speed gives variable marker
speed. Seven moving links plus the fixed ground link make the “eight”.

## Simulator support

The official frozen LDraw subset now includes both rack components, the worm
housing and the small patterned ball, with original part credits and licences.
New metadata models the housings’ open channels and bearing bosses. Accurate L
profiles replace filled corner boxes for 32526 and 32056. The rack uses its
actual 32-tooth strip, centred 12 LDU from the part origin; its retaining lip is
not a tooth tip. The metadata tests measure the tooth primitives independently.

A passive rack-guide connector creates a prismatic joint between 18940 and
18942. The existing rack solver now also accepts bevel pinions explicitly marked
as meshing like spur gears, including the supplied double-bevel 12T. Perpendicular
cylinder overlap uses the actual radial intervals instead of square envelopes.
No Jolt core, mechanism compiler, collision-filter or collider-simplifier source
was independently changed in this delivery.

The instruction viewer supports Home for the first step and End for the parts
list, alongside the existing arrow keys. This makes the longer manuals practical.

## Qualification

Native Scratch VM runs use the bundled SPIKE extension, virtual hub and real
Jolt model. Judges observe body poses independently of encoders. They check the
arm’s physical 24:1 joint sweeps and return, the rack’s 6 mm/radian displacement,
and the free ball’s outbound trip, wait at the closed gate and return to the
cradle. Straight Eight checks marker straightness, the inversion equation,
closed hinge loops, sector limits and return. Frozen-output controls must fail.

Representative measurements are about 15.02° / 25.06° arm sweep, 64.03 mm lift, 148.4 mm ball excursion and 0.34 mm ball return error.
Straight Eight traces about 49.45–49.47 mm with 0.09 mm maximum lateral error.
Contact dynamics and finite solver tolerance explain the small ideal-path error.

The test suite also checks motor stress in both directions, lower-stop stalling,
part metadata against official meshes, complete bounded instruction plans,
registry/catalogue consistency, source hashes and equivalent LDR/MPD exports.
Browser gates exercise actual worker programs, manual overrides, individual
Stop/Stop All, framing and lesson reveals. Straight Eight’s gate traverses all
57 instruction pages; Atlas/Switchback inspect first/next/Home/End and full BOMs
in the browser, with every instruction step checked headlessly.

These are simulated digital builds. Physical LEGO assembly, real motor loads,
cable routing and calibrated contact/friction measurements remain untested.
The free ball’s 1.5 g mass and solid-sphere inertia are model parameters, not
hardware measurements. Supplied animations and downloaded controller scripts
are not runtime qualification and were not executed.

Run `scripts/export-robot-lab-library.mjs output-directory output.zip` with the
GUI scope loader to create all fixed `.ldr` files and equivalent `.mpd` wrappers,
programs, lessons and notices. The exporter verifies every wrapper’s placements,
ports, payload flags and motor-pose geometry before writing the ZIP.
