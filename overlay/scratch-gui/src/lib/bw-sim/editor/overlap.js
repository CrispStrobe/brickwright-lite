// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Exact-enough primitive intersection for PartMeta colliders (LDraw frame, LDU),
// used by snap.js instead of its AABB approximation, and the build editor's
// collider geometry: which solid parts a pose would push into (one rule for the
// editor and test/bw-sim-s1-driving-base.test.mjs), whether a move is allowed,
// what a pointer ray hits (holes count as the part: colliders are solid), and
// where a part rests on a surface.

import {placedGearsMesh} from '../mech/gears.js';
import {solidColliders} from '../kinds/pin-axle.js';
import {mat3MulVec3, vecAdd, vecSub, vecScale, vecDot, vecCross, vecLen, vecNormalize} from '../mech/vec.js';
import {indexFor, partBounds} from '../mech/spatial-index.js';

// Transform a point from part local to model LDraw frame
const transformPoint = (pos, rot, local) => vecAdd(mat3MulVec3(rot, local), pos);
const transformAxis = (rot, localAxis) => vecNormalize(mat3MulVec3(rot, localAxis));

// For a collider's own rotation (quaternion xyzw), get its 3 axes in part local
const quatToAxes = q => {
    const [x, y, z, w] = q;
    const xx = x*x, yy = y*y, zz = z*z;
    const xy = x*y, xz = x*z, yz = y*z;
    const wx = w*x, wy = w*y, wz = w*z;
    return [
        [1 - 2*(yy+zz), 2*(xy+wz), 2*(xz-wy)],
        [2*(xy-wz), 1 - 2*(xx+zz), 2*(yz+wx)],
        [2*(xz+wy), 2*(yz-wx), 1 - 2*(xx+yy)]
    ];
};

export const collidersOf = (placedPart, meta) => {
    const out = [];
    for (const c of meta.colliders) {
        const localPos = c.position || [0, 0, 0];
        const worldPos = transformPoint(placedPart.position, placedPart.rotation, localPos);
        if (c.shape === 'box') {
            // Box: centre, 3 axes, halfExtents
            let axes;
            if (c.rotation) {
                const localAxes = quatToAxes(c.rotation);
                axes = localAxes.map(ax => transformAxis(placedPart.rotation, ax));
            } else {
                // Default axes are world axes in part local, transformed by placed rotation
                axes = [
                    transformAxis(placedPart.rotation, [1, 0, 0]),
                    transformAxis(placedPart.rotation, [0, 1, 0]),
                    transformAxis(placedPart.rotation, [0, 0, 1])
                ];
            }
            out.push({shape: 'box', centre: worldPos, axes, halfExtents: c.halfExtents.slice()});
        } else if (c.shape === 'cylinder') {
            let axis;
            if (c.rotation) {
                const localAxes = quatToAxes(c.rotation);
                axis = transformAxis(placedPart.rotation, localAxes[1]); // local +y
            } else {
                axis = transformAxis(placedPart.rotation, [0, 1, 0]);
            }
            out.push({shape: 'cylinder', centre: worldPos, axis, radius: c.radius, halfHeight: c.halfHeight});
        } else if (c.shape === 'sphere') {
            out.push({shape: 'sphere', centre: worldPos, radius: c.radius});
        }
    }
    return out;
};

// Helper: projection of a box onto an axis
const boxProjection = (box, axis) => {
    let p = 0;
    for (let i = 0; i < 3; i++) {
        p += Math.abs(vecDot(box.axes[i], axis)) * box.halfExtents[i];
    }
    return p;
};

// Box-box SAT with 15 axes
const boxBoxOverlap = (a, b, tolerance) => {
    const axes = [];
    // 3 + 3 face normals
    for (let i = 0; i < 3; i++) axes.push(a.axes[i]);
    for (let i = 0; i < 3; i++) axes.push(b.axes[i]);
    // 9 cross products
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            const cp = vecCross(a.axes[i], b.axes[j]);
            if (vecLen(cp) > 1e-9) axes.push(vecNormalize(cp));
        }
    }
    const delta = vecSub(b.centre, a.centre);
    for (const axis of axes) {
        const aProj = boxProjection(a, axis);
        const bProj = boxProjection(b, axis);
        const dProj = Math.abs(vecDot(delta, axis));
        const penetration = aProj + bProj - dProj;
        if (penetration <= tolerance + 1e-9) return false;
    }
    return true;
};

