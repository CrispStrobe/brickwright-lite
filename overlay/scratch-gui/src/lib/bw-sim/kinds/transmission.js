// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Gear shifting (gearbox lane, docs/ROBOT-LAB-ARCHITECTURE.md §1.2): the Technic
// transmission driving ring (LDraw 6539) slides along a ridged axle joiner
// (6538a/6538b) and, pushed into the clutch socket of a clutch gear (6542a/b,
// 18946, 81346, 2471, 35185), locks that gear to the joiner's axle. The clutch
// gears themselves have a round hole: on the axle they spin freely (an axle in a
// pin hole is a hinge, kinds/pin-axle.js), until the ring takes one of them.
// A changeover catch (6641) on a turning axle puts its bar into the ring's groove
// and pushes the ring as it swings.
//
// Connector kinds (all measured from the LDraw meshes by scripts/derive-part-meta.mjs):
//   spline       the ridged outside of an axle joiner (LDraw draws the ridges as
//                s/6538s02.dat): middle, axis, ridged length;
//   spline-bore  the ring's ridged bore. A spline in it makes a SLIDER edge: the ring
//                slides along the joiner and turns with it (mech/joints.js makes the
//                slider joint and its travel);
//   clutch       a clutch gear's socket: position = the centre of the gear face it
//                opens in, axis = out of that face, length = the socket's depth;
//   clutch-teeth a ring end: position = the end's centre, axis = out of the end;
//   fork         a changeover catch's bar: its centre, axis = along the bar,
//                data.radiusLdu = the bar's radius;
//   fork-groove  the ring's groove: its middle, the ring's axis, data {radiusLdu (the
//                groove's floor), outerLdu (the flanges), widthLdu (between the flanges)}.
//
// Couplings (free detectors, run after the gear meshes):
//   dogClutch  a ring end facing a clutch socket on the same line. The ring rides a
//              slider (on the joiner's body A), the gear a hinge on A. The clutch is
//              ENGAGED while the ring's teeth reach at least ENGAGE_LDU into the
//              socket: {sliderJoint, gearJoint, engage: [lo, hi] (slider travel, m,
//              zero at the start pose), holdTorqueNm, parts}. The ring cannot go
//              deeper than the socket, so the slider's travel is narrowed to it
//              (`limits`). The physics core (physics/jolt-core.js) locks the gear's
//              hinge, while engaged, with a friction of holdTorqueNm — a ring that is
//              in turns the gear with the axle, one that is out leaves it free.
//   shiftFork  a catch's bar in a ring's groove: the catch turns on a hinge h, the
//              ring slides on a slider s. The bar's swing pushes the ring along:
//                  v(s) = ratio · ω(h),  ratio = σ · (a × d) · ŝ   (m per rad)
//              a the catch's signed hinge axis (+ on body2), d hinge point → bar
//              centre (m), ŝ the slider axis, σ = +1 when the ring is the slider's
//              body2. That is the bar's speed along the ring's axis at the start
//              pose: the swing is linearised (a 22 LDU arm swung ±21° to push the
//              ring 8 LDU each way: sin 21° vs 21° in radians, 2.3 %). The core
//              builds it as the rack and pinion is built (Jolt RackAndPinionConstraint).

import {vecSub, vecDot, vecCross, vecLen, vecScale, vecNormalize, lineDistance, SIN_1_DEG, COS_1_DEG} from '../mech/vec.js';
import {LDU_M, lduToWorld, dirToWorld} from '../contracts.js';
import {shaftEngagement} from './pin-axle.js';
import {toothConnectors} from './tooth-parts.js';

/** LDU: a ring's teeth hold a clutch gear once they are this deep in its socket (half an 8 LDU socket). */
export const ENGAGE_LDU = 4;

