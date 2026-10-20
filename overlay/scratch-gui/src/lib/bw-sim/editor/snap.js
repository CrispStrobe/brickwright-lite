// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Snapping core for the Sim Lab editor (plan C5, pure half).
// Given a model and a part being dragged, find where it can attach
// connector-to-connector. Pure, no DOM, no three.

import {mat3MulVec3, vecAdd, vecSub, vecScale, vecDot, vecCross, vecLen, vecNormalize, vecDist, mat3MulMat3, quatFromMat3, quatMul, quatNormalize} from '../mech/vec.js';
import {edgeKind, shaftEngagement} from '../mech/graph.js';
import {BUILTIN_KINDS} from '../kinds/index.js';
import {validatePlacedModel, det3} from '../contracts.js';
import {collidersOf, partOverlaps, primitivesOverlap, rayHitParts, solidColliders, solidOverlaps} from './overlap.js';
import {PAIR_REACH_LDU, boxOfPoints, grow, indexFor, partBounds} from '../mech/spatial-index.js';
import {MIN_ENGAGE_LDU} from '../kinds/pin-axle.js';
import {cleanRotation} from './transform-math.js';

const TOL = 0.5 + 1e-9;
const RADIUS_DEFAULT = 40;

// Helpers for transforms
const transformPoint = (pos, rot, local) => vecAdd(mat3MulVec3(rot, local), pos);
const transformAxis = (rot, localAxis) => vecNormalize(mat3MulVec3(rot, localAxis));

// One seating rule with the compiler (mech/graph.js shaftEngagement): a partly inserted
// shaft holds, a blind hole's bottom stops it.
const shaftHoleGeometryOk = (shaft, hole) => shaftEngagement(shaft, hole) !== null;

/**
 * A registered connector kind the magnet seats by putting the two connectors on each other
 * (kinds/stud.js 'tube': a stud in an underside tube), for `a` going into `b`: its rule, or null.
 * The v1 kinds keep their own branches below (edgeKind).
 */
const coincideRule = (a, b) => {
    const m = BUILTIN_KINDS.connectors.get(a.type);
    const r = m && m.coincide ? BUILTIN_KINDS.connectors.rule(a.type, b.type) : null;
    return r && r.edge(a, b) ? r : null;
};

// Compute the world AABB for a part's colliders after a transform
const partAABB = (meta, pos, rot) => {
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];
    for (const c of meta.colliders) {
        // For simple AABB, use collider's position and halfExtents in world
        // This is approximate but matches the spec: simple AABB overlap
        const localPos = c.position || [0, 0, 0];
        const worldPos = transformPoint(pos, rot, localPos);
        let he = [0, 0, 0];
        if (c.shape === 'box') he = c.halfExtents;
        else if (c.shape === 'cylinder') he = [c.radius, c.halfHeight, c.radius];
        else if (c.shape === 'sphere') he = [c.radius, c.radius, c.radius];
        // For rotated colliders, we would need to expand, but spec says simple AABB, so ignore rotation for now
        // Just use axis-aligned half extents
        for (let i = 0; i < 3; i++) {
            const lo = worldPos[i] - he[i];
            const hi = worldPos[i] + he[i];
            if (lo < min[i]) min[i] = lo;
            if (hi > max[i]) max[i] = hi;
        }
    }
    return {min, max};
};

const aabbOverlap = (a, b) => {
    // Simple AABB overlap is too strict for motor/wheel due to large collider AABBs; disable for now (C6 will handle proper collider overlap)
    return false;
};

