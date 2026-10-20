# Robot Lab: LDD part frames from LDraw geometry

**Question (owner, 2026-10-18).** Measuring each part's frame from the LDraw geometry sounds
easily automated. Do we have a working method? Compare it against `ldraw.xml` as the
ground truth.

**Short answer.** We have a working, reproducible method. It agrees with `ldraw.xml` only
for a minority of parts, though: **33.0 % of the 2,526 held-out parts** (32.7 % of the
2,496 training parts). A trivial "LDD frame = LDraw frame" guess scores 16 %. Agreement is
much higher on plain System parts in the Robot Lab catalogue: **85.7 % (60/70) held out**
for the stud-grid rule, using the catalogue's own metadata as the importer does. Only that
rule is wired into the `.lxf` importer, and it marks every part it places with a warning.
Technic, minifigure and decorative parts follow LDD conventions that the geometry does not
determine, such as which end of an asymmetric part is the origin, and the roll of a pin.

## In plain words: what this is about, and what it is not

**Our part geometry is exact and does not depend on any of this.** Every part's shape,
holes, studs, axles and pins come from the LDraw `.dat` files themselves (official parts
carry `0 !LICENSE` CC BY 4.0, older ones CCAL 2.0; both allow use, change and commercial
use with attribution, which `THIRD-PARTY-NOTICES.md` and the About dialog give as "The
LDraw Parts Library", the attribution LDraw.org's legal page names as sufficient — see
<https://www.ldraw.org/legal-info>). Frames, symmetry, mirror pairs and default
orientations (`bw-sim/part-meta/canonical-frame.js`) are computed from that geometry.
Inside the Robot Lab a part's origin is bookkeeping only: physics, snapping and
collisions use the holes, studs and colliders.

**The origin matters only when reading another program's file.** A LEGO Digital Designer
`.lxf` stores no geometry, only "design 3001 at position p, rotated by R". That p is LDD's
own origin for 3001, a point LDD's makers chose per part (a 2 × 4 brick: a corner stud
cell at the bottom; a beam: its end hole; some parts: an inner cell), with axes they also
chose (which way a bent liftarm or a pin's roll faces). Were it always the mathematical
centre, it could be computed from the geometry. It is not, so placing an LDD part
needs LDD's per-part offset — the table `ldraw.xml` holds. This page measured how much of
that table can be predicted from geometry alone.

**What "rule" and "learned" mean here.** A *rule* is a hand-written guess at LDD's habit
for a family of parts ("studded parts: origin at the bottom of the first stud cell").
*Learned* overstates it: the rules were written while looking at a training half of the
table and then scored, unchanged, on the other half. No machine learning. The 33 % says
how predictable LDD's conventions are; it says nothing about the correctness of our
LDraw geometry.

## Later: two better ways to open LDD files (owner, 2026-10-18: do both later)

LDD has been discontinued since about 2022; BrickLink Studio's `.io` (supported) is what
people use now, so neither is urgent.

1. **Snap to connections (physical facts, no table).** An LDD model is a built model:
   its parts are connected. Place every part roughly from the file (off by at most a
   part's own size, since the unknown is only where the origin sits inside the part),
   then solve each part's pose so its studs sit in the tubes, pins in the holes and
   axles in the axle holes of its neighbours, using our exact connector geometry
   (`derive-part-meta.mjs`) and the editor's snap code. Correct for every part the
   library has; only parts that touch nothing stay approximate (and are flagged). The
   evaluator here (`scripts/eval-ldd-frames.mjs`) can score it the same way: against
   `ldraw.xml` as the oracle, locally.
2. **The user's own `ldraw.xml`.** An "Use my ldraw.xml…" button: the user picks a copy
   they have, the app reads its rows in the browser for that conversion only and keeps
   it in the user's local storage; nothing is shipped, uploaded or cached on a server.
   Where to get one: it is installed with LDD itself (Windows: `%APPDATA%\LEGO Company\LEGO Digital
   Designer\ldraw.xml`; macOS: `~/Library/Application Support/LEGO Company/LEGO Digital
   Designer/ldraw.xml`), and LeoCAD publishes a
   maintained copy at <https://github.com/leozide/leocad/blob/master/resources/ldraw.xml>.
   Rows from the user's file override the derived rules; the 27-row table stays as the
   built-in minimum.
   *Licence view (not legal advice):* the file states no licence, so we must not
   distribute it — but we would not: the user brings their own copy, the same way LeoCAD
   and Studio users use the one their LDD installed. Linking to where it is published is
   not distributing it. What it holds is a table of numeric offsets for interoperability,
   read locally. The 27 recorded rows in `ldd-parts.js` (numbers only, cited) remain the
   only figures from it in this repository.
3. **Already possible today:** LDD 4.3 itself exports LDraw (`File → Export → LDraw`),
   using its own `ldraw.xml`; the Robot Lab opens that `.ldr` with every library part.

## The oracle

- `ldraw.xml` from LeoCAD: <https://github.com/leozide/leocad>, file `resources/ldraw.xml`,
  read at commit `74e16b0d13967dadda26ffb84ec7a09d1d0c5e86` (the file last changed in
  `fd7b4ce26b58b553b4de70cb9810daa32f39d453`, 2025-07-05). Header: `LDrawMapping
  versionMajor="1" versionMinor="7" comment="LDD 4.3.11 Brick ver 2670"`, dated
  2025-03-17. sha256 `2c1ddba5985edecaff361be7a63187e08877aec0a08ae35ec5e4ac04b1025a4b`.
- The file has no licence statement. It is used only as a local test oracle: it is not in
  this repository, and neither is any per-part number derived from it. This page gives
  aggregates and a few named examples only.
- It has 6,681 `<Transformation>` rows covering 6,669 distinct LDraw files. 5,277 of those
  are in the official LDraw library (`complete.zip` 2026-09-30). 5,022 have geometry that
  `derive-part-meta.mjs` can analyse. The rest are `~` non-placeable files or files that
  fail to derive.

## What a row means

`<Transformation ldraw="P.dat" tx ty tz ax ay az angle/>` holds a translation in LDD units
(1 = 25 LDU, y up) and an axis-angle in radians. LeoCAD's `common/lc_lxf.cpp` applies it as
`Transform = Rot(axis, −angle)`, translated by `−t·Transform`, then the LXFML bone, then the
flip to LDraw's axes. In column form, an LDraw-part point `q` (LDU) sits in the LDD part's
own frame at

    d = Rn · (F·q/25 − t),   Rn = Rot(axis, −angle),   F = diag(1, −1, −1)

So **the LDD origin is at `o = 25·F·t` in the LDraw part, and the LDD axes are the columns
of `M = F·Rot(axis, angle)`**. This is the same convention `model/ldd-parts.js` documents
and `lxf-model.js lddToLdraw` applies. `rowOfFrame` (model/ldd-frame.js) converts back, and a
test checks that a recorded row and its frame place an LXFML bone identically.

**Check against the importer's 27 recorded rows.** The importer's rows were copied from an
older file (`MG beta 4.32`). Parsed with this reader and compared modulo symmetry:

- 20 parts match the current file to within 0.5 LDU. The difference is the old file's 0.02
  LDD sub-offset, which the 2025 file dropped.
- Four rotations differ: pins 43093 and 3749, bush 3713, and 94925. The two files give
  different rolls, and the part's slots or ribs make each roll visibly different, so no
  symmetry reconciles them.
- Two translations differ: 3649 by 2.3 LDU and 6589 by 0.7 LDU.
- One part, 32198, has no geometry in this run.

The table is kept unchanged.

## Method

- **Geometry**: `scripts/derive-part-meta.mjs derivePart` gives the part's connectors (studs,
  anti-studs, tubes, pin and axle lines). `canonical-frame.js analysePart` gives the part's
  proper symmetry group: the 24 axis-aligned turns that map connectors and mesh onto
  themselves (1 % area tolerance), plus n-fold turns of round parts. Aliases are followed: a
  `~Moved to` file, and a `=` file that only references another part.
- **Agreement**: a predicted frame agrees when a symmetry `g` of the part takes it onto the
  file's frame. The rotation must be exact (entries within 1e-3) and the origin within
  **0.5 LDU**. A symmetric part therefore has several correct answers.
- **Split**: FNV-1a hash of the LDraw file name. Even hashes are training and odd hashes
  are held out. The rule was designed on training parts only.

  One exception: before the split was fixed, an exploratory listing of about 150 studded
  parts mixed both halves. It suggested the bottom-corner-cell origin. Every choice after
  that was measured on the training half only.
- **Reproduce**: `node scripts/eval-ldd-frames.mjs --ldraw-xml <ldraw.xml> --ldraw <LDraw
  library> [--split train|test|all] [--cache geo.jsonl] [--list]`. Deriving the geometry
  takes about 1 s per part, so use `--cache`. `--list` prints each disagreement, for local
  use only; never commit its output. `test/bw-sim-ldd-frames.test.mjs` runs the evaluator
  on a five-row mapping file that the test writes by hand from the vendored parts.

## The rule (model/ldd-frame.js)

| rule | applies to | frame |
|---|---|---|
| `grid` | studs, anti-studs or tubes pointing up | LDD y up. System categories keep LDraw's yaw. Other studded parts turn their longer run of cells onto LDD x. The origin is the first stud cell (least LDD x, then most LDD z), at the underside height on the plate grid. |
| `technic-beam` | a straight row of parallel holes, or a Technic beam | LDD z runs along the holes in LDD's preferred sense (LDraw −x, +y, −z). The origin is at the end hole's +z end, and LDD x points to the next hole. |
| `technic-hub` | other parts with pin or axle lines | Same z rule. The origin is on the line nearest the middle of the connectors, with LDD y up. |
| `ldraw-origin` | no connectors | LDD frame = LDraw frame |

## Scorecard (tolerance 0.5 LDU)

| split | parts scored | agree | rate | baseline (o = 0, M = F) |
|---|---|---|---|---|
| training | 2,496 | 815 | 32.7 % | 15.5 % |
| **held out** | **2,526** | **834** | **33.0 %** | 16.1 % |

Both halves, by category (the derived category from the LDraw description):

| category | scored | agree | rate | rotation wrong | origin wrong | no rule |
|---|---|---|---|---|---|---|
| brick | 332 | 218 | 65.7 % | 69 | 45 | 0 |
| tile | 105 | 64 | 61.0 % | 21 | 20 | 0 |
| axle | 45 | 31 | 68.9 % | 12 | 2 | 0 |
| beam | 81 | 40 | 49.4 % | 36 | 5 | 0 |
| plate | 336 | 164 | 48.8 % | 72 | 100 | 0 |
| gear | 67 | 25 | 37.3 % | 34 | 6 | 2 |
| slope | 223 | 74 | 33.2 % | 88 | 61 | 0 |
| pin | 35 | 11 | 31.4 % | 24 | 0 | 0 |
| connector | 127 | 32 | 25.2 % | 79 | 15 | 1 |
| other (minifig, animals, decor, vehicles…) | 3,671 | 990 | 27.0 % | 1,618 | 992 | 71 |
| **all** | **5,022** | **1,649** | **32.8 %** | 2,053 | 1,246 | 74 |

By rule over both halves:

| rule | scored | rate |
|---|---|---|
| `grid` | 2,238 | 37.4 % |
| `ldraw-origin` | 1,737 | 35.3 % |
| `technic-beam` | 301 | 23.9 % |
| `technic-hub` | 672 | 18.8 % |

The Robot Lab catalogue, scored through the importer's own path (the catalogue's
connectors and colliders), excluding the 27-row table: the `grid` rule places 132
catalogue parts that ldraw.xml maps, and agrees on **113 (85.6 %)**. On held-out parts it
agrees on 60 of 70 (85.7 %). The Technic rules would agree on 32 of 73 held-out
catalogue Technic parts (44 %). That is too few to place them silently, so those parts are
still refused.

