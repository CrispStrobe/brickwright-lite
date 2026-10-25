# Resonance Lab — complete construction guide

Copyright (c) 2026 Christian Ströbele (CrispStrobe).  
SPDX-License-Identifier: BSD-3-Clause.

Resonance Lab has one fixed SPIKE motor, one mounted SPIKE hub, a blue driven
rocker, and an orange passive rotor carrying two equal wheel masses. Two
white rubber bands transmit elastic forces between off-axis yellow bushes.
The output has its own freely rotating, retained shaft; it receives no motor
command. Three finite programs compare the response to different input
rhythms and then let the output continue oscillating while the input holds.

The complete model contains **142 rigid placements and two real bands**:
144 physical BOM items. The qualified module contributes 106 rigid
placements; exactly 36 further parts form the freestanding base. The final
model has one connected frame, two moving rotors, two hinges, and two native
spring couplings. The ground is its only static simulation body.

This guide describes the exact delivered construction. The authoritative
placement ledger is `geometry.json`; the deterministic source is
`generate_model.py` with `mechanism_geometry.py`. Both LDR and MPD exports
reference standard external part files. The physical bands use the
application's ordinary `!BW BELT` records and are included in `parts.csv`.

## Coordinates, layers, and orientation

One LDraw unit, abbreviated LDU, is 0.4 mm. A Technic hole pitch is 20 LDU,
or 8 mm. Positive Y points downward in the saved model. X and Z describe
the horizontal mechanism plane; the two main shaft axes run along Y.
Coordinates below are part origins unless explicitly identified as hole
centers or material faces.

| Datum | Saved position or interval in LDU |
|---|---|
| Blue input axis | X = −140, Z = 0 |
| Orange passive axis | X = 0, Z = 0 |
| Axis separation | 140, or 56 mm |
| Main keyed rocker layers | Y = 0 |
| Blue and orange main beams | Y = 20 |
| Both band groove center planes | Y = −60 |
| Band anchor lever arms | Z = −20 and +20 relative to each rotor axis |
| Passive wheel centers | (0, −20, −120) and (0, −20, +120) |
| Floor rail center planes | Y = 360 |
| Common actual floor underside | Y = 370 |

The ordinary horizontal rocker beams run along Z with their bores along Y.
Crossbeams described as running along X have their bores along Y. Vertical
posts run along Y with their bores along X. A 15100 angle has a round bore
along Y and a molded pin pointing along X; turn it so that its molded pin
points toward the stated post. All bushes and wheels on a Y shaft have
their own axle-hole axes along Y.

The thin 6632 bridge is unusual: its origin is at one end axle hole, rather
than at the middle. Placing it at Z = −20 puts its two axle holes at Z = −20
and +20 and its central round hole at Z = 0. Its 10 LDU thickness matters in
the retained shaft stacks.

## Inventory

The color IDs are LDraw color IDs: 0 black, 1 blue, 14 yellow, 15 white,
25 orange, 71 light bluish gray, and 72 dark bluish gray. The decorated wheel
part includes its own medium azure tyre; its placement color remains 15.

| Part | Description | Color | Quantity |
|---|---|---:|---:|
| 15100 | Friction pin with perpendicular pin hole | 71 | 18 |
| 2780 | 2L friction pin | 0 | 30 |
| 32278 | 15L beam | 25 | 1 |
| 32278 | 15L beam | 72 | 10 |
| 32316 | 5L beam | 1 | 1 |
| 32523 | 3L beam | 72 | 8 |
| 32524 | 7L beam | 72 | 2 |
| 32525 | 11L beam | 72 | 4 |
| 3706 | 6L axle | 0 | 6 |
| 3707 | 8L axle | 0 | 1 |
| 3713 | Full bush with two flanges | 14 | 4 |
| 3713 | Full bush with two flanges | 71 | 16 |
| 39367p01 | SPIKE 56 mm wheel with integral tyre | 15 | 2 |
| 40490 | 9L beam | 72 | 4 |
| 41239 | 13L beam | 72 | 1 |
| 4265c | Half bush | 71 | 10 |
| 45601 | SPIKE Prime hub | 15 | 1 |
| 54696p01 | SPIKE angular medium motor | 15 | 1 |
| 60485 | 9L axle | 0 | 1 |
| 6558 | 3L friction pin | 1 | 15 |
| 6632 | Thin 3L liftarm with two axle holes | 1 | 1 |
| 6632 | Thin 3L liftarm with two axle holes | 25 | 1 |
| 7229 | 3L beam with central axle hole | 1 | 1 |
| 7229 | 3L beam with central axle hole | 25 | 3 |
| 85546 | Round rubber band, nominal 33 mm centerline diameter | 15 | 2 |