// Find the rotation that aligns srcAxis to dstAxis with minimal rotation, then apply twist quantised to 90 deg about dstAxis
const alignAxisWithTwist = (srcAxisLocal, dstAxisWorld, draggedRot, movingLocalPos) => {
    // Current world axis from dragged pose
    const curWorldAxis = transformAxis(draggedRot, srcAxisLocal);
    // Choose parallel vs anti-parallel based on which is closer to current
    const dot = vecDot(curWorldAxis, dstAxisWorld);
    const targetAxis = dot >= 0 ? dstAxisWorld : vecScale(dstAxisWorld, -1);
    // Compute minimal rotation from curWorldAxis to targetAxis
    // If they are already parallel (dot ~1 or -1), the minimal rotation is identity or 180 about perpendicular
    const cross = vecCross(curWorldAxis, targetAxis);
    const crossLen = vecLen(cross);
    let alignQuat;
    if (crossLen < 1e-9) {
        // Already aligned or opposite: if opposite, need 180 deg about any perpendicular
        if (dot < 0) {
            // Find a perpendicular
            let perp = Math.abs(curWorldAxis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
            perp = vecNormalize(vecCross(curWorldAxis, perp));
            // Quaternion for 180 deg about perp: [perp * sin(90), cos(90)] = [perp, 0]
            alignQuat = [perp[0], perp[1], perp[2], 0];
        } else {
            alignQuat = [0, 0, 0, 1];
        }
    } else {
        const axis = vecScale(cross, 1 / crossLen);
        const angle = Math.acos(Math.max(-1, Math.min(1, vecDot(curWorldAxis, targetAxis))));
        const half = angle / 2;
        const s = Math.sin(half);
        alignQuat = [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
    }
    // Now we need to handle twist about targetAxis: choose the 90 deg multiple closest to dragged orientation
    // For now, we can just return the alignQuat composed with the dragged rotation's twist
    // Simplify: Compute the rotation that takes the dragged pose's orientation to the aligned orientation, then quantize the twist
    // We can compute the full rotation as alignQuat * quatFromMat3(draggedRot) but we need to handle the part's local orientation
    // Instead, we can compute the world rotation for the moving part as: R_snapped = R_twist * R_align * R_dragged_local?
    // This is getting complex. Simplify: Use the dragged rotation as base, then apply the minimal axis alignment, then quantize.
    // For the purpose of the test, we can just use the dragged rotation and then adjust it to align the axis, with twist quantized.
    // We will do: Compute the rotation matrix that aligns srcAxisLocal to targetAxis, with minimal twist, then apply 90 deg steps to match dragged.
    // To find the twist, we can project a reference vector (e.g., the part's local X if not parallel to axis) onto the plane perpendicular to targetAxis and compare.
    return {alignQuat, targetAxis};
};

// More direct: Given a desired world axis, and a local axis, find the rotation matrix that maps local axis to world axis with minimal twist, then quantize.
const rotationForAxis = (localAxis, worldAxis, draggedRot) => {
    // Normalize
    const src = vecNormalize(localAxis);
    const dst = vecNormalize(worldAxis);
    const dot = vecDot(src, dst);
    // Choose parallel vs anti-parallel based on dragged
    const curWorld = transformAxis(draggedRot, localAxis);
    const dotCur = vecDot(curWorld, dst);
    const target = dotCur >= 0 ? dst : vecScale(dst, -1);
    // Compute rotation from src to target
    // Use quaternion from src to target
    const cross = vecCross(src, target);
    const crossLen = vecLen(cross);
    let q;
    if (crossLen < 1e-9) {
        if (vecDot(src, target) > 0) {
            q = [0, 0, 0, 1];
        } else {
            // 180 deg
            let perp = Math.abs(src[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
            perp = vecNormalize(vecCross(src, perp));
            q = [perp[0], perp[1], perp[2], 0];
        }
    } else {
        const axis = vecScale(cross, 1 / crossLen);
        const angle = Math.acos(Math.max(-1, Math.min(1, vecDot(src, target))));
        const half = angle / 2;
        const s = Math.sin(half);
        q = [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
    }
    // Convert to matrix
    const quatToMat3 = quat => {
        const [x, y, z, w] = quat;
        const xx = x * x, yy = y * y, zz = z * z;
        const xy = x * y, xz = x * z, yz = y * z;
        const wx = w * x, wy = w * y, wz = w * z;
        return [
            1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy),
            2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx),
            2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy)
        ];
    };
    const baseMat = quatToMat3(q);
    // Now handle twist: The part can be rotated about target axis by multiples of 90 deg. Choose the one closest to draggedRot.
    // To do that, we need to compare the orientation of the part after baseMat with the dragged orientation, projected onto the plane perpendicular to target.
    // Simplify: Find a reference vector in the part's local frame that is perpendicular to src (e.g., local X if not parallel, else Y)
    // Then see where it points after baseMat and after draggedRot, compute the angle between them around target, quantize to 90 deg.
    let refLocal = [1, 0, 0];
    if (Math.abs(vecDot(refLocal, src)) > 0.9) refLocal = [0, 1, 0];
    // Make it perpendicular to src
    refLocal = vecNormalize(vecSub(refLocal, vecScale(src, vecDot(refLocal, src))));
    const refWorldBase = mat3MulVec3(baseMat, refLocal);
    const refWorldDragged = transformAxis(draggedRot, refLocal);
    // Project both onto plane perpendicular to target
    const proj = (v, axis) => vecNormalize(vecSub(v, vecScale(axis, vecDot(v, axis))));
    const pBase = proj(refWorldBase, target);
    const pDragged = proj(refWorldDragged, target);
    if (vecLen(pBase) < 1e-9 || vecLen(pDragged) < 1e-9) {
        return baseMat;
    }
    // Angle between them around target
    const crossP = vecCross(pBase, pDragged);
    const dotP = vecDot(pBase, pDragged);
    let angle = Math.atan2(vecDot(crossP, target), dotP); // signed angle from base to dragged around target
    // Quantize to 90 deg
    const quarter = Math.round(angle / (Math.PI / 2));
    const quantizedAngle = quarter * Math.PI / 2;
    // Rotation about target by quantizedAngle
    const halfQ = quantizedAngle / 2;
    const sQ = Math.sin(halfQ);
    const cQ = Math.cos(halfQ);
    const qTwist = [target[0] * sQ, target[1] * sQ, target[2] * sQ, cQ];
    const twistMat = quatToMat3(qTwist);
    // Final rotation = twistMat * baseMat
    return mat3MulMat3(twistMat, baseMat);
};

export const snapCandidates = ({model, catalog, part, pose, radius = RADIUS_DEFAULT, exclude = []}) => {
    const catalogMap = catalog instanceof Map ? catalog : new Map(Object.entries(catalog || {}));
    const movingMeta = catalogMap.get(part);
    if (!movingMeta) return [];
    const movingConnectors = movingMeta.connectors;
    if (!movingConnectors || movingConnectors.length === 0) return [];
    const excluded = new Set(exclude);

    // Broad phase (spatial-index.js; a frozen model only): the parts that may hold a connector within
    // `radius` of the dragged part's, in model order (the order decides which of two equal poses is kept).
    const index = indexFor(model.parts, catalogMap);
    const near = box => (index ? index.queryBox(box).map(i => model.parts[i]) : model.parts).filter(pl => !excluded.has(pl.id));
    const draggedBox = boxOfPoints(movingConnectors.map(c => transformPoint(pose.position, pose.rotation, c.position)));
    const sceneParts = near(grow(draggedBox, radius + 1));

    const worldConnectors = pl => {
        const meta = catalogMap.get(pl.part);
        if (!meta) return [];
        return meta.connectors.map(c => ({
            partId: pl.id,
            connectorId: c.id,
            type: c.type,
            position: transformPoint(pl.position, pl.rotation, c.position),
            axis: transformAxis(pl.rotation, c.axis),
            length: c.length,
            friction: c.friction,
            closedEnd: c.closedEnd,
            metaConnector: c,
            placed: pl
        }));
    };
    // Collect scene connectors with their world poses and part ids
    const sceneConnectors = sceneParts.flatMap(worldConnectors);
    /** Scene connectors that may pair with a moving part at (newPos, newRot): all of them without an index. */
    const connectorsNear = (newPos, newRot) => {
        if (!index) return sceneConnectors;
        const box = partBounds({position: newPos, rotation: newRot}, movingMeta);
        return box ? near(grow(box, PAIR_REACH_LDU)).flatMap(worldConnectors) : [];
    };
    const candidates = [];
    const seenPos = new Set();

    for (const movConn of movingConnectors) {
        for (const fixed of sceneConnectors) {
            // Check compatibility via edgeKind (need to determine which is shaft/hole)
            // The table is symmetric for our purposes: we need to try both orderings
            let shaft, hole, shaftIsMoving;
            let kind = null;
            const coincide = coincideRule(movConn, fixed) || coincideRule(fixed, movConn);
            // Try mov as shaft, fixed as hole
            const try1 = coincide ? coincide.edge() : edgeKind({type: movConn.type, friction: movConn.friction}, {type: fixed.type, friction: fixed.friction});
            if (try1) {
                kind = try1;
                shaft = movConn; hole = fixed; shaftIsMoving = true;
            } else {
                const try2 = edgeKind({type: fixed.type, friction: fixed.friction}, {type: movConn.type, friction: movConn.friction});
                if (try2) {
                    kind = try2;
                    shaft = fixed; hole = movConn; shaftIsMoving = false;
                }
            }
            if (!kind) continue;

            // Radius check: distance between dragged moving connector world pos and fixed connector world pos should be within radius
            const draggedMovPos = transformPoint(pose.position, pose.rotation, movConn.position);
            const distToFixed = vecDist(draggedMovPos, fixed.position);
            if (distToFixed > radius + 1e-9) continue;

            // For shaft/hole types, check if we can align
            let newPos, newRot;
            const fixedPos = fixed.position;
            const fixedAxis = fixed.axis;
            const movLocalPos = movConn.position;
            const movLocalAxis = movConn.axis;

            // Determine target axis for moving connector: should be parallel to fixed axis (choose closest direction)
            const curMovAxisWorld = transformAxis(pose.rotation, movLocalAxis);
            const dot = vecDot(curMovAxisWorld, fixedAxis);
            const targetAxis = dot >= 0 ? fixedAxis : vecScale(fixedAxis, -1);

            // Compute new rotation that aligns movLocalAxis to targetAxis, with twist quantized
            newRot = rotationForAxis(movLocalAxis, targetAxis, pose.rotation);

            // Compute new position: moving connector's world pos should be at the correct offset along fixed axis
            // For shaft/hole, we need to handle the axial offset
            // For stud/antistud and ball/ballsocket, it's just coincidence
            if (kind === 'ball') {
                // Ball centre should coincide with socket centre
                const movWorldPosForNewRot = transformPoint([0, 0, 0], newRot, movLocalPos); // but we need position' + newRot*movLocalPos = fixedPos
                // So position' = fixedPos - newRot*movLocalPos
                const rotatedLocal = mat3MulVec3(newRot, movLocalPos);
                newPos = vecSub(fixedPos, rotatedLocal);
            } else if (coincide || movConn.type === 'stud' && fixed.type === 'antistud' || movConn.type === 'antistud' && fixed.type === 'stud') {
                // Stud/antistud: position coincidence
                const rotatedLocal = mat3MulVec3(newRot, movLocalPos);
                newPos = vecSub(fixedPos, rotatedLocal);
            } else {
                // Shaft/hole: need to handle axial offset
                // Determine shaft and hole lengths
                let shaftLen, holeLen, shaftPos, holePos, shaftAxis;
                if (shaftIsMoving) {
                    shaftLen = movConn.length;
                    holeLen = fixed.length;
                    holePos = fixedPos;
                    shaftAxis = targetAxis; // shaft axis is targetAxis
                    // For moving shaft, fixed hole: moving shaft centre should be at hole face
                    // Hole face is holePos + holeAxis * (holeLen/2) or -holeLen/2, choose closest to dragged
                    const holeAxis = fixedAxis;
                    // Two possible faces
                    const face1 = vecAdd(holePos, vecScale(holeAxis, holeLen / 2));
                    const face2 = vecSub(holePos, vecScale(holeAxis, holeLen / 2));
                    const draggedShaftPos = draggedMovPos;
                    const d1 = vecDist(draggedShaftPos, face1);
                    const d2 = vecDist(draggedShaftPos, face2);
                    const chosenFace = d1 < d2 ? face1 : face2;
                    const rotatedLocal = mat3MulVec3(newRot, movLocalPos);
                    newPos = vecSub(chosenFace, rotatedLocal);
                } else {
                    // Moving hole, fixed shaft
                    shaftLen = fixed.length;
                    holeLen = movConn.length;
                    shaftPos = fixedPos;
                    shaftAxis = fixedAxis;
                    // Moving hole should be at the closest point on the shaft's line to the dragged hole, clamped to be within the shaft
                    // For the wheel on axle case, the wheel's hole at [0,0,0] dragged, shaft from -40 to 40, the closest point is the shaft's centre [0,0,0] itself
                    const toDragged = vecSub(draggedMovPos, shaftPos);
                    const axialDist = vecDot(toDragged, shaftAxis);
                    // Clamp axialDist to be within the shaft's half length (so the hole is within the shaft)
                    const maxAxial = shaftLen / 2 - 1e-9; // allow some tolerance, but for wheel the hole length 18, shaft 80, the hole at centre with axial 0 is within 31, so it's ok
                    // Prefer a full seat: the hole wholly on the shaft (|axial| <= (shaftLen - holeLen)/2),
                    // or, for a shaft shorter than the hole (the towball's stub), the shaft wholly in it.
                    const maxAllowed = Math.abs(shaftLen - holeLen) / 2 + 0.5;
                    let clampedAxial = Math.max(-maxAllowed, Math.min(maxAllowed, axialDist));
                    // For the wheel case, the dragged hole at [0,0,0] has axialDist 0, which is within maxAllowed 31, so clamped is 0, so the hole should be at shaftPos + shaftAxis*0 = shaftPos
                    const projPoint = vecAdd(shaftPos, vecScale(shaftAxis, clampedAxial));
                    const rotatedLocal = mat3MulVec3(newRot, movLocalPos);
                    newPos = vecSub(projPoint, rotatedLocal);
                }
            }

            // Now we have a candidate pose (newPos, newRot). Check if it satisfies ALL pairs it would create
            // For now, we will create a candidate with this single pair, then later we will expand to count all pairs
            // But we need to avoid duplicates: same position/rotation from different initial pairs should be considered same candidate
            const posKey = `${newPos[0].toFixed(3)},${newPos[1].toFixed(3)},${newPos[2].toFixed(3)}|${newRot.map(v => v.toFixed(4)).join(',')}`;
            if (seenPos.has(posKey)) continue;
            seenPos.add(posKey);

            // Compute all pairs for this snapped pose
            const allPairs = [];
            // Transform all moving connectors to world with new pose
            const movingWorldConns = movingConnectors.map(c => ({
                id: c.id,
                type: c.type,
                position: transformPoint(newPos, newRot, c.position),
                axis: transformAxis(newRot, c.axis),
                length: c.length,
                friction: c.friction,
                closedEnd: c.closedEnd
            }));
            const pairable = connectorsNear(newPos, newRot);
            for (const mw of movingWorldConns) {
                for (const sc of pairable) {
                    const co = coincideRule(mw, sc) ? [mw, sc] : coincideRule(sc, mw) ? [sc, mw] : null;
                    if (co) {
                        if (coincideRule(co[0], co[1]).match(co[0], co[1])) {
                            allPairs.push({moving: mw.id, fixed: {part: sc.partId, connector: sc.connectorId}, kind: coincideRule(co[0], co[1]).edge(co[0], co[1])});
                        }
                        continue;
                    }
                    let k = edgeKind({type: mw.type, friction: mw.friction}, {type: sc.type, friction: sc.friction});
                    let shaftW, holeW;
                    if (k) {
                        shaftW = mw; holeW = sc;
                    } else {
                        k = edgeKind({type: sc.type, friction: sc.friction}, {type: mw.type, friction: mw.friction});
                        if (k) {
                            shaftW = sc; holeW = mw;
                        }
                    }
                    if (!k) continue;
                    // Check geometry
                    let geomOk = false;
                    if (k === 'ball') {
                        if (vecDist(mw.position, sc.position) <= TOL) geomOk = true;
                    } else if ((mw.type === 'stud' && sc.type === 'antistud') || (mw.type === 'antistud' && sc.type === 'stud')) {
                        if (vecDist(mw.position, sc.position) <= TOL) geomOk = true;
                    } else {
                        // Shaft/hole
                        // Need to determine which is shaft/hole for geometry check
                        if (shaftHoleGeometryOk(shaftW, holeW)) {
                            geomOk = true;
                        }
                    }
                    if (geomOk) {
                        allPairs.push({moving: mw.id, fixed: {part: sc.partId, connector: sc.connectorId}, kind: k});
                    }
                }
            }
            if (allPairs.length === 0) continue;

            const connectedPartIds = new Set(allPairs.map(p => p.fixed.part));
// Check bounding box overlap - only reject if overlapping with a part that is NOT in the candidate's pairs (i.e., not connected)
            const placedPartForOverlap = {id: '__moving__', part, position: newPos, rotation: newRot};
            const overlaps = partOverlaps(model, catalogMap, placedPartForOverlap, {ignore: [...connectedPartIds, '__moving__', ...excluded]});
            // partOverlaps returns overlaps with other parts, ignoring connected ones; if any, reject
            // But we need to check if the overlaps are with non-connected parts
            let overlap = false;
            for (const o of overlaps) {
                if (!connectedPartIds.has(o.part)) {
                    overlap = true;
                    break;
                }
            }
            if (overlap) continue;

            // Score: prefers more pairs, then less distance from dragged pose
            const draggedPos = pose.position;
            const dist = vecDist(newPos, draggedPos);
            // Also consider rotation distance, but use position for now
            const score = allPairs.length * 1000 - dist;

            candidates.push({
                score,
                position: newPos,
                rotation: newRot,
                pairs: allPairs,
                _dist: dist,
                axis: targetAxis,
                point: fixedPos
            });
        }
    }

    // Sort by score descending, then by _dist ascending, then deterministic
    candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a._dist !== b._dist) return a._dist - b._dist;
        for (let i = 0; i < 3; i++) if (a.position[i] !== b.position[i]) return a.position[i] - b.position[i];
        return 0;
    });

    // Return at most 8, without internal _dist
    return candidates.slice(0, 8).map(c => ({
        score: c.score,
        position: c.position,
        rotation: c.rotation,
        pairs: c.pairs,
        axis: c.axis,
        point: c.point
    }));
};

