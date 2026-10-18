// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// A connector kind and a coupling kind that exist only in this test module,
// registered beside the built-ins (kinds/index.js withKinds) to prove that a
// new mechanism is a module plus part metadata — no edit to the compiler
// (mech/), the contracts or the registries (docs/ROBOT-LAB-ARCHITECTURE.md §6.2).
//
//   toy-peg + toy-socket   a peg turning in a socket: a HINGE edge, when the two
//                          centres coincide (0.5 LDU) and the axes are parallel
//   belt (coupling)        two hinges whose turning parts are toy pulleys
//                          (`toyPulley: {radiusLdu}` in their metadata) are
//                          belted: same sense, ratio r1 / r2

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const parallel = (a, b) => Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) > 0.9998;

export const TOY_CONNECTORS = [
    {kind: 'toy-peg', shaft: true, pairs: [{with: 'toy-socket', edge: () => 'hinge',
        match: (peg, socket) => dist(peg.position, socket.position) <= 0.5 && parallel(peg.axis, socket.axis)}]},
    {kind: 'toy-socket'}
];

export const TOY_BELT = {
    id: 'toy-belt',
    kind: 'belt',
    /** Every pair of hinges whose turning body (body2) carries a toy pulley, in joint order. */
    detect ({joints, islands, nodes}) {
        const pulleys = [];
        for (const j of joints) {
            if (j.type !== 'hinge') continue;
            for (const [nodeId, bodyId] of islands.nodeToBody) {
                const node = nodes.get(nodeId);
                if (bodyId === j.body2 && node.meta.toyPulley) pulleys.push({joint: j.id, part: node.partId, r: node.meta.toyPulley.radiusLdu});
            }
        }
        const couplings = [];
        for (let i = 1; i < pulleys.length; i++) {
            const [a, b] = [pulleys[i - 1], pulleys[i]];
            couplings.push({joint1: a.joint, joint2: b.joint, ratio: a.r / b.r, parts: [a.part, b.part]});
        }
        return {couplings};
    },
    validate (c, m) {
        const out = [];
        for (const k of ['joint1', 'joint2']) if (!m.joints.some(j => j.id === c[k] && j.type === 'hinge')) out.push(`${k}: not a hinge`);
        if (!(c.ratio > 0)) out.push('ratio: a belt turns both pulleys the same way (ratio > 0)');
        return out;
    },
    bodies: (c, joints) => [c.joint1, c.joint2].map(id => joints.find(j => j.id === id).body2)
};

const box = halfExtents => [{shape: 'box', halfExtents}];

/** A base with two sockets and two pulleys with pegs, as a part catalogue (PartMeta v2). */
export const toyCatalog = () => new Map([
    ['toy-base.dat', {part: 'toy-base.dat', name: 'Toy base', category: 'beam', massGrams: 5,
        connectors: [
            {id: 's0', type: 'toy-socket', position: [-40, 0, 0], axis: [0, 0, 1], length: 20},
            {id: 's1', type: 'toy-socket', position: [40, 0, 0], axis: [0, 0, 1], length: 20}
        ],
        colliders: box([60, 10, 10])}],
    ['toy-pulley-small.dat', {part: 'toy-pulley-small.dat', name: 'Toy pulley small', category: 'gear', massGrams: 1,
        connectors: [{id: 'peg', type: 'toy-peg', position: [0, 0, 0], axis: [0, 0, 1], length: 20}],
        colliders: box([10, 10, 4]), toyPulley: {radiusLdu: 10}}],
    ['toy-pulley-large.dat', {part: 'toy-pulley-large.dat', name: 'Toy pulley large', category: 'gear', massGrams: 2,
        connectors: [{id: 'peg', type: 'toy-peg', position: [0, 0, 0], axis: [0, 0, 1], length: 20}],
        colliders: box([20, 20, 4]), toyPulley: {radiusLdu: 20}}]
]);

const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** The base with a small pulley in one socket and a large one in the other. */
export const TOY_MODEL = Object.freeze({version: 1, parts: [
    {id: 'base', part: 'toy-base.dat', position: [0, 0, 0], rotation: I3},
    {id: 'small', part: 'toy-pulley-small.dat', position: [-40, 0, 0], rotation: I3},
    {id: 'large', part: 'toy-pulley-large.dat', position: [40, 0, 0], rotation: I3}
]});