## Disagreements, by class

- **Not in the library: 1,392 rows.** ldraw.xml maps files that the official library does
  not have: unofficial and custom parts, `-f1`-style variants, and printed or assembled
  numbers.
- **No geometry: 255 rows.** These are `~` non-placeable files, or files whose derivation
  failed.
- **No rule: 74 rows.** These parts have connectors, but no stud grid and no Technic line,
  only a ball joint or side studs.
- **Rule gap, rotation: 2,053 rows.** LDD's yaw differs from LDraw's in a way the geometry
  does not fix:
  - L-shaped corner parts: 2639 Plate 4 x 4 Corner, 2357, 2420.
  - Curved or angled bricks: 6091, 85984.
  - Most minifigure and decorative parts.
  - Technic: the origin end of asymmetric parts. Examples are bent liftarms (32056 is "z
    up" while 32140 is "z down") and gears (32269 starts on the +z face, 3648 on −z).
  - Pin and axle roll, where slots or friction ridges break the round symmetry (32054).
    The two ldraw.xml versions themselves disagree on the roll of 43093 and 3749.
- **Rule gap, origin: 1,246 rows.** Two patterns dominate:
  - The LDD origin is on an interior cell. Technic plates 4262, 4263, 4442 and 2719 are
    one to three cells in. So are Plate 1 x 5 (78329), Brick 1 x 4 x 3 (49311) and the
    jumper plates (3794b, 87580, half a cell).
  - The LDD origin sits on the stud-bearing layer's underside rather than the part's
    bottom. This covers 149 height-only grid misses: brackets 99781 and 92411, inverted
    dishes 44375 and 3961, and hinge plate 3640. They are typically one or two plates (8 or
    16 LDU) off.
- **ldraw.xml self-inconsistency: 14 of 638 alias pairs.** Two LDraw numbers with the same
  geometry get frames that no symmetry reconciles, for example 432/6126a and 2714a/2714. So
  at least about 2 % of the oracle disagrees with itself.
- **Our geometry: not separately measurable here.** The likeliest cases are anti-studs
  that the deriver misses on unusual undersides: the importer falls back to collider
  bottoms, and the evaluator to the mesh bottom. Those cases sit inside the origin class
  above.

## In the importer

`model/lxf-model.js` keeps the 27-row table. Any other design whose number is a catalogue
part is placed with the derived frame **only when the rule is `grid`**
(`ldd-frame.js DERIVED_RULES`), with a warning `lxf-derived-frame` on the part. All other
designs stay `lxf-unknown-design`. The pane passes its catalogue (`openModelFile(…,
{catalog})`). `test/bw-sim-ldd-frames.test.mjs` loads a hand-written LXFML with a 2 x 4
brick and two 1 x 2 bricks, one turned a quarter, none of them in the table. It checks the
placement against expectations taken from the parts' own connectors: the base's underside
on the ground plane, every anti-stud of the upper bricks exactly on a stud of the base, at
the stud pitches the LDD positions name.

## Snap to connections, built (2026-10-21)

The first of the two "later" ways is now the importer's (`model/ldd-snap.js`). A design that has
no recorded row and is no `grid` part, but is a catalogue part, is placed where its connectors
meet the parts already placed:

- **Candidates.** The LDD frame of a part is an origin and one of the 24 axis-aligned turns
  (`ldd-frame.js`). The origins tried are where LDD puts them: the part's origin, each connector,
  and both ends of each connector line. LDD's habits come first and win a tie: the frame
  `ldd-frame.js` derives (even a `technic` one, not trusted on its own), then LDraw's frame.
- **Score.** Every instance of the design is placed by the candidate; each of its connectors that
  joins an anchor by the connector kinds' own pair rules (pin in pin hole, axle in axle hole, stud
  in anti-stud — the rules the compiler joins parts by) counts one; each of its holes (or shafts)
  that shares more than 2 LDU of a line with an anchor's hole (shaft) counts minus one: the part
  would sit inside its neighbour (a beam slid half its width along its pins). How deep the shafts
  sit breaks ties. Tread links (`chain-link`) count each other at one pitch apart.
