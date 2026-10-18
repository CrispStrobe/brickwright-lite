// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// LEGO Digital Designer (LDD) → LDraw, for the Robot Lab's .lxf import
// (model/lxf-model.js): which LDraw part an LDD design is, how the two part
// frames differ, and which LDraw colour an LDD material is.
//
// PARTS: A SMALL CURATED TABLE, NOT A VENDORED MAPPING FILE
// --------------------------------------------------------
// LDraw names a part file after the design number moulded on the part, and
// LDD's `designID` is that same LEGO design number, so the NAME mapping is the
// identity for the parts below (plus four LDD design numbers that are newer
// mould numbers of an LDraw part: 64290, 64871, 6590, 6562). What is not the
// identity is the part FRAME: LDD puts a part's origin elsewhere (for a beam,
// at its end hole) and lays it along another axis. The community-maintained
// LDD↔LDraw mapping file `ldraw.xml` (header "MG beta 4.32 … LDD 4.3.6 Brick
// ver 1033", shipped with LDD and copied by LeoCAD/LPub3D) records that frame
// difference per part as a translation (LDD units) and an axis-angle. That
// file carries no licence statement, so it is NOT vendored: the rows below
// record its frame facts only for the 27 core Technic parts the Robot Lab's
// catalog knows (beams, pins, axles, bushes, round and bevel gears), checked
// by hand against the pattern they follow (a beam of n holes sits
// (n-1)/2 × 0.8 LDD units from its end hole; an axle or pin of length L
// studs at L × 0.4, half its length, from its end).
// Every other design ID — including every SPIKE Prime element, which LDD never
// had — is refused with code `lxf-unknown-design`, never guessed.
// The sub-LDU offsets (0.02 LDD = 0.5 LDU) are kept as recorded.
//
// How a row is used (column vectors; LeoCAD's lc_lxf.cpp reads the same file
// the same way, which is how the convention was confirmed):
//   LDraw rotation = F · B · Rn · F,  LDraw position = 25 · F · (b − B · Rn · t)
// with B, b the LXFML bone's rotation and translation (LDD units, y up),
// Rn the rotation by −angle about `axis`, t the row's translation and
// F = diag(1, −1, −1) (LDraw is −y up, −z toward the viewer); 1 LDD unit is
// 25 LDU (a stud pitch: 0.8 LDD = 20 LDU).
//
// COLOURS: FROM LDRAW'S OWN TABLE
// -------------------------------
// LDraw's LDConfig.ldr (static/ldraw/LDConfig.ldr, CC BY 4.0, vendored with the
// parts) writes the LEGO colour number above each colour as
// `0 // LEGOID 21 - Bright Red`; an LDD material IS that LEGO colour number.
// lddColours() reads the map from the file, so no colour table is kept here.

const K = 0.5773503; // 1/√3: the beams' frame turns 120° about the cube diagonal
/** [design IDs, LDraw part, translation (LDD units), axis, angle (rad)] */
const ROWS = [
    [['32523'], '32523.dat', [0.02, 0.4, -0.8], [K, K, K], -2.0943951],
    [['32316'], '32316.dat', [0.02, 0.4, -1.6], [K, K, K], -2.0943951],
    [['32524'], '32524.dat', [0.02, 0.4, -2.4], [K, K, K], -2.0943951],
    [['40490'], '40490.dat', [0.02, 0.4, -3.2], [K, K, K], -2.0943951],
    [['32525', '64290'], '32525.dat', [0.02, 0.4, -4], [K, K, K], -2.0943951],
    [['41239'], '41239.dat', [0.02, 0.4, -4.8], [K, K, K], -2.0943951],
    [['32278', '64871'], '32278.dat', [0.02, 0.4, -5.6], [K, K, K], -2.0943951],
    [['2780'], '2780.dat', [0.8, 0.02, 0], [0, 1, 0], 1.570796],
    [['3673'], '3673.dat', [0.8, 0.02, 0], [0, 1, 0], 1.570796],
    [['43093'], '43093.dat', [0.8, 0.02, 0], [0, 1, 0], 1.570796],
    [['3749', '6562'], '3749.dat', [0.8, 0.02, 0], [0, 1, 0], 1.570796],
    [['6558'], '6558.dat', [-1.2, 0.02, 0], [0, 1, 0], 4.712389],
    [['32062'], '32062.dat', [0.8, 0.02, 0], [0, 1, 0], 1.570796],
    [['4519'], '4519.dat', [1.2, 0.02, 0], [0, 1, 0], 1.570796],
    [['3705'], '3705.dat', [1.6, 0.02, 0], [0, 1, 0], 1.570796],
    [['32073'], '32073.dat', [2, 0.02, 0], [0, 1, 0], 1.570796],
    [['3706'], '3706.dat', [2.4, 0.02, 0], [0, 1, 0], 1.570796],
    [['3707'], '3707.dat', [3.2, 0.02, 0], [0, 1, 0], 1.570796],
    [['3737'], '3737.dat', [4, 0.02, 0], [0, 1, 0], 1.570796],
    [['3708'], '3708.dat', [4.8, 0.02, 0], [0, 1, 0], 1.570796],
    [['3713', '6590'], '3713.dat', [0, 0.02, -0.4], [0, 1, 0], 3.141593],
    [['3647'], '3647.dat', [0, 0.02, 0.4], [1, 0, 0], 0],
    [['94925'], '94925.dat', [0, 0.02, -0.4], [0, 1, 0], 3.141593],
    [['3648'], '3648.dat', [0, 0.02, 0.4], [1, 0, 0], 0],
    [['3649'], '3649.dat', [0, 0.02, 0.3], [1, 0, 0], 0],
    [['6589'], '6589.dat', [0, 0.02, -0.3], [0, 1, 0], 3.141593],
    [['32198'], '32198.dat', [0, 0.02, 0.3], [0, 1, 0], 0]
];

/** design ID → {part, translation, axis, angle} */
export const LDD_PARTS = new Map(ROWS.flatMap(([ids, part, translation, axis, angle]) =>
    ids.map(id => [id, Object.freeze({part, translation, axis, angle})])));

/** 1 LDD unit in LDU. */
export const LDD_UNIT_LDU = 25;

/**
 * LEGO colour number (an LDD material) → LDraw colour code, from LDConfig.ldr's
 * `// LEGOID n - name` comment above each `0 !COLOUR … CODE c` line.
 * @param {string} ldconfig LDConfig.ldr text
 * @returns {Map<number, number>}
 */
export const lddColours = ldconfig => {
    const map = new Map();
    let pending = null;
    for (const raw of ldconfig.split(/\r?\n/)) {
        // `// LEGOID 21 - Bright Red`, or several numbers for one colour: `// LEGOID 1 / 426 - White`.
        const legoId = raw.match(/^\s*0\s+\/\/\s*LEGOID\s+([\d\s/]+?)\s*-/);
        if (legoId) {
            pending = legoId[1].split('/').map(Number).filter(Number.isInteger);
            continue;
        }
        const colour = raw.match(/^\s*0\s+!COLOUR\s+\S+\s+CODE\s+(\d+)\b/i);
        if (colour) {
            for (const id of pending || []) if (!map.has(id)) map.set(id, Number(colour[1]));
            pending = null;
        }
    }
    return map;
};