The motor's integral cable is not a separate rigid placement. There is one
motor, connected to hub port A. Both wheel assemblies are passive masses.

The exported construction steps contain 49, 25, 16, 36, and 16 rigid
placements respectively. Fit the two bands during the fifth step after
their anchors and both wheel assemblies are retained.

## Step 1 — connected base, four floor rails, and hub

### Four coplanar floor rails

Lay four gray 15L 32278 beams along Z, centered at:

| Floor rail ID | Center (X, Y, Z) |
|---|---|
| `floor_hub_outer` | (−360, 360, 60) |
| `floor_hub_inner` | (−240, 360, 60) |
| `floor_mechanism_left` | (−100, 360, 60) |
| `floor_mechanism_right` | (60, 360, 60) |

Their hole centers run from Z = −80 through +200. All four undersides are
at Y = 370. They connect through the actual upper frame; no hidden floor
crossbar or fixed-body declaration joins them.

### Four short hub supports

At each combination of X = −360 or −240 and Z = 0 or 120, install a 15100
top angle centered at Y = 300, a 3L 32523 vertical post centered at Y = 320,
and a 15100 foot centered at Y = 340. Both molded pins point into the same
post: toward −X for the X = −360 supports and toward +X for the X = −240
supports. The resulting post centers are X = −380 and −220 respectively.
The post end holes are at Y = 300 and 340.

A 2780 pin centered at Y = 290 joins each top angle to its hub rail, which
will be at Y = 280. Another 2780 centered at Y = 350 joins its foot to the
floor rail at Y = 360. These eight ordinary pins have their collars at the
actual meeting faces of their two 20 LDU layers.

### Four spacer mounts beneath the mechanism

At X = −100 and +60, place one 3L 32523 spacer beam along Z at each of
Z = 0 and 120, with Y = 340. Each spacer lies between the original lower
rail at Y = 320 and its floor rail at Y = 360.

Use two 6558 pins per spacer, at its outer holes Z = center ±20. Each pin
is centered at Y = 340 and spans Y = 310 through 370, filling three real
layers. Its collar is at Y = 330, between the original lower rail and the
spacer. Leave the spacer's center hole empty. In particular, the existing
lower-rail connection at Z = 0 must not receive a second pin.

The four floor rails, four five-part hub supports, and four three-part
spacer mounts are the **36 complete-frame additions** to the proved module.

### Original connected module base and hub

Place two 15L crossbeams along X, centered at (−220, 300, −40) and
(−220, 300, 160). Their hole centers run from X = −360 through −80.
Install two 15L hub rails along Z at (−360, 280, 60) and (−240, 280, 60),
on the four short supports already described.

The hub origin is (−300, 270, 60). Its four selected downward mounting
bores have centers at X = −360 or −240, Y = 260, Z = −40 or 160. Each
uses one 6558 pin centered at Y = 280. The three occupied layers are:

| Member | Occupied Y interval |
|---|---|
| Actual hub mounting bore | 250 to 270 |
| Hub rail | 270 to 290 |
| X crossbeam | 290 to 310 |

The pin spans 250 to 310 and its collar sits at Y = 270. This seats the
actual blind hub bore without putting a pin through the closed housing.
The same four pins join hub, rails, and crossbeams; no additional pin belongs
in those four stacked holes.

Place the 13L 41239 `frame_reference` crossbeam along X at (−60, 300, 0).
Place two lower 15L rails along Z at (−100, 320, 60) and (60, 320, 60),
above their spacer mounts. A 2780 at (−100, 310, 0) joins the reference
crossbeam to the left lower rail. Later motor and bearing feet complete the
other shared stacks. Keep those specified foot holes available.

## Step 2 — fixed motor cradle

