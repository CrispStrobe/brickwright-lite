// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Exact-enough primitive intersection for PartMeta colliders (LDraw frame, LDU),
// used by snap.js instead of its AABB approximation.

import {mat3MulVec3, vecAdd, vecSub, vecScale, vecDot, vecCross, vecLen, vecNormalize} from '../mech/vec.js';

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
    const cylBox = cylinderAsBox(cyl);
    return boxBoxOverlap(cylBox, box, tolerance);
};

const cylinderCylinderOverlap = (a, b, tolerance) => {
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

export const partOverlaps = (model, catalog, placedPart, {ignore = []} = {}) => {
    const catalogMap = catalog instanceof Map ? catalog : new Map(Object.entries(catalog || {}));
    const meta = catalogMap.get(placedPart.part);
    if (!meta) return [];
    const ignoreSet = new Set(ignore);
    const myPrims = collidersOf(placedPart, meta);
    const result = [];
    for (const other of model.parts) {
        if (other.id === placedPart.id) continue;
        if (ignoreSet.has(other.id)) continue;
        const otherMeta = catalogMap.get(other.part);
        if (!otherMeta) continue;
        const otherPrims = collidersOf(other, otherMeta);
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