const sphereSphereOverlap = (a, b, tolerance) => {
    const d = vecLen(vecSub(a.centre, b.centre));
    return d < a.radius + b.radius - tolerance - 1e-9;
};

const sphereBoxOverlap = (sphere, box, tolerance) => {
    // Closest point on box to sphere centre
    let closest = box.centre.slice();
    for (let i = 0; i < 3; i++) {
        const axis = box.axes[i];
        const he = box.halfExtents[i];
        const d = vecDot(vecSub(sphere.centre, box.centre), axis);
        const clamped = Math.max(-he, Math.min(he, d));
        closest = vecAdd(closest, vecScale(axis, clamped));
    }
    const d = vecLen(vecSub(sphere.centre, closest));
    return d < sphere.radius - tolerance - 1e-9;
};

const sphereCylinderOverlap = (sphere, cyl, tolerance) => {
    // Cylinder as capsule? For exact, we can treat cylinder as sphere sweep along axis
    // Closest point on cylinder's axis segment to sphere centre
    const toSphere = vecSub(sphere.centre, cyl.centre);
    const axial = vecDot(toSphere, cyl.axis);
    const clampedAxial = Math.max(-cyl.halfHeight, Math.min(cyl.halfHeight, axial));
    const closestOnAxis = vecAdd(cyl.centre, vecScale(cyl.axis, clampedAxial));
    const radialVec = vecSub(sphere.centre, closestOnAxis);
    const radialDist = vecLen(radialVec);
    const axialInside = Math.abs(axial) <= cyl.halfHeight + 1e-9;
    // If axialInside, radialDist < r + sr - tolerance
    // If outside caps, distance to cap circle
    let dist;
    if (axialInside) {
        dist = radialDist;
        return dist < cyl.radius + sphere.radius - tolerance - 1e-9;
    } else {
        const capCentre = vecAdd(cyl.centre, vecScale(cyl.axis, clampedAxial));
        dist = vecLen(vecSub(sphere.centre, capCentre));
        return dist < cyl.radius + sphere.radius - tolerance - 1e-9;
    }
};