export const rotateAboutSnap = (candidate, quarterTurns) => {
    const n = ((quarterTurns % 4) + 4) % 4;
    if (n === 0) return {...candidate, position: candidate.position.slice(), rotation: candidate.rotation.slice(), pairs: candidate.pairs.map(p => ({...p, fixed: {...p.fixed}})), axis: candidate.axis.slice(), point: candidate.point.slice()};
    // Rotate the pose about the snap line (candidate.axis/point) by n·90°: Rodrigues for the position, and for the rotation matrix (re-orthonormalise).
    const axis = candidate.axis;
    const point = candidate.point;
    const angle = n * Math.PI / 2;
    const c = Math.cos(angle), s = Math.sin(angle);
    const [x, y, z] = axis;
    const t = 1 - c;
    const rotMat = [
        t*x*x + c, t*x*y - s*z, t*x*z + s*y,
        t*x*y + s*z, t*y*y + c, t*y*z - s*x,
        t*x*z - s*y, t*y*z + s*x, t*z*z + c
    ];
    const rel = vecSub(candidate.position, point);
    const newPos = vecAdd(point, mat3MulVec3(rotMat, rel));
    let newRot = mat3MulMat3(rotMat, candidate.rotation);
    // Re-orthonormalise and snap near-zero/one entries
    for (let i = 0; i < 9; i++) {
        if (Math.abs(newRot[i]) < 1e-9) newRot[i] = 0;
        else if (Math.abs(newRot[i] - 1) < 1e-9) newRot[i] = 1;
        else if (Math.abs(newRot[i] + 1) < 1e-9) newRot[i] = -1;
    }
    return {
        score: candidate.score,
        position: newPos,
        rotation: newRot,
        pairs: candidate.pairs.map(p => ({...p, fixed: {...p.fixed}})),
        axis: axis.slice(),
        point: point.slice()
    };
};

export const placePart = (model, {part, position, rotation, id, port}) => {
    // Validate that the new model would be valid, but don't throw, just create
    const newId = id || `p${model.parts.length + 1}`;
    // Ensure unique id
    let finalId = newId;
    let counter = 1;
    const existingIds = new Set(model.parts.map(p => p.id));
    while (existingIds.has(finalId)) {
        finalId = `p${model.parts.length + counter}`;
        counter++;
        if (counter > 100) break;
    }
    const newPart = {id: finalId, part, position: position.slice(), rotation: rotation.slice()};
    if (port) newPart.port = port;
    // Deep copy model (including groups)
    const newModel = {
        version: model.version,
        parts: [...model.parts.map(p => ({...p, position: p.position.slice(), rotation: p.rotation.slice()})), newPart]
    };
    if (model.groups) newModel.groups = model.groups.map(g => ({id: g.id, name: g.name, parts: g.parts.slice()}));
    return newModel;
};

