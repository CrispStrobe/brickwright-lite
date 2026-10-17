// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Snapping core for the Sim Lab editor (plan C5, pure half).
// Given a model and a part being dragged, find where it can attach
// connector-to-connector. Pure, no DOM, no three.

import {mat3MulVec3, vecAdd, vecSub, vecScale, vecDot, vecCross, vecLen, vecNormalize, vecDist, mat3MulMat3, quatFromMat3, quatMul, quatNormalize} from '../mech/vec.js';
import {edgeKind, shaftEngagement} from '../mech/graph.js';
import {validatePlacedModel, det3} from '../contracts.js';
import {partOverlaps} from './overlap.js';

const TOL = 0.5 + 1e-9;
const RADIUS_DEFAULT = 40;

// Helpers for transforms
const transformPoint = (pos, rot, local) => vecAdd(mat3MulVec3(rot, local), pos);
const transformAxis = (rot, localAxis) => vecNormalize(mat3MulVec3(rot, localAxis));

// One seating rule with the compiler (mech/graph.js shaftEngagement): a partly inserted
// shaft holds, a blind hole's bottom stops it.
const shaftHoleGeometryOk = (shaft, hole) => shaftEngagement(shaft, hole) !== null;

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

export const snapCandidates = ({model, catalog, part, pose, radius = RADIUS_DEFAULT}) => {
    const catalogMap = catalog instanceof Map ? catalog : new Map(Object.entries(catalog || {}));
    const movingMeta = catalogMap.get(part);
    if (!movingMeta) return [];
    const movingConnectors = movingMeta.connectors;
    if (!movingConnectors || movingConnectors.length === 0) return [];

    // Collect scene connectors with their world poses and part ids
    const sceneConnectors = [];
    for (const pl of model.parts) {
        const meta = catalogMap.get(pl.part);
        if (!meta) continue;
        for (const c of meta.connectors) {
            const worldPos = transformPoint(pl.position, pl.rotation, c.position);
            const worldAxis = transformAxis(pl.rotation, c.axis);
            sceneConnectors.push({
                partId: pl.id,
                connectorId: c.id,
                type: c.type,
                position: worldPos,
                axis: worldAxis,
                length: c.length,
                friction: c.friction,
                closedEnd: c.closedEnd,
                metaConnector: c,
                placed: pl
            });
        }
    }

    const candidates = [];
    const seenPos = new Set();

    for (const movConn of movingConnectors) {
        for (const fixed of sceneConnectors) {
            // Check compatibility via edgeKind (need to determine which is shaft/hole)
            // The table is symmetric for our purposes: we need to try both orderings
            let shaft, hole, shaftIsMoving;
            let kind = null;
            // Try mov as shaft, fixed as hole
            const try1 = edgeKind({type: movConn.type, friction: movConn.friction}, {type: fixed.type, friction: fixed.friction});
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
            } else if (movConn.type === 'stud' && fixed.type === 'antistud' || movConn.type === 'antistud' && fixed.type === 'stud') {
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
            for (const mw of movingWorldConns) {
                for (const sc of sceneConnectors) {
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
            const tempModel = {version: model.version, parts: [...model.parts, placedPartForOverlap]};
            const overlaps = partOverlaps(tempModel, catalogMap, placedPartForOverlap, {ignore: [...connectedPartIds, '__moving__']});
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
