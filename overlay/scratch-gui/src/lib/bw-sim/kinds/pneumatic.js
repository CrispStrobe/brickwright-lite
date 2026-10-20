// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Pneumatics v1 (docs/ROBOT-LAB-ARCHITECTURE.md §1.2 M12, docs/ROBOT-LAB-UX.md §16). What it is:
//
//   - a cylinder: its body (u9145c01: a 'pneu-bore', data {strokeLdu, boreMm}) and its rod
//     (21828c01: a 'pneu-rod') slide (a slider edge, as kinds/shock.js), narrowed to the stroke;
//     its 'air-port's: role 'extend' (air in pushes the rod out) and 'retract';
//   - a valve (19474-f1): an axle in its 'valve-lever' turns on a hinge — the lever's angle from
//     where the model has it (neutral) is the valve's state: up past VALVE_DEG sends air to its
//     'outA' port, down past it to 'outB', between them both are shut;
//   - hoses: the model's `hoses` ({id, a: {part, port}, b: {part, port}}, editor/hose-path.js),
//     from a valve's outlet to a cylinder's port.
//
// What it leaves out, said here and in the UX notes: the air supply is ideal (as from a pumped-up
// tank: the valve's 'supply' port is always fed, at SUPPLY_KPA), the air is not compressible (a
// shut valve holds the rod where it is), and the valve's lever is drawn where the model has it.
//
// Coupling module 'pneumatic' (kind 'pneumatic'), one per cylinder a valve feeds:
//   {sliderJoint, outSign (+1 when the slider's coordinate grows as the rod comes out), valveJoint,
//    valveSign (+ the lever up), extendFrom: 'outA'|'outB'|null, retractFrom: …, forceN, speedMPerS}
// the core (physics/jolt-core.js pneumaticDrives) reads the valve's hinge before each step and drives
// the slider out or in with at most forceN = p·A, or holds it.
import {vecSub, vecDot, vecNormalize} from '../mech/vec.js';
import {LDU_M, dirToWorld} from '../contracts.js';
import {shaftEngagement} from './pin-axle.js';
import {toothConnectors, placedTooth} from './tooth-parts.js';
import {parallelAxes} from './gear-mesh.js';

/** The supply's pressure (kPa above the air's): a LEGO hand pump reaches about two bar. */
export const SUPPLY_KPA = 150;
/** The lever's turn (degrees) past which the valve opens one way or the other. */
export const VALVE_DEG = 15;
/** How fast a rod moves under air (m/s): a small cylinder's flow, not its force, sets it. */
export const ROD_SPEED_M_PER_S = 0.06;

const isNum = v => typeof v === 'number' && Number.isFinite(v);

/** The rod's inner end and the bore's inner end (as kinds/shock.js): how far in it can still go. */
const roomIn = (rod, bore) => {
    const ends = c => [1, -1].map(s => c.position.map((v, i) => v + c.axis[i] * s * c.length / 2));
    const d = (p, q) => Math.hypot(...vecSub(p, q));
    const rodEnds = ends(rod).sort((p, q) => d(p, bore.position) - d(q, bore.position));
    const boreIn = ends(bore).sort((p, q) => d(q, rodEnds[1]) - d(p, rodEnds[1]))[0];
    // In: from the rod's outer end towards the bore's inner end (never zero: the rod fully in has its inner end there).
    const inward = vecNormalize(vecSub(boreIn, rodEnds[1]));
    return {room: vecDot(vecSub(boreIn, rodEnds[0]), inward), inward};
};

