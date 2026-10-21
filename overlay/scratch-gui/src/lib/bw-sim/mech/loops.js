// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Closed loops of hinges in a model from elsewhere (docs/ROBOT-LAB-REAL-MODELS.md). A real set's steering linkage
// or four-bar is a loop of hinges: each hinge locks five degrees of freedom, so a loop locks more than its links have,
// and with the axes a file rounds a hair off parallel the extra constraints fight. With links of one to three grams
// Jolt's solver gives way (the rally car 42109: every body NaN in one step after 0.75 s). The usual remedy: one hinge
// per independent loop becomes a ball joint (three constraints), which frees exactly the redundant ones and moves the
// linkage as before. Kept as hinges: motorised joints, joints with limits or a spring, and joints a coupling names
// (a gear, a rack, a chain turns them about their axis).

/**
 * @param {object[]} joints CompiledMechanism joints (hinge, slider, ball; body2 may be 'world')
 * @param {{keep: Set<string>, massOf: (bodyId: string) => number}} opts
 * @returns {{joints: object[], balls: string[]}} the joints with each loop's closing hinge a ball, and their ids
 */
export const breakHingeLoops = (joints, {keep, massOf}) => {
    const parent = new Map();
    const find = x => {
        if (!parent.has(x)) parent.set(x, x);
        while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); }
        return x;
    };
    const light = j => Math.min(massOf(j.body1), massOf(j.body2));
    // Kept joints first (they are never the loop's closing edge), then the rest heaviest first: the closing edge of a
    // loop is then at its lightest link, where a ball changes least.
    const order = [...joints.filter(j => keep.has(j.id)), ...joints.filter(j => !keep.has(j.id)).sort((a, b) => light(b) - light(a) || (a.id < b.id ? -1 : 1))];
    const pairs = new Set();
    const balls = [];
    for (const j of order) {
        const key = j.body1 < j.body2 ? `${j.body1}|${j.body2}` : `${j.body2}|${j.body1}`;
        // A second joint between the same two bodies is not a loop (collinear hinges are one axis, mech/joints.js).
        if (pairs.has(key)) continue;
        pairs.add(key);
        const [a, b] = [find(j.body1), find(j.body2)];
        if (a === b) {
            if (j.type === 'hinge' && !keep.has(j.id) && Array.isArray(j.point)) balls.push(j.id);
        } else parent.set(a, b);
    }
    const ball = new Set(balls);
    return {joints: joints.map(j => (ball.has(j.id) ? {id: j.id, type: 'ball', body1: j.body1, body2: j.body2, point: j.point.slice()} : j)), balls};
};
