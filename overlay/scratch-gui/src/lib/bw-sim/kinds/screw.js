// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Linear actuator (docs/ROBOT-LAB-ARCHITECTURE.md §1.2 M5): a lead screw. The small
// Technic linear actuator is three LDraw parts — the body (92693c01), the spindle
// ("Axle Actuator", 92695: the input axle stub and the threaded rod) and the piston
// (92696: a rod with a pin-hole eye) — and this module is what joins them.
//
// Connector kinds (scripts/derive-part-meta.mjs deriveLinearActuator measures them):
//   'screw-spindle'  the spindle's rod: position, axis, length, and `data`
//                      leadLdu      advance per turn (LDU): LDraw's stroke over the measured
//                                   turns of a full stroke (the deriver cites the source)
//                      hand         +1 right-hand thread, −1 left-hand
//                      threadFrom,  where the nut may run, as offsets along the axis from
//                      threadTo     `position` (LDraw's contracted and extended assemblies)
//                      radiusLdu    the rod's radius (the thread's lead angle)
//   'screw-bearing'  the body's bearing the spindle turns in: a spindle coaxial (0.5 LDU,
//                    1°) with it and reaching into it is a 'hinge' edge;
//   'la-bore'        the body's front bore and 'la-rod' the piston's rod: a rod engaged in
//                    the bore (the pin-axle seat rule) is a 'slider' edge — the piston slides
//                    in the body (mech/joints.js makes the slider, its travel from the
//                    engagement);
//   'screw-nut'      the piston's nut (its rear end), where the thread drives it.
// The pair rules live on the bore kinds (as kinds/slide.js's): edge a = the spindle or rod.
//
// Coupling module 'screw' (kind 'screw'): a spindle turning on a hinge in a frame F, and a
// nut on its thread (coaxial, 0.5 LDU, within threadFrom..threadTo) on a body that SLIDES
// relative to F (a slider joint between the two): the coupling is v(slider) = ratio · ω(hinge)
//     ratio = σ · (−hand · lead / 2π) · (a · s)          (m per rad)
// a the spindle's signed hinge axis (+ on the hinge's body2, the gear-mesh convention), s the
// slider's axis, σ = +1 when the nut's body is the slider's body2. Turning a right-hand screw
// by +θ about a, its nut held from turning, moves the nut by −lead·θ/2π along a. The slider's
// travel is narrowed to the thread: the nut stops at its ends (`limits`, as kinds/rack.js).
//
// The physics (physics/screw.js) drives the slider from the spindle's RELATIVE rotation (a
// coupling of world rates, Jolt's RackAndPinionConstraint, would move an actuator whose body
// is carried by a turning boom), and models the three things a real one does:
//   - self-locking: the lead angle λ = atan(lead / (2π r)) — 1.206 mm on a 6 LDU (2.4 mm)
//     rod: 9.1° — is below the friction angle of plastic on plastic (μ 0.2–0.35: 11°–19°,
//     kinds/worm.js), so a load on the piston cannot turn the spindle: the slider holds while
//     the spindle does not turn;
//   - efficiency η = tan λ / tan(λ + φ) (a square-thread lead screw; φ = atan μ): the torque
//     the spindle needs for a load F is F · lead / (2π η), applied back to the spindle, so the
//     motor that drives it feels the load;
//   - the slip clutch: the real actuator has one that clicks at the ends of the stroke and
//     under overload. The slider's drive is force-limited to clutchForceN; beyond it (or at
//     an end stop) the spindle turns on while the piston stays.

import {vecSub, vecDot, vecLen, vecScale, vecNormalize, COS_1_DEG} from '../mech/vec.js';
import {LDU_M, dirToWorld} from '../contracts.js';
import {gearHinges} from './gear-mesh.js';
import {toothConnectors, placedTooth} from './tooth-parts.js';
import {shaftEngagement} from './pin-axle.js';

/**
 * Plastic on plastic friction for the thread: the middle of the range kinds/worm.js uses
 * (μ ≈ 0.2–0.35, ABS/POM sliding contact).
 */
export const SCREW_FRICTION_MU = 0.275;

/**
 * Where the actuator's slip clutch lets go, as a force on the piston (N). NOT a measured
 * number: no published measurement of the small actuator's clutch was found (896gerard's
 * Eurobricks bench, 2020-02, publishes its results only as an image). 60 N is above what an
 * arm built from LEGO parts puts on its actuators (the excavator's boom: < 10 N), and the
 * torque it costs at the spindle (60 N · 1.206 mm / 2π / η ≈ 0.03 N·m) is below a SPIKE
 * medium motor's stall torque (0.104 N·m, devices/catalog.js), so a motor driving an
 * actuator into its end stop turns on, the clutch slipping, as the real one does.
 */
