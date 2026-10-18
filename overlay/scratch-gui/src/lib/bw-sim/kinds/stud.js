// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// System clutch (docs/ROBOT-LAB-PARTS-COVERAGE.md): a stud held by the part above it.
//
//   stud + antistud   rigid (kinds/pin-axle.js, the v1 rule): a stud in an anti-stud
//                     cell of the bottom face — between the walls and tubes of a brick,
//                     plate or tile (scripts/derive-part-meta.mjs measures the cells);
//   stud + tube       rigid (this module): a stud in the bore of an open underside tube
//                     (LDraw p/stud4.dat) — the half-stud offset a 2-wide part allows.
//
// Both are clutch: a seated stud is a rigid edge, so a stack of bricks compiles to one
// body. A stud seats when its base centre meets the cell's (or the tube's bottom
// centre) within 0.5 LDU and the two point the same way (1°): the stud's `axis` points
// out of the stud, the cell's and the tube's point out of the part's bottom face, i.e.
// along the stud that enters (both [0, -1, 0] for parts the right way up in LDraw).
//
// As in kinds/slide.js, the pair rule lives on the kind that is added ('tube'): kinds
// are added, never edited. `coincide: true` tells the editor's magnet snap (editor/snap.js)
// to place the two connectors on each other, as it does a stud on an anti-stud.

import {COS_1_DEG, vecDot, vecDist} from '../mech/vec.js';

const TOL = 0.5 + 1e-9;

/** A stud's base centre on the tube's bottom centre, pointing the same way. */
export const studSeats = (stud, hole) => vecDist(stud.position, hole.position) <= TOL &&
    vecDot(stud.axis, hole.axis) >= COS_1_DEG - 1e-12;

const studInTube = {
    with: 'stud',
    edge: () => 'rigid',
    match: (tube, stud) => studSeats(stud, tube)
};

export const TUBE = {kind: 'tube', coincide: true, pairs: [studInTube]};