export const PNEUMATIC = {
    id: 'pneumatic',
    kind: 'pneumatic',
    detect ({nodes, islands, joints, model}) {
        const couplings = [];
        const limits = [];
        const bores = toothConnectors(nodes, islands, 'pneu-bore');
        const rods = toothConnectors(nodes, islands, 'pneu-rod');
        const levers = toothConnectors(nodes, islands, 'valve-lever');
        const hoses = (model && model.hoses) || [];
        // Which valve outlet feeds a port: the other end of a hose from it.
        const fedBy = (partId, portId) => {
            for (const h of hoses) {
                for (const [me, other] of [[h.a, h.b], [h.b, h.a]]) if (me.part === partId && me.port === portId) return other;
            }
            return null;
        };
        const portsOf = partId => {
            const node = [...nodes.values()].find(n => n.partId === partId);
            return node ? (node.meta.connectors || []).filter(c => c.type === 'air-port') : [];
        };
        for (const bore of bores) {
            const rod = rods.find(r => r.islandId !== bore.islandId && shaftEngagement(r.c, bore.c) !== null);
            if (!rod) continue;
            const j = joints.find(x => x.type === 'slider' &&
                ((x.body1 === bore.islandId && x.body2 === rod.islandId) || (x.body1 === rod.islandId && x.body2 === bore.islandId)));
            if (!j) continue;
            // The stroke (as the shock): from fully in to fully out, measured from where the rod is.
            const stroke = bore.data.strokeLdu;
            const {room, inward} = roomIn(rod.c, bore.c);
            const sigma = j.body2 === rod.islandId ? 1 : -1;
            const k = sigma * vecDot(vecNormalize(dirToWorld(inward)), j.axis);
            const inM = k * Math.max(0, Math.min(stroke, room)) * LDU_M;
            const outM = -k * (stroke - Math.max(0, Math.min(stroke, room))) * LDU_M;
            limits.push({joint: j.id, limits: [Math.min(inM, outM), Math.max(inM, outM)]});
            // Its ports, and the valve outlets that feed them.
            const feeds = {};
            let valve = null;
            for (const port of portsOf(bore.partId)) {
                const src = fedBy(bore.partId, port.id);
                if (!src) continue;
                const srcPort = portsOf(src.part).find(p => p.id === src.port);
                const lever = levers.find(l => l.partId === src.part);
                if (!srcPort || !lever || !['outA', 'outB'].includes(srcPort.data.role)) continue;
                feeds[port.data.role] = srcPort.data.role;
                valve = valve || lever;
            }
            if (!valve) continue;
            // The valve's hinge: an axle turning in its lever hole (its axis, through the pivot).
            const hinge = joints.find(x => x.type === 'hinge' && (x.body1 === valve.islandId || x.body2 === valve.islandId) &&
                parallelAxes(vecNormalize(dirToWorld(x.axis)), valve.c.axis));
            if (!hinge) continue;
            const areaM2 = Math.PI * (bore.data.boreMm / 2000) ** 2;
            couplings.push({sliderJoint: j.id, outSign: -Math.sign(k) || 1, valveJoint: hinge.id, valveSign: hinge.body2 === valve.islandId ? -1 : 1,
                extendFrom: feeds.extend || null, retractFrom: feeds.retract || null,
                forceN: SUPPLY_KPA * 1000 * areaM2, speedMPerS: ROD_SPEED_M_PER_S, parts: [bore.partId, rod.partId, valve.partId]});
        }
        return {couplings, limits};
    },
    validate (c, m) {
        const out = [];
        const joints = new Map((m.joints || []).map(j => [j.id, j]));
        if (joints.get(c.sliderJoint)?.type !== 'slider') out.push('sliderJoint: need a slider');
        if (joints.get(c.valveJoint)?.type !== 'hinge') out.push('valveJoint: need a hinge');
        if (!(c.forceN > 0) || !(c.speedMPerS > 0)) out.push('forceN, speedMPerS: positive');
        return out;
    },
    /** The editor's overlap rule: a rod in its cylinder shares volume with it. */
    placedMesh (a, metaA, b, metaB) {
        for (const [p, mp, q, mq] of [[a, metaA, b, metaB], [b, metaB, a, metaA]]) {
            const rs = placedTooth(p, mp, 'pneu-rod');
            if (rs.length && placedTooth(q, mq, 'pneu-bore').some(bo => rs.some(r => shaftEngagement(r.c, bo.c) !== null))) return true;
        }
        return false;
    }
};

const rodInBore = {with: 'pneu-rod', edge: () => 'slider', match: (bore, rod) => shaftEngagement(rod, bore) !== null};
export const PNEU_BORE = {
    kind: 'pneu-bore',
    pairs: [rodInBore],
    validate (c) {
        const out = [];
        if (!(isNum(c.length) && c.length > 0)) out.push('a pneu-bore needs its length (LDU)');
        if (!c.data || !(c.data.strokeLdu > 0) || !(c.data.boreMm > 0)) out.push('data.strokeLdu, data.boreMm: the stroke (LDU), the bore (mm)');
        return out;
    }
};
export const PNEU_ROD = {kind: 'pneu-rod', validate: c => (isNum(c.length) && c.length > 0 ? [] : ['a pneu-rod needs its length (LDU)'])};
/** An axle in the valve's lever hole turns (a hinge): the lever (its angle is the valve's state). */
export const VALVE_LEVER = {
    kind: 'valve-lever',
    pairs: [{with: 'axle', edge: () => 'hinge', match: (lever, axle) => shaftEngagement(axle, lever) !== null}],
    validate: c => (isNum(c.length) && c.length > 0 ? [] : ['a valve-lever needs its length (LDU)'])
};
export const AIR_PORT = {
    kind: 'air-port',
    validate: c => (c.data && ['extend', 'retract', 'supply', 'outA', 'outB'].includes(c.data.role) ? [] : ['data.role: extend, retract, supply, outA or outB'])
};
