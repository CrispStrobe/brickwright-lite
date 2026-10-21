# Robot Lab: LDD part frames from LDraw geometry

**Question (owner, 2026-10-18).** Measuring each part's frame from the LDraw geometry sounds
easily automated. Do we have a working method? Compare it against `ldraw.xml` as the
ground truth.

**Short answer.** We have working, reproducible rules, and an importer that needs no per-part
table: a part is placed by a geometry rule where the rule cannot be wrong in a way that matters
(the stud grid of System parts; Technic shapes the same from either end: pins, axles, bushes,
straight beams), and every other catalogue part by its connections in the model ("snap to
connections", below). `ldraw.xml` is used only as a local check of these rules: no figure from
it, per part or as a score, is kept in this repository (owner's rule, 2026-10-21).

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
needs LDD's per-part offset — the table `ldraw.xml` holds. This page is about how far
geometry and the model's own connections stand in for that table.

**What "rule" and "learned" mean here.** A *rule* is a hand-written guess at LDD's habit
for a family of parts ("studded parts: origin at the bottom of the first stud cell").
*Learned* overstates it: the rules were written while looking at a training half of the
table and checked, unchanged, on the other half, locally. No machine learning.

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
   Rows from the user's file would override the derived rules.
   *Licence view (not legal advice):* the file states no licence, so we must not
   distribute it — but we would not: the user brings their own copy, the same way LeoCAD
   and Studio users use the one their LDD installed. Linking to where it is published is
   not distributing it. What it holds is a table of numeric offsets for interoperability,
   read locally. No figure from it is in this repository.
3. **Already possible today:** LDD 4.3 itself exports LDraw (`File → Export → LDraw`),
   using its own `ldraw.xml`; the Robot Lab opens that `.ldr` with every library part.

## The local check

`ldraw.xml` (LeoCAD publishes a copy in `resources/ldraw.xml`) carries no licence statement. It
is used only on a developer's machine, as an oracle: it is not in this repository, and neither
is any per-part number or score derived from it.

`<Transformation ldraw="P.dat" tx ty tz ax ay az angle/>` holds a translation in LDD units
(1 = 25 LDU, y up) and an axis-angle in radians. An LDraw-part point `q` (LDU) sits in the LDD
part's own frame at

    d = Rn · (F·q/25 − t),   Rn = Rot(axis, −angle),   F = diag(1, −1, −1)

So **the LDD origin is at `o = 25·F·t` in the LDraw part, and the LDD axes are the columns
of `M = F·Rot(axis, angle)`**: the convention `lxf-model.js lddToLdraw` applies.
`rowOfFrame` (model/ldd-frame.js) converts a frame to a row, and a test checks, on rows made up
for it, that a row and its frame place an LXFML bone identically.

- **Agreement**: a frame agrees with a row when a symmetry `g` of the part takes it onto the
  row's frame: the rotation exact, the origin within 0.5 LDU. A symmetric part has several
  correct answers.
- **Reproduce**: `node scripts/eval-ldd-frames.mjs --ldraw-xml <ldraw.xml> --ldraw <LDraw
  library> [--split train|test|all] [--cache geo.jsonl] [--list]`. Its output is for local use
  only; never commit it. `test/bw-sim-ldd-frames.test.mjs` runs the evaluator on a mapping
  file made up in the test.

## The rules (model/ldd-frame.js)

| rule | applies to | frame |
|---|---|---|
| `grid` | studs, anti-studs or tubes pointing up | LDD y up. System categories keep LDraw's yaw. Other studded parts turn their longer run of cells onto LDD x. The origin is the first stud cell (least LDD x, then most LDD z), at the underside height on the plate grid. |
| `technic-beam` | a straight row of parallel holes, or a Technic beam | LDD z runs along the holes in LDD's preferred sense (LDraw −x, +y, −z). The origin is at the end hole's +z end, and LDD x points to the next hole: a beam of n holes sits (n−1)/2 × 0.8 LDD units from its end hole. |
| `technic-hub` | other parts with pin or axle lines | Same z rule. The origin is on the line nearest the middle of the connectors, with LDD y up: an axle or pin of length L studs sits at L × 0.4, half its length, from its end. |
| `ldraw-origin` | no connectors | LDD frame = LDraw frame |

What the geometry does not fix: which end of an asymmetric part LDD starts at (an axle pin, a
bent liftarm, a bevel gear), the roll of a slotted pin, interior-cell origins of some plates.
So the importer trusts a rule only where that cannot matter (`importFrame`): `grid`, and the
Technic rules on the shapes `technicShape` names — `line` (every connector a pin, axle or hole
on one line, alike from either end, the body too: a pin, an axle, a bush, a round gear's hub)
and `row` (a straight row of alike holes at the stud pitch: a straight beam). Every other
catalogue part is placed by its connections.

## In the importer

`model/lxf-model.js` keeps no per-part table (`model/ldd-parts.js` holds only the units and the
colour reader). A design whose number is a catalogue part is placed with the frame
`importFrame` works out, with a warning `lxf-derived-frame`; any other catalogue part by its
connections (below); every other design is `lxf-unknown-design`. A design whose LDraw file is an alias or a
"~Moved to" (64290 for the 11L beam 32525; 54696 for the SPIKE Medium motor 54696p01) is the part it names. The pane passes its
catalogue (`openModelFile(…, {catalog, prepareCatalog})`). `test/bw-sim-ldd-frames.test.mjs`
loads a hand-written LXFML with a 2 x 4 brick and two 1 x 2 bricks, one turned a quarter, and
checks the placement against the parts' own connectors; `test/bw-sim-model-file.test.mjs`
places a beam, an axle and a gear from a hand-written `.lxf` at poses worked out by hand from
the rules.

## Snap to connections, built (2026-10-21)

The first of the two "later" ways is now the importer's (`model/ldd-snap.js`). A catalogue part
that no geometry rule places outright (`importFrame`) is placed where its connectors meet the
parts already placed:

- **Candidates.** The LDD frame of a part is an origin and one of the 24 axis-aligned turns
  (`ldd-frame.js`). The origins tried are where LDD puts them: the part's origin, each connector,
  and both ends of each connector line. LDD's habits come first and win a tie: the frame
  `ldd-frame.js` derives (even one not trusted on its own), then LDraw's frame.
- **Score.** Every instance of the design is placed by the candidate; each of its connectors that
  joins an anchor by the connector kinds' own pair rules (pin in pin hole, axle in axle hole, stud
  in anti-stud — the rules the compiler joins parts by) counts one, scaled by how far it is
  seated, and half for an axle in a round hole or a pin in an axle hole; each of its holes (or shafts)
  that shares more than 2 LDU of a line with an anchor's hole (shaft) counts minus one: the part
  would sit inside its neighbour (a beam slid half its width along its pins). How deep the shafts
  sit breaks ties. Tread links (`chain-link`) count each other at one pitch apart.
- **Rounds.** The designs whose best candidate scores at least two connections (and half of their
  instances) and is not tied with a differently shaped placement are placed; their connectors join
  the anchors; the next round may place more. A tie is taken last, by the habits above.
- **Notes.** `lxf-snapped-frame` (a warning, with the connections it found) on each part placed
  so; `lxf-unplaced-design` (refused) for a catalogue part nothing places.
- **Elements of several parts.** LDD writes some LEGO elements as one `<Brick>` holding several
  `<Part>`s whose design numbers LDraw does not have (an EV3 motor: its body and its hub). When the
  element's own design number is a catalogue part, the element's first part stands for it and is
  placed as that part (by its connections); the others are left out with a note
  (`lxf-part-of-element`). The file says which element a part belongs to; nothing is looked up.
- **The catalogue first.** The pane derives the parts of the file's design numbers the catalogue
  lacks before importing (`openModelFile(…, {prepareCatalog})`, `sim-lab.js catalogFor`).
- **An imported model is from elsewhere**: its LDraw text no longer carries `0 Author:
  Brickwright`, so its motors and sensors are plugged into ports like any foreign model's.

**Measured on the 13 `.lxf` files of the reference collection** (refused = parts not placed;
before: the importer of 2026-10-20, with its recorded table, and the same catalogue):

| model | placed / refused before | placed / refused after | by shape | by connections | motors turning |
|---|---|---|---|---|---|
| brickpi-rigraptor-tank | 43 / 34 | 63 / 10 | 43 | 20 | 2 |
| crane-cuber | 760 / 264 | 992 / 23 | 760 | 232 | 4 |
| mappingrobots-ev3 | 77 / 61 | 119 / 11 | 71 | 48 | 3 |
| ofdl-wro-2018-junior | 168 / 113 | 249 / 20 | 182 | 67 | 4 |
| ofdl-wro-2019-junior-all-collect | 240 / 140 | 357 / 19 | 250 | 107 | 4 |
| ofdl-wro-2019-junior-gripper | 135 / 118 | 235 / 15 | 165 | 70 | 3 |
| ofdl-wro-2020-junior | 336 / 184 | 498 / 17 | 370 | 128 | 4 |
| packt-falcon | 198 / 126 | 301 / 13 | 190 | 111 | 2 |
| packt-gps-car | 225 / 140 | 339 / 17 | 214 | 125 | 2 |
| packt-grunt | 336 / 176 | 475 / 26 | 327 | 148 | 1 |
| packt-omnilander | 175 / 212 | 338 / 40 | 166 | 172 | 2 |
| packt-security-tank | 218 / 172 | 362 / 18 | 204 | 158 | 2 |
| packt-timmyton-5-7 | 214 / 180 | 367 / 19 | 221 | 146 | 2 |

(Motors turning: the headless bench, every motor at 60 % for 2 s.) Still refused: cable plugs, parts with
no connectors the catalogue derives (a pin connector), parts not in the LDraw library under
their LDD number (a rubber tread), gear racks (they mesh, they do not join), the rubber feet of
tread links, and parts that touch nothing placed. Some symmetric-looking parts (the EV3 brick's
screen side and its back, open frames) fit the model's connections either way round; the
physics treats them alike. Importing takes 0.1–10 s on a loaded Mac.
`test/bw-sim-ldd-snap.test.mjs` checks a hand-made model: an L-beam on three pins of two beams,
its bone written for a frame the importer cannot know, lands on the pins.
