// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Worm drive (docs/ROBOT-LAB-ARCHITECTURE.md §1.2 M3, slice R4).
//
// Connector kind 'worm': a worm's thread. `position` is the worm's centre,
// `axis` its axis, `length` the threaded length, and `data` holds
//   pitchRadiusLdu  where it meshes (tip radius − one module, 2.5 LDU),
//   hand            +1 for a right-hand thread, −1 for a left-hand one (the
//                   thread advances along +axis as it turns positively about
//                   +axis), measured from the mesh by the part-meta test,
//   starts          the number of thread starts (LEGO's worms: 1).
//
// Coupling module 'worm' (kind 'worm'): a spur wheel meshes with a worm when
// their axes are perpendicular (1°), the distance between the axis lines is the
// two pitch radii (0.5 LDU), the wheel's mid-plane holds the worm's axis (4 LDU,
// the spur rule's axial tolerance) and the wheel sits over the threaded length.
// Worm and wheel must turn on hinges in one frame (the gear rules of
// mech/gears.js: a worm fixed to the wheel's frame — or the wheel to the
// worm's — locks the pair, gear-on-frame; different frames: gear-frames-differ).
//
// Ratio. Turning a right-hand thread by +Δ about +a shifts its tooth pattern
// by −k·Δ along a, k = lead / 2π = starts · π · m / 2π = starts · 1.25 LDU
// (module m = 1 mm = 2.5 LDU). The wheel's tooth at the contact P follows:
//     ω_wheel · ((a_w × (P − C)) · a) = −hand · k · ω_worm
//     ratio = ω(wheelJoint) / ω(wormJoint) = −hand · k / ((a_w × (P − C)) · a)
// with a, a_w the signed hinge axes (+ on the hinge's body2). |ratio| =
// starts / teeth (a 24T wheel: 1/24) — derived from the geometry.
//
// Self-locking (the physics core builds it, physics/jolt-core.js 'worm'): a
// LEGO worm's lead angle is tan λ = lead / (π·d) = 3.14 mm / (π · 8 mm) ≈ 7°,
// below the friction angle of plastic on plastic (μ ≈ 0.2–0.35: 11°–19°), so
// its back-efficiency tan(λ − φ)/tan λ is negative: a torque on the wheel
// cannot turn the worm, however large, while a torque on the worm drives the
// wheel. Jolt has no friction that depends on which side drives, so the core
// models the two cases it can tell apart: while nothing DRIVES the worm (its
// motor coasts or brakes, or no motor reaches it) the wheel's hinge holds
// with friction holdTorqueNm / |ratio| (the hold, referred to the wheel);
// while the worm's motor drives, the hold is released and the mesh is the
// gear constraint alone. holdTorqueNm is the torque at the worm the hold
// stands for: WORM_HOLD_TORQUE_NM below.

import {vecAdd, vecSub, vecDot, vecCross, vecScale, vecLen, vecNormalize, SIN_1_DEG} from '../mech/vec.js';
import {dirToWorld} from '../contracts.js';
import {gearHinges, TOL} from './gear-mesh.js';
import {spurGears, toothConnectors, placedSpur, placedTooth} from './tooth-parts.js';

/**
 * The hold a self-locking worm gives, as a torque at the worm (N·m): a wheel of N teeth is held
 * up to N times this. NOT a measured number — a real worm holds until a tooth breaks or the
 * frame gives; 0.1 N·m (2.4 N·m at a 24T wheel) is above what a SPIKE motor puts through any
 * LEGO gear train (the medium motor's stall is 0.104 N·m at 7.2 V, devices/catalog.js), so no
 * load a model can lift back-drives the worm, and below the numbers Jolt's solver handles at
 * the 5 ms step with LEGO-sized inertias (a friction limit of thousands of N·m would make the
 * hold a hard lock the solver fights).
 */
export const WORM_HOLD_TORQUE_NM = 0.1;

/** Lead / 2π per thread start, LDU per radian (module 1 mm: π · 2.5 LDU / 2π). */
const K_PER_START = 1.25;

/** Where a spur wheel meshes with a worm: {P (contact on the wheel's pitch circle, LDU)} or null. */
export const wormContact = (worm, wheel) => {
    const a = worm.c.axis;
    if (Math.abs(vecDot(a, wheel.axisLdu)) > SIN_1_DEG + 1e-12) return null;
    const rw = worm.data.pitchRadiusLdu;
    // Closest point of the worm's axis line to the wheel centre.
    const s = vecDot(vecSub(wheel.centerLdu, worm.c.position), a);
    if (Math.abs(s) > worm.c.length / 2 + 1e-9) return null;
    const Q = vecAdd(worm.c.position, vecScale(a, s));
    const v = vecSub(Q, wheel.centerLdu);
    const axial = vecDot(v, wheel.axisLdu);
    if (Math.abs(axial) > 4 + 1e-9) return null;
    const radial = vecSub(v, vecScale(wheel.axisLdu, axial));
    if (Math.abs(vecLen(radial) - (rw + wheel.r)) > TOL + 1e-9) return null;
    return {P: vecAdd(wheel.centerLdu, vecScale(vecNormalize(radial), wheel.r))};
};

/** ratio = ω(wheelJoint) / ω(wormJoint) for a contact P (the derivation above). */
export const wormRatio = (worm, hw, wheel, hg, P) => {
    const a = vecScale(vecNormalize(dirToWorld(hw.joint.axis)), hw.sign);
    const ag = vecScale(vecNormalize(dirToWorld(hg.joint.axis)), hg.sign);
    const k = K_PER_START * (worm.data.starts || 1);
    const den = vecDot(vecCross(ag, vecSub(P, wheel.centerLdu)), a);
    if (Math.abs(den) < 1e-9) return null;
    return -worm.data.hand * k / den;
};

