// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// LEGO Digital Designer (LDD) → LDraw, for the Robot Lab's .lxf import
// (model/lxf-model.js): which LDraw part an LDD design is, how the two part
// frames differ, and which LDraw colour an LDD material is.
//
// PARTS: THE DESIGN NUMBER, AND A FRAME WORKED OUT, NEVER A RECORDED TABLE
// -------------------------------------------------------------------------
// LDraw names a part file after the design number moulded on the part, and
// LDD's `designID` is that same LEGO design number, so the NAME mapping is the
// identity: design 32524 is 32524.dat. What is not the identity is the part
// FRAME: LDD puts a part's origin elsewhere (for a beam, at its end hole) and
// lays it along another axis. No per-part frame is recorded in this repository
// (LDD's mapping file `ldraw.xml` carries no licence statement: it is used only
// as a local check, docs/ROBOT-LAB-LDD-FRAMES.md). The frame is worked out:
//   - from the part's geometry (model/ldd-frame.js): the stud-grid rule for
//     System parts, and the Technic rules for the shapes where LDD's choice of
//     end and sense cannot matter (technicShape: a pin, an axle, a bush, a round
//     gear's hub; a straight beam of alike holes — a beam of n holes sits
//     (n−1)/2 × 0.8 LDD units from its end hole, an axle or pin of length L
//     studs at L × 0.4, half its length, from its end);
//   - for any other catalogue part, from its connections in the model
//     (model/ldd-snap.js);
// every other design ID — including every SPIKE Prime element, which LDD never
// had — is refused with code `lxf-unknown-design`.
//
// How a frame row is used (column vectors; the convention LeoCAD's lc_lxf.cpp
// applies to LDD files too):
//   LDraw rotation = F · B · Rn · F,  LDraw position = 25 · F · (b − B · Rn · t)
// with B, b the LXFML bone's rotation and translation (LDD units, y up),
// Rn the frame's rotation, t its translation and
// F = diag(1, −1, −1) (LDraw is −y up, −z toward the viewer); 1 LDD unit is
// 25 LDU (a stud pitch: 0.8 LDD = 20 LDU).
//
// COLOURS: FROM LDRAW'S OWN TABLE
// -------------------------------
// LDraw's LDConfig.ldr (static/ldraw/LDConfig.ldr, CC BY 4.0, vendored with the
// parts) writes the LEGO colour number above each colour as
// `0 // LEGOID 21 - Bright Red`; an LDD material IS that LEGO colour number.
// lddColours() reads the map from the file, so no colour table is kept here.

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