/**
 * The torque an engaged dog clutch holds before it slips, N·m (a hinge friction, as the worm's
 * hold, kinds/worm.js). A real dog clutch does not slip at all; the number stands for "far more
 * than anything in the model": a SPIKE large motor stalls at 0.25 N·m (devices/catalog.js), so
 * even a 1:5 reduction before the clutch puts 1.25 N·m on it, and it stays well below the
 * torques at which Jolt's solver turns a friction limit into a lock it fights.
 */
export const DOG_CLUTCH_HOLD_NM = 2.5;

const parallel = (a, b) => Math.abs(vecDot(a, b)) >= COS_1_DEG - 1e-12;

// ---- connector kinds -------------------------------------------------------------

/** The rule on the bore (as kinds/slide.js): the graph edge then has a = the joiner's spline, b = the ring. */
const splineInBore = {
    with: 'spline',
    edge: () => 'slider',
    match: (bore, spline) => shaftEngagement(spline, bore) !== null
};

const needsLength = what => c => (typeof c.length === 'number' && c.length > 0 ? [] : [`a ${what} needs its length (LDU)`]);

export const SPLINE = {kind: 'spline', validate: needsLength('spline')};
export const SPLINE_BORE = {kind: 'spline-bore', pairs: [splineInBore], validate: needsLength('spline-bore')};
export const CLUTCH = {kind: 'clutch', validate: needsLength('clutch socket')};
export const CLUTCH_TEETH = {kind: 'clutch-teeth'};
export const FORK = {
    kind: 'fork',
    validate: c => (c.data && c.data.radiusLdu > 0 ? [] : ['data.radiusLdu: the bar\'s radius (LDU)'])
};
export const FORK_GROOVE = {
    kind: 'fork-groove',
    validate: c => {
        const d = c.data || {};
        return d.radiusLdu > 0 && d.outerLdu > d.radiusLdu && d.widthLdu > 0 ? [] : ['data: {radiusLdu, outerLdu > radiusLdu, widthLdu} of the groove (LDU)'];
    }
};

// ---- helpers -----------------------------------------------------------------------

/** The slider joint whose ring side is `ringIsland`, with the other side: {joint, axle, sigma}. */
const ringSliders = (joints, ringIsland) => joints.filter(j => j.type === 'slider' && (j.body1 === ringIsland || j.body2 === ringIsland))
    .map(j => ({joint: j, axle: j.body1 === ringIsland ? j.body2 : j.body1, sigma: j.body2 === ringIsland ? 1 : -1}));

/** A hinge between bodies a and b whose axis line is the given line (model LDU), or null. */
const hingeOnLine = (joints, a, b, point, axis) => joints.find(j => {
    if (j.type !== 'hinge' || !((j.body1 === a && j.body2 === b) || (j.body1 === b && j.body2 === a))) return false;
    const ax = vecNormalize(dirToWorld(j.axis));
    if (!parallel(ax, axis)) return false;
    const p = [j.point[0] / LDU_M, -j.point[1] / LDU_M, -j.point[2] / LDU_M];
    const d = vecSub(point, p);
    return vecLen(vecSub(d, vecScale(ax, vecDot(d, ax)))) <= 0.5 + 1e-9;
}) || null;

// ---- the couplings -------------------------------------------------------------------

