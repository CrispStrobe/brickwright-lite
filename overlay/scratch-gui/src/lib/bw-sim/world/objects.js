// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// World objects (docs/ROBOT-LAB-ARCHITECTURE.md §5.5): the `load` role — a
// DYNAMIC body that is not part of the model and that the model moves by
// contact (owner decision D2: robot–load contact is on, R3): a pallet the
// forks lift, a box a gripper picks up. A mat may carry loads as it carries
// obstacles (world/mats.js `loads`, the compile option `loads`); the compiler
// turns each into a body with role 'load' (mech/compile.js).
//
// A load is plain data, world metres:
//   {id, position: [x, y, z]   x/z on the floor, y the height of its bottom above it,
//    yawDeg?, massKg, friction?, color? (a CSS colour for the view),
//    grip?: 'pallet-pockets' | 'hook-loop',
//    boxes: [{size: [x, y, z], offset?: [x, y, z]}]}   its shape, in its own frame
//   (origin at the middle of its footprint, on its bottom face; y up).

/**
 * The pallet of slice R4 (T4 forklift): 60 × 40 × 10 mm, 30 g, two fork pockets running
 * along its depth (z). A 3.4 mm deck on three runners 6.6 mm tall; the pockets between the
 * runners are 10 mm wide, centred 8 mm either side of the middle (the forklift's tines are 40 LDU = 16 mm apart) — a fork tine
 * (2823: 8 mm wide, 6.4 mm tall, measured from its LDraw mesh) fits with 1 mm each side and
 * 0.2 mm above. Friction 0.6: wood on plastic (an estimate; no measurement).
 */
export const PALLET = Object.freeze({
    sizeM: Object.freeze([0.06, 0.01, 0.04]),
    deckM: 0.0034,
    pocketWidthM: 0.01,
    pocketCentreM: 0.008,
    massKg: 0.03,
    friction: 0.6,
    color: '#b5835a'
});

/** A pallet load at `position` (world m; y: its bottom above the floor), turned by yawDeg. */
export const palletLoad = ({id = 'pallet', position, yawDeg = 0}) => {
    const [W, H, D] = PALLET.sizeM;
    const runnerH = H - PALLET.deckM;
    const c = PALLET.pocketCentreM;
    const pw = PALLET.pocketWidthM;
    // Runners: outer ones from the pocket's outer edge to the pallet's side, the middle one between the pockets.
    const outer = W / 2 - (c + pw / 2);
    const middle = 2 * (c - pw / 2);
    const runner = (width, x) => ({size: [width, runnerH, D], offset: [x, runnerH / 2, 0]});
    return {
        id, position: position.slice(), yawDeg, massKg: PALLET.massKg, friction: PALLET.friction, color: PALLET.color,
        grip: 'pallet-pockets',
        boxes: [
            {size: [W, PALLET.deckM, D], offset: [0, runnerH + PALLET.deckM / 2, 0]},
            runner(outer, -(W / 2 - outer / 2)),
            runner(middle, 0),
            runner(outer, W / 2 - outer / 2)
        ]
    };
};

const isVec = (v, n = 3) => Array.isArray(v) && v.length === n && v.every(x => typeof x === 'number' && Number.isFinite(x));

/** Problems with a load description (empty: it is valid). */
export const validateLoad = load => {
    const id = load && typeof load.id === 'string' ? load.id : '';
    if (!id) return ['load id missing'];
    const out = [];
    if (!isVec(load.position)) out.push(`load '${id}' position must be Vec3`);
    if (load.yawDeg !== undefined && !(typeof load.yawDeg === 'number' && Number.isFinite(load.yawDeg))) out.push(`load '${id}' yawDeg must be a number`);
    if (!(typeof load.massKg === 'number' && load.massKg > 0)) out.push(`load '${id}' massKg must be positive`);
    if (load.friction !== undefined && !(typeof load.friction === 'number' && load.friction >= 0 && load.friction <= 2)) out.push(`load '${id}' friction must be in 0..2`);
    if (!Array.isArray(load.boxes) || load.boxes.length === 0) out.push(`load '${id}' needs at least one box`);
    else {
        load.boxes.forEach((b, i) => {
            if (!(isVec(b && b.size) && b.size.every(v => v > 0))) out.push(`load '${id}' box ${i} size must be three positive numbers`);
            if (b && b.offset !== undefined && !isVec(b.offset)) out.push(`load '${id}' box ${i} offset must be Vec3`);
        });
    }
    return out;
};

/**
 * The body of a valid load, standing on the floor whose top is at y = groundTop:
 * a dynamic body `load:<id>` with role 'load' (contracts.js BODY_ROLES), one box collider per
 * box, its origin on the middle of its footprint at its bottom.
 */
export const loadBody = (load, groundTop) => {
    const yaw = (load.yawDeg || 0) * Math.PI / 180;
    const body = {
        id: `load:${load.id}`,
        motion: 'dynamic',
        role: 'load',
        position: [load.position[0], groundTop + load.position[1], load.position[2]],
        rotation: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)],
        massKg: load.massKg,
        colliders: load.boxes.map(b => ({shape: 'box', halfExtents: b.size.map(v => v / 2), position: (b.offset || [0, 0, 0]).slice()})),
        parts: []
    };
    if (typeof load.friction === 'number') body.friction = load.friction;
    if (typeof load.color === 'string') body.loadColor = load.color;
    if (load.grip) body.grip = load.grip;
    return body;
};
