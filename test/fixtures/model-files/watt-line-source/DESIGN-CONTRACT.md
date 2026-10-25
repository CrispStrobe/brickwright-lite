# Watt's Line: design and acceptance contract

Version 1, 23 October 2026. Acceptance bounds fixed before the qualification run.

## Physical question

Can a one-motor linkage with only rotary bearings move the midpoint of a bar
along a useful, nearly straight path? The measured output is the centre of the
red 5-hole coupler, carried by its actual simulated rigid body and expressed
relative to the actual measured chassis. The prediction never positions a body.

## Construction

One SPIKE Prime hub and one medium angular motor on explicit port A. Four moving
rigid-body groups including the freestanding chassis, four ordinary hinges, no
gear coupling, slide, virtual payload, custom part, or world anchor. Both ends of
the coupler are connected with physical frictionless 2L pins. The motor rotor has
two separate structural pins. The output bearing and both stop rails have
two-pin-bonded piers. The motor stator and hub use pinned physical mounts.

LDraw uses +Y down, 20 LDU/stud and 1 LDU = 0.4 mm. In the horizontal XZ plane:
O=(0,0), D=(200,80), OB=DC=100 LDU and BC=80 LDU. At datum B=(100,0), C=(100,80),
P=(100,40). Input / coupler / output beam layers are Y=-60/-80/-100 LDU.

Input and output arms are 7-hole beams with a **5-stud pivot span**, between h1
and h6. The coupler is a 5-hole beam with a **4-stud pivot span**, h0 to h4.
No hole count is used as a length. The assembly has no free payload.

## Range and datum

Saved input direction is +X. Motor encoder A=0 is the saved rotor datum.
Native probe establishes geometric angle theta = -A, to be checked over the final
run. Direct drive has a 1:1 magnitude ratio. The program commands absolute
unwrapped targets +20, -20, 0 degrees twice, using fresh target-minus-encoder
errors. Units are degrees and degrees/second, not percent.

Two real 7-hole orange rails, centred at (100,-60,+/-60), stop the input at a
nominal +/-24.8345875 degrees: 100 sin(abs(theta)) + 9 = 51 LDU. This is a collider
and source-mesh geometry calculation, subject to real clearance and compliance.
The unconstrained linkage branch reaches toggles at -34.3441 and +77.9469 degrees.
Do not remove the stops or command past the working sector during the experiment.

Full permitted-travel clearance must cover both endpoints and intermediate
poses. Use at least 501 analytical poses over the stop-to-stop sector; this is
construction evidence only. Check physical stop contact separately in native
physics where available. Coupler and stop rail nominal surfaces share Y=-70;
surface contact and its drag must remain enabled. All supporting walls sit below
the moving coupler. The integral motor cable routes behind the motor to the hub,
away from all moving bars. Cable flex/contact and physical battery are unmodelled.

## Analytical expectation

At theta=-20 degrees, P=(100.1793746,5.3129765) LDU. At +20 degrees,
P=(99.8443655,73.7682014) LDU. The ideal longitudinal stroke is 27.38209 mm;
maximum ideal lateral deviation from X=40 mm is 0.0717498 mm. Real hinges,
friction, clearance, compliance and solver error add to this geometric deviation.

## Final native acceptance bounds

Use exact exported LDR and BW bytes through the selected registered compiler,
Scratch VM, bundled Robot Lab extension/API, hub controller, and pinned Jolt
fork. Use coldMs=2000, afterMs=1000, frameMs=1000/60 and timeLimitMs=45000.

- Import: 145 explicit rigid placements, one hub, one port-A actuator, four
  dynamic bodies, four hinges, zero parser/compiler issues or unsupported items.
- Construction: all finite proper rotations, unique semantic IDs; no unintended
  saved-pose overlaps; all 145 parts appear exactly once in connected instructions.
- Cold interval: after initial floor settling, passive output movement under
  0.15 mm and chassis tilt below 0.3 degrees.
- Program: completed=1, failed=0, final stage=7; finish before the 40-second
  watchdog plus the 2-second cold interval; at least 600 nonempty measured frames.
- Useful travel: measured midpoint longitudinal span 26 to 29 mm; lateral
  deviation from the saved ideal line below 0.35 mm throughout the experiment.
- Independent prediction: midpoint error against circle-intersection geometry
  using the **measured input angle** below 0.5 mm. Input geometric angle plus
  encoder angle within 0.5 degrees.
- Mechanical integrity: maximum hinge-point gap below 0.5 mm, hinge-axis
  mismatch below 2 degrees, chassis tilt below 0.3 degrees.
- Completion: all six commanded stages visit their target within 1 degree,
  final encoder within 1 degree, midpoint returns within 0.8 mm of datum.
- Negative control: freezing the measured output body must fail the same judge.
- Ordinary import and explicit autoPorts:false both qualify. Truthful
  CrispStrobe credit already disables auto-wiring and rescueLoose. Inspect
  topology for loop replacement or other stabilization independently.

The development run of the original program failed the stage-2 arrival check.
This remains recorded in the development history; no acceptance bound is relaxed
to turn it into a pass. Any revised program must receive a complete final run.

## Scope

This is a simulation experiment, not hardware firmware. Native evidence does not
prove a physical build, app installation, or the real parts' sub-millimetre
accuracy. Each qualification layer is reported independently.
