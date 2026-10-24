# TwinTempo qualification contract — revision 2

Declared before the full exported-model native run. Original work: CrispStrobe,
BSD-3-Clause. Development probes are separate evidence.

## Physical question and topology

Can one motor lift two independent tags in a 3:1 ratio using equal 3713 bush
drums and an 8T → 24T → 24T gear train, and return both to their saved heights?
The gallery's ratio workbench has rotary outputs; TwinTempo adds two independently
measured rope-supported outputs. No corrected external collection was supplied.

One 45601 SPIKE Prime hub; one 54696p01 medium motor, explicitly port A.
Expected topology: one dynamic chassis, three dynamic shaft assemblies (including
the motor rotor), two independent dynamic tags, three hinges, two gear couplings,
two rope couplings. The floor is a separate static body. No frozen frame, artificial
weld, manually prescribed pose or added collision suppression is permitted.

## Geometry and datum

Authored axes: X along shafts, Y down, Z between shafts; 20 LDU/stud and
0.4 mm/LDU. Shaft lines are Y=-260, Z=0/40/100. Bearings are X=-20/100;
gear plane X=-60; drums X=40. Both ropes have native saved free length131 LDU.
Two 32523 tags are centered at [40,-100,0] and [40,-100,100], with their
local Z along authored +Y. The upper native attachment is tag-local [0,0,-29].
The physical cord loops through the upper hole and over its rounded end.
Part-local [0,0,0] is an additional independent center marker.

The saved motor encoder datum is zero. Positive A winds both drums. Bare bush
barrel radius is7 LDU=2.8 mm, flanges9 LDU. Idler rotation=-A/3; slow=A/3.
At A=720°, the ideal native rises are35.1858377 and11.7286126 mm.
The program guards the saved datum, uses fresh unwrapped encoder differences,
moves to720° and back to0°, permits at most two low-speed corrections per move,
and holds the attained position. A parallel60 s watchdog bounds execution.

Program targets are [0,720]°. Qualified envelope including overshoot is
[-5,725]°. Physical shaft rotation is not stopped at those values; excessive
winding can hit the drum/frame or pile cord, and excessive unwinding can land
a tag on the hub and slacken or unwind its cord. Those endpoints are not tested
operating positions. The supplied program is not hardware firmware.

## Independent measurement

Resolve each marker to exactly one body. Tags must belong to different bodies,
neither the chassis nor a driven shaft. Reference is the observed body containing
`hub`, using its actual pose each sample. Compute attachment points from each
part's saved placement plus its observed rigid-body transform. Expected equations
are checks only; they never populate observations.

Record actual chassis-relative tag positions, unwrapped joint angles, rope
free lengths/tensions, VM stage/completed/failed variables, busy state and hub
identity every25 ms. Physics step is the unmodified native5 ms. Observe500 ms
cold before green flag, then500 ms after successful completion. Ordinary import
and explicit `autoPorts:false` must be compared. There must be nonempty samples.

## Acceptance gates, fixed before qualification

1. Exported bytes parse with no refusals; native compiler warnings/errors empty;
   all compiled block opcodes registered. Exactly one explicitly routed motor,
   one controlled SPIKE hub and the topology described above. Report all solver
   and friction policy, including any substitutions.
2. Run the exact exported LDR/BW through registered parser/compiler, actual Scratch
   VM, Robot Lab extension, hub controller and native Jolt. `completed=1`,
   `failed=0`, stage3 and all threads finished within the watchdog. The harness's
   literal `unsupported:[]` is not used as evidence.
3. Cold behavior must be recorded before powered hold. No claim of cold
   self-locking; startup's ±1° guard must accept the actual saved state or visibly
   reject it. No resetting/zeroing during the program.
4. Useful fast/slow rise ≥30/9.5 mm. Over all trajectory samples, independent
   marker rise must match each measured-angle bare-radius prediction within1 mm;
   |fast rise−3×slow rise|≤1.5 mm. Both outputs move up then down. Shaft ratio
   residuals≤2°, hinge closure≤0.5 mm and axis mismatch≤1°.
5. Return both markers within1 mm of their start, final A within2°. Ropes support both tags during suspended travel; tags stay independent.
   The native unilateral constraint reports impulses, not a continuous force sensor.
   Require each rolling100 ms mean of the25 ms sampled tension to exceed0.001 N,
   and measured endpoint distance to differ from commanded free length by≤0.5 mm.
   Report the number and longest run of zero-impulse samples explicitly.
6. Chassis horizontal drift≤2 mm and tilt≤2° relative to settled starting pose.
   Input stays in[-5,725]° throughout. All poses finite.
7. Verify actual final geometry, fastener ownership, axial engagement, retention,
   same-body intersections and swept clearance throughout the qualified envelope.
   Mesh/collider exceptions must identify the exact intended connection or mesh.
   Native rope graphics are centerline approximations; finite cord, tangency,
   knots, winding-layer growth and cable contact are outside native qualification.
8. Freeze the recorded fast tag in an altered copy: the independent useful-travel
   gate must fail. This is an observer test, not a physical comparison run.

No browser integration or hardware PASS is permitted without the corresponding
observations. Preserve failed runs and their original criteria if revision is
needed. Freeze and hash the final tested bytes.

## Revision record, declared before the second full run

Revision1 remains in `evidence/first-run-v1/`, including its actual failed gates
and full recording. The model and program bytes did not change. It completed
all motion/return/stability gates but failed three observer checks:

- Built-in literal/menu shadow blocks were incorrectly required to have a
  primitive function. The native VM explicitly evaluates one-field/no-input
  shadow blocks; revision2 follows that actual semantics and lists those blocks.
- The observer read an absent public `mode` field. Revision2 reads the actual
  controller state and retains `lastStopAction` in its recorded motor data.
- Revision1 required strictly positive last-step rope impulse on every frame.
  The unilateral native rope approximation produced zero-impulse samples during
  lowering and endpoint settling while measured positions remained within
  0.25 mm of the ideal length. Revision2 replaces that continuous-tension claim
  with explicitly bounded length error and positive100 ms mean support, fixed
  above before rerunning. Continuous physical cord tension is not established.

All trajectory, return, frame stability, motor envelope and topology criteria
are unchanged. This is a revised measurement contract, not an engine repair or
a physical-design change.
