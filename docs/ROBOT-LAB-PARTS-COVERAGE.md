# Robot Lab part library: coverage of the derived parts

Written by `node scripts/derive-part-meta.mjs --lib <LDraw library> --generate scripts/derive-part-meta.parts.txt --report-md <this file>` — do not edit by hand.

Parts in `overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json` marked `"derived": true` were derived from their official LDraw
files by `scripts/derive-part-meta.mjs`; the others are measured by hand. A derived part is admitted only when the deriver's
`selfCheck` passes (the rules of `test/bw-sim-part-meta.test.mjs`), and the tests then check the shipped file independently.

## How a part is derived

- **Connectors** come from LDraw's connection primitives with their placements composed down to the part frame
  (`ldraw/ldraw-geometry.js` `flattenPart`, which reports each primitive's ancestry): bore walls of radius 6 LDU and the Technic
  hole composites (connhole, connhol2, connhol3 — blind, `closedEnd` —, peghole\*, beamhol\*) are pin holes when the wall faces
  into its line (the mesh's outward BFC winding) and goes at least half round it; facing out of the line they are pins
  (`friction` from confric\*), merged across a collar; the axl\* profiles are axle holes or axles the same way; a gear's
  axle-hole sub-files are its hole; top-stud primitives are studs; towballs are 8 LDU sphere primitives; rack teeth and worm
  threads are measured as their tests measure them. Lengths round to the 10 LDU Technic lattice within 2 LDU (LDraw draws a
  blind hole 18 deep and a counterbore-less slot 16); a hole through a plate keeps the plate's 8 LDU.
- **Anti-studs** are measured, not assumed: every stud-grid cell of a System part's bottom face where a stud fits (no mesh within
  5.5 LDU of its axis over the 4 LDU it reaches in) and is gripped (walls or tubes within 8.6 LDU). **Tubes** are the bottoms of the
  open underside tubes (stud4\*): a stud seats there too (kinds/stud.js `tube`).
- **Colliders**: a region box around every pin and axle, the stud layer as region `stud` (it sits in the hollow underside of the
  part on top), and solid boxes for the body — along the part's straight hole chains (bent liftarms, frames, T/H beams), else its
  outer envelope seen along its hole axis (System parts: from the top surface down to the bottom face, the hollow underside
  filled; slopes in 4 LDU stairs); a round body is a cylinder.
- **Mass** = mesh volume (divergence theorem over the outward-wound mesh) × ABS density **1.05 g/cm³** (ABS 1.04–1.06; LEGO
  elements are ABS). LDraw's walls are drawn at nominal thickness, so a 2 × 4 brick comes out 2.67 g (a real one weighs about 2.3 g).
- **Names**: the LDraw header description in the catalogue's sentence case; `nameDe` from a small term dictionary
  (Brick → Stein, Plate → Platte, Tile → Fliese, Slope Brick → Schräge, Beam → Lochbalken, Axle → Achse, Gear → Zahnrad, …), marked
  `nameDeGenerated: true`; the palette category from the description (Brick, Plate, Tile, Slope are new palette categories).

## Agreement with the hand-measured parts

68 hand-measured parts, 323 hand connectors: 315 matched by a derived connector of the same type on
the same line within 0.5 LDU; 46 parts agree exactly (same connectors, lengths and blind ends). Hand entries are
kept as they are; every difference is explained below (a derived connector the hand entry lacks is listed as "derived only").

| Part | Name | Matched | Hand only | Derived only | Length / blind end differs | Why |
|---|---|---|---|---|---|---|
| 32523.dat | Technic beam 3 | 3 | — | — | — | agrees |
| 32524.dat | Technic beam 7 | 7 | — | — | — | agrees |
| 2780.dat | Technic pin with friction | 1 | — | — | — | agrees |
| 3673.dat | Technic pin without friction | 1 | — | — | — | agrees |
| 3705.dat | Technic axle 4 | 1 | — | — | — | agrees |
| 3647.dat | Technic gear 8 tooth | 1 | — | — | — | agrees |
| 3648.dat | Technic gear 24 tooth | 1 | — | pinhole [10,10,0] L15.5<br>pinhole [-10,10,0] L15.5<br>pinhole [-10,-10,0] L15.5<br>pinhole [10,-10,0] L15.5 | — | LDraw draws four 6 LDU bores at (±10, ±10) beside the axle hole. They are 14.1 LDU from it, under the contract's 15.5 LDU hole pitch, so they are no pin seats; the hand entry is right to leave them out (and the deriver rejects 3648a for them). |
| 39367p01.dat | Wheel 56 x 14 with medium azure tyre (SPIKE Prime) | 0 | axlehole [0,0,0] L18 | 9 (pinhole [0,20,0] L20, pinhole [0,40,0] L20, …) | — | The hub's 8 pin holes are real LDraw bores the hand entry left out. The axle hole is drawn 20 long at z −11..9 (axl* primitives), 1 LDU off the hand entry's 18 centred at 0. |
| 39370.dat | Technic beam 5 x 3 H-shaped with ball socket | 9 | ballsocket [0,46,0] | pinhole [0,16.791,0] L10 | — | The ball socket is not an LDraw connection primitive (the hand entry takes it from the castor assembly 39370c01). The deriver also finds a 10 LDU vertical bore over the socket (y 12..22). |
| 52629.dat | Technic ball 19 mm for ball castor | 0 | ball [0,0,0] | — | — | The castor ball is a plain 24 LDU sphere, no towball primitive: measured by hand from the castor assembly. |
| 54696p01.dat | SPIKE medium angular motor | 23 | — | axlehole [0,20,0] L20 | — | LDraw draws an axle profile on the housing's far side (y 10..30) that the hand entry does not list. |
| 45601.dat | SPIKE Prime hub | 44 | — | — | — | agrees |
| 32316.dat | Technic beam 5 | 5 | — | — | — | agrees |
| 40490.dat | Technic beam 9 | 9 | — | — | — | agrees |
| 32525.dat | Technic beam 11 | 11 | — | — | — | agrees |
| 41239.dat | Technic beam 13 | 13 | — | — | — | agrees |
| 32278.dat | Technic beam 15 | 15 | — | — | — | agrees |
| 32062.dat | Technic axle 2 notched | 1 | — | — | — | agrees |
| 4519.dat | Technic axle 3 | 1 | — | — | — | agrees |
| 32073.dat | Technic axle 5 | 1 | — | — | — | agrees |
| 3706.dat | Technic axle 6 | 1 | — | — | — | agrees |
| 3707.dat | Technic axle 8 | 1 | — | — | — | agrees |
| 6558.dat | Technic pin 3L with friction | 1 | — | — | — | agrees |
| 43093.dat | Technic axle pin with friction | 2 | — | — | — | agrees |
| 3713.dat | Technic bush | 1 | — | — | — | agrees |
| 4265c.dat | Technic half bush | 1 | — | — | — | agrees |
| 94925.dat | Technic gear 16 tooth | 1 | — | — | — | agrees |
| 3649.dat | Technic gear 40 tooth | 1 | — | 16 (pinhole [10,10,0] L15.5, pinhole [10,30,-0.05] L15.5, …) | — | The 40T gear's web has 12 pin holes and 4 axle holes, 15.5 LDU deep; the hand entry lists only the centre hole. |
| 6589.dat | Technic gear 12 tooth bevel | 0 | axlehole [0,0,0] L10 | axlehole [0,0,3.5] L7 | — | Hand-measurement error: the axle hole is drawn 7 deep (z 0..7; the gear spans z −3..7); the hand entry centres a 10 LDU hole at z 0, so its segment runs z −5..5, 2 LDU out of the gear's back and 2 short of its hub face (the axle-line test checks only the line, not the ends). 7 LDU is under the seat rule's 8, which is why the deriver rejects such bevel gears. |
| 32198.dat | Technic gear 20 tooth bevel | 0 | axlehole [0,0,0] L10 | axlehole [0,0,-3.5] L7 | — | Hand-measurement error: as 6589, mirrored — the hole is drawn z −7..0 (the gear spans z −7..3); the hand entry has 10 centred at 0. |
| 54675.dat | SPIKE large angular motor | 17 | — | 21 (pinhole [40,-20,0] L20, pinhole [40,20,0] L20, …) | — | 21 further blind side holes (connhol3) the hand entry does not list; four of its blind holes are written with the opposite axis and closedEnd — the same bottom. |
| 37308.dat | SPIKE colour sensor | 4 | — | pinhole [20,0,0] L20<br>pinhole [-20,0,0] L20 | — | Two further blind holes (connhol3) on the sensor's sides the hand entry does not list. |
| 37316.dat | SPIKE distance sensor | 4 | — | pinhole [60,0,0] L20<br>pinhole [-60,0,0] L20 | — | Two further blind holes (connhol3) the hand entry does not list. |
| 37312.dat | SPIKE force sensor | 4 | — | 11 (pinhole [20,20,-20] L20, pinhole [-20,20,-20] L20, …) | — | 10 further blind holes (connhol3) and an axle hole the hand entry does not list. |
| 32526.dat | Technic beam 3 x 5 L-shaped | 7 | — | — | — | agrees |
| 32140.dat | Technic beam 2 x 4 L-shaped | 5 | — | — | — | agrees |
| 64179.dat | Technic frame 5 x 7 open centre | 8 | — | 12 (pinhole [20,0,-60] L20, pinhole [20,0,60] L20, …) | — | The frame's 12 perpendicular side holes are real LDraw bores the hand entry left out. |
| 39794.dat | Technic frame 5 x 11 open centre | 16 | — | 16 (pinhole [-60,0,40] L20, pinhole [60,0,40] L20, …) | — | The frame's 16 perpendicular side holes are real LDraw bores the hand entry left out. |
| 6536.dat | Technic axle and pin connector perpendicular | 2 | — | — | — | agrees |
| 32184.dat | Technic axle and pin connector perpendicular 3L with centre pin hole | 3 | — | — | — | agrees |
| 32039.dat | Technic axle connector with axle hole | 2 | — | — | — | agrees |
| 42003.dat | Technic axle and pin connector perpendicular 3L with 2 pin holes | 3 | — | — | — | agrees |
| 6632.dat | Technic thin liftarm 1 x 3 | 3 | — | — | — | agrees |
| 32449.dat | Technic thin liftarm 1 x 4 | 4 | — | — | — | agrees |
| 49295p01.dat | Wheel 88 x 14 with medium azure tyre (SPIKE Prime large) | 1 | — | 28 (pinhole [0,-80,0] L20, pinhole [0,-60,0] L20, …) | axlehole L18 → L20 | 28 hub pin holes the hand entry left out; the axle hole is drawn 20 long (z −10..10), the hand entry has 18. |
| 3749.dat | Technic axle pin without friction | 2 | — | — | — | agrees |
| 32054.dat | Technic pin 2L with stop bush | 1 | — | axlehole [-20,0,0] L20 | — | The stop bush has an axle hole (axl* primitives, x −30..−10) the hand entry left out. |
| 32348.dat | Technic liftarm 1 x 7 bent 4 x 4 | 7 | — | — | — | agrees |
| 6629.dat | Technic liftarm 1 x 9 bent 6 x 4 | 9 | — | — | — | agrees |
| 32009.dat | Technic liftarm 1 x 11.5 double bent | 12 | — | — | pinhole L20 → L16<br>pinhole L20 → L16 | The slot ends are drawn 16 deep (half cylinders, no counterbore); the hand entry rounds them to 20. |
| 60483.dat | Technic beam 2 with axle hole | 2 | — | — | — | agrees |
| 41678.dat | Technic axle and pin connector perpendicular 2 x 2 split | 4 | — | — | — | agrees |
| 32002.dat | Technic pin 3/4 | 1 | — | — | — | agrees |
| 87082.dat | Technic pin 3L with centre pin hole | 3 | — | — | — | agrees |
| 2736.dat | Technic axle towball | 2 | — | — | axle L17.5 → L17 | The towball stub is drawn 17 long to its end cap; the hand entry has 17.5 (within 0.5). |
| 4716.dat | Technic worm gear | 2 | — | — | — | agrees |
| 32063.dat | Technic thin liftarm 1 x 6 | 6 | — | — | — | agrees |
| 32065.dat | Technic thin liftarm 1 x 7 | 7 | — | — | — | agrees |
| 3737.dat | Technic axle 10 | 1 | — | — | — | agrees |
| 3708.dat | Technic axle 12 | 1 | — | — | — | agrees |
| 87083.dat | Technic axle with stop | 1 | — | — | — | agrees |
| 32269.dat | Technic gear 20 tooth double bevel | 1 | — | — | — | agrees |
| 32270.dat | Technic gear 12 tooth double bevel | 1 | — | — | — | agrees |
| 32498.dat | Technic gear 36 tooth double bevel | 5 | — | — | — | agrees |
| 64781.dat | Technic gear rack 1 x 13 with holes | 4 | rack-teeth [0,-5,0] L176 | — | — | Rack teeth: the deriver's tooth-crest detection finds no even π·2.5 LDU pitch on this rack (its teeth meet the hole ends); kept as measured by hand. |
| 3743.dat | Technic gear rack 1 x 4 | 1 | — | — | rack-teeth L80 → L74 | Rack teeth: the deriver measures the toothed length from the first tooth crest to the last (74); the hand entry has the whole rack (80). Both pass the rack test's 8 LDU end tolerance. |
| 48496.dat | Technic toggle joint smooth, double, with 2 pins | 2 | slide-bore [0,-30,-25] L10<br>slide-bore [0,-30,25] L10 | pinhole [0,-5,0] L10<br>pinhole [0,-30,-25] L10<br>pinhole [0,-30,25] L10 | pin L19 → L20<br>pin L19 → L20 | The eyes are the same bores; the hand entry types them slide-bore (an axle slides in them, kinds/slide.js), a modelling choice the geometry cannot make. The pins are drawn 20 long at y 0..20; the hand entry has 19 at 10.5. LDraw also draws a vertical bore at the toggle's middle (y −10..0). |
| 2823.dat | Technic forklift fork | 1 | — | 9 (stud [0,0,10] L4, stud [0,0,-10] L4, …) | pinhole L16 → L20 | The fork's two studs and two anti-stud cells (System connectivity did not exist when it was measured); its cross hole is drawn 20 long, the hand entry has 16. |

## Derived parts by palette category

| Category | Parts |
|---|---|
| beam | 27 |
| axle | 15 |
| pin | 18 |
| connector | 33 |
| gear | 10 |
| brick | 49 |
| plate | 47 |
| tile | 17 |
| slope | 18 |
| other | 8 |
| **total** | **242** (and 56 listed parts already measured by hand) |

<details><summary>Every derived part</summary>

| Part | Name | Category | Mass (g) | Connectors | Colliders |
|---|---|---|---|---|---|
| 18654.dat | Technic beam 1 | beam | 0.16 | 1 pinhole | 1 |
| 43857.dat | Technic beam 2 | beam | 0.43 | 2 pinhole | 1 |
| 7229.dat | Technic beam 3 with center axle hole | beam | 0.7000000000000001 | 2 pinhole, 1 axlehole | 1 |
| 41677.dat | Technic beam 2 x 0.5 liftarm | beam | 0.28 | 2 axlehole | 1 |
| 32017.dat | Technic beam 5 x 0.5 | beam | 0.58 | 5 pinhole | 1 |
| 11478.dat | Technic beam 5 x 0.5 liftarm with axle holes at both ends | beam | 0.62 | 3 pinhole, 2 axlehole | 1 |
| 60484.dat | Technic beam 3 x 3 T-shaped | beam | 1.18 | 5 pinhole | 2 |
| 71708.dat | Technic beam 2 x 3 liftarm bent 90 quarter ellipse | beam | 1.22 | 3 pinhole, 1 axlehole | 1 |
| 80286.dat | Technic beam 2 x 5 liftarm bent 90 quarter ellipse | beam | 1.98 | 5 pinhole, 1 axlehole | 1 |
| 32056.dat | Technic beam 3 x 3 x 0.5 liftarm bent 90 | beam | 0.64 | 2 pinhole, 3 axlehole | 2 |
| 32249.dat | Technic beam 3 x 3 x 0.5 liftarm bent 90 quarter circle | beam | 0.87 | 2 pinhole, 3 axlehole | 1 |
| 32250.dat | Technic beam 3 x 5 x 0.5 liftarm bent 90 quarter ellipse | beam | 1.25 | 4 pinhole, 3 axlehole | 1 |
| 32251.dat | Technic beam 5 x 7 x 0.5 liftarm bent 90 quarter ellipse | beam | 1.9100000000000001 | 8 pinhole, 3 axlehole | 1 |
| 32271.dat | Technic beam 3 x 7 liftarm bent 53.13 | beam | 2.36 | 7 pinhole, 2 axlehole | 2 |
| 3916.dat | Technic beam 3 x 9 liftarm bent 90 quarter ellipse | beam | 4.38 | 10 pinhole, 1 axlehole | 1 |
| 43464.dat | Technic beam 4 x 3 liftarm triangle | beam | 1.62 | 3 pinhole, 2 axlehole | 1 |
| 2905.dat | Technic beam 5 x 3 x 0.5 liftarm triangle | beam | 0.9 | 5 pinhole, 2 axlehole | 2 |
| 99773.dat | Technic beam 5 x 3 x 0.5 liftarm triangle type 2 | beam | 0.92 | 5 pinhole, 2 axlehole | 2 |
| 14720.dat | Technic beam 5 x 3 H-shaped | beam | 1.85 | 9 pinhole | 3 |
| 64178.dat | Technic beam 11 x 5 with open center 5 x 3 | beam | 7.37 | 28 pinhole | 4 |
| 39790.dat | Technic beam 15 x 11 with open center 13 x 9 | beam | 13.84 | 48 pinhole | 4 |
| 3704.dat | Technic axle 2 | axle | 0.2 | 1 axle | 1 |
| 44294.dat | Technic axle 7 | axle | 0.71 | 1 axle | 1 |
| 60485.dat | Technic axle 9 | axle | 0.92 | 1 axle | 1 |
| 23948.dat | Technic axle 11 | axle | 1.1300000000000001 | 1 axle | 1 |
| 50451.dat | Technic axle 16 | axle | 1.6400000000000001 | 1 axle | 1 |
| 24316.dat | Technic axle 3 with stop | axle | 0.27 | 1 axle | 1 |
| 15462.dat | Technic axle 5 with stop | axle | 0.44 | 1 axle | 1 |
| 55013.dat | Technic axle 8 with stop | axle | 0.7000000000000001 | 1 axle | 1 |
| 32209.dat | Technic axle 5.5 with stop type 1 | axle | 0.56 | 1 axle | 1 |
| 59426.dat | Technic axle 5.5 with stop type 2 | axle | 0.5700000000000001 | 1 axle | 1 |
| 99008.dat | Technic axle 4 with middle cylindrical stop | axle | 0.45 | 1 axle | 1 |
| 4459.dat | Technic pin with friction | pin | 0.2 | 1 pin | 1 |
| 61332.dat | Technic pin with friction type 2 | pin | 0.2 | 1 pin | 1 |
| 4274.dat | Technic pin 1/2 | pin | 0.11 | 1 pin, 1 stud | 2 |
| 89678.dat | Technic pin 1/2 with friction | pin | 0.11 | 1 pin, 1 stud | 2 |
| 77765.dat | Technic pin long with end stop | pin | 0.27 | 1 pin | 1 |
| 42924.dat | Technic pin long with friction type 2 | pin | 0.31 | 1 pin | 1 |
| 39888.dat | Technic pin long without friction type 2 | pin | 0.29 | 1 pin | 1 |
| 32556a.dat | Technic pin long without friction with single slot | pin | 0.3 | 1 pin | 1 |
| 32556b.dat | Technic pin long without friction with dual slots | pin | 0.29 | 1 pin | 1 |
| 65304.dat | Technic pin long with stop bush type 2 | pin | 0.34 | 1 pin, 1 axlehole | 2 |
| 11214.dat | Technic axle pin long with friction with 2L pin | pin | 0.33 | 1 pin, 1 axle | 1 |
| 18651.dat | Technic axle pin long with friction with 2L axle | pin | 0.29 | 1 pin, 1 axle | 1 |
| 65249.dat | Technic axle pin long without friction with 2L axle | pin | 0.28 | 1 pin, 1 axle | 1 |
| 6628.dat | Technic pin towball with friction | pin | 0.25 | 1 pin, 1 ball | 1 |
| 15100.dat | Technic pin with friction with perpendicular pin hole type 1 | pin | 0.35000000000000003 | 1 pinhole, 1 pin | 2 |
| 65487.dat | Technic pin with friction with perpendicular pin hole type 2 | pin | 0.36 | 1 pinhole, 1 pin | 2 |
| 44874.dat | Technic pin long with pin hole type 2 | pin | 0.55 | 1 pinhole, 2 pin | 3 |
| 32138.dat | Technic pin 3L double with axlehole | pin | 1.09 | 4 pin, 1 axlehole | 5 |
| 6538a.dat | Technic axle joiner | connector | 0.48 | 1 axlehole | 1 |
| 6538b.dat | Technic axle joiner offset | connector | 0.46 | 1 axlehole | 1 |
| 59443.dat | Technic axle joiner inline smooth | connector | 0.36 | 1 axlehole | 1 |
| 26287.dat | Technic axle joiner 3L | connector | 0.54 | 2 axlehole | 1 |
| 42195.dat | Technic axle joiner 3L with two flat sides | connector | 0.53 | 2 axlehole | 1 |
| 32013.dat | Technic angle connector #1 | connector | 0.44 | 1 pinhole, 1 axlehole | 1 |
| 32034.dat | Technic angle connector #2 (180 degree) | connector | 0.72 | 1 pinhole, 2 axlehole | 1 |
| 32016.dat | Technic angle connector #3 (157.5 degree) | connector | 0.72 | 1 pinhole, 2 axlehole | 1 |
| 32192.dat | Technic angle connector #4 (135 degree) | connector | 0.72 | 1 pinhole, 2 axlehole | 2 |
| 32015.dat | Technic angle connector #5 (112.5 degree) | connector | 0.72 | 1 pinhole, 2 axlehole | 2 |
| 32014.dat | Technic angle connector #6 (90 degree) | connector | 0.72 | 1 pinhole, 2 axlehole | 1 |
| 10288.dat | Technic angle connector (3 x 120 degree) | connector | 1.01 | 1 pinhole, 3 axlehole | 3 |
| 42135.dat | Technic connector (axle/bush) type 2 | connector | 0.28 | 2 axlehole | 1 |
| 32068.dat | Technic cross block 1 x 3 (axle/none/pin) | connector | 0.75 | 1 pinhole, 1 axlehole | 2 |
| 32291.dat | Technic cross block 2 x 2 (axle/twin pin) | connector | 0.51 | 2 pinhole, 1 axlehole | 2 |
| 44809.dat | Technic cross block 2 x 2 bent 90 (pin/pin/pin) | connector | 0.58 | 3 pinhole | 1 |
| 32557.dat | Technic cross block 2 x 3 (pin/pin/twin pin) | connector | 0.77 | 4 pinhole | 2 |
| 63869.dat | Technic cross block 3 x 2 (axle/triple pin) | connector | 0.84 | 3 pinhole, 1 axlehole | 1 |
| 98989.dat | Technic cross block 2 x 4 (axle/pin/pin/twin pin) | connector | 0.93 | 4 pinhole, 1 axlehole | 2 |
| 80910.dat | Technic cross block 2 x 4 split (pin/axle/axle/pin) | connector | 1.12 | 2 pinhole, 2 axlehole | 2 |
| 92907.dat | Technic cross block 2 x 2 x 2 bent 90 split (pin/twin axle) | connector | 1.03 | 1 pinhole, 4 axlehole | 1 |
| 48989.dat | Technic cross block 1 x 3 (pin/pin/pin) with 4 pins | connector | 1.55 | 3 pinhole, 4 pin | 5 |
| 32126.dat | Technic connector toggle joint smooth | connector | 0.24 | 1 pinhole, 1 axlehole | 1 |
| 87408.dat | Technic connector toggle joint double with axle and pin holes | connector | 1.25 | 5 pinhole, 2 axlehole | 3 |
| 3651.dat | Technic connector (pin/bush) with 2 studs | connector | 0.56 | 1 pinhole, 1 axlehole, 2 stud, 1 antistud | 3 |
| 6553.dat | Technic connector (axle) with axle 1.5 | connector | 0.47000000000000003 | 1 axlehole, 1 axle | 2 |
| 22961.dat | Technic axle with perpendicular pin hole | connector | 0.38 | 1 pinhole, 1 axle | 2 |
| 5713.dat | Technic axle 3L with perpendicular pin hole | connector | 0.59 | 1 pinhole, 1 axle | 2 |
| 27940.dat | Technic axle 3L with middle perpendicular pin hole | connector | 0.6 | 1 axlehole, 2 axle | 3 |
| 39793.dat | Technic connector block 3 x 3 with 9 perpendicular holes | connector | 2.2 | 9 pinhole | 1 |
| 32123a.dat | Technic bush 1/2 smooth with axle hole reduced | axle | 0.08 | 1 axlehole | 1 |
| 32123b.dat | Technic bush 1/2 smooth with axle hole semi-reduced | axle | 0.08 | 1 axlehole | 1 |
| 4265a.dat | Technic bush 1/2 type 1 | axle | 0.07 | 1 axlehole | 1 |
| 6577.dat | Technic bush 1/2 type 2 | axle | 0.06 | 1 axlehole | 1 |
| 10928.dat | Technic gear 8 tooth reinforced | gear | 0.29 | 1 axlehole | 1 |
| 69778.dat | Technic gear 12 tooth | gear | 0.5 | 1 axlehole | 1 |
| 69779.dat | Technic gear 20 tooth | gear | 1.23 | 1 axlehole | 1 |
| 18575.dat | Technic gear 20 tooth double bevel reinforced | gear | 1.26 | 1 axlehole | 1 |
| 46372.dat | Technic gear 28 tooth double bevel | gear | 2.27 | 4 pinhole, 1 axlehole | 1 |
| 15457.dat | Technic worm gear 3L with bush ends | gear | 0.5700000000000001 | 2 axlehole, 1 worm | 1 |
| 6630.dat | Technic gear rack 1 x 8 with holes | gear | 1.42 | 2 pinhole, 1 rack-teeth | 1 |
| 6592.dat | Technic gear rack 1 x 10 with holes | gear | 1.83 | 2 pinhole, 1 rack-teeth | 1 |
| 32132.dat | Technic gear rack 1 x 12 with holes | gear | 2.19 | 2 pinhole, 1 rack-teeth | 17 |
| 32185.dat | Technic gear rack 1 x 14 with holes | gear | 2.5500000000000003 | 2 pinhole, 1 rack-teeth | 1 |
| 62520.dat | Technic universal joint 3L end | connector | 0.19 | 1 axlehole | 1 |
| 3712.dat | Technic universal joint 4L end with bush end | connector | 0.29 | 1 axlehole | 1 |
| 575.dat | Technic universal joint 4L end with slotted end | connector | 0.37 | 1 axlehole | 1 |
| 6541.dat | Technic brick 1 x 1 with hole | brick | 0.45 | 1 pinhole, 1 stud, 1 antistud | 2 |
| 73230.dat | Technic brick 1 x 1 with axlehole | brick | 0.47000000000000003 | 1 axlehole, 1 stud, 1 antistud | 2 |
| 3700.dat | Technic brick 1 x 2 with hole | brick | 0.8300000000000001 | 1 pinhole, 2 stud, 2 antistud | 2 |
| 32000.dat | Technic brick 1 x 2 with holes | brick | 0.79 | 2 pinhole, 2 stud, 2 antistud | 2 |
| 3701.dat | Technic brick 1 x 4 with holes | brick | 1.56 | 3 pinhole, 4 stud, 4 antistud | 2 |
| 3894.dat | Technic brick 1 x 6 with holes | brick | 2.29 | 5 pinhole, 6 stud, 6 antistud | 2 |
| 3702.dat | Technic brick 1 x 8 with holes | brick | 3.02 | 7 pinhole, 8 stud, 8 antistud | 2 |
| 2730.dat | Technic brick 1 x 10 with holes | brick | 3.75 | 9 pinhole, 10 stud, 10 antistud | 2 |
| 3895.dat | Technic brick 1 x 12 with holes | brick | 4.48 | 11 pinhole, 12 stud, 12 antistud | 2 |
| 32018.dat | Technic brick 1 x 14 with holes | brick | 5.21 | 13 pinhole, 14 stud, 14 antistud | 2 |
| 3703.dat | Technic brick 1 x 16 with holes | brick | 5.94 | 15 pinhole, 16 stud, 16 antistud | 2 |
| 5565.dat | Technic brick 1 x 3 with holes | brick | 1.17 | 3 pinhole, 3 stud, 3 antistud | 2 |
| 3709b.dat | Technic plate 2 x 4 with holes | plate | 1.32 | 3 pinhole, 8 stud, 8 antistud, 3 tube | 2 |
| 32001.dat | Technic plate 2 x 6 with holes | plate | 1.94 | 5 pinhole, 12 stud, 12 antistud, 5 tube | 2 |
| 3738.dat | Technic plate 2 x 8 with holes | plate | 2.56 | 7 pinhole, 16 stud, 16 antistud, 7 tube | 2 |
| 4263.dat | Technic plate 1 x 4 with holes | plate | 0.6 | 2 pinhole, 2 stud, 2 antistud | 2 |
| 4262.dat | Technic plate 1 x 6 with holes | plate | 0.97 | 2 pinhole, 4 stud, 4 antistud | 2 |
| 4442.dat | Technic plate 1 x 8 with holes | plate | 1.34 | 2 pinhole, 6 stud, 6 antistud | 2 |
| 3005.dat | Brick 1 x 1 | brick | 0.48 | 1 stud, 1 antistud | 2 |
| 3004.dat | Brick 1 x 2 | brick | 0.9 | 2 stud, 2 antistud | 2 |
| 3622.dat | Brick 1 x 3 | brick | 1.33 | 3 stud, 3 antistud | 2 |
| 3010.dat | Brick 1 x 4 | brick | 1.75 | 4 stud, 4 antistud | 2 |
| 3009.dat | Brick 1 x 6 | brick | 2.59 | 6 stud, 6 antistud | 2 |
| 3008.dat | Brick 1 x 8 | brick | 3.44 | 8 stud, 8 antistud | 2 |
| 6111.dat | Brick 1 x 10 | brick | 4.28 | 10 stud, 10 antistud | 2 |
| 6112.dat | Brick 1 x 12 | brick | 5.13 | 12 stud, 12 antistud | 2 |
| 3003.dat | Brick 2 x 2 | brick | 1.45 | 4 stud, 4 antistud, 1 tube | 2 |
| 3002.dat | Brick 2 x 3 | brick | 2.06 | 6 stud, 6 antistud, 2 tube | 2 |
| 3001.dat | Brick 2 x 4 | brick | 2.67 | 8 stud, 8 antistud, 3 tube | 2 |
| 2456.dat | Brick 2 x 6 | brick | 3.89 | 12 stud, 12 antistud, 5 tube | 2 |
| 3007.dat | Brick 2 x 8 | brick | 5.19 | 16 stud, 16 antistud, 7 tube | 2 |
| 3006.dat | Brick 2 x 10 | brick | 6.34 | 20 stud, 20 antistud, 9 tube | 2 |
| 2356.dat | Brick 4 x 6 | brick | 7.17 | 24 stud, 24 antistud, 8 tube | 2 |
| 14716.dat | Brick 1 x 1 x 3 | brick | 1.31 | 1 stud, 1 antistud | 2 |
| 3245a.dat | Brick 1 x 2 x 2 | brick | 1.6500000000000001 | 2 stud, 2 antistud | 2 |
| 3024.dat | Plate 1 x 1 | plate | 0.21 | 1 stud, 1 antistud | 2 |
| 3023b.dat | Plate 1 x 2 | plate | 0.4 | 2 stud, 2 antistud | 2 |
| 3623.dat | Plate 1 x 3 | plate | 0.6 | 3 stud, 3 antistud | 2 |
| 3710.dat | Plate 1 x 4 | plate | 0.8 | 4 stud, 4 antistud | 2 |
| 78329.dat | Plate 1 x 5 | plate | 1 | 5 stud, 5 antistud | 2 |
| 3666.dat | Plate 1 x 6 | plate | 1.19 | 6 stud, 6 antistud | 2 |
| 3460.dat | Plate 1 x 8 | plate | 1.59 | 8 stud, 8 antistud | 2 |
| 4477.dat | Plate 1 x 10 | plate | 1.99 | 10 stud, 10 antistud | 2 |
| 60479.dat | Plate 1 x 12 | plate | 2.38 | 12 stud, 12 antistud | 2 |
| 3022.dat | Plate 2 x 2 | plate | 0.73 | 4 stud, 4 antistud, 1 tube | 2 |
| 3021.dat | Plate 2 x 3 | plate | 1.08 | 6 stud, 6 antistud, 2 tube | 2 |
| 3020.dat | Plate 2 x 4 | plate | 1.43 | 8 stud, 8 antistud, 3 tube | 2 |
| 3795.dat | Plate 2 x 6 | plate | 2.13 | 12 stud, 12 antistud, 5 tube | 2 |
| 3034.dat | Plate 2 x 8 | plate | 2.82 | 16 stud, 16 antistud, 7 tube | 2 |
| 3832.dat | Plate 2 x 10 | plate | 3.52 | 20 stud, 20 antistud, 9 tube | 2 |
| 2445.dat | Plate 2 x 12 | plate | 4.21 | 24 stud, 24 antistud, 11 tube | 2 |
| 11212.dat | Plate 3 x 3 | plate | 1.6 | 9 stud, 9 antistud, 4 tube | 2 |
| 3031.dat | Plate 4 x 4 | plate | 2.8000000000000003 | 16 stud, 16 antistud, 9 tube | 2 |
| 3032.dat | Plate 4 x 6 | plate | 4.17 | 24 stud, 24 antistud, 15 tube | 2 |
| 3035.dat | Plate 4 x 8 | plate | 5.53 | 32 stud, 32 antistud, 21 tube | 2 |
| 3030.dat | Plate 4 x 10 | plate | 6.9 | 40 stud, 40 antistud, 27 tube | 2 |
| 3029.dat | Plate 4 x 12 | plate | 8.27 | 48 stud, 48 antistud, 33 tube | 2 |
| 3958.dat | Plate 6 x 6 | plate | 6.2 | 36 stud, 36 antistud, 25 tube | 2 |
| 3036.dat | Plate 6 x 8 | plate | 8.24 | 48 stud, 48 antistud, 35 tube | 2 |
| 3033.dat | Plate 6 x 10 | plate | 10.28 | 60 stud, 60 antistud, 45 tube | 2 |
| 3028.dat | Plate 6 x 12 | plate | 12.32 | 72 stud, 72 antistud, 55 tube | 2 |
| 3070b.dat | Tile 1 x 1 with groove | tile | 0.17 | 1 antistud | 1 |
| 3069b.dat | Tile 1 x 2 with groove | tile | 0.32 | 2 antistud | 1 |
| 63864.dat | Tile 1 x 3 | tile | 0.5 | 3 antistud | 1 |
| 2431.dat | Tile 1 x 4 with groove | tile | 0.67 | 4 antistud | 1 |
| 6636.dat | Tile 1 x 6 | tile | 1 | 6 antistud | 1 |
| 4162.dat | Tile 1 x 8 | tile | 1.33 | 8 antistud | 1 |
| 3068b.dat | Tile 2 x 2 with groove | tile | 0.6 | 4 antistud, 1 tube | 1 |
| 26603.dat | Tile 2 x 3 | tile | 0.89 | 6 antistud, 2 tube | 1 |
| 87079.dat | Tile 2 x 4 | tile | 1.18 | 8 antistud, 3 tube | 1 |
| 69729.dat | Tile 2 x 6 | tile | 1.75 | 12 antistud, 5 tube | 1 |
| 1751.dat | Tile 4 x 4 | tile | 2.3000000000000003 | 16 antistud, 9 tube | 1 |
| 6934.dat | Tile 3 x 6 | tile | 2.31 | 14 antistud | 1 |
| 3039.dat | Slope brick 45 2 x 2 | slope | 1.1 | 2 stud, 4 antistud, 1 tube | 2 |
| 3040b.dat | Slope brick 45 2 x 1 | slope | 0.7000000000000001 | 1 stud, 2 antistud | 2 |
| 3038.dat | Slope brick 45 2 x 3 | slope | 1.57 | 3 stud, 6 antistud, 2 tube | 2 |
| 3037.dat | Slope brick 45 2 x 4 | slope | 2.0300000000000002 | 4 stud, 8 antistud, 3 tube | 2 |
| 3298.dat | Slope brick 33 3 x 2 | slope | 1.47 | 2 stud, 6 antistud, 2 tube | 2 |
| 4286.dat | Slope brick 33 3 x 1 | slope | 0.96 | 1 stud, 3 antistud | 2 |
| 3043.dat | Slope brick 45 2 x 2 double | slope | 0.78 | 4 antistud, 1 tube | 1 |
| 54200.dat | Slope brick 31 1 x 1 x 0.667 | slope | 0.2 | 1 antistud | 1 |
| 85984.dat | Slope brick 31 1 x 2 x 0.667 | slope | 0.36 | 2 antistud | 1 |
| 3665a.dat | Slope brick 45 2 x 1 inverted without inner stopper ring | slope | 0.67 | 2 stud, 2 antistud | 3 |
| 6141.dat | Plate 1 x 1 round | plate | 0.12 | 1 stud, 1 antistud | 2 |
| 3062b.dat | Brick 1 x 1 round with hollow stud | brick | 0.31 | 1 stud, 1 tube | 2 |
| 41539.dat | Plate 8 x 8 | plate | 10.950000000000001 | 64 stud, 64 antistud, 49 tube | 2 |
| 3456.dat | Plate 6 x 14 | plate | 14.36 | 84 stud, 84 antistud, 65 tube | 2 |
| 3027.dat | Plate 6 x 16 | plate | 16.4 | 96 stud, 96 antistud, 75 tube | 2 |
| 3026.dat | Plate 6 x 24 | plate | 24.560000000000002 | 144 stud, 144 antistud, 115 tube | 2 |
| 92438.dat | Plate 8 x 16 | plate | 21.8 | 128 stud, 128 antistud, 105 tube | 2 |
| 91988.dat | Plate 2 x 14 | plate | 4.91 | 28 stud, 28 antistud, 13 tube | 2 |
| 4282.dat | Plate 2 x 16 | plate | 5.61 | 32 stud, 32 antistud, 15 tube | 2 |
| 2465.dat | Brick 1 x 16 | brick | 6.82 | 16 stud, 16 antistud | 2 |
| 3754.dat | Brick 1 x 6 x 5 | brick | 9.68 | 6 stud, 3 antistud | 2 |
| 49311.dat | Brick 1 x 4 x 3 | brick | 3.95 | 4 stud, 4 antistud | 2 |
| 30145.dat | Brick 2 x 2 x 3 | brick | 3.65 | 4 stud, 4 antistud, 1 tube | 2 |
| 30144.dat | Brick 2 x 4 x 3 | brick | 6.59 | 8 stud, 8 antistud, 3 tube | 2 |
| 6213.dat | Brick 2 x 6 x 3 | brick | 9.6 | 12 stud, 12 antistud, 5 tube | 2 |
| 6212.dat | Brick 4 x 10 | brick | 11.66 | 40 stud, 40 antistud, 14 tube | 2 |
| 4202.dat | Brick 4 x 12 | brick | 13.9 | 48 stud, 48 antistud, 17 tube | 2 |
| 4201.dat | Brick 8 x 8 | brick | 17.91 | 64 stud, 64 antistud, 25 tube | 2 |
| 4204.dat | Brick 8 x 16 | brick | 34.910000000000004 | 128 stud, 128 antistud, 53 tube | 2 |
| 2357.dat | Brick 2 x 2 corner | brick | 1.33 | 3 stud, 3 antistud | 3 |
| 6143.dat | Brick 2 x 2 round reinforced | brick | 1.17 | 1 axlehole, 4 stud, 4 antistud, 1 tube | 2 |
| 3941.dat | Brick 2 x 2 round without reinforcement | brick | 1.11 | 1 axlehole, 4 stud, 4 antistud, 1 tube | 2 |
| 3065.dat | Brick 1 x 2 without centre stud | brick | 0.8300000000000001 | 2 stud, 2 antistud | 2 |
| 3066.dat | Brick 1 x 4 without centre studs | brick | 1.54 | 4 stud, 4 antistud | 2 |
| 3245c.dat | Brick 1 x 2 x 2 without understud | brick | 1.55 | 2 stud, 2 antistud | 2 |
| 30136.dat | Brick 1 x 2 log | brick | 0.67 | 2 stud | 2 |
| 6091.dat | Brick 2 x 1 x 1.333 with curved top | brick | 0.6900000000000001 | 1 stud, 1 antistud | 2 |
| 6215.dat | Brick 2 x 3 with curved top | brick | 1.87 | 4 stud, 6 antistud, 2 tube | 2 |
| 4490.dat | Arch 1 x 3 | other | 1.17 | 3 stud, 2 antistud | 2 |
| 3659.dat | Arch 1 x 4 | other | 1.42 | 4 stud, 4 antistud | 2 |
| 2420.dat | Plate 2 x 2 corner | plate | 0.6 | 3 stud, 3 antistud | 3 |
| 2639.dat | Plate 4 x 4 corner | plate | 2.13 | 12 stud, 12 antistud, 5 tube | 3 |
| 2450.dat | Plate 3 x 3 without corner | plate | 1.22 | 6 stud, 8 antistud, 3 tube | 2 |
| 3176.dat | Plate 3 x 2 with hole | plate | 0.9500000000000001 | 1 pinhole, 4 stud, 6 antistud, 1 tube | 2 |
| 3794b.dat | Plate 1 x 2 with groove with 1 centre stud | plate | 0.35000000000000003 | 1 stud, 2 antistud | 2 |
| 87580.dat | Plate 2 x 2 with groove with 1 centre stud | plate | 0.61 | 1 stud, 4 antistud, 1 tube | 2 |
| 3048b.dat | Slope brick 45 1 x 2 triple | slope | 0.39 | 2 antistud | 1 |
| 48288.dat | Tile 8 x 16 | tile | 16.88 | 80 antistud, 40 tube | 1 |
| 98138.dat | Tile 1 x 1 round with groove | tile | 0.13 | 1 antistud | 1 |
| 14769.dat | Tile 2 x 2 round with round underside stud | tile | 0.42 | 4 antistud, 1 tube | 1 |
| 2412b.dat | Tile 1 x 2 grille with groove | tile | 0.24 | 2 antistud | 5 |
| 4150.dat | Tile 2 x 2 round with cross underside stud | tile | 0.42 | 4 antistud | 1 |
| 3044b.dat | Slope brick 45 2 x 1 double | slope | 0.48 | 2 antistud | 1 |
| 3747a.dat | Slope brick 33 3 x 2 inverted without ribs between studs | slope | 1.54 | 6 stud, 6 antistud | 2 |
| 4161.dat | Slope brick 33 3 x 3 | slope | 2.1 | 3 stud, 9 antistud, 4 tube | 2 |
| 3297.dat | Slope brick 33 3 x 4 | slope | 2.73 | 4 stud, 12 antistud, 6 tube | 2 |
| 4445.dat | Slope brick 45 2 x 8 | slope | 3.88 | 8 stud, 16 antistud, 7 tube | 2 |
| 3678b.dat | Slope brick 65 2 x 2 x 2 with centre tube | slope | 1.98 | 2 stud, 4 antistud, 1 tube | 11 |
| 4460b.dat | Slope brick 75 2 x 1 x 3 with hollow stud | slope | 1.73 | 1 stud, 2 antistud | 11 |
| 2825.dat | Technic beam 4 x 0.5 liftarm with boss | beam | 0.5700000000000001 | 3 pinhole, 2 axlehole | 2 |
| 2391.dat | Technic beam 7 with alternating holes | beam | 1.79 | 7 pinhole | 1 |
| 6612.dat | Technic beam 9 with alternating holes | beam | 2.36 | 9 pinhole | 1 |
| 4586.dat | Technic beam 9 x 0.5 with 3 holes | beam | 1.16 | 3 pinhole | 3 |
| 73507.dat | Technic beam 11 with alternating holes | beam | 2.93 | 11 pinhole | 1 |
| 71710.dat | Technic beam 15 with alternating holes | beam | 4.0600000000000005 | 15 pinhole | 1 |
| 2719.dat | Technic plate 1 x 10 with holes | plate | 1.71 | 2 pinhole, 8 stud, 8 antistud | 2 |
| 41769a.dat | Wing 2 x 4 right without chamfer | other | 1.03 | 4 stud, 6 antistud | 2 |
| 41770a.dat | Wing 2 x 4 left without chamfer | other | 1.03 | 4 stud, 6 antistud | 2 |
| 43722a.dat | Wing 2 x 3 right without chamfer | other | 0.78 | 3 stud, 5 antistud | 2 |
| 43723a.dat | Wing 2 x 3 left without chamfer | other | 0.78 | 3 stud, 5 antistud | 2 |
| 32190.dat | Technic panel fairing #1 | other | 3.7800000000000002 | 4 pinhole | 1 |
| 32191.dat | Technic panel fairing #2 | other | 3.7800000000000002 | 4 pinhole | 1 |

</details>

## Not derived (coverage gaps)

Listed parts the deriver could not admit, with the reason. They are not in parts.json.

| Part | LDraw description | Why |
|---|---|---|
| 6587.dat | Technic Axle 3 with Stud | colliders enclose 97.3 % of the mesh (< 98 %) |
| 4019.dat | Technic Gear 16 Tooth | gear tip radius 21.66 ≠ 16·1.25 + 2.5 (not module 1) |
| 3648a.dat | Technic Gear 24 Tooth with 3 Axleholes | holes h0/x0 14.14 LDU apart; holes h1/x0 14.14 LDU apart; holes h2/x0 14.14 LDU apart; holes h3/x0 14.14 LDU apart |
| 32072.dat | Technic Gear 4 Knob | a gear-category part without derivable gear data (no clean rack teeth or worm thread; crown, clutch, turntable, knob) |
| 4143.dat | Technic Gear 14 Tooth Bevel | x0: a 4 LDU axlehole is shallower than the seat rule's 8 LDU |
| 69762.dat | Technic Gear 14 Tooth Bevel | gear tip radius 27.00 ≠ 14·1.25 + 2.5 (not module 1) |
| 6542a.dat | Technic Gear 16 Tooth with Clutch | gear without one centre axle hole; a gear-category part without derivable gear data (no clean rack teeth or worm thread; crown, clutch, turntable, knob) |
| 6542b.dat | Technic Gear 16 Tooth with Clutch Smooth | gear without one centre axle hole; a gear-category part without derivable gear data (no clean rack teeth or worm thread; crown, clutch, turntable, knob) |
| 18946.dat | Technic Gear 16 Tooth with Clutch on Both Sides | gear without one centre axle hole; a gear-category part without derivable gear data (no clean rack teeth or worm thread; crown, clutch, turntable, knob) |
| 81346.dat | Technic Gear 20 Tooth with Clutch on Both Sides | gear without one centre axle hole; a gear-category part without derivable gear data (no clean rack teeth or worm thread; crown, clutch, turntable, knob) |
| 2471.dat | Technic Gear 24 Tooth with Clutch on Both Sides | gear without one centre axle hole; a gear-category part without derivable gear data (no clean rack teeth or worm thread; crown, clutch, turntable, knob) |
| 35185.dat | Technic Gear 20 Tooth Double Bevel with Clutch on Both Sides | gear without one centre axle hole; a gear-category part without derivable gear data (no clean rack teeth or worm thread; crown, clutch, turntable, knob) |
| 3650c.dat | Technic Gear 24 Tooth Crown Type 3 | a gear-category part without derivable gear data (no clean rack teeth or worm thread; crown, clutch, turntable, knob) |
| 87407.dat | Technic Gear 20 Tooth Bevel with Peghole | gear without one centre axle hole; a gear-category part without derivable gear data (no clean rack teeth or worm thread; crown, clutch, turntable, knob) |
| 32198a.dat | Technic Gear 20 Tooth Bevel with Two Axlehole Slots | x0: a 7 LDU axlehole is shallower than the seat rule's 8 LDU |
| 32198b.dat | Technic Gear 20 Tooth Bevel with Four Axlehole Slots | x0: a 7 LDU axlehole is shallower than the seat rule's 8 LDU |
| 27938.dat | Technic Worm Gear 1L | worm pitch radius 15.47: does not mesh a 24T 40 LDU away |
| 87761.dat | Technic Gear Rack 1 x 7 with Pegholes and Axleholes | a gear-category part without derivable gear data (no clean rack teeth or worm thread; crown, clutch, turntable, knob) |
| 99009.dat | Technic Turntable 28 Tooth Bottom | a gear-category part without derivable gear data (no clean rack teeth or worm thread; crown, clutch, turntable, knob) |
| 99010.dat | Technic Turntable 28 Tooth Top | a gear-category part without derivable gear data (no clean rack teeth or worm thread; crown, clutch, turntable, knob) |
| 18939.dat | Technic Turntable 60 Tooth Bottom | a gear-category part without derivable gear data (no clean rack teeth or worm thread; crown, clutch, turntable, knob) |
| 18938.dat | Technic Turntable 60 Tooth Top | a gear-category part without derivable gear data (no clean rack teeth or worm thread; crown, clutch, turntable, knob) |
| 48452.dat | Technic Turntable Type 2 Base | a gear-category part without derivable gear data (no clean rack teeth or worm thread; crown, clutch, turntable, knob) |
| 48168.dat | Technic Turntable Type 2 Top | a gear-category part without derivable gear data (no clean rack teeth or worm thread; crown, clutch, turntable, knob) |
| 62519.dat | Technic Universal Joint 3L Centre | no connector found |
| 3326a.dat | Technic Universal Joint Centre Type 1 | no connector found |
| 3326b.dat | Technic Universal Joint Centre Type 2 | no connector found |
| 4032a.dat | Plate 2 x 2 Round with Axlehole | x0: a 4 LDU axlehole is shallower than the seat rule's 8 LDU |
| 4589.dat | Cone 1 x 1 | x0: a 6 LDU axlehole is shallower than the seat rule's 8 LDU |

Not attempted: ball sockets, steering arms and links, click hinges, rubber/flex parts, panels, Bionicle/Hero Factory, Duplo.
Turntables, clutch gears, crown and knob gears need a coupling model of their own (a turntable is two parts that turn on each
other; a clutch gear slips); racks and worms are derived when their teeth measure cleanly.

## Size

parts.json is 1122351 bytes as written (one-space JSON) and 511384 bytes minified (39962 gzipped) in
the lazy Sim Lab chunk. If the library grows by another few hundred parts, split it: keep the hand-measured parts (motors, hub,
sensors, the examples' parts) in parts.json and move the derived ones to a second file the palette fetches on first open.