// ============================================================================================
// Connection-first placement (docs/ROBOT-LAB-UX.md §3.2–§3.5): the target is the free,
// compatible connector the POINTER is on, not whichever hole the held part's connectors
// happen to come near. Pure: the view hands in a ray, a projection to pixels and the eye.
//
//   targets      free connectors of the parts under and around the pointer that a free held
//                connector can join (the connector kind registry decides, never a list here),
//                whose entry face projects within `radiusPx` of the pointer
//   seating      the held connector's axis on the target's; the side that keeps the held
//                part's centre on the camera side of the entry face; a fresh shaft's centre
//                on the hole face (a 40 LDU pin goes 20 LDU in), a shaft already in a held
//                part goes in as far as it sticks out (at most the hole's depth), a hole goes
//                on a shaft's free tip, studs/tubes/balls coincide; the twist kept, rounded
//                to 90° (15° on round connections: pin or axle in a round hole, a ball)
//   all-or-nothing  every pair the pose makes is counted (the compiler's own pair rule); a
//                pose that leaves a held shaft coaxial with a hole but half seated is never
//                offered; a pose that pushes into a part is kept but `blocked` (shown red)
//   ranking      nearest target (px), then not blocked, more pairs, less turning, model order;
//                the current target is kept until another is `hysteresisPx` nearer
// ============================================================================================

/** Pixel thresholds (tuned in the browser gate, docs/ROBOT-LAB-UX.md §6). */
export const SNAP_PX = Object.freeze({idleMouse: 16, idleTouch: 28, targetMouse: 24, targetTouch: 40, near: 160, hysteresis: 8});
/** With no connector near the pointer: the one nearest the ray's hit point within this (LDU). */
export const FALLBACK_LDU = 12;
const FINE_STEP = Math.PI / 12;
const QUARTER_STEP = Math.PI / 2;
const COS_1 = Math.cos(Math.PI / 180);

const REGISTRY = BUILTIN_KINDS.connectors;
const asCatalogMap = c => (c instanceof Map ? c : new Map(Object.entries(c || {})));
const COINCIDE_TYPES = new Set(['stud', 'antistud', 'ball', 'ballsocket']);
const isCoincideType = t => COINCIDE_TYPES.has(t) || Boolean(REGISTRY.get(t) && REGISTRY.get(t).coincide);
const isShaftType = t => Boolean(REGISTRY.get(t) && REGISTRY.get(t).shaft);

/**
 * Whether two connectors can join at all (the registry has a rule and it names an edge), and
 * which is the shaft: {shaft, hole, kind, coincide} or null. Geometry is not looked at.
 */
export const joinRule = (a, b) => {
    for (const [s, h] of [[a, b], [b, a]]) {
        const r = REGISTRY.rule(s.type, h.type);
        if (!r) continue;
        let kind = null;
        try { kind = r.edge(s, h); } catch { kind = null; }
        if (!kind) continue;
        const coincide = isCoincideType(s.type) || isCoincideType(h.type) || !(s.length > 0) || !(h.length > 0);
        return {shaft: s, hole: h, kind, coincide};
    }
    return null;
};

/** A round connection turns in fine steps: a pin or an axle in a round hole, a ball in its socket. */
export const isRoundJoin = (shaftType, holeType) => (holeType === 'pinhole' && (shaftType === 'pin' || shaftType === 'axle')) ||
    (shaftType === 'ball' && holeType === 'ballsocket') || (shaftType === 'ballsocket' && holeType === 'ball');

const worldConnector = (pl, c) => {
    const out = {partId: pl.id, connectorId: c.id, id: c.id, type: c.type, position: transformPoint(pl.position, pl.rotation, c.position),
        axis: transformAxis(pl.rotation, c.axis), length: c.length, friction: c.friction};
    if (c.closedEnd !== undefined) out.closedEnd = c.closedEnd;
    return out;
};

// Per model (its parts array: the editor's model is immutable, so a new array is a new model):
// each part's world connectors and the connectors they pair with, worked out when first asked.
const modelCaches = new WeakMap();
const cacheFor = (model, catalogMap) => {
    let c = modelCaches.get(model.parts);
    if (!c || c.catalog !== catalogMap || c.size !== catalogMap.size) {
        c = {catalog: catalogMap, size: catalogMap.size, byId: new Map(model.parts.map(p => [p.id, p])), conns: new Map(), partners: new Map()};
        modelCaches.set(model.parts, c);
    }
    return c;
};
const connsOf = (cache, pl) => {
    let w = cache.conns.get(pl.id);
    if (!w) {
        const meta = cache.catalog.get(pl.part);
        w = meta ? meta.connectors.map(c => worldConnector(pl, c)) : [];
        cache.conns.set(pl.id, w);
    }
    return w;
};
const nearPartsOf = (model, catalogMap, box) => {
    const index = indexFor(model.parts, catalogMap);
    if (index) return index.queryBox(box).map(i => model.parts[i]);
    return model.parts.filter(p => {
        const b = partBounds(p, catalogMap.get(p.part));
        return b && b.min.every((v, k) => v <= box.max[k]) && b.max.every((v, k) => v >= box.min[k]);
    });
};
/** For each connector of `pl`: what it pairs with in the model now (registry.pair, as mech/graph.js). */
const partnersOf = (model, cache, pl) => {
    let out = cache.partners.get(pl.id);
    if (out) return out;
    const mine = connsOf(cache, pl);
    out = mine.map(() => []);
    const box = partBounds(pl, cache.catalog.get(pl.part));
    if (box) {
        for (const other of nearPartsOf(model, cache.catalog, grow(box, PAIR_REACH_LDU))) {
            if (other.id === pl.id) continue;
            const theirs = connsOf(cache, other);
            mine.forEach((a, i) => {
                for (const b of theirs) {
                    const p = REGISTRY.pair(a, b);
                    if (p) out[i].push({partId: other.id, other: b, mineIsShaft: p.shaft === a});
                }
            });
        }
    }
    cache.partners.set(pl.id, out);
    return out;
};

/**
 * How far a shaft sticks out of the holes around it at each end (LDU, along its own axis):
 * {plus, minus, fresh}; a shaft in no hole is `fresh` (both ends its whole length).
 */
const exposure = (conn, partners) => {
    const L = conn.length;
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of partners) {
        if (!p.mineIsShaft || !(p.other.length > 0)) continue;
        const axial = vecDot(vecSub(p.other.position, conn.position), conn.axis);
        const a = Math.max(-L / 2, axial - p.other.length / 2);
        const b = Math.min(L / 2, axial + p.other.length / 2);
        if (b > a) { lo = Math.min(lo, a); hi = Math.max(hi, b); }
    }
    if (hi === -Infinity) return {plus: L, minus: L, fresh: true};
    return {plus: L / 2 - hi, minus: lo + L / 2, fresh: false};
};

/**
 * Where a connector can be entered (LDU): a hole's two faces (not a blind hole's bottom), a
 * shaft's free tips (at least MIN_ENGAGE_LDU sticking out), a stud's tip / an anti-stud's, a
 * tube's or a ball's own point. `normal` points out of the connector, towards whatever comes in.
 * Empty when the connector is taken.
 */
export const connectorEntries = (conn, partners = []) => {
    const t = conn.type;
    if (isCoincideType(t) || !(conn.length > 0)) {
        if (partners.length) return [];
        const tip = t === 'stud' && conn.length > 0 ? vecAdd(conn.position, vecScale(conn.axis, conn.length)) : conn.position;
        return [{point: tip, normal: conn.axis.slice(), side: 1}];
    }
    const L = conn.length;
    if (isShaftType(t)) {
        const e = exposure(conn, partners);
        const out = [];
        for (const side of [1, -1]) {
            const free = side > 0 ? e.plus : e.minus;
            if (!e.fresh && free < MIN_ENGAGE_LDU - 1e-9) continue;
            out.push({point: vecAdd(conn.position, vecScale(conn.axis, side * L / 2)), normal: vecScale(conn.axis, side), side,
                exposed: e.fresh ? L : free, fresh: e.fresh});
        }
        return out;
    }
    if (partners.length) return [];
    const out = [];
    for (const side of [1, -1]) {
        if (conn.closedEnd === side) continue;
        out.push({point: vecAdd(conn.position, vecScale(conn.axis, side * L / 2)), normal: vecScale(conn.axis, side), side});
    }
    return out;
};

/** The entry facing the eye first (its outward normal towards the camera). */
const byFacing = (entries, eye) => entries.slice().sort((a, b) =>
    vecDot(b.normal, vecSub(eye, b.point)) / (vecDist(eye, b.point) || 1) - vecDot(a.normal, vecSub(eye, a.point)) / (vecDist(eye, a.point) || 1));