export const SCREW_CLUTCH_FORCE_N = 60;

/** Lead angle and efficiency of a screw of lead `leadLdu` on a rod of radius `radiusLdu`. */
export const screwEfficiency = (leadLdu, radiusLdu, mu = SCREW_FRICTION_MU) => {
    const lambda = Math.atan(leadLdu / (2 * Math.PI * radiusLdu));
    const phi = Math.atan(mu);
    return {lambda, phi, efficiency: Math.tan(lambda) / Math.tan(lambda + phi), selfLocking: lambda < phi};
};

const isNum = v => typeof v === 'number' && Number.isFinite(v);
const TOL = 0.5 + 1e-9;

/** Is point p on the line (q, unit a) within 0.5 LDU, and how far along it from q? */
const onLine = (p, q, a) => {
    const d = vecSub(p, q);
    const t = vecDot(d, a);
    return vecLen(vecSub(d, vecScale(a, t))) <= TOL ? t : null;
};

/** A spindle reaching into a bearing: coaxial, and the bearing's segment overlaps the spindle's. */
export const spindleInBearing = (spindle, bearing) => {
    if (Math.abs(vecDot(spindle.axis, bearing.axis)) < COS_1_DEG - 1e-12) return false;
    const t = onLine(bearing.position, spindle.position, spindle.axis);
    if (t === null) return false;
    return Math.abs(t) < (spindle.length + (bearing.length || 0)) / 2 - 1e-9;
};

/** The nut's place on the spindle's thread (offset along its axis), or null when it is not on it. */
export const nutOnThread = (spindle, data, nut) => {
    if (Math.abs(vecDot(spindle.axis, nut.axis)) < COS_1_DEG - 1e-12) return null;
    const t = onLine(nut.position, spindle.position, spindle.axis);
    if (t === null || t < data.threadFrom - TOL || t > data.threadTo + TOL) return null;
    return t;
};

export const SCREW_SPINDLE = {
    kind: 'screw-spindle',
    validate (c) {
        const out = [];
        const d = c.data || {};
        if (!(isNum(c.length) && c.length > 0)) out.push('a screw-spindle needs its length (LDU)');
        if (!(isNum(d.leadLdu) && d.leadLdu > 0)) out.push('data.leadLdu: the advance per turn (LDU)');
        if (d.hand !== 1 && d.hand !== -1) out.push('data.hand: 1 (right-hand thread) or -1');
        if (!(isNum(d.threadFrom) && isNum(d.threadTo) && d.threadFrom < d.threadTo)) out.push('data.threadFrom < data.threadTo: where the nut runs');
        if (!(isNum(d.radiusLdu) && d.radiusLdu > 0)) out.push('data.radiusLdu: the rod\'s radius (LDU)');
        return out;
    }
};

export const SCREW_BEARING = {
    kind: 'screw-bearing',
    validate: c => (isNum(c.length) && c.length > 0 ? [] : ['a screw-bearing needs its length (LDU)']),
    pairs: [{with: 'screw-spindle', edge: () => 'hinge', match: (bearing, spindle) => spindleInBearing(spindle, bearing)}]
};

export const SCREW_NUT = {kind: 'screw-nut'};

export const LA_ROD = {
    kind: 'la-rod',
    validate: c => (isNum(c.length) && c.length > 0 ? [] : ['an la-rod needs its length (LDU)'])
};

export const LA_BORE = {
    kind: 'la-bore',
    validate: c => (isNum(c.length) && c.length > 0 ? [] : ['an la-bore needs its length (LDU)']),
    // The rod is the shaft that runs through the bore: the v1 seat test (kinds/slide.js's rule).
    pairs: [{with: 'la-rod', edge: () => 'slider', match: (bore, rod) => shaftEngagement(rod, bore) !== null}]
};

/** The slider joint between bodies a and b, or null. */
const sliderBetween = (joints, a, b) => joints.find(j => j.type === 'slider' &&
    ((j.body1 === a && j.body2 === b) || (j.body1 === b && j.body2 === a))) || null;

/** The two bodies a joint pair ties (each joint's side not shared with the other). */
const tiedBodies = (ja, jb) => {
    const shared = [ja.body1, ja.body2].find(b => b === jb.body1 || b === jb.body2);
    const side = j => (shared === undefined || j.body2 !== shared ? j.body2 : j.body1);
    return [side(ja), side(jb)];
};