Place the 54696p01 motor upright at (−140, 140, 0), with its output axis
along Y and its actual output opening toward negative Y. Assign this motor
explicitly to port A.

Two 11L 32525 side beams run along Z, with bores along X, at
(−180, 120, 60) and (−100, 120, 60). Six black 2780 pins join them to the
motor's real housing sockets. Pin centers are X = −170 or −110,
Y = 120, and Z = −20, +20, or +140. Their 20 LDU inner halves fill the
actual motor sockets; the outer halves fill the side beams.

Add four 9L 40490 vertical posts centered at X = −200 or −80,
Y = 200, Z = −40 or +160. Their hole centers run from Y = 120 to 280.
At the top, 2780 pins centered at X = −190 or −90, Y = 120, and the
matching Z join each post to its side beam.

Each bottom foot is a 15100 centered at X = −180 or −100, Y = 280,
and the matching Z. Its molded pin points outward into the post. Use the
following exact foot fasteners:

| Foot locations | Separate pin | Pin center Y | Occupied layers |
|---|---|---:|---|
| X = −180, Z = −40 or 160 | 2780 | 290 | Foot at 280, crossbeam at 300 |
| X = −100, Z = −40 or 160 | 6558 | 300 | Foot at 280, crossbeam at 300, lower rail at 320 |

The right-hand three-layer stack uses **one 3L pin**. It must not be
replaced by opposing 2L pins in the same bore.

## Step 3 — passive bearing cage

Install two 7L 32524 beams along X at (0, 60, 0) and (0, 100, 0).
Their central round holes, connector `h3`, form the two separated bearings
for the output shaft. Neither bearing receives a friction pin in that
central hole.

At X = −60 and +60, put 15100 angles below the top beam at Y = 80 and
below the lower beam at Y = 120. Their molded pins point outward into
vertical posts at X = −80 and +80. Use 2780 pins centered at Y = 70 and
110 to join the angle bores to the corresponding bearing beams.

The two 11L 32525 posts are centered at (−80, 180, 0) and
(80, 180, 0). Their holes run from Y = 80 to 280. Fit two further
15100 feet at (−60, 280, 0) and (60, 280, 0), with molded pins toward
their posts. The left foot uses a 2780 centered at Y = 290 to join the
reference crossbeam. The right foot uses one 6558 centered at Y = 300
through foot, reference crossbeam, and right lower rail.

The lower-left bearing angle already occupies the post hole at
(−80, 120, 0) with its molded pin. **Do not add a motor-rail crosspin at
(−90, 120, 0).** An early construction audit found that such a pin would
duplicate the molded pin's occupied axial interval. The delivered model
omits it; the lower base already physically connects the frame.

## Step 4 — retained input and passive rotor

### Rocker layers

For each axis, assemble three parallel layers:

| Layer | Input, centered on X = −140 | Output, centered on X = 0 |
|---|---|---|
| Y = −15, thickness 10 | Blue 6632, origin Z = −20 | Orange 6632, origin Z = −20 |
| Y = 0, thickness 20 | Blue 7229, center Z = 0 | Orange 7229, center Z = 0 |
| Y = 20, thickness 20 | Blue 5L 32316, center Z = 0 | Orange 15L 32278, center Z = 0 |

Each 7229 central axle hole keys its rotor to its main shaft. The 6632
bridge's two end axle holes key the two band-anchor shafts. Those shafts
also pass through the round outer holes of the 7229 and through the main
beam. Two distinct parallel shaft lines 40 LDU apart prevent the layers
from rotating relative to one another. Retainers on both outer faces keep
the layers together axially.

The native compiler reports four specific `locked-hinges` warnings while
recognizing this legitimate rigid construction: two for each rocker. Their
exact part sets and physical justification are preserved by
`runtime/diagnostics.mjs`. They are not artificial weld declarations or a
reason to discard unrelated preparation warnings.

### Four retained band-anchor shafts

Build the following identical stack at each rotor's Z = −20 and +20.
Every shaft is a 6L 3706, centered at Y = −20 and spanning −80 to +40.
Read the table from the upper end toward the lower end:

