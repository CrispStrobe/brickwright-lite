// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Pneumatics (docs/ROBOT-LAB-ARCHITECTURE.md §1.2 M12, docs/ROBOT-LAB-UX.md §16). What it is:
//
//   - a cylinder: its body (u9145c01: a 'pneu-bore', data {strokeLdu, boreMm}) and its rod
//     (21828c01: a 'pneu-rod') slide (a slider edge, as kinds/shock.js), narrowed to the stroke;
//     its 'air-port's: role 'extend' (air in pushes the rod out) and 'retract';
//   - a valve (19474-f1): an axle in its 'valve-lever' turns on a hinge — the lever's angle from
//     where the model has it (neutral) is the valve's state: up past VALVE_DEG sends the air from its
//     'supply' port to its 'outA' port, down past it to 'outB', between them both are shut;
//   - hoses: the model's `hoses` ({id, a: {part, port}, b: {part, port}}, editor/hose-path.js);
//   - air networks: the ports a valve's supply reaches through hoses, T-pieces (4697b, role 'tee':
//     its ports are one) and air tanks (75974, role 'tank', data.volumeCm3: its ports are one, and it
//     holds air). A network holds an amount of air (p·V); a cylinder moving under it uses p·A per metre;
//   - a pump (2943bc01 body, 2944c02 piston: 'pump-bore' / 'pump-rod', a sprung slider as the shock
//     absorber's): pushed in, it puts the air it sweeps into the network on its 'pump' port, and
//     the network's pressure pushes back on it.
//
// A valve whose supply has no hose is fed ideally (as from a pumped-up tank, at SUPPLY_KPA: v1); a
// tank starts pumped up to SUPPLY_KPA (as a child pumps it before playing). Left out, and said so:
// air in the cylinder does not compress (a shut valve holds the rod), the outlet the valve does not
// feed vents freely, and the lever is drawn where the model has it.
//
// Coupling module 'pneumatic' (kind 'pneumatic'), one per cylinder a valve feeds:
//   {sliderJoint, outSign (+1 when the slider's coordinate grows as the rod comes out), valveJoint,
//    valveSign (+ the lever up), extendFrom: 'outA'|'outB'|null, retractFrom: …, areaM2, forceN,
//    speedMPerS, network: {id, volumeM3, startKpa} | null (an ideal supply)}
// Coupling module 'pump' (kind 'pump'), one per pump whose port is in a network:
//   {sliderJoint, inSign (+1 when the slider's coordinate grows as the piston goes in), areaM2, network}
// The core (physics/jolt-core.js, physics/air.js) keeps each network's air, reads the valves' hinges
// before each step and drives the cylinders out or in with at most p·A, or holds them.
import {vecSub, vecDot, vecNormalize} from '../mech/vec.js';
import {LDU_M, dirToWorld} from '../contracts.js';
import {shaftEngagement} from './pin-axle.js';
import {toothConnectors, placedTooth} from './tooth-parts.js';
import {parallelAxes} from './gear-mesh.js';

/** The supply's pressure (kPa above the air's): a LEGO hand pump reaches about two bar. */
export const SUPPLY_KPA = 150;
/** The highest pressure a pump reaches (kPa): its seals let go above it. */
export const PUMP_MAX_KPA = 250;
/** The lever's turn (degrees) past which the valve opens one way or the other. */
export const VALVE_DEG = 15;
/** How fast a rod moves under air (m/s): a small cylinder's flow, not its force, sets it. */
export const ROD_SPEED_M_PER_S = 0.06;
/** The air in a network's hoses and nozzles (cm³), besides its tanks'. */
export const HOSE_CM3 = 1;

const isNum = v => typeof v === 'number' && Number.isFinite(v);
const ROLES = ['extend', 'retract', 'supply', 'outA', 'outB', 'pump', 'tee', 'tank'];

/** A rod's room to go further in its bore (LDU), and which way is in (as kinds/shock.js). */
const roomIn = (rod, bore) => {
    const ends = c => [1, -1].map(s => c.position.map((v, i) => v + c.axis[i] * s * c.length / 2));
    const d = (p, q) => Math.hypot(...vecSub(p, q));
    const rodEnds = ends(rod).sort((p, q) => d(p, bore.position) - d(q, bore.position));
    const boreIn = ends(bore).sort((p, q) => d(q, rodEnds[1]) - d(p, rodEnds[1]))[0];
    // In: from the rod's outer end towards the bore's inner end (never zero: the rod fully in has its inner end there).
    const inward = vecNormalize(vecSub(boreIn, rodEnds[1]));
    return {room: vecDot(vecSub(boreIn, rodEnds[0]), inward), inward};
};