export const SCREW = {
    id: 'screw',
    kind: 'screw',
    detect ({nodes, islands, joints}) {
        const couplings = [];
        const diagnostics = [];
        const limits = [];
        const nuts = toothConnectors(nodes, islands, 'screw-nut');
        for (const spindle of toothConnectors(nodes, islands, 'screw-spindle')) {
            const a = spindle.c.axis;
            for (const nut of nuts) {
                if (nut.islandId === spindle.islandId) continue;
                const u = nutOnThread(spindle.c, spindle.data, nut.c);
                if (u === null) continue;
                const parts = [spindle.partId, nut.partId];
                const hinges = gearHinges({islandId: spindle.islandId, centerLdu: spindle.c.position, axisLdu: a}, joints);
                let found = null;
                for (const h of hinges) {
                    const s = sliderBetween(joints, h.frame, nut.islandId);
                    if (s) { found = {h, s}; break; }
                }
                if (!found) {
                    diagnostics.push({severity: 'warning', code: 'screw-not-sliding', parts,
                        message: `The spindle ${spindle.partId} turns the nut of ${nut.partId}, but the piston cannot slide in the part the spindle turns in, so the actuator is not driven.`});
                    continue;
                }
                const {h, s} = found;
                const sigma = s.body2 === nut.islandId ? 1 : -1;
                const ah = vecScale(vecNormalize(h.joint.axis), h.sign);
                const k = spindle.data.leadLdu * LDU_M / (2 * Math.PI);
                const ratio = sigma * -spindle.data.hand * k * vecDot(ah, s.axis);
                if (!(Math.abs(ratio) > 0)) continue;
                const {efficiency} = screwEfficiency(spindle.data.leadLdu, spindle.data.radiusLdu);
                couplings.push({hingeJoint: h.joint.id, sliderJoint: s.id, ratio, clutchForceN: SCREW_CLUTCH_FORCE_N, efficiency, parts});
                // The nut stays on the thread: u(x) = u + σ·x·(s·a) for a slider travel x (LDU).
                const sa = vecDot(vecNormalize(dirToWorld(s.axis)), a) * sigma;
                const ends = [(spindle.data.threadFrom - u) / sa, (spindle.data.threadTo - u) / sa].sort((p, q) => p - q);
                limits.push({joint: s.id, limits: [Math.min(0, ends[0] * LDU_M), Math.max(0, ends[1] * LDU_M)]});
            }
        }
        couplings.sort((p, q) => p.hingeJoint.localeCompare(q.hingeJoint) || p.sliderJoint.localeCompare(q.sliderJoint));
        return {couplings, welds: [], diagnostics, limits};
    },
    validate (c, m) {
        const out = [];
        const typed = (id, type) => m.joints.some(j => j.id === id && j.type === type);
        if (!typed(c.hingeJoint, 'hinge')) out.push(`hingeJoint: '${c.hingeJoint}' is not a hinge`);
        if (!typed(c.sliderJoint, 'slider')) out.push(`sliderJoint: '${c.sliderJoint}' is not a slider`);
        // A lead screw is slow: well under a 1 mm per radian (a 6 mm lead).
        if (!(isNum(c.ratio) && c.ratio !== 0 && Math.abs(c.ratio) < 0.001)) out.push('ratio: m per rad, 0 < |ratio| < 0.001');
        if (!(isNum(c.clutchForceN) && c.clutchForceN > 0)) out.push('clutchForceN: a positive number (N)');
        if (!(isNum(c.efficiency) && c.efficiency > 0 && c.efficiency <= 1)) out.push('efficiency: in (0, 1]');
        return out;
    },
    /** The spindle's body and the piston's: they never collide (the spindle runs inside the piston). */
    bodies (c, joints) {
        const jh = joints.find(j => j.id === c.hingeJoint);
        const js = joints.find(j => j.id === c.sliderJoint);
        return jh && js ? tiedBodies(jh, js) : [];
    },
    /**
     * The editor's overlap rule: an actuator's three parts nest — the spindle in the body's
     * bearing and inside the piston (LDraw's own assembly has the spindle's tip 0.8 LDU into the
     * piston's end), the piston's rod in the body's tube.
     */
    placedMesh (a, metaA, b, metaB) {
        for (const [p, mp, q, mq] of [[a, metaA, b, metaB], [b, metaB, a, metaA]]) {
            const spindles = placedTooth(p, mp, 'screw-spindle');
            if (spindles.some(sp => placedTooth(q, mq, 'screw-bearing').some(br => spindleInBearing(sp.c, br.c)))) return true;
            if (spindles.some(sp => placedTooth(q, mq, 'screw-nut').some(n => nutOnThread(sp.c, sp.data, n.c) !== null))) return true;
            const rods = placedTooth(p, mp, 'la-rod');
            if (rods.some(r => placedTooth(q, mq, 'la-bore').some(bo => shaftEngagement(r.c, bo.c) !== null))) return true;
        }
        return false;
    }
};

/** The connector kinds this module adds. */
export const SCREW_CONNECTORS = [SCREW_SPINDLE, SCREW_BEARING, SCREW_NUT, LA_ROD, LA_BORE];