| Member | Center Y | Occupied Y interval |
|---|---:|---|
| Deliberate exposed axle tail | — | −80 to −70 |
| Yellow full 3713 band bush | −60 | −70 to −50 |
| Gray full 3713 spacer | −40 | −50 to −30 |
| Gray 4265c half bush | −25 | −30 to −20 |
| Thin 6632 keyed bridge | −15 | −20 to −10 |
| 7229 round outer bore | 0 | −10 to +10 |
| Main beam round bore | 20 | +10 to +30 |
| Gray 4265c lower retainer | 35 | +30 to +40 |

The yellow bushes are the band seats. Their waists are at Y = −60, above
both main shaft tips and above the wheel bodies. Do not place ordinary pins
in the round beam holes already filled by these anchor axles.

### Input main shaft

Use one 8L 3707 axle centered at (−140, 30, 0), spanning Y = −50 to 110.
The exact stack is:

| Member | Occupied Y interval |
|---|---|
| Deliberate exposed upper tail | −50 to −30 |
| Half-bush top retainer, center −25 | −30 to −20 |
| Thin bridge central round bore | −20 to −10 |
| 7229 central keyed bore | −10 to +10 |
| Main beam central round bore | +10 to +30 |
| Three full bushes, centers 40, 60, 80 | +30 to +90 |
| Actual motor output cross socket | +90 to +110 |

The shaft's nominal lower end is exactly Y = 110. The source motor cross
socket ends there; its narrower internal continuation is not another usable
axle socket. Do not extend the shaft farther into the motor.

### Passive main shaft

Use one 9L 60485 axle centered at (0, 40, 0), spanning Y = −50 to 130.
Its upper tail, half-bush retainer, bridge, key, and beam occupy the same
intervals as the input stack through Y = 30. Continue with:

| Member | Occupied Y interval |
|---|---|
| Full spacer bush, center 40 | 30 to 50 |
| Fixed upper bearing beam, center 60 | 50 to 70 |
| Full spacer bush, center 80 | 70 to 90 |
| Fixed lower bearing beam, center 100 | 90 to 110 |
| Full lower retainer, center 120 | 110 to 130 |

The axle rotates inside the two fixed round bearing holes. Bushes rotate
with the axle and retain the stack on both sides. The two bearings prevent
the output from being supported by a single cantilevered round hole.

## Step 5 — balanced masses, bands, and reset

### Two retained wheel masses

The two 39367p01 wheels are centered at (0, −20, −120) and
(0, −20, +120), with their axle axes along Y. Each uses a 6L 3706 shaft
centered at Y = 10, spanning −50 through +70. The shaft carries:

| Member | Center Y | Actual support interval Y |
|---|---:|---|
| Full upper bush | −40 | −50 to −30 |
| Wheel's central hub support faces | −20 | −30 to −10 |
| Full spacer bush | 0 | −10 to +10 |
| Existing output beam | 20 | +10 to +30 |
| Orange 7229 wheel key | 40 | +30 to +50 |
| Full lower retainer | 60 | +50 to +70 |

Join each wheel key to the output beam with two 2780 pins centered at
Y = 30 and Z = wheel center ±20. Thus the negative-Z wheel uses Z = −140
and −100; the positive-Z wheel uses Z = +100 and +140. The 7229 center
axle hole keys the shaft, and the wheel is keyed to that same shaft. These
are rigidly carried masses, not free-spinning wheels.

**Wheel bore length and support width are different.** The actual source
cross bore runs from wheel-local Z = −10 to +8, a length of 18 LDU. Its
surrounding support faces are at local Z = −10 and +10, 20 LDU apart.
With the delivered wheel placement, the actual cross bore is Y = −30 to
−12 and the retaining support faces are Y = −30 and −10. Native metadata
centers its 18 LDU bore at the wheel origin, giving Y = −29 to −11; both
representations are fully covered by the real shaft. The bushes seat
against the **actual 20 LDU support width**. Using an 18 LDU gap between
the two bushes would put a retainer into the wheel's material.

### Two separate, uncrossed bands

Fit one 85546 band around `input_band_neg` and `output_band_neg`, and the
other around `input_band_pos` and `output_band_pos`. Both bands sit in the
yellow bush waists at Y = −60. They do not cross and do not wrap around
either central main shaft. The actual native records are:

```text
0 !BW BELT spring_neg 85546.dat input_band_neg output_band_neg
0 !BW BELT spring_pos 85546.dat input_band_pos output_band_pos
```