/** The sliders of rods in bores (`boreType` / `rodType`), narrowed to the bore's stroke: [{bore, rod, joint, k, limits}]. */
const strokeSliders = (nodes, islands, joints, boreType, rodType) => {
    const out = [];
    const rods = toothConnectors(nodes, islands, rodType);
    for (const bore of toothConnectors(nodes, islands, boreType)) {
        const rod = rods.find(r => r.islandId !== bore.islandId && shaftEngagement(r.c, bore.c) !== null);
        if (!rod) continue;
        const joint = joints.find(x => x.type === 'slider' &&
            ((x.body1 === bore.islandId && x.body2 === rod.islandId) || (x.body1 === rod.islandId && x.body2 === bore.islandId)));
        if (!joint) continue;
        const stroke = bore.data.strokeLdu;
        const {room, inward} = roomIn(rod.c, bore.c);
        const sigma = joint.body2 === rod.islandId ? 1 : -1;
        // The slider's coordinate is body2's travel along joint.axis relative to body1: the rod going in by d moves it by k·d.
        const k = sigma * vecDot(vecNormalize(dirToWorld(inward)), joint.axis);
        const inLdu = Math.max(0, Math.min(stroke, room));
        const inM = k * inLdu * LDU_M;
        const outM = -k * (stroke - inLdu) * LDU_M;
        out.push({bore, rod, joint, k, inM, outM, limits: [Math.min(inM, outM), Math.max(inM, outM)]});
    }
    return out;
};

/**
 * The air networks: every air port's network {id, volumeM3, startKpa, ports: [key]}, by port key
 * `${part}:${port}`. Hoses join two ports; a T-piece's ports, and a tank's, are one. A port with
 * no hose and in no tank or tee is in no network (undefined).
 */
export const airNetworks = (nodes, islands, model) => {
    const ports = toothConnectors(nodes, islands, 'air-port');
    const key = (part, port) => `${part}:${port}`;
    const parent = new Map(ports.map(p => [key(p.partId, p.c.id), key(p.partId, p.c.id)]));
    const find = k => { while (parent.get(k) !== k) k = parent.get(k); return k; };
    const join = (a, b) => { if (parent.has(a) && parent.has(b)) parent.set(find(a), find(b)); };
    const linked = new Set();
    for (const h of (model && model.hoses) || []) {
        const [a, b] = [key(h.a.part, h.a.port), key(h.b.part, h.b.port)];
        join(a, b);
        linked.add(a).add(b);
    }
    const byPart = new Map();
    for (const p of ports) {
        if (!['tee', 'tank'].includes(p.data.role)) continue;
        const k = key(p.partId, p.c.id);
        linked.add(k);
        if (byPart.has(p.partId)) join(byPart.get(p.partId), k); else byPart.set(p.partId, k);
    }
    const groups = new Map();
    for (const p of ports) {
        const k = key(p.partId, p.c.id);
        if (!linked.has(k)) continue;
        const root = find(k);
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root).push(p);
    }
    const out = new Map();
    for (const members of groups.values()) {
        const tanks = new Map();
        for (const p of members) if (p.data.role === 'tank') tanks.set(p.partId, p.data.volumeCm3 || 0);
        const keys = members.map(p => key(p.partId, p.c.id)).sort();
        const net = {id: `air:${keys[0]}`, volumeM3: (HOSE_CM3 + [...tanks.values()].reduce((s, v) => s + v, 0)) * 1e-6,
            startKpa: tanks.size ? SUPPLY_KPA : 0, ports: keys};
        for (const k of keys) out.set(k, net);
    }
    return out;
};

const networkOf = (nets, part, port) => {
    const n = nets.get(`${part}:${port}`);
    return n ? {id: n.id, volumeM3: n.volumeM3, startKpa: n.startKpa} : null;
};

