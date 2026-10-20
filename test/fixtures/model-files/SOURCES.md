# Model files from other programs — sources and licences

Real files written by other people with other programs, used by
`test/bw-sim-model-foreign.test.mjs`. Each is kept byte for byte as downloaded
(header, author and licence lines included). Downloaded 2026-10-18.

| File | Set | Author (header) | Licence (header line) | Program (from the header) | Size | sha256 |
|---|---|---|---|---|---|---|
| `42022-1.mpd` | 42022-1 Hot Rod | Faramond Florent [Makou] | `0 !LICENSE Redistributable under CCAL version 2.0 : see CAreadme.txt` (CC BY 2.0) | probably MLCad (`0 ROTATION CENTER … "Custom"`, `0 ROTATION CONFIG`); rotations written with 3 decimals | 26,777 B | `27483bd39081f2e5ee3a30af9e154f528e3f85c5d5fc598337f8f5d9ee0df25b` |
| `42032-1.mpd` | 42032-1 Compact Tracked Loader | Philippe Hurbain [Philo] | same line (CC BY 2.0) | LDCad 1.4 (`0 !LDCAD GENERATED [generator=LDCad 1.4]`, a generated chain); embeds the unofficial part `42032 - 33299b.dat` (author Santeri Piippo [arezey]) | 29,470 B | `83e4493b00058fee922d9fbb80f13ef346654a231c4dc673418b2615887ff848` |
| `42034-1.mpd` | 42034-1 Quad Bike | Philippe Hurbain [Philo] | same line (CC BY 2.0) | not named | 10,130 B | `5d32ac6f59fbf87e7334b6e6e6008e9462592fdc8f3ae115b24dd605de8e6089` |
| `8527-1.mpd` | 8527-1 MINDSTORMS NXT, Tri-bot | Cameron Brick [LegoManIAm94] (two cable sub-files: LDCad) | same line, all 31 sections (CC BY 2.0) | LDCad 1.7 Alpha 1 (`0 !LDCAD GENERATED`: its NXT cables, stretched segments; embeds `8527 - ldcNxtWireSeg.dat` and `8527 - ldcConRing-2-4.dat`) | 207,430 B | `1821c669e3663ef602d5d11d75acee17cf1b5eff0d60c15aac999cd54e4ac170` |

**Where from:** the LDraw Official Model Repository (OMR), https://library.ldraw.org/omr —
the files themselves at `https://library.ldraw.org/library/omr/42022-1.mpd`,
`https://library.ldraw.org/library/omr/42032-1.mpd` and
`https://library.ldraw.org/library/omr/42034-1.mpd`, and the Tri-bot (added 2026-10-20) at
`https://library.ldraw.org/media/omr_models/1775/8527-1_Tri-bot.mpd`, saved as `8527-1.mpd` (the set pages' "Download" links 404 for
some sets; these direct links work). The OMR may update a file; the sha256 above is the
version kept here.

**Licence:** each file's own header says `Redistributable under CCAL version 2.0`, the
Creative Commons Attribution 2.0 licence (https://creativecommons.org/licenses/by/2.0/);
the OMR Specification (https://www.ldraw.org/article/593.html, revised 22-Nov-2023) asks new
files for CC BY 4.0, but these were released under 2.0 and say so. Attribution: the authors
above, the LDraw.org OMR. Nothing in the files is changed.

## What is missing (the owner can supply it)

- **BrickLink Studio `.io`:** no real Studio file with an explicit open licence was found.
  vengi (MIT code, assets CC BY-SA 3.0) has `data/testio/studioio-encrypted.io`, but it is a
  synthetic 443-byte encrypted ZIP (one brick 3001), not a Studio export, and the Robot
  Lab's own `test/fixtures/bw-sim/interop/studio-encrypted.io` already covers that case. No
  `.io` is invented here. **A model saved in Studio 2.x by the owner** (a few Technic parts,
  one sub-model; with `model.ldr`, `model2.ldr`, `.info`, thumbnail) would close this gap.
- **LEGO Digital Designer `.lxf`:** one real LDD 4.3 export was found —
  https://raw.githubusercontent.com/NXT-ROS/nxt_robots/master/nxt_robots_gyro_car/urdf/robot.lxf
  (23,449 B, sha256 `0931f10631ffe31c82722e6f64fff0f1f65c643236bd87f5c6ebbb1e57b3a9ff`).
  Its only licence statement is `<license>BSD</license>` in the ROS package's `package.xml`
  (no LICENSE file, no copyright holder), so it is **not** vendored. Opened locally on
  2026-10-18 (not committed): 74 parts placed, 38 refused by design number
  (`lxf-unknown-design`: 32526 ×10, 32123 ×4, 54715 ×3, 54725 ×3, …), nothing else refused,
  the LDraw it gives parses without a note. **An `.lxf` saved in LDD by the owner** (or one
  with a clear licence) would make this a test.
- **LeoCAD:** its repository (GPL-2.0) has no sample or test models (the only `.ldr` is
  `resources/ldconfig.ldr`, the colour table).

## ORBITAL LOOM (bundled adapted Robot Lab example)

- File: `overlay/scratch-gui/static/sim-lab/models/orbital-loom.ldr` (202 LEGO pieces).
- Author/credit: **ORBITAL LOOM, CrispStrobe, 2026**; owner-confirmed original work.
- Source: owner-supplied `orbital_loom_bricks_only.mpd`, version 1.0, 2026-10-20, 210 pieces.
- Exact source and README retained under `orbital-loom-source/` for reproducible adaptation.
- Source SHA256: `d2e22ef40af389d6e1580b3ace65968e390fd6eadac0488aee318adddbb0f539`.
- Licence: BSD-3-Clause, explicitly specified by the owner, superseding the original generated
  README/header wording. Unmodified source fixtures retain their original bytes for hash verification;
  the distributed adaptation and notice use the corrected author/licence. No NC terms.
- Changes: shared 3L mounting pins, bearing clearance pins, shorter drive axle, canonical hub,
  explicit ports/IDs and pose-driven virtual paper/marker attachments. Source geometry proportions
  and gearing retained. Controller/preview/PDF remain unbundled references.

## TIDAL TRIO (original bundled Robot Lab example)

- Credit: **TIDAL TRIO, CrispStrobe, 2026**, BSD-3-Clause as explicitly confirmed by the owner.
- Source: owner-supplied `tidal_trio_complete.zip`, version 1.0, 218 LEGO pieces.
- Retain the exact `tidal_trio_home.mpd`, initial README and preset data in `tidal-trio-source/`.
  Source SHA256: `2d22875000cdedb24e5135eea5c1282b1e0ddfa4ca6a7a56ee7f3d07c69233c5`.
- The owner's credit/licence supersedes the generated source's OpenAI/CC BY wording; raw fixtures
  retain their initial bytes for reproducibility. Bundled adaptation: 226 pieces, three motors,
  eight-piece pinned hub mount, explicit ports, connected instructions and four native programs.
- App notice: `static/sim-lab/licenses/tidal-trio.txt`. LDraw part authors/licences are unchanged.
  Source Python, PDF, predicted GIF and preview are not newly bundled as app behaviour.