// Cylinder as box of half-sizes (r, hh, r) for SAT with box/cylinder
const cylinderAsBox = cyl => {
    // Cylinder's own frame: axis is y, radius in x/z, halfHeight in y
    // We need to create a box that approximates it with halfExtents [r, hh, r] and axes [perp1, axis, perp2]
    // Find two perpendicular axes to the cylinder axis
    let perp1 = Math.abs(cyl.axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    perp1 = vecNormalize(vecSub(perp1, vecScale(cyl.axis, vecDot(perp1, cyl.axis))));
    const perp2 = vecNormalize(vecCross(cyl.axis, perp1));
    return {
        centre: cyl.centre,
        axes: [perp1, cyl.axis, perp2],
        halfExtents: [cyl.radius, cyl.halfHeight, cyl.radius]
    };
};

const cylinderBoxOverlap = (cyl, box, tolerance) => {
    // A beam end is a disk extruded through its thickness. When its axis is a
    // box face normal, closest-point distance in that face is exact. Bounding
    // its disk by a square falsely rejects adjacent angled Technic beams.
    const normal = box.axes.findIndex(ax => Math.abs(vecDot(ax, cyl.axis)) > 1 - 1e-9);
    if (normal >= 0) {
        const delta = vecSub(cyl.centre, box.centre);
        if (Math.abs(vecDot(delta, cyl.axis)) >= cyl.halfHeight + box.halfExtents[normal] - tolerance - 1e-9) return false;
        let distance2 = 0;
        for (let i = 0; i < 3; i++) {
            if (i === normal) continue;
            const outside = Math.max(0, Math.abs(vecDot(delta, box.axes[i])) - box.halfExtents[i]);
            distance2 += outside * outside;
        }
        return distance2 < Math.max(0, cyl.radius - tolerance) ** 2 - 1e-9;
    }
    const cylBox = cylinderAsBox(cyl);
    return boxBoxOverlap(cylBox, box, tolerance);
};

const cylinderCylinderOverlap = (a, b, tolerance) => {
    if (Math.abs(vecDot(a.axis, b.axis)) > 1 - 1e-9) {
        const delta = vecSub(b.centre, a.centre);
        const axial = vecDot(delta, a.axis);
        if (Math.abs(axial) >= a.halfHeight + b.halfHeight - tolerance - 1e-9) return false;
        const radial2 = Math.max(0, vecDot(delta, delta) - axial * axial);
        return radial2 < Math.max(0, a.radius + b.radius - tolerance) ** 2 - 1e-9;
    }
    // For orthogonal shafts, the two axial slabs leave independent radial
    // distances. Their remaining intervals on the common normal must overlap.
    // This is exact for perpendicular cylinders; bounding squares falsely
    // collide a gearbox bearing with the corner outside its round gear.
    if (Math.abs(vecDot(a.axis, b.axis)) < 1e-9) {
        const delta = vecSub(b.centre, a.centre);
        const normal = vecNormalize(vecCross(a.axis, b.axis));
        const ra = Math.max(0, a.radius - tolerance / 2);
        const rb = Math.max(0, b.radius - tolerance / 2);
        const gapA = Math.max(0, Math.abs(vecDot(delta, a.axis)) - a.halfHeight);
        const gapB = Math.max(0, Math.abs(vecDot(delta, b.axis)) - b.halfHeight);
        if (gapA >= rb - 1e-9 || gapB >= ra - 1e-9) return false;
        const reach = Math.sqrt(ra * ra - gapB * gapB) + Math.sqrt(rb * rb - gapA * gapA);
        return Math.abs(vecDot(delta, normal)) < reach - 1e-9;
    }
    const aBox = cylinderAsBox(a);
    const bBox = cylinderAsBox(b);
    return boxBoxOverlap(aBox, bBox, tolerance);
};

export const primitivesOverlap = (a, b, tolerance = 1) => {
    if (a.shape === 'box' && b.shape === 'box') return boxBoxOverlap(a, b, tolerance);
    if (a.shape === 'sphere' && b.shape === 'sphere') return sphereSphereOverlap(a, b, tolerance);
    if (a.shape === 'sphere' && b.shape === 'box') return sphereBoxOverlap(a, b, tolerance);
    if (a.shape === 'box' && b.shape === 'sphere') return sphereBoxOverlap(b, a, tolerance);
    if (a.shape === 'sphere' && b.shape === 'cylinder') return sphereCylinderOverlap(a, b, tolerance);
    if (a.shape === 'cylinder' && b.shape === 'sphere') return sphereCylinderOverlap(b, a, tolerance);
    if (a.shape === 'box' && b.shape === 'cylinder') return cylinderBoxOverlap(b, a, tolerance);
    if (a.shape === 'cylinder' && b.shape === 'box') return cylinderBoxOverlap(a, b, tolerance);
    if (a.shape === 'cylinder' && b.shape === 'cylinder') return cylinderCylinderOverlap(a, b, tolerance);
    return false;
};

/**
 * The parts of `model` worth testing against `placedPart`: with an index (a frozen model, see
 * spatial-index.js), only those whose bounds touch its own, in model order; else all of them.
 */
const nearParts = (model, catalogMap, placedPart, meta) => {
    const index = indexFor(model.parts, catalogMap);
    if (!index) return model.parts;
    const box = partBounds(placedPart, meta);
    return box ? index.queryBox(box).map(i => model.parts[i]) : [];
};

export const partOverlaps = (model, catalog, placedPart, {ignore = [], colliders = (meta => meta.colliders.map((_, i) => i))} = {}) => {
    const catalogMap = catalog instanceof Map ? catalog : new Map(Object.entries(catalog || {}));
    const meta = catalogMap.get(placedPart.part);
    if (!meta) return [];
    const ignoreSet = new Set(ignore);
    const pick = (pl, m) => {
        const prims = collidersOf(pl, m);
        return colliders(m).map(i => prims[i]);
    };
    const myPrims = pick(placedPart, meta);
    const result = [];
    if (!myPrims.length) return result;
    // Broad phase: a part whose bounds miss this one's cannot overlap it (its colliders are inside them).
    for (const other of nearParts(model, catalogMap, placedPart, meta)) {
        if (other.id === placedPart.id) continue;
        if (ignoreSet.has(other.id)) continue;
        const otherMeta = catalogMap.get(other.part);
        if (!otherMeta) continue;
        const otherPrims = pick(other, otherMeta);
        let maxDepth = 0;
        let overlaps = false;
        for (const a of myPrims) {
            for (const b of otherPrims) {
                if (primitivesOverlap(a, b, 1)) {
                    overlaps = true;
                    // For depth, we can approximate as the minimal penetration, but for now just use 1
                    maxDepth = Math.max(maxDepth, 1);
                }
            }
        }
        if (overlaps) result.push({part: other.id, depth: maxDepth});
    }
    return result;
};

// ---- solid parts, moves, rays, resting ---------------------------------------

// The region rule (which colliders of a part are shaft, which solid) is the v1 connector
// kinds' (kinds/pin-axle.js), re-exported here where the editor and the tests read it.
export {SHAFT_REGIONS, solidColliders} from '../kinds/pin-axle.js';
const asMap = catalog => (catalog instanceof Map ? catalog : new Map(Object.entries(catalog || {})));

/**
 * True for a part that is made to sit wholly INSIDE other ones: no solid
 * collider (solidColliders) — pins and axles (in holes), the castor ball (in its
 * socket). Everything else has a solid volume.
 * @param {object} meta PartMeta
 */
export const sitsInside = meta => Boolean(meta && meta.connectors && meta.connectors.length && solidColliders(meta).length === 0);

/**
 * The solid parts a placed part pushes into: its solid colliders against every
 * other part's solid colliders (solidColliders). Shaft regions — a pin, the pin
 * ends of 87082, an axle — may sit inside anything; meshing gears interleave
 * their teeth.
 * @returns {{part: string, depth: number}[]}
 */
export const solidOverlaps = (model, catalog, placedPart, {ignore = []} = {}) => {
    const catalogMap = asMap(catalog);
    const myMeta = catalogMap.get(placedPart.part);
    if (solidColliders(myMeta).length === 0) return [];
    // Only parts that can touch it need the pin/axle and gear-mesh exemptions worked out.
    const skip = nearParts(model, catalogMap, placedPart, myMeta).filter(p => p.id !== placedPart.id && (solidColliders(catalogMap.get(p.part)).length === 0 ||
        placedGearsMesh(placedPart, myMeta, p, catalogMap.get(p.part)))).map(p => p.id);
    return partOverlaps(model, catalogMap, placedPart, {ignore: [...ignore, ...skip], colliders: solidColliders});
};

/**
 * First offset from a list at which none of the translated copies overlaps a
 * solid part of the model. Pure: uses solidOverlaps semantics (pins/axles/balls
 * and meshing gears may share volume), copies are not checked against each other.
 * @param {{model: object, catalog: Map|object, parts: {id:string,part:string,position:number[],rotation:number[]}[], offsets: number[][]}} args
 * @returns {number[]|null} the first free offset, or null
 */
export const freeOffset = ({model, catalog, parts, offsets}) => {
    for (const offset of offsets) {
        let free = true;
        for (const part of parts) {
            const copy = {
                ...part,
                position: [part.position[0] + offset[0], part.position[1] + offset[1], part.position[2] + offset[2]]
            };
            if (solidOverlaps(model, catalog, copy).length > 0) {
                free = false;
                break;
            }
        }
        if (free) return offset;
    }
    return null;
};

/**
 * Whether moving parts to new poses is allowed: refused when a moved solid part
 * would push into a solid part it was not already in (an old overlap never
 * blocks moving out of it). Parts moved together are not checked against each
 * other (they keep their relative poses only if moved rigidly; a gizmo, drag
 * or turn always is), and `connected` parts — the ones a magnet snap joins the
 * part to — count as a legitimate connection.
 * @param {{model: object, catalog: Map|object, moves: {id: string, position: number[], rotation: number[]}[], connected?: string[]}} args
 * @returns {{ok: true}|{ok: false, part: string, into: string}}
 */
export const moveVerdict = ({model, catalog, moves, connected = []}) => {
    const moved = new Map(moves.map(m => [m.id, m]));
    const ignore = [...moved.keys(), ...connected];
    // Every moved part is ignored, so each moved part is tested against the parts that stay, which are
    // the same in the model before and after the move: test against `model` itself (its index, if any).
    for (const p of model.parts) {
        if (!moved.has(p.id)) continue;
        const m = moved.get(p.id);
        const was = new Set(solidOverlaps(model, catalog, p, {ignore}).map(o => o.part));
        const hit = solidOverlaps(model, catalog, {...p, position: m.position, rotation: m.rotation}, {ignore}).find(o => !was.has(o.part));
        if (hit) return {ok: false, part: p.id, into: hit.part};
    }
    return {ok: true};
};

/** Ray (origin, unit dir) against one collider primitive: entry distance and outward normal, or null. */
const rayPrimitive = (prim, origin, dir) => {
    if (prim.shape === 'sphere') {
        const oc = vecSub(origin, prim.centre);
        const b = vecDot(oc, dir);
        const c = vecDot(oc, oc) - prim.radius * prim.radius;
        const disc = b * b - c;
        if (disc < 0) return null;
        const t = -b - Math.sqrt(disc);
        if (t < 0) return null;
        return {t, normal: vecNormalize(vecSub(vecAdd(origin, vecScale(dir, t)), prim.centre))};
    }
    const box = prim.shape === 'box' ? prim : cylinderAsBox(prim);
    const rel = vecSub(origin, box.centre);
    let tNear = -Infinity;
    let tFar = Infinity;
    let normal = null;
    for (let i = 0; i < 3; i++) {
        const e = vecDot(box.axes[i], rel);
        const f = vecDot(box.axes[i], dir);
        const h = box.halfExtents[i];
        if (Math.abs(f) < 1e-12) {
            if (Math.abs(e) > h) return null;
            continue;
        }
        const t1 = (-h - e) / f;
        const t2 = (h - e) / f;
        const [a, b] = t1 < t2 ? [t1, t2] : [t2, t1];
        if (a > tNear) {
            tNear = a;
            normal = vecScale(box.axes[i], f > 0 ? -1 : 1);
        }
        tFar = Math.min(tFar, b);
        if (tNear > tFar) return null;
    }
    if (tNear < 0 || !normal) return null;
    return {t: tNear, normal};
};

/**
 * What a pointer ray hits, nearest first, against the parts' colliders (LDraw
 * frame). Colliders are solid, so a ray aimed into a beam's hole hits the
 * beam's face around it instead of passing through to the floor.
 * @param {object} model
 * @param {Map|object} catalog
 * @param {number[]} origin LDU
 * @param {number[]} direction any length
 * @param {{exclude?: string[]}} [options]
 * @returns {{part: string, t: number, point: number[], normal: number[]}[]}
 */
export const rayHitParts = (model, catalog, origin, direction, {exclude = []} = {}) => {
    const catalogMap = asMap(catalog);
    const dir = vecNormalize(direction);
    const skip = new Set(exclude);
    const hits = [];
    // Broad phase: only the parts whose bounds the ray passes through (a frozen model's index).
    const index = indexFor(model.parts, catalogMap);
    const parts = index ? index.queryRay(origin, dir).map(i => model.parts[i]) : model.parts;
    for (const p of parts) {
        if (skip.has(p.id)) continue;
        const meta = catalogMap.get(p.part);
        if (!meta) continue;
        let best = null;
        for (const prim of collidersOf(p, meta)) {
            const h = rayPrimitive(prim, origin, dir);
            if (h && (!best || h.t < best.t)) best = h;
        }
        if (best) hits.push({part: p.id, t: best.t, point: vecAdd(origin, vecScale(dir, best.t)), normal: best.normal});
    }
    return hits.sort((a, b) => a.t - b.t);
};

/** Extent of a primitive along a model axis k (0 x, 1 y, 2 z) about its centre. */
const extentAlong = (prim, k) => {
    if (prim.shape === 'sphere') return prim.radius;
    const box = prim.shape === 'box' ? prim : cylinderAsBox(prim);
    return box.axes.reduce((sum, axis, i) => sum + Math.abs(axis[k]) * box.halfExtents[i], 0);
};

/**
 * Where a part rests on a surface point (LDraw, LDU): its colliders' lowest
 * point touches the surface (no overlap with what it stands on), its footprint
 * is centred on the point, and x/z are on the grid. LDraw is -y up, so "lowest"
 * is the largest y; the height is rounded UP to whole LDU so it never sinks in.
 * @param {{meta: object, rotation: number[], point: number[], grid: number}} args
 * @returns {number[]} the part's position
 */
export const restingPosition = ({meta, rotation, point, grid}) => {
    const prims = collidersOf({position: [0, 0, 0], rotation}, meta);
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const prim of prims) {
        for (let k = 0; k < 3; k++) {
            const e = extentAlong(prim, k);
            lo[k] = Math.min(lo[k], prim.centre[k] - e);
            hi[k] = Math.max(hi[k], prim.centre[k] + e);
        }
    }
    if (!prims.length) for (let k = 0; k < 3; k++) { lo[k] = 0; hi[k] = 0; }
    const onGrid = v => Math.round(v / grid) * grid;
    const tidy = v => (Object.is(v, -0) ? 0 : v);
    return [onGrid(point[0] - (lo[0] + hi[0]) / 2), Math.floor(point[1] - hi[1] + 1e-6), onGrid(point[2] - (lo[2] + hi[2]) / 2)].map(tidy);
};