export const PNEUMATIC = {
    id: 'pneumatic',
    kind: 'pneumatic',
    detect ({nodes, islands, joints, model}) {
        const couplings = [];
        const limits = [];
        const welds = [];
        const levers = toothConnectors(nodes, islands, 'valve-lever');
        const ports = toothConnectors(nodes, islands, 'air-port');
        const hoses = (model && model.hoses) || [];
        const nets = airNetworks(nodes, islands, model);
        // Which port a port's hose goes to.
        const fedBy = (partId, portId) => {
            for (const h of hoses) {
                for (const [me, other] of [[h.a, h.b], [h.b, h.a]]) if (me.part === partId && me.port === portId) return other;
            }
            return null;
        };
        const portOf = (partId, portId) => ports.find(p => p.partId === partId && p.c.id === portId);
        // A T-piece rides on a hose: drawn only, welded to the part its first hosed port goes to (one weld each).
        const tees = new Map();
        for (const tee of ports.filter(p => p.data.role === 'tee')) {
            const other = fedBy(tee.partId, tee.c.id);
            if (other && !tees.has(tee.partId)) tees.set(tee.partId, {tee, other});
        }
        for (const {tee, other} of tees.values()) {
            const to = ports.find(p => p.partId === other.part);
            if (to && to.islandId !== tee.islandId) welds.push([tee.islandId, to.islandId]);
        }
        for (const s of strokeSliders(nodes, islands, joints, 'pneu-bore', 'pneu-rod')) {
            limits.push({joint: s.joint.id, limits: s.limits});
            // Its ports, and the valve outlets that feed them.
            const feeds = {};
            let valve = null;
            for (const port of ports.filter(p => p.partId === s.bore.partId)) {
                const src = fedBy(s.bore.partId, port.c.id);
                const srcPort = src && portOf(src.part, src.port);
                const lever = srcPort && levers.find(l => l.partId === src.part);
                if (!lever || !['outA', 'outB'].includes(srcPort.data.role)) continue;
                feeds[port.data.role] = srcPort.data.role;
                valve = valve || lever;
            }
            if (!valve) continue;
            // The valve's hinge: an axle turning in its lever hole (its axis, through the pivot).
            const hinge = joints.find(x => x.type === 'hinge' && (x.body1 === valve.islandId || x.body2 === valve.islandId) &&
                parallelAxes(vecNormalize(dirToWorld(x.axis)), valve.c.axis));
            if (!hinge) continue;
            const supply = ports.find(p => p.partId === valve.partId && p.data.role === 'supply');
            const areaM2 = Math.PI * (s.bore.data.boreMm / 2000) ** 2;
            couplings.push({sliderJoint: s.joint.id, outSign: -Math.sign(s.k) || 1, valveJoint: hinge.id, valveSign: hinge.body2 === valve.islandId ? -1 : 1,
                extendFrom: feeds.extend || null, retractFrom: feeds.retract || null,
                areaM2, forceN: SUPPLY_KPA * 1000 * areaM2, speedMPerS: ROD_SPEED_M_PER_S,
                network: supply ? networkOf(nets, valve.partId, supply.c.id) : null,
                parts: [s.bore.partId, s.rod.partId, valve.partId]});
        }
        return {couplings, limits, welds};
    },
    validate (c, m) {
        const out = [];
        const joints = new Map((m.joints || []).map(j => [j.id, j]));
        if (joints.get(c.sliderJoint)?.type !== 'slider') out.push('sliderJoint: need a slider');
        if (joints.get(c.valveJoint)?.type !== 'hinge') out.push('valveJoint: need a hinge');
        if (!(c.forceN > 0) || !(c.speedMPerS > 0) || !(c.areaM2 > 0)) out.push('areaM2, forceN, speedMPerS: positive');
        if (c.network !== null && !(c.network && c.network.volumeM3 > 0)) out.push('network: null or {id, volumeM3, startKpa}');
        return out;
    },
    /** The editor's overlap rule: a rod in its cylinder (or a piston in its pump) shares volume with it. */
    placedMesh (a, metaA, b, metaB) {
        for (const [p, mp, q, mq] of [[a, metaA, b, metaB], [b, metaB, a, metaA]]) {
            for (const [rodType, boreType] of [['pneu-rod', 'pneu-bore'], ['pump-rod', 'pump-bore']]) {
                const rs = placedTooth(p, mp, rodType);
                if (rs.length && placedTooth(q, mq, boreType).some(bo => rs.some(r => shaftEngagement(r.c, bo.c) !== null))) return true;
            }
        }
        return false;
    }
};