export const DOG_CLUTCH = {
    id: 'dog-clutch',
    kind: 'dogClutch',
    detect ({nodes, islands, joints}) {
        const couplings = [];
        const diagnostics = [];
        const limits = [];
        const sockets = toothConnectors(nodes, islands, 'clutch');
        for (const end of toothConnectors(nodes, islands, 'clutch-teeth')) {
            for (const ring of ringSliders(joints, end.islandId)) {
                const s = vecNormalize(dirToWorld(ring.joint.axis)); // the slider axis in LDU (dirToWorld is its own inverse)
                const k = ring.sigma * vecDot(s, end.c.axis); // LDU of reach into the socket per LDU of slider travel
                if (Math.abs(k) < COS_1_DEG - 1e-9) continue; // this end does not move along its own axis
                for (const sock of sockets) {
                    if (sock.islandId === end.islandId) continue;
                    if (!parallel(sock.c.axis, end.c.axis) || vecDot(sock.c.axis, end.c.axis) > 0) continue; // facing each other
                    if (lineDistance(end.c.position, end.c.axis, sock.c.position, sock.c.axis) > 0.5 + 1e-9) continue;
                    const gap = vecDot(vecSub(sock.c.position, end.c.position), end.c.axis); // LDU until the teeth reach the socket
                    if (gap < -0.5 - 1e-9 || gap > sock.c.length + 1e-9) continue; // already inside the gear body, or too far to reach it
                    const parts = [end.partId, sock.partId];
                    if (sock.islandId === ring.axle) {
                        diagnostics.push({severity: 'warning', code: 'clutch-gear-fixed', parts,
                            message: `The clutch gear ${sock.partId} is fixed to the axle of the driving ring ${end.partId}: it turns with the axle whether the ring is in or out.`});
                        continue;
                    }
                    const hinge = hingeOnLine(joints, ring.axle, sock.islandId, sock.c.position, sock.c.axis);
                    if (!hinge) {
                        diagnostics.push({severity: 'warning', code: 'clutch-not-on-axle', parts,
                            message: `The driving ring ${end.partId} faces the clutch gear ${sock.partId}, but the gear does not turn on the ring's axle, so the ring cannot take it.`});
                        continue;
                    }
                    // Depth into the socket after a slider travel x (LDU): k·x − gap. Engaged for depth in
                    // [ENGAGE_LDU, socket depth]; the socket's bottom stops the ring.
                    const depthEngage = Math.min(ENGAGE_LDU, sock.c.length);
                    const xs = [(depthEngage + gap) / k, (sock.c.length + gap) / k].sort((p, q) => p - q);
                    couplings.push({sliderJoint: ring.joint.id, gearJoint: hinge.id, engage: [xs[0] * LDU_M, xs[1] * LDU_M],
                        holdTorqueNm: DOG_CLUTCH_HOLD_NM, parts});
                    const stop = ((sock.c.length + gap) / k) * LDU_M;
                    limits.push({joint: ring.joint.id, limits: stop > 0 ? [-Infinity, stop] : [stop, Infinity]});
                }
            }
        }
        couplings.sort((p, q) => p.sliderJoint.localeCompare(q.sliderJoint) || p.gearJoint.localeCompare(q.gearJoint));
        // A stop beyond the slider's own travel changes nothing: keep the finite side only.
        return {couplings, welds: [], diagnostics, limits: limits.map(({joint, limits: [lo, hi]}) => ({joint, limits: [Math.max(lo, -1e6), Math.min(hi, 1e6)]}))};
    },
    validate (c, m) {
        const out = [];
        const joint = id => m.joints.find(j => j.id === id);
        if (joint(c.sliderJoint)?.type !== 'slider') out.push(`sliderJoint: '${c.sliderJoint}' is not a slider`);
        if (joint(c.gearJoint)?.type !== 'hinge') out.push(`gearJoint: '${c.gearJoint}' is not a hinge`);
        if (!(Array.isArray(c.engage) && c.engage.length === 2 && c.engage.every(Number.isFinite) && c.engage[0] < c.engage[1])) out.push('engage: [lo, hi] slider travel (m), lo < hi');
        if (!(typeof c.holdTorqueNm === 'number' && c.holdTorqueNm > 0)) out.push('holdTorqueNm: a positive number');
        return out;
    },
    /** The ring and the gear (each joint's side not shared with the other): the ring's teeth go into the gear. */
    bodies (c, joints) {
        const s = joints.find(j => j.id === c.sliderJoint);
        const h = joints.find(j => j.id === c.gearJoint);
        if (!s || !h) return [];
        const shared = [s.body1, s.body2].find(b => b === h.body1 || b === h.body2);
        const side = j => (j.body2 !== shared ? j.body2 : j.body1);
        return [side(s), side(h)];
    }
};