const name = (what, partId) => `the ${what} ${partId}`;

export const WORM = {
    id: 'worm',
    kind: 'worm',
    detect ({nodes, islands, joints}) {
        const couplings = [];
        const welds = [];
        const diagnostics = [];
        const wheels = spurGears(nodes, islands);
        for (const worm of toothConnectors(nodes, islands, 'worm')) {
            const wormGear = {islandId: worm.islandId, centerLdu: worm.c.position, axisLdu: worm.c.axis};
            const wormHinges = gearHinges(wormGear, joints);
            for (const wheel of wheels) {
                if (wheel.islandId === worm.islandId) continue;
                const contact = wormContact(worm, wheel);
                if (!contact) continue;
                const parts = [worm.partId, wheel.partId];
                const wheelHinges = gearHinges(wheel, joints);
                // A worm fixed to the frame the wheel turns in (or the wheel to the worm's): locked.
                const lock = wheelHinges.find(h => h.frame === worm.islandId) || wormHinges.find(h => h.frame === wheel.islandId);
                if (lock) {
                    diagnostics.push({severity: 'warning', code: 'gear-on-frame', parts,
                        message: `${name('worm', worm.partId)} and ${name('gear', wheel.partId)}: one is fixed to the part that holds the other, so they lock together.`});
                    welds.push([worm.islandId, wheel.islandId]);
                    continue;
                }
                if (wormHinges.length === 0) {
                    diagnostics.push({severity: 'warning', code: 'gear-not-on-hinge', message: `Worm ${worm.partId} not on hinge`, parts: [worm.partId]});
                    continue;
                }
                if (wheelHinges.length === 0) continue; // the gear pass says gear-not-on-hinge
                let pair = null;
                for (const hw of wormHinges) {
                    const hg = wheelHinges.find(h => h.frame === hw.frame);
                    if (hg) { pair = [hw, hg]; break; }
                }
                if (!pair) {
                    diagnostics.push({severity: 'warning', code: 'gear-frames-differ', parts,
                        message: `${name('worm', worm.partId)} and ${name('gear', wheel.partId)} mesh, but their axles turn in different parts, so the gearing is not modelled.`});
                    continue;
                }
                const ratio = wormRatio(worm, pair[0], wheel, pair[1], contact.P);
                if (ratio === null) continue;
                couplings.push({wormJoint: pair[0].joint.id, wheelJoint: pair[1].joint.id, ratio, holdTorqueNm: WORM_HOLD_TORQUE_NM, parts});
            }
        }
        couplings.sort((p, q) => p.wormJoint.localeCompare(q.wormJoint) || p.wheelJoint.localeCompare(q.wheelJoint));
        return {couplings, welds, diagnostics};
    },
    validate (c, m) {
        const out = [];
        const hinge = id => m.joints.some(j => j.id === id && j.type === 'hinge');
        if (!hinge(c.wormJoint)) out.push(`wormJoint: '${c.wormJoint}' is not a hinge`);
        if (!hinge(c.wheelJoint)) out.push(`wheelJoint: '${c.wheelJoint}' is not a hinge`);
        if (c.wormJoint === c.wheelJoint) out.push('a worm cannot drive its own hinge');
        if (!(typeof c.ratio === 'number' && Number.isFinite(c.ratio) && c.ratio !== 0 && Math.abs(c.ratio) <= 1)) {
            out.push('ratio: a worm turns its wheel slower than itself (0 < |ratio| ≤ 1)');
        }
        if (!(typeof c.holdTorqueNm === 'number' && c.holdTorqueNm >= 0)) out.push('holdTorqueNm: a number ≥ 0');
        return out;
    },
    /** The two bodies the mesh ties (each hinge's side not shared with the other): they never collide. */
    bodies (c, joints) {
        const jw = joints.find(j => j.id === c.wormJoint);
        const jg = joints.find(j => j.id === c.wheelJoint);
        if (!jw || !jg) return [];
        const shared = [jw.body1, jw.body2].find(b => b === jg.body1 || b === jg.body2);
        const side = j => (shared === undefined || j.body2 !== shared ? j.body2 : j.body1);
        return [side(jw), side(jg)];
    },
    /** The editor's overlap rule: a worm and a wheel meshing where they stand share volume. */
    placedMesh (a, metaA, b, metaB) {
        for (const [p, mp, q, mq] of [[a, metaA, b, metaB], [b, metaB, a, metaA]]) {
            const wheel = placedSpur(q, mq);
            if (!wheel) continue;
            if (placedTooth(p, mp, 'worm').some(w => wormContact(w, wheel))) return true;
        }
        return false;
    }
};

/** The connector kind: data checked here (validatePartMeta with the registry). */
export const WORM_THREAD = {
    kind: 'worm',
    validate (c) {
        const out = [];
        if (!(typeof c.length === 'number' && c.length > 0)) out.push('a worm connector needs its threaded length (LDU)');
        const d = c.data || {};
        if (!(d.pitchRadiusLdu > 0)) out.push('data.pitchRadiusLdu: where the worm meshes (LDU)');
        if (d.hand !== 1 && d.hand !== -1) out.push('data.hand: 1 (right-hand thread) or -1 (left-hand)');
        if (d.starts !== undefined && !(Number.isInteger(d.starts) && d.starts > 0)) out.push('data.starts: a positive integer');
        return out;
    }
};