A 3713 band bush has a nominal 7 LDU waist radius, with 9 LDU retaining
flanges. The round band's tube radius is 2 LDU, so its intended taut
centerline runs at radius 9 LDU around each waist. The band's 4 LDU axial
diameter fits within the 12 LDU straight waist region, leaving 4 LDU axial
margin to each flange transition. The independent audit records the tiny
source-vertex rounding of the nominal 7 LDU waist explicitly.

At reset, corresponding anchor centers are 140 LDU apart and the two
rotors are parallel along Z. The matched pretensions cancel in yaw. The
raised band tube occupies Y = −62 to −58; the central shaft tips stop at
Y = −50, giving 8 LDU axial clearance. Wheel bodies also remain below this
band plane. Keep both band seats on the specified layer when assembling.

Connect the motor's integral cable to hub port A. Route the cable along the
fixed frame below the rocker layers, away from the band routes and wheel
sweep. No moving cable service loop is needed because both hub and motor
housing are fixed to the frame; cable flexibility is not simulated.

## Running the experiments

Load `models/resonance-lab.ldr` or the equivalent MPD. Before **each**
experiment, reload the saved model so that both rotors begin from the
unexcited saved pose. Use the slow, main, or fast exported program:

| Program | Requested motor speed | Physical target sequence |
|---|---:|---|
| `programs/resonance-lab-slow.bw` | 5°/s | 0 → +2° → (−2° → +2°) × 4 → 0 |
| `programs/resonance-lab.bw` | 13°/s | Same finite sequence |
| `programs/resonance-lab-fast.bw` | 80°/s | Same finite sequence |

Each program begins with a 0.5 s hold and finishes with a 10 s input hold.
Only the blue input is commanded. The orange output continues its natural
ringdown after the input returns to zero. Its continuing motion is part of
the experiment; it is not an unfinished motor move. Use the delivered
motor-sign convention established by the actual sign probe.

Requested motor speed is not the measured forcing frequency. Endpoint
settling, controller behavior, and VM timing affect the actual rhythm.
The validation measures the blue input and orange output from actual body
poses and compares their response in fixed finite-burst windows. Consult
`validation/RESULTS.md` for measured complete-machine results, frequency,
gain, phase, and the disclosed native-model limitations.

## Construction qualification and limits

The complete independent audit is `validation/geometry-audit.json`. It
checks all **10,011 saved-pose part pairs**, including parts within the same
rigid body. It also checks **5,292 pairs between different intended bodies**
over the full independent input range −3° to +3° and passive output range
−35° to +35°. Its 5,589 conservative interval checks include both regions
of the factory motor rotor. This covers every combination of the two
angles within that rectangle, rather than only a sampled motion path.

All 45 separate pin stacks, 41 keyed interfaces, and eight retained shaft
stacks pass. The audit checks actual motor socket depth, all six motor
mount sockets, the source wheel support faces, duplicate male occupancy,
pin collars, bush retention, both band paths, and their flange seating.
The minimum separation between the two intended taut band tubes is
10.7660818 LDU throughout the declared angle rectangle. The lowest moving
factory-rotor envelope reaches Y = 170, leaving 200 LDU to the floor
underside at Y = 370; the external moving shafts and masses have more
clearance than that factory envelope.

The angle rectangle is a **qualification envelope**, not a pair of physical
end stops or a new constraint in the model. The delivered small-angle
programs and their guards are intended to remain inside it, including
reversal overshoot and final ringdown. A different amplitude, long burst,
unbounded spin, altered mass, or different band requires a new check.

The native spring law uses a 7 LDU anchor-circle radius and a tension-only
linear spring approximation. The intended visible band's centerline uses
9 LDU because of the band's own thickness. Those conventions are recorded
separately; neither the simulated spring coefficients nor the displayed
smoothed band spline are a calibration of an actual rubber band. The
source-mesh construction audit certifies the intended taut band route and
rigid assembly geometry, while native tests qualify the observed body
motion and base stability. This delivery is not a physical build or a
measurement of strength, wear, friction, or manufacturing tolerances.

For exact reproduction and evidence-preserving reruns, use `REPRODUCE.md`.
Keep the original qualified reports and frozen prototype inputs unchanged.