- **Rounds.** The designs whose best candidate scores at least two connections (and half of their
  instances) and is not tied with a differently shaped placement are placed; their connectors join
  the anchors; the next round may place more. A tie is taken last, by the habits above.
- **Notes.** `lxf-snapped-frame` (a warning, with the connections it found) on each part placed
  so; `lxf-unplaced-design` (refused) for a catalogue part nothing places.
- **EV3 elements.** LDD splits the EV3 motors and the touch sensor into a body and a hub or
  button; `ldraw.xml` names those bodies (names only): 74042 (the large motor's case, LDraw
  99550c01, unturned inside 95658), 74043 (the medium motor's, 99535c01 in 99455) and 74665 (the
  touch sensor's, 99385c01 in 95648) are placed as the catalogue parts; the medium motor's hub
  59158, the touch button 99386 and the cable plugs 60410 are left out with a note
  (`lxf-absorbed`).
- **The catalogue first.** The pane derives the parts of the file's design numbers the catalogue
  lacks before importing (`openModelFile(…, {prepareCatalog})`, `sim-lab.js catalogFor`).
- **An imported model is from elsewhere**: its LDraw text no longer carries `0 Author:
  Brickwright`, so its motors and sensors are plugged into ports like any foreign model's.

**Measured on the 13 `.lxf` files of the reference collection** (refused = parts not placed;
before: the importer of 2026-10-20 with the same catalogue; the oracle column compares each
placed part, by its connectors within 1.5 LDU, with where LDD's own `ldraw.xml` row would put
it — used locally only, as above):

| model | placed / refused before | placed / refused after | by connections | agrees with ldraw.xml |
|---|---|---|---|---|
| brickpi-rigraptor-tank | 43 / 34 | 61 / 12 | 18 | 59 of 59 |
| crane-cuber | 760 / 264 | 986 / 26 | 226 | 956 of 969 |
| mappingrobots-ev3 | 77 / 61 | 119 / 8 | 42 | 108 of 117 |
| ofdl-wro-2018-junior | 168 / 113 | 246 / 17 | 78 | 221 of 237 |
| ofdl-wro-2019-junior-all-collect | 240 / 140 | 356 / 20 | 116 | 335 of 351 |
| ofdl-wro-2019-junior-gripper | 135 / 118 | 235 / 15 | 100 | 218 of 234 |
| ofdl-wro-2020-junior | 336 / 184 | 500 / 18 | 164 | 471 of 490 |
| packt-falcon | 198 / 126 | 296 / 13 | 98 | 274 of 292 |
| packt-gps-car | 225 / 140 | 337 / 14 | 112 | 320 of 333 |
| packt-grunt | 336 / 176 | 475 / 20 | 135 | 445 of 474 |
| packt-omnilander | 175 / 212 | 336 / 40 | 161 | 321 of 330 |
| packt-security-tank | 218 / 172 | 358 / 18 | 140 | 333 of 354 |
| packt-timmyton-5-7 | 214 / 180 | 361 / 22 | 147 | 348 of 357 |

About 96 % of the placed parts agree with LDD's own mapping. The rest are mostly parts whose
connectors are symmetric where their shape is not (the EV3 brick's screen side and back, the
5 × 7 and 5 × 11 frames, some wheels and bent liftarms): any of the placements fits the model's
connections, and the physics treats them alike. Still refused: parts with no connectors the
catalogue derives (the pin connector 55615), the rubber tread 53992 and 54725 (not in the LDraw
library under these numbers), gear racks (they mesh, they do not join), and the rubber feet of
tread links. Importing takes 0.1–6 s on a loaded Mac. `test/bw-sim-ldd-snap.test.mjs` checks a
hand-made model: an L-beam (no recorded row) on three pins of two recorded beams, its bone written
for a frame the importer cannot know, lands on the pins.