// ---- rotations -------------------------------------------------------------------------------
const transpose3 = m => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
const axisAngle = (axis, angle) => {
    const [x, y, z] = vecNormalize(axis);
    const c = Math.cos(angle); const s = Math.sin(angle); const t = 1 - c;
    return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
};
/** The smallest rotation taking unit vector a onto unit vector b. */
const rotationBetween = (a, b) => {
    const d = Math.max(-1, Math.min(1, vecDot(a, b)));
    const cross = vecCross(a, b);
    const len = vecLen(cross);
    if (len < 1e-9) {
        if (d > 0) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
        const perp = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
        return axisAngle(vecNormalize(vecCross(a, perp)), Math.PI);
    }
    return axisAngle(vecScale(cross, 1 / len), Math.atan2(len, d));
};
/** The angle (radians) of the rotation m. */
const rotationAngle = m => Math.acos(Math.max(-1, Math.min(1, (m[0] + m[4] + m[8] - 1) / 2)));
/** The rotation (row-major 3×3) by `angle` about unit `axis`. */
export const axisRotation = (axis, angle) => axisAngle(axis, angle);
const tidyNumber = v => {
    const r = Math.round(v * 1e6) / 1e6;
    return Object.is(r, -0) ? 0 : r;
};

/**
 * A rotation R' of a part now at rotation R such that R'·u = w (u: the connector's axis in the
 * part, w: the world axis it must take), its twist about w kept from R, rounded to `step`.
 */