export const SHIFT_FORK = {
    id: 'shift-fork',
    kind: 'shiftFork',
    detect ({nodes, islands, joints}) {
        const couplings = [];
        const diagnostics = [];
        const grooves = toothConnectors(nodes, islands, 'fork-groove');
        for (const fork of toothConnectors(nodes, islands, 'fork')) {
            for (const g of grooves) {
                if (g.islandId === fork.islandId) continue;
                const u = g.c.axis;
                if (Math.abs(vecDot(fork.c.axis, u)) > SIN_1_DEG + 1e-12) continue; // the bar lies across the ring
                const rb = fork.data.radiusLdu;
                const axial = vecDot(vecSub(fork.c.position, g.c.position), u);
                if (Math.abs(axial) > g.data.widthLdu / 2 - rb + 0.5 + 1e-9) continue; // between the flanges
                const off = lineDistance(fork.c.position, fork.c.axis, g.c.position, u);
                if (off < g.data.radiusLdu + rb - 0.5 - 1e-9 || off > g.data.outerLdu + 1e-9) continue; // in the groove
                const parts = [fork.partId, g.partId];
                const ring = ringSliders(joints, g.islandId).find(r => parallel(vecNormalize(dirToWorld(r.joint.axis)), u));
                if (!ring) {
                    diagnostics.push({severity: 'warning', code: 'fork-ring-not-sliding', parts,
                        message: `The catch ${fork.partId} sits in the groove of ${g.partId}, but that ring cannot slide, so the catch moves nothing.`});
                    continue;
                }
                // The catch's hinge: the one whose swing moves the bar along the ring's axis the most.
                let best = null;
                for (const j of joints) {
                    if (j.type !== 'hinge' || (j.body1 !== fork.islandId && j.body2 !== fork.islandId)) continue;
                    const a = vecScale(vecNormalize(j.axis), j.body2 === fork.islandId ? 1 : -1);
                    const d = vecSub(lduToWorld(fork.c.position), j.point);
                    const ratio = ring.sigma * vecDot(vecCross(a, d), ring.joint.axis);
                    if (!best || Math.abs(ratio) > Math.abs(best.ratio)) best = {j, ratio};
                }
                if (!best || Math.abs(best.ratio) < 1e-6) {
                    diagnostics.push({severity: 'warning', code: 'fork-not-on-hinge', parts,
                        message: `The catch ${fork.partId} sits in the groove of ${g.partId} but does not swing, so it holds the ring where it is.`});
                    continue;
                }
                couplings.push({hingeJoint: best.j.id, sliderJoint: ring.joint.id, ratio: best.ratio, parts});
            }
        }
        couplings.sort((p, q) => p.hingeJoint.localeCompare(q.hingeJoint) || p.sliderJoint.localeCompare(q.sliderJoint));
        return {couplings, welds: [], diagnostics};
    },
    validate (c, m) {
        const out = [];
        const joint = id => m.joints.find(j => j.id === id);
        if (joint(c.hingeJoint)?.type !== 'hinge') out.push(`hingeJoint: '${c.hingeJoint}' is not a hinge`);
        if (joint(c.sliderJoint)?.type !== 'slider') out.push(`sliderJoint: '${c.sliderJoint}' is not a slider`);
        if (!(typeof c.ratio === 'number' && Number.isFinite(c.ratio) && c.ratio !== 0)) out.push('ratio: a non-zero number (m per rad)');
        return out;
    },
    bodies (c, joints) {
        const h = joints.find(j => j.id === c.hingeJoint);
        const s = joints.find(j => j.id === c.sliderJoint);
        if (!h || !s) return [];
        const shared = [h.body1, h.body2].find(b => b === s.body1 || b === s.body2);
        const side = j => (shared === undefined || j.body2 !== shared ? j.body2 : j.body1);
        return [side(h), side(s)];
    }
};
