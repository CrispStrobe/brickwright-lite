// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Shock absorbers (docs/ROBOT-LAB-ARCHITECTURE.md §1.2 M17). LDraw's 9L shock absorber is two parts
// — the cylinder (2909) and the piston rod (2910) that slides in it — with the spring as a third,
// formed part (74741-f1 extended, -f2 compressed: the rod 40 LDU further in).
//
// Connector kinds:
//   'shock-bore'  the cylinder's bore: position, axis, length, and `data`
//                   strokeLdu     how far the rod goes in from fully out to fully in
//                   springNPerM   the spring's stiffness, dampingNsPerM its damping
//   'shock-rod'   the rod's shaft that goes in: position, axis, length.
// A rod engaged in a bore (the pin-axle seat rule) is a 'slider' edge (mech/joints.js makes the
// slider joint between the two bodies, as kinds/slide.js's).
//
// Coupling module 'shock' (emits no coupling): for each such slider it narrows the travel to the
// stroke (`limits`: from fully in to fully out, measured from where the rod is in the model) and
// puts a SPRING on the joint (`springs`): it pushes the rod out to the full extension with
// springNPerM per metre it is in, damped. The core (physics/jolt-core.js) drives that slider
// with a position motor whose spring is that stiffness and damping, so it is a spring, not a motor.
import {vecSub, vecDot, vecNormalize} from '../mech/vec.js';
import {LDU_M, dirToWorld} from '../contracts.js';
import {shaftEngagement} from './pin-axle.js';
import {toothConnectors, placedTooth} from './tooth-parts.js';

const isNum = v => typeof v === 'number' && Number.isFinite(v);

/** A rod's inner end and a bore's inner end (LDU): the ends that meet when it is fully in. */
const innerEnds = (rod, bore) => {
    // The rod goes in along its own axis towards the bore's far end: the rod's end nearer the bore's centre.
    const rodEnds = [1, -1].map(s => rod.position.map((v, i) => v + rod.axis[i] * s * rod.length / 2));
    const boreEnds = [1, -1].map(s => bore.position.map((v, i) => v + bore.axis[i] * s * bore.length / 2));
    const d = (p, q) => Math.hypot(...vecSub(p, q));
    const rodIn = rodEnds.sort((p, q) => d(p, bore.position) - d(q, bore.position))[0];
    // the bore's inner (closed) end: the one further from the rod's outer end
    const rodOut = rodEnds[1];
    const boreIn = boreEnds.sort((p, q) => d(q, rodOut) - d(p, rodOut))[0];
    return {rodIn, boreIn, inward: vecNormalize(vecSub(boreIn, rodIn))};
};

export const SHOCK = {
    id: 'shock',
    kind: 'shock',
    detect ({nodes, islands, joints}) {
        const limits = [];
        const springs = [];
        const bores = toothConnectors(nodes, islands, 'shock-bore');
        const rods = toothConnectors(nodes, islands, 'shock-rod');
        for (const bore of bores) {
            for (const rod of rods) {
                if (rod.islandId === bore.islandId || shaftEngagement(rod.c, bore.c) === null) continue;
                const j = joints.find(x => x.type === 'slider' &&
                    ((x.body1 === bore.islandId && x.body2 === rod.islandId) || (x.body1 === rod.islandId && x.body2 === bore.islandId)));
                if (!j) continue;
                const stroke = bore.data.strokeLdu;
                const {rodIn, boreIn, inward} = innerEnds(rod.c, bore.c);
                // How far the rod can still go in (to fully in) and come out (to fully out), LDU.
                const room = Math.max(0, Math.min(stroke, vecDot(vecSub(boreIn, rodIn), inward)));
                const out = stroke - room;
                // The slider's coordinate is body2's travel along j.axis relative to body1: the rod going in by d moves it by k·d.
                const sigma = j.body2 === rod.islandId ? 1 : -1;
                const k = sigma * vecDot(vecNormalize(dirToWorld(inward)), j.axis);
                const xIn = k * room * LDU_M;
                const xOut = -k * out * LDU_M;
                limits.push({joint: j.id, limits: [Math.min(xIn, xOut), Math.max(xIn, xOut)]});
                springs.push({joint: j.id, restM: xOut, stiffness: bore.data.springNPerM, damping: bore.data.dampingNsPerM || 0,
                    parts: [bore.partId, rod.partId]});
            }
        }
        return {limits, springs};
    },
    /** The editor's overlap rule: a rod in its cylinder shares volume with it. */
    placedMesh (a, metaA, b, metaB) {
        for (const [p, mp, q, mq] of [[a, metaA, b, metaB], [b, metaB, a, metaA]]) {
            const rods = placedTooth(p, mp, 'shock-rod');
            if (rods.length && placedTooth(q, mq, 'shock-bore').some(bo => rods.some(r => shaftEngagement(r.c, bo.c) !== null))) return true;
        }
        return false;
    }
};

const rodInBore = {with: 'shock-rod', edge: () => 'slider', match: (bore, rod) => shaftEngagement(rod, bore) !== null};

export const SHOCK_BORE = {
    kind: 'shock-bore',
    pairs: [rodInBore],
    validate (c) {
        const out = [];
        if (!(isNum(c.length) && c.length > 0)) out.push('a shock-bore needs its length (LDU)');
        if (!c.data || !(c.data.strokeLdu > 0)) out.push('data.strokeLdu: the stroke (LDU)');
        if (!c.data || !(c.data.springNPerM > 0)) out.push('data.springNPerM: the spring\'s stiffness (N/m)');
        return out;
    }
};

export const SHOCK_ROD = {
    kind: 'shock-rod',
    validate: c => (isNum(c.length) && c.length > 0 ? [] : ['a shock-rod needs its length (LDU)'])
};