const seatRotation = (R, u, w, step) => {
    const uu = vecNormalize(u);
    const base = rotationBetween(uu, w); // base·u = w
    // The twist R has about w once its axis is brought there the short way.
    const R1 = mat3MulMat3(rotationBetween(vecNormalize(mat3MulVec3(R, uu)), w), R);
    let ref = Math.abs(uu[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    ref = vecNormalize(vecSub(ref, vecScale(uu, vecDot(ref, uu))));
    const a = mat3MulVec3(base, ref);
    const b = mat3MulVec3(R1, ref);
    const theta = Math.atan2(vecDot(vecCross(a, b), w), vecDot(a, b));
    const k = Math.round(theta / step);
    return cleanRotation(mat3MulMat3(axisAngle(w, k * step), base));
};

// ---- the held set ----------------------------------------------------------------------------
/**
 * The held parts' connectors at their current poses, each with its own entries (what is free of
 * it): pairs between held parts stay (a beam carries its pins), pairs with the rest are broken.
 */
const heldConnectors = (catalogMap, held) => {
    const conns = held.parts.map(pl => {
        const meta = catalogMap.get(pl.part);
        return meta ? meta.connectors.map(c => worldConnector(pl, c)) : [];
    });
    const out = [];
    held.parts.forEach((pl, i) => {
        conns[i].forEach(a => {
            const partners = [];
            held.parts.forEach((other, j) => {
                if (j === i) return;
                for (const b of conns[j]) {
                    const p = REGISTRY.pair(a, b);
                    if (p) partners.push({partId: other.id, other: b, mineIsShaft: p.shaft === a});
                }
            });
            out.push({conn: a, partIndex: i, partners, entries: connectorEntries(a, partners)});
        });
    });
    return out;
};

/** The held set's centre (the middle of its parts' bounds), for which side it sits on. */
const heldCentre = (catalogMap, parts) => {
    const pts = [];
    for (const pl of parts) {
        const b = partBounds(pl, catalogMap.get(pl.part));
        if (b) pts.push(b.min, b.max);
    }
    if (!pts.length) return parts[0].position.slice();
    const lo = [0, 1, 2].map(k => Math.min(...pts.map(p => p[k])));
    const hi = [0, 1, 2].map(k => Math.max(...pts.map(p => p[k])));
    return lo.map((v, k) => (v + hi[k]) / 2);
};

/** The held set moved rigidly so that point `from` goes to `to`, turned by Q about it. */
const movedSet = (parts, Q, from, to) => parts.map(pl => ({
    id: pl.id,
    part: pl.part,
    position: vecAdd(mat3MulVec3(Q, vecSub(pl.position, from)), to).map(tidyNumber),
    rotation: cleanRotation(mat3MulMat3(Q, pl.rotation))
}));

/**
 * Seating poses of the held set with held connector `h` on target entry `te` of target `t`:
 * one per way the held connector may face (the preferred one first: the held set's centre on the
 * camera side of the entry face). Each: {moves, sign, rotationChange, round}.
 */
const seatings = (catalogMap, held, h, t, te, centre) => {
    const rule = joinRule(h.conn, t);
    if (!rule) return [];
    const lead = held.parts[h.partIndex];
    const m = h.conn;
    const local = catalogMap.get(lead.part).connectors.find(c => c.id === m.connectorId);
    const shaftT = rule.shaft.type;
    const holeT = rule.hole.type;
    const round = isRoundJoin(shaftT, holeT);
    const step = round ? FINE_STEP : QUARTER_STEP;
    const n = te.normal;
    const ways = [];
    const finish = (w, at) => {
        const R2 = w ? seatRotation(lead.rotation, local.axis, w, step) : lead.rotation.slice();
        const Q = mat3MulMat3(R2, transpose3(lead.rotation));
        const moves = movedSet(held.parts, Q, m.position, at(R2));
        const c2 = vecAdd(mat3MulVec3(Q, vecSub(centre, m.position)), at(R2));
        return {moves, side: vecDot(vecSub(c2, te.point), n), rotationChange: rotationAngle(Q), round};
    };
    if (rule.coincide) {
        // Studs, anti-studs, tubes: the same way round (kinds/stud.js); a ball keeps its turn.
        const ball = shaftT === 'ball' || holeT === 'ball';
        ways.push(finish(ball ? null : t.axis, () => t.position));
    } else if (rule.shaft === m) {
        // A held shaft into the target hole through the entry face: each free end of it may go in
        // (a fresh shaft's two ends are its two ways round).
        const closed = t.closedEnd === 1 || t.closedEnd === -1;
        for (const end of h.entries) {
            // This end goes in: its outward direction points into the hole (-n).
            const w = vecScale(n, -end.side);
            const depth = end.fresh ? (closed ? Math.min(m.length / 2, t.length) : m.length / 2) : Math.min(end.exposed, t.length);
            // The entering tip `depth` inside the face; the shaft's centre L/2 back from the tip.
            const centrePoint = vecAdd(te.point, vecScale(n, m.length / 2 - depth));
            const way = finish(w, () => centrePoint);
            way.end = end.side;
            ways.push(way);
        }
    } else {
        // A held hole onto the target shaft's free tip, flush with it.
        const centrePoint = vecSub(te.point, vecScale(n, m.length / 2));
        if (m.closedEnd === 1 || m.closedEnd === -1) {
            ways.push(finish(vecScale(n, m.closedEnd), () => centrePoint));
        } else {
            ways.push(finish(n, () => centrePoint), finish(vecScale(n, -1), () => centrePoint));
        }
    }
    // The preferred way: the held set's centre furthest out on the camera side, then the least turning.
    const order = ways.map((w, i) => ({w, i})).sort((a, b) => (Math.abs(a.w.side - b.w.side) > 0.5 ? b.w.side - a.w.side : 0) ||
        a.w.rotationChange - b.w.rotationChange || a.i - b.i).map(x => x.w);
    return order;
};

// ---- judging a pose ----------------------------------------------------------------------------
const shaftIndices = meta => {
    const solid = new Set(solidColliders(meta));
    return meta.colliders.map((_, i) => i).filter(i => !solid.has(i));
};
const primsOverlap = (pa, ia, pb, ib) => {
    for (const i of ia) for (const j of ib) if (primitivesOverlap(pa[i], pb[j], 1)) return true;
    return false;
};

/**
 * What a held set at `moves` would push into, or null: a solid part into a solid part (overlap.js
 * solidOverlaps), a held pin or axle into a solid part it does not pair with, or a pin or axle of
 * the model into a held solid part it does not pair with. Overlaps a held part already had where
 * it stands do not count (overlap.js moveVerdict's rule).
 */
const poseBlocked = (model, catalogMap, held, moves, pairs, exclude) => {
    const heldIds = held.parts.map(p => p.id);
    const ignore = [...heldIds, ...exclude];
    const pairedWith = id => new Set(pairs.filter(p => p.moving.part === id).map(p => p.fixed.part));
    const anyPaired = new Set(pairs.map(p => p.fixed.part));
    const byId = cacheFor(model, catalogMap).byId;
    const hits = (pl, partnerIds) => {
        const meta = catalogMap.get(pl.part);
        const out = new Set(solidOverlaps(model, catalogMap, pl, {ignore: [...ignore, ...anyPaired]}).map(o => o.part));
        const box = partBounds(pl, meta);
        if (!box) return out;
        const mine = collidersOf(pl, meta);
        const myShaft = shaftIndices(meta);
        const mySolid = solidColliders(meta);
        for (const other of nearPartsOf(model, catalogMap, grow(box, 1))) {
            if (ignore.includes(other.id) || partnerIds.has(other.id) || out.has(other.id)) continue;
            const om = catalogMap.get(other.part);
            if (!om) continue;
            const theirs = collidersOf(other, om);
            if ((myShaft.length && primsOverlap(mine, myShaft, theirs, solidColliders(om))) ||
                (mySolid.length && primsOverlap(mine, mySolid, theirs, shaftIndices(om)))) out.add(other.id);
        }
        return out;
    };
    for (const mv of moves) {
        const partners = pairedWith(mv.id);
        const now = hits({id: mv.id, part: mv.part, position: mv.position, rotation: mv.rotation}, partners);
        if (!now.size) continue;
        const was = byId.has(mv.id) ? hits(byId.get(mv.id), partners) : new Set();
        const into = [...now].find(id => !was.has(id));
        if (into) return {part: mv.id, into};
    }
    return null;
};

/** Is connector `s` of the model free now (its partners, the held parts' left out)? */
const freeEntries = (model, cache, pl, index, heldIds) => {
    const partners = partnersOf(model, cache, pl)[index].filter(p => !heldIds.has(p.partId));
    return connectorEntries(connsOf(cache, pl)[index], partners);
};

/**
 * Every pair a held set at `moves` makes with the model's free connectors, and whether it leaves
 * a shaft half seated (coaxial with a hole it could join, overlapping it, but not held by it).
 */
const posePairs = (model, catalogMap, held, moves, h0, exclude) => {
    const cache = cacheFor(model, catalogMap);
    const heldIds = new Set(held.parts.map(p => p.id));
    const skip = new Set([...heldIds, ...exclude]);
    const pairs = [];
    let halfSeated = false;
    const byHeld = new Map(held.parts.map((p, i) => [p.id, i]));
    const free = new Map();
    for (const hc of h0) {
        if (!hc.entries.length) continue;
        const mv = moves[hc.partIndex];
        const meta = catalogMap.get(mv.part);
        const local = meta.connectors.find(c => c.id === hc.conn.connectorId);
        const a = worldConnector({id: mv.id, position: mv.position, rotation: mv.rotation}, local);
        const box = boxOfPoints([vecAdd(a.position, vecScale(a.axis, (a.length || 0) / 2)), vecSub(a.position, vecScale(a.axis, (a.length || 0) / 2))]);
        for (const pl of nearPartsOf(model, catalogMap, grow(box, PAIR_REACH_LDU + 1))) {
            if (skip.has(pl.id)) continue;
            const theirs = connsOf(cache, pl);
            theirs.forEach((b, k) => {
                const rule = joinRule(a, b);
                if (!rule) return;
                const key = `${pl.id}\u0000${k}`;
                if (!free.has(key)) free.set(key, freeEntries(model, cache, pl, k, heldIds).length > 0);
                const p = REGISTRY.pair(a, b);
                if (p && free.get(key)) {
                    pairs.push({moving: {part: mv.id, connector: a.connectorId}, fixed: {part: pl.id, connector: b.connectorId}, kind: p.kind,
                        heldIndex: byHeld.get(mv.id)});
                    return;
                }
                if (p || rule.coincide) return;
                // Coaxial and overlapping, but not seated (less than MIN_ENGAGE_LDU in, or past a blind bottom).
                const s = rule.shaft; const ho = rule.hole;
                if (Math.abs(vecDot(s.axis, ho.axis)) < COS_1 - 1e-12) return;
                const d = vecSub(ho.position, s.position);
                const axial = vecDot(d, s.axis);
                if (vecLen(vecSub(d, vecScale(s.axis, axial))) > 0.5 + 1e-9) return;
                const engaged = Math.min(s.length / 2, axial + ho.length / 2) - Math.max(-s.length / 2, axial - ho.length / 2);
                if (engaged > 0.5 + 1e-9) halfSeated = true;
            });
        }
    }
    return {pairs: pairs.map(({heldIndex, ...p}) => p), halfSeated};
};

// ---- the pointer ---------------------------------------------------------------------------
const pxDist = (project, point, pointer) => {
    const q = project(point);
    return q ? Math.hypot(q[0] - pointer[0], q[1] - pointer[1]) : Infinity;
};

/**
 * The model's free connectors a held set could join, near the pointer: each with its entries
 * (facing the eye first) and the pixel distance of its first entry from the pointer.
 * `allParts` looks at every part (keyboard placement); otherwise the parts under the pointer's
 * ray and those around its hit point. Studs and anti-studs only on parts the ray passes through.
 */
const candidateTargets = (model, catalogMap, h0, ray, project, opts) => {
    const cache = cacheFor(model, catalogMap);
    const heldIds = new Set(opts.heldIds);
    const skip = new Set([...heldIds, ...(opts.exclude || [])]);
    const eye = opts.eye;
    const hits = ray ? rayHitParts(model, catalogMap, ray.origin, ray.direction, {exclude: [...skip]}) : [];
    const under = new Set(hits.map(h => h.part));
    const hit = hits[0] || null;
    let parts;
    if (opts.allParts) parts = model.parts.filter(p => !skip.has(p.id));
    else if (hit) {
        const r = opts.nearLdu || 60;
        parts = nearPartsOf(model, catalogMap, {min: hit.point.map(v => v - r), max: hit.point.map(v => v + r)}).filter(p => !skip.has(p.id));
        for (const id of under) if (!parts.some(p => p.id === id)) parts.push(cache.byId.get(id));
    } else parts = [];
    const heldFree = h0.filter(h => h.entries.length);
    const out = [];
    for (const pl of parts) {
        if (!pl) continue;
        const conns = connsOf(cache, pl);
        conns.forEach((c, k) => {
            if ((c.type === 'stud' || c.type === 'antistud' || c.type === 'tube') && !under.has(pl.id) && !opts.allParts) return;
            if (!heldFree.some(h => joinRule(h.conn, c))) return;
            const entries = freeEntries(model, cache, pl, k, heldIds);
            if (!entries.length) return;
            const sorted = byFacing(entries, eye);
            out.push({partId: pl.id, connectorId: c.connectorId, type: c.type, conn: c, entries: sorted,
                px: pxDist(project, sorted[0].point, opts.pointer), order: cache.byId.size ? model.parts.indexOf(pl) : 0});
        });
    }
    return {targets: out, hit};
};

const targetKey = t => `${t.partId}\u0000${t.connectorId}`;

/**
 * The connection the pointer asks for (docs/ROBOT-LAB-UX.md §3.3).
 * @param {object} model PlacedModel
 * @param {Map|object} catalog PartMeta by part
 * @param {{parts: {id: string, part: string, position: number[], rotation: number[]}[], grab?: number[]}} held
 *        the held set at its current poses (a palette part: one part with an id not in the model);
 *        `grab`: the pressed point (LDU), whose nearest held connector leads a dragged selection
 * @param {{origin: number[], direction: number[]}|null} ray the pointer's ray (LDU)
 * @param {(p: number[]) => number[]|null} project an LDU point to view pixels (null behind the eye)
 * @param {object} opts {pointer: [x, y] px, eye: LDU, radiusPx, nearPx, previous (a target key),
 *        hysteresisPx, cycle (Tab), flip (X), exclude (hidden ids), allParts (keyboard), lead
 *        ({partId, connectorId}: the held connector that leads)}
 * @returns {{hit: object|null, lit: object[], targets: object[], chosen: object|null, alternatives: object[]}}
 */
export const snapAtPointer = (model, catalog, held, ray, project, opts = {}) => {
    const catalogMap = asCatalogMap(catalog);
    const radiusPx = opts.radiusPx ?? SNAP_PX.targetMouse;
    const nearPx = opts.nearPx ?? SNAP_PX.near;
    const hysteresisPx = opts.hysteresisPx ?? SNAP_PX.hysteresis;
    const exclude = opts.exclude || [];
    const h0 = heldConnectors(catalogMap, held);
    // The lead: the held connector nearest the grab point (a dragged selection), else any free one.
    let leads = h0.filter(h => h.entries.length);
    if (opts.lead) {
        const l = leads.filter(h => held.parts[h.partIndex].id === opts.lead.partId && h.conn.connectorId === opts.lead.connectorId);
        if (l.length) leads = l;
    }
    // How near each held connector is to the pressed point: of two equally good poses, the one led by the
    // connector nearest where the hand holds the set wins (a beam grabbed by its end leads with that end's pin).
    const leadDist = new Map(leads.map(h => [h, held.grab ? Math.min(...h.entries.map(e => vecDist(e.point, held.grab)), vecDist(h.conn.position, held.grab)) : 0]));
    const {targets: all, hit} = candidateTargets(model, catalogMap, leads, ray, project, {...opts, heldIds: held.parts.map(p => p.id)});
    if (opts.only) {
        for (let i = all.length - 1; i >= 0; i--) if (all[i].partId !== opts.only.partId || all[i].connectorId !== opts.only.connectorId) all.splice(i, 1);
    }
    if (opts.viewport) {
        const [w, h] = opts.viewport;
        for (let i = all.length - 1; i >= 0; i--) {
            const q = project(all[i].entries[0].point);
            if (!q || q[0] < 0 || q[1] < 0 || q[0] > w || q[1] > h) all.splice(i, 1);
        }
    }
    all.sort((a, b) => a.px - b.px || a.order - b.order || (a.connectorId < b.connectorId ? -1 : 1));
    const lit = all.filter(t => t.px <= nearPx);
    let targets = all.filter(t => t.px <= radiusPx);
    if (!targets.length && hit && !opts.allParts) {
        // Nearest to the hit point: the distance to the connector's own segment (a hole's axis between its faces),
        // so the top of a beam lying on its side, right over a hole, finds that hole.
        const segDist = c => {
            const L = c.length > 0 ? c.length : 0;
            const along = Math.max(-L / 2, Math.min(L / 2, vecDot(vecSub(hit.point, c.position), c.axis)));
            return vecDist(hit.point, vecAdd(c.position, vecScale(c.axis, along)));
        };
        const near = all.map(t => ({t, d: Math.min(segDist(t.conn), ...t.entries.map(e => vecDist(e.point, hit.point)))}))
            .filter(x => x.d <= FALLBACK_LDU).sort((a, b) => a.d - b.d);
        if (near.length) targets = [near[0].t];
    }
    if (opts.allParts) {
        // Keyboard placement: reading order (rows of 12 px, then left to right).
        // The 60 nearest the view's centre, so a big model stays quick.
        targets = all.filter(t => Number.isFinite(t.px)).slice(0, 60).map(t => ({t, q: project(t.entries[0].point)}))
            .sort((a, b) => Math.round(a.q[1] / 12) - Math.round(b.q[1] / 12) || a.q[0] - b.q[0]).map(x => x.t);
    }
    const centre = heldCentre(catalogMap, held.parts);
    /** Every valid pose for target t through entry e: the held connectors that may lead, each way round. */
    const optionsFor = (t, entryIndex) => {
        const te = t.entries[entryIndex];
        const out = [];
        // The (at most four) held connectors nearest the hand that can join it: a big selection stays quick.
        for (const h of leads.filter(x => joinRule(x.conn, t.conn)).sort((a, b) => leadDist.get(a) - leadDist.get(b)).slice(0, 4)) {
            const ways = seatings(catalogMap, held, h, t.conn, te, centre);
            ways.forEach((way, wi) => {
                const {pairs, halfSeated} = posePairs(model, catalogMap, held, way.moves, h0, exclude);
                if (halfSeated) return;
                if (!pairs.some(p => p.fixed.part === t.partId && p.fixed.connector === t.connectorId)) return;
                const blocked = poseBlocked(model, catalogMap, held, way.moves, pairs, exclude);
                out.push({
                    key: `${targetKey(t)}\u0000${entryIndex}\u0000${held.parts[h.partIndex].id}\u0000${h.conn.connectorId}\u0000${wi}`,
                    target: {partId: t.partId, connectorId: t.connectorId, type: t.type, entry: entryIndex, point: te.point, normal: te.normal, px: t.px},
                    lead: {partId: held.parts[h.partIndex].id, connectorId: h.conn.connectorId, type: h.conn.type}, leadDist: leadDist.get(h),
                    moves: way.moves, pairs, blocked, rotationChange: way.rotationChange, round: way.round, way: wi,
                    axis: t.conn.axis.slice(), point: t.conn.position.slice(),
                    position: way.moves[0].position, rotation: way.moves[0].rotation
                });
            });
        }
        return out;
    };
    const rank = (a, b) => (Boolean(a.blocked) - Boolean(b.blocked)) || (b.pairs.length - a.pairs.length) ||
        (a.leadDist - b.leadDist > 1e-6 ? 1 : b.leadDist - a.leadDist > 1e-6 ? -1 : 0) || (a.rotationChange - b.rotationChange > 1e-6 ? 1 : b.rotationChange - a.rotationChange > 1e-6 ? -1 : 0);
    /** A target's own choice: its entry facing the eye, the preferred way round (X flips it), best lead. */
    const primary = t => {
        const opts0 = optionsFor(t, 0);
        if (!opts0.length) return [];
        const preferred = opts0.filter(o => o.way === 0);
        const flipped = opts0.filter(o => o.way !== 0);
        const first = (opts.flip && flipped.length ? flipped : preferred.length ? preferred : flipped).slice().sort(rank);
        const rest = opts0.filter(o => !first.includes(o)).sort(rank);
        return [...first, ...rest];
    };
    // The nearest target with a valid pose; the current one is kept until another is clearly nearer.
    let chosenTarget = null;
    let chosenOptions = [];
    const evaluated = new Map();
    const optionsOf = t => {
        if (!evaluated.has(targetKey(t))) evaluated.set(targetKey(t), primary(t));
        return evaluated.get(targetKey(t));
    };
    for (const t of targets) {
        if (optionsOf(t).length) { chosenTarget = t; break; }
    }
    if (opts.previous && chosenTarget && !opts.allParts) {
        // The current target counts a little beyond the radius too, or the hysteresis could not hold it.
        const prev = all.find(t => targetKey(t) === opts.previous && t.px <= radiusPx + hysteresisPx);
        if (prev && prev !== chosenTarget && optionsOf(prev).length) {
            const nearer = chosenTarget.px < prev.px - hysteresisPx;
            const morePairs = Math.abs(chosenTarget.px - prev.px) < 0.5 && optionsOf(chosenTarget)[0].pairs.length > optionsOf(prev)[0].pairs.length;
            if (!nearer && !morePairs) chosenTarget = prev;
        }
    }
    if (chosenTarget) chosenOptions = optionsOf(chosenTarget);
    // Tab: the chosen pose, the other ways at this target (other face, other end, other lead), then the next targets.
    const alternatives = [];
    const seen = new Set();
    const add = o => {
        // Two poses that look the same (a symmetric pin either way round) are one alternative.
        const k = o.moves.map(m => collidersOf(m, catalogMap.get(m.part)).map(c => c.centre.map(v => v.toFixed(2)).join(',')).sort().join(' ')).join(';') +
            o.pairs.map(p => `${p.fixed.part}:${p.fixed.connector}`).sort().join(',');
        if (seen.has(k)) return;
        seen.add(k);
        alternatives.push(o);
    };
    if (chosenTarget) {
        if (opts.allParts) {
            for (const t of targets) for (const o of optionsOf(t).slice(0, 1)) add(o);
        }
        chosenOptions.forEach(add);
        if (opts.cycle) {
            for (let e = 1; e < chosenTarget.entries.length; e++) optionsFor(chosenTarget, e).sort(rank).forEach(add);
            for (const t of targets.slice(0, 8)) if (t !== chosenTarget) for (const o of optionsOf(t).slice(0, 1)) add(o);
        }
    }
    let chosen = null;
    if (alternatives.length) {
        let start = 0;
        if (opts.allParts && opts.startNearest) {
            // Keyboard: start at the target nearest the view centre.
            let best = Infinity;
            alternatives.forEach((o, i) => { if (o.target.px < best) { best = o.target.px; start = i; } });
        } else if (opts.allParts) start = 0;
        const n = alternatives.length;
        chosen = alternatives[(((start + (opts.cycle || 0)) % n) + n) % n];
    }
    const strip = t => ({partId: t.partId, connectorId: t.connectorId, type: t.type, point: t.entries[0].point, normal: t.entries[0].normal, px: t.px});
    return {hit: hit ? {partId: hit.part, point: hit.point} : null, lit: lit.map(strip), targets: targets.map(strip), chosen, alternatives,
        chosenKey: chosen ? `${chosen.target.partId}\u0000${chosen.target.connectorId}` : null};
};

/**
 * Idle (nothing held): the one free connector of the parts under the pointer whose entry is
 * nearest it, within `radiusPx` (docs/ROBOT-LAB-UX.md §3.2), or null.
 */
export const connectorUnderPointer = (model, catalog, ray, project, {pointer, eye, radiusPx = SNAP_PX.idleMouse, exclude = []} = {}) => {
    const catalogMap = asCatalogMap(catalog);
    const cache = cacheFor(model, catalogMap);
    const hits = rayHitParts(model, catalogMap, ray.origin, ray.direction, {exclude});
    if (!hits.length) return null;
    const hit = hits[0];
    const skip = new Set(exclude);
    const parts = nearPartsOf(model, catalogMap, {min: hit.point.map(v => v - 30), max: hit.point.map(v => v + 30)}).filter(p => !skip.has(p.id));
    let best = null;
    for (const pl of parts) {
        connsOf(cache, pl).forEach((c, k) => {
            const entries = freeEntries(model, cache, pl, k, new Set());
            if (!entries.length) return;
            const e = byFacing(entries, eye)[0];
            const px = pxDist(project, e.point, pointer);
            if (px <= radiusPx && (!best || px < best.px)) best = {partId: pl.id, connectorId: c.connectorId, type: c.type, point: e.point, normal: e.normal, px};
        });
    }
    return best;
};

/** The parts a part's connectors pair with now (the compiler's pair rule), for "select connected". */
export const pairedParts = (model, catalog, id) => {
    const catalogMap = asCatalogMap(catalog);
    const cache = cacheFor(model, catalogMap);
    const pl = cache.byId.get(id);
    if (!pl) return [];
    return [...new Set(partnersOf(model, cache, pl).flat().map(p => p.partId))];
};

/** Every part joined to `ids` through pairs, `ids` first (Studio's "By Connected"). */
export const connectedComponent = (model, catalog, ids) => {
    const seen = new Set(ids);
    const queue = [...ids];
    while (queue.length) {
        for (const next of pairedParts(model, catalog, queue.shift())) {
            if (!seen.has(next)) { seen.add(next); queue.push(next); }
        }
    }
    return [...seen];
};

/**
 * A pose turned by `angle` about a connection's line (`axis` through `point`): a snap option's
 * moves, or any poses. Pure; positions to 1e-6 LDU.
 */
export const turnAboutLine = (moves, axis, point, angle) => {
    const R = axisAngle(axis, angle);
    return moves.map(m => ({...m, position: vecAdd(point, mat3MulVec3(R, vecSub(m.position, point))).map(tidyNumber),
        rotation: cleanRotation(mat3MulMat3(R, m.rotation))}));
};

/**
 * How a placed part sits on the model (its pairs with other parts), for turning it in place:
 * {axis, point, round, quarterOnly, kinds} for one connection line, or null (none, or two lines).
 */
export const connectionLine = (model, catalog, id) => {
    const catalogMap = asCatalogMap(catalog);
    const cache = cacheFor(model, catalogMap);
    const pl = cache.byId.get(id);
    if (!pl) return null;
    const mine = connsOf(cache, pl);
    const lines = [];
    partnersOf(model, cache, pl).forEach((ps, i) => {
        for (const p of ps) {
            const a = mine[i];
            const [shaft, hole] = p.mineIsShaft ? [a, p.other] : [p.other, a];
            lines.push({axis: hole.axis, point: hole.position, round: isRoundJoin(shaft.type, hole.type), shaft: shaft.type, hole: hole.type});
        }
    });
    if (!lines.length) return null;
    const l0 = lines[0];
    const sameLine = lines.every(l => Math.abs(vecDot(l.axis, l0.axis)) >= COS_1 - 1e-12 &&
        vecLen(vecSub(vecSub(l.point, l0.point), vecScale(l0.axis, vecDot(vecSub(l.point, l0.point), l0.axis)))) <= 0.5 + 1e-9);
    if (!sameLine) return {axis: l0.axis, point: l0.point, round: false, many: true, shaft: l0.shaft, hole: l0.hole};
    return {axis: l0.axis.slice(), point: l0.point.slice(), round: lines.every(l => l.round), many: false, shaft: l0.shaft, hole: l0.hole};
};

/** At most this many parts turn on a hinge: a bigger side is not offered (and not searched further). */
export const HINGE_MAX_PARTS = 400;

const onLine = (l, axis, point) => Math.abs(vecDot(l.axis, axis)) >= COS_1 - 1e-12 &&
    vecLen(vecSub(vecSub(point, l.point), vecScale(l.axis, vecDot(vecSub(point, l.point), l.axis)))) <= 0.5 + 1e-9;

/**
 * Where a selection can turn on the model like a hinge (Studio's hinge tool, LDD's pivots):
 * [{axis, point, moving: [ids], fixed: [ids]}], the fewest moving parts first. A hinge is one
 * round connection line (a pin or an axle in a round hole, a ball in its socket) next to the
 * selection: cut every joint on it and the selection comes free with everything that hangs
 * off it (`moving`, the selection first), while the parts across the line (`fixed`) stay. A
 * joint between two parts is cut only when all their pairs are round and on that line (two
 * parts held at two places stay together), and the fixed side must be more than the pins on the
 * line, so an arm pinned at two holes has no hinge.
 * @param {{parts: object[]}} model
 * @param {Map|object} catalog
 * @param {string[]} ids the selection
 * @param {{maxParts?: number}} [opts]
 */
export const hingeCandidates = (model, catalog, ids, {maxParts = HINGE_MAX_PARTS} = {}) => {
    const catalogMap = asCatalogMap(catalog);
    const cache = cacheFor(model, catalogMap);
    if (!ids.length || ids.length > maxParts || ids.some(id => !cache.byId.has(id))) return [];
    // partId → Map(partner id → [{axis, point, round, shaft (this part's connector is the shaft)}]) of the pairs between them
    const joints = new Map();
    const jointsOf = id => {
        let m = joints.get(id);
        if (m) return m;
        m = new Map();
        const pl = cache.byId.get(id);
        const mine = connsOf(cache, pl);
        partnersOf(model, cache, pl).forEach((ps, i) => {
            for (const p of ps) {
                const [shaft, hole] = p.mineIsShaft ? [mine[i], p.other] : [p.other, mine[i]];
                if (!m.has(p.partId)) m.set(p.partId, []);
                m.get(p.partId).push({axis: hole.axis, point: hole.position, round: isRoundJoin(shaft.type, hole.type), shaft: p.mineIsShaft});
            }
        });
        joints.set(id, m);
        return m;
    };
    // The round lines on the selection's joints and its partners' joints (an axle the selected wheel sits on).
    const lines = [];
    const near = new Set(ids);
    for (const id of ids) for (const other of jointsOf(id).keys()) near.add(other);
    for (const id of near) {
        for (const pairs of jointsOf(id).values()) {
            for (const pr of pairs) {
                if (pr.round && !lines.some(l => onLine(l, pr.axis, pr.point))) lines.push({axis: pr.axis, point: pr.point});
            }
        }
    }
    const out = [];
    for (const line of lines) {
        const cut = (a, b) => jointsOf(a).get(b).every(pr => pr.round && onLine(line, pr.axis, pr.point));
        const moving = new Set(ids);
        const fixed = new Set();
        const queue = [...ids];
        let ok = true;
        while (queue.length && ok) {
            const id = queue.shift();
            for (const other of jointsOf(id).keys()) {
                if (moving.has(other)) continue;
                if (cut(id, other)) { fixed.add(other); continue; }
                moving.add(other);
                queue.push(other);
                if (moving.size > maxParts) { ok = false; break; }
            }
        }
        // Something across the line must stay (a part reached around it moves after all), and more
        // than the pins and axles on the line itself (an arm held by two pins is not hinged on one).
        for (const id of moving) fixed.delete(id);
        const onlyShaft = id => [...jointsOf(id)].every(([other, prs]) => moving.has(other) && prs.every(pr => pr.shaft && onLine(line, pr.axis, pr.point)));
        if (!ok || !fixed.size || [...fixed].every(onlyShaft)) continue;
        if (out.some(c => c.moving.length === moving.size && c.moving.every(id => moving.has(id)))) continue;
        out.push({axis: line.axis.slice(), point: line.point.slice(), moving: [...moving], fixed: [...fixed]});
    }
    return out.sort((a, b) => a.moving.length - b.moving.length);
};