/** Pumps: a sprung slider (the spring pushes the piston out); in a network, pushing it in pumps air. */
export const PUMP = {
    id: 'pump',
    kind: 'pump',
    detect ({nodes, islands, joints, model}) {
        const couplings = [];
        const limits = [];
        const springs = [];
        const nets = airNetworks(nodes, islands, model);
        const ports = toothConnectors(nodes, islands, 'air-port');
        for (const s of strokeSliders(nodes, islands, joints, 'pump-bore', 'pump-rod')) {
            limits.push({joint: s.joint.id, limits: s.limits});
            springs.push({joint: s.joint.id, restM: s.outM, stiffness: s.bore.data.springNPerM, damping: s.bore.data.dampingNsPerM || 0,
                parts: [s.bore.partId, s.rod.partId]});
            const out = ports.find(p => p.partId === s.bore.partId && p.data.role === 'pump');
            const network = out && networkOf(nets, s.bore.partId, out.c.id);
            if (!network) continue;
            couplings.push({sliderJoint: s.joint.id, inSign: Math.sign(s.k) || 1, areaM2: Math.PI * (s.bore.data.boreMm / 2000) ** 2,
                network, parts: [s.bore.partId, s.rod.partId]});
        }
        return {couplings, limits, springs};
    },
    validate (c, m) {
        const out = [];
        const joints = new Map((m.joints || []).map(j => [j.id, j]));
        if (joints.get(c.sliderJoint)?.type !== 'slider') out.push('sliderJoint: need a slider');
        if (!(c.areaM2 > 0)) out.push('areaM2: positive');
        if (!(c.network && c.network.volumeM3 > 0)) out.push('network: {id, volumeM3, startKpa}');
        return out;
    }
};

const rodIn = rodType => ({with: rodType, edge: () => 'slider', match: (bore, rod) => shaftEngagement(rod, bore) !== null});
export const PNEU_BORE = {
    kind: 'pneu-bore',
    pairs: [rodIn('pneu-rod')],
    validate (c) {
        const out = [];
        if (!(isNum(c.length) && c.length > 0)) out.push('a pneu-bore needs its length (LDU)');
        if (!c.data || !(c.data.strokeLdu > 0) || !(c.data.boreMm > 0)) out.push('data.strokeLdu, data.boreMm: the stroke (LDU), the bore (mm)');
        return out;
    }
};
export const PNEU_ROD = {kind: 'pneu-rod', validate: c => (isNum(c.length) && c.length > 0 ? [] : ['a pneu-rod needs its length (LDU)'])};
export const PUMP_BORE = {
    kind: 'pump-bore',
    pairs: [rodIn('pump-rod')],
    validate (c) {
        const out = [];
        if (!(isNum(c.length) && c.length > 0)) out.push('a pump-bore needs its length (LDU)');
        if (!c.data || !(c.data.strokeLdu > 0) || !(c.data.boreMm > 0) || !(c.data.springNPerM > 0)) {
            out.push('data.strokeLdu, data.boreMm, data.springNPerM: the stroke (LDU), the bore (mm), the return spring (N/m)');
        }
        return out;
    }
};
export const PUMP_ROD = {kind: 'pump-rod', validate: c => (isNum(c.length) && c.length > 0 ? [] : ['a pump-rod needs its length (LDU)'])};
/** An axle in the valve's lever hole turns (a hinge): the lever (its angle is the valve's state). */
export const VALVE_LEVER = {
    kind: 'valve-lever',
    pairs: [{with: 'axle', edge: () => 'hinge', match: (lever, axle) => shaftEngagement(axle, lever) !== null}],
    validate: c => (isNum(c.length) && c.length > 0 ? [] : ['a valve-lever needs its length (LDU)'])
};
export const AIR_PORT = {
    kind: 'air-port',
    validate (c) {
        if (!c.data || !ROLES.includes(c.data.role)) return [`data.role: one of ${ROLES.join(', ')}`];
        if (c.data.role === 'tank' && !(c.data.volumeCm3 > 0)) return ['data.volumeCm3: a tank\'s volume (cm³)'];
        return [];
    }
};
