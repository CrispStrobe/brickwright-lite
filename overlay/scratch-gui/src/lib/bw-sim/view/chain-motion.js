// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Chain links that run round in Simulate (kinds/chain.js welds them to the sprockets' frame:
// the physics does not move them). Each drawn frame, the chain's first sprocket's turn relative
// to that frame says how far the chain has run, and every link slides that far along the loop
// the links make (link k takes the pose of the place k + u along it, u in links: positions
// interpolated, rotations slerped between neighbours). Drawing only: the bodies, the contacts
// and the snapshot stay as the core made them.

import {Quaternion, Vector3} from 'three';
import {pitchRadiusLdu, dirToWorld} from '../contracts.js';

const JOIN_LDU = 2;

const mulVec = (m, v) => [0, 1, 2].map(r => m[r * 3] * v[0] + m[r * 3 + 1] * v[1] + m[r * 3 + 2] * v[2]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** A placed link's pivots (LDU): its connector's middle ∓ half its pitch along `along`. */
export const placedPivots = (pl, conn) => {
    const mid = mulVec(pl.rotation, conn.position).map((x, i) => x + pl.position[i]);
    const half = mulVec(pl.rotation, conn.data.along).map(x => x * conn.data.pitchLdu / 2);
    return [sub(mid, half), mid.map((x, i) => x + half[i])];
};

/**
 * The links in running order round a closed chain (each one's second pivot on the next one's
 * first), or null when they do not close into one loop.
 * @param {{id: string, pivots: number[][]}[]} links
 */
export const orderLoop = links => {
    if (links.length < 3) return null;
    const near = (p, q) => Math.hypot(...sub(p, q)) <= JOIN_LDU;
    const out = [links[0]];
    const used = new Set([links[0].id]);
    for (;;) {
        const last = out.at(-1);
        const next = links.find(l => !used.has(l.id) && near(last.pivots[1], l.pivots[0]));
        if (!next) break;
        out.push(next);
        used.add(next.id);
    }
    return out.length === links.length && near(out.at(-1).pivots[1], out[0].pivots[0]) ? out : null;
};

/** The angle (rad, −π..π) a rotation quaternion [x, y, z, w] turns about the unit `axis`. */
export const twistAbout = (q, axis) => 2 * Math.atan2(q[0] * axis[0] + q[1] * axis[1] + q[2] * axis[2], q[3]);

/**
 * Where link k is when the chain has run `u` links: between the base places of links
 * floor(k + u) and the next (mod n), at the fraction between them.
 */
export const slotAt = (k, u, n) => {
    const f = Math.floor(k + u);
    return {from: ((f % n) + n) % n, to: (((f + 1) % n) + n) % n, frac: k + u - f};
};

/**
 * @param {{model, mechanism, catalog: Map|object|null, built: {bodyGroups: Map, partMeshes: Map}}} args
 * @returns {{update(): void, loops: number}|null} null when the model has no chain that runs
 */
export const createChainMotion = ({model, mechanism, catalog, built}) => {
    if (!catalog) return null;
    const metaOf = part => (catalog instanceof Map ? catalog.get(part) : catalog[part]);
    const byId = new Map(model.parts.map(p => [p.id, p]));
    const linkConn = pl => {
        const meta = pl && metaOf(pl.part);
        return meta && (meta.connectors || []).find(c => c.type === 'chain-link' && c.data && c.data.along);
    };
    const bodyOf = id => (mechanism.bodies || []).find(b => b.parts.includes(id));
    const seen = new Set();
    const loops = [];
    for (const c of (mechanism.couplings || []).filter(x => x.kind === 'chain')) {
        const linkIds = (c.parts || []).filter(id => linkConn(byId.get(id)));
        const key = linkIds.slice().sort().join(',');
        if (!linkIds.length || seen.has(key)) continue;
        seen.add(key);
        const gearId = (c.parts || []).find(id => !linkIds.includes(id));
        const gear = byId.get(gearId);
        const gearMeta = gear && metaOf(gear.part);
        const gearBody = bodyOf(gearId);
        const frameBody = bodyOf(linkIds[0]);
        if (!gearMeta || !gearMeta.gear || !gearBody || !frameBody) continue;
        const frameGroup = built.bodyGroups.get(frameBody.id);
        const gearGroup = built.bodyGroups.get(gearBody.id);
        const order = orderLoop(linkIds.map(id => ({id, pivots: placedPivots(byId.get(id), linkConn(byId.get(id)))})));
        if (!frameGroup || !gearGroup || !order || !order.every(l => built.partMeshes.has(l.id))) continue;
        // The way round: a positive turn about the gear's axis moves its pitch circle along a × (p − c).
        const axisLdu = mulVec(gear.rotation, gearMeta.gear.axis);
        const centre = mulVec(gear.rotation, gearMeta.gear.center).map((x, i) => x + gear.position[i]);
        const r = pitchRadiusLdu(gearMeta.gear.teeth);
        const onGear = order.find(l => {
            const d = sub(l.pivots[0], centre);
            const axial = dot(d, axisLdu);
            return Math.abs(Math.hypot(...d.map((x, i) => x - axisLdu[i] * axial)) - r) <= 2.5;
        });
        if (!onGear) continue;
        const sense = Math.sign(dot(sub(onGear.pivots[1], onGear.pivots[0]), cross(axisLdu, sub(onGear.pivots[0], centre)))) || 1;
        // The gear's axis in the frame's own coordinates, and the gear's turn relative to it at t = 0.
        const q0 = frameGroup.quaternion.clone().invert().multiply(gearGroup.quaternion);
        const al = new Vector3(...dirToWorld(axisLdu)).applyQuaternion(frameGroup.quaternion.clone().invert()).normalize();
        const meshes = order.map(l => built.partMeshes.get(l.id));
        loops.push({meshes, base: meshes.map(m => ({p: m.position.clone(), q: m.quaternion.clone()})), frameGroup, gearGroup, q0,
            axis: [al.x, al.y, al.z], perLinkRad: linkConn(byId.get(order[0].id)).data.pitchLdu / r, sense, turned: 0, last: 0});
    }
    if (!loops.length) return null;
    const rel = new Quaternion();
    const inv0 = new Quaternion();
    return {
        loops: loops.length,
        update () {
            for (const L of loops) {
                rel.copy(L.frameGroup.quaternion).invert().multiply(L.gearGroup.quaternion).multiply(inv0.copy(L.q0).invert());
                const now = twistAbout([rel.x, rel.y, rel.z, rel.w], L.axis);
                let d = now - L.last;
                if (d > Math.PI) d -= 2 * Math.PI;
                if (d < -Math.PI) d += 2 * Math.PI;
                L.turned += d;
                L.last = now;
                const u = L.sense * L.turned / L.perLinkRad;
                const n = L.meshes.length;
                L.meshes.forEach((m, k) => {
                    const s = slotAt(k, u, n);
                    m.position.lerpVectors(L.base[s.from].p, L.base[s.to].p, s.frac);
                    m.quaternion.slerpQuaternions(L.base[s.from].q, L.base[s.to].q, s.frac);
                });
            }
        }
    };
};
