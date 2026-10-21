// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Pen and paper (docs/ROBOT-LAB-ARCHITECTURE.md §1.2 M15): a part marked `pen` (the model's
// `0 !BW PEN`) draws on the floor in Simulate. Its tip is the lowest point of the part's colliders
// (what touches the floor in the physics), kept in the frame of the body that carries it; whenever the
// tip is within PEN_DOWN_M of the floor, the tip's track is a line on the floor. Lifting the pen
// ends the stroke. Drawing only, as the architecture has it: no physics beyond the bodies' poses.
// The strokes are read as vectors (the Robot Lab API's drawing(), the browser gate).

import {Box3, BufferGeometry, Float32BufferAttribute, Group, Line, LineBasicMaterial, Matrix4, Quaternion, Vector3} from 'three';
import {createSurfaceDrawing} from './surface-drawing.js';

/** The pen draws while its tip is this close to the floor (m): a pen pressed on paper, a little play. */
export const PEN_DOWN_M = 0.0012;
/** A new point once the tip has moved this far (m). */
const STEP_M = 0.0005;
/** At most this many points in all (a long run keeps its first drawing). */
const MAX_POINTS = 50000;

/**
 * The lowest point of a part's colliders in its body (the body's frame at t = 0 is the world's,
 * shifted to body.position): what touches the floor, as the physics has it (a mesh may sit a
 * little inside its collider). null when the body carries no collider of the part.
 */
const lowestPoint = (body, partId) => {
    let best = null; // {bottom (y), point (the tip, or a ball's centre), sphere (its radius, else 0)}
    const q = new Quaternion();
    const v = new Vector3();
    for (const c of body.colliders || []) {
        if (c.part !== partId) continue;
        const at = new Vector3(...(c.position || [0, 0, 0])).add(new Vector3(...body.position));
        if (c.shape === 'sphere') {
            // A ball rolls: its tip is under its centre, whichever way its body has turned.
            if (!best || at.y - c.radius < best.bottom) best = {bottom: at.y - c.radius, point: at.clone(), sphere: c.radius};
            continue;
        }
        const h = c.shape === 'box' ? c.halfExtents : [c.radius, c.halfHeight, c.radius];
        q.set(...(c.rotation || [0, 0, 0, 1]));
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
            v.set(sx * h[0], sy * h[1], sz * h[2]).applyQuaternion(q).add(at);
            // a box's lowest corner, but under the collider's middle (a pen's tip, not its corner)
            if (!best || v.y < best.bottom - 1e-9) best = {bottom: v.y, point: new Vector3(at.x, v.y, at.z), sphere: 0};
        }
    }
    return best;
};

/**
 * @param {{model, mechanism, built: {scene, bodyGroups: Map, partMeshes: Map, ground}, colors?: Map}} args
 * @returns {{update(): void, strokes(): number[][][], dispose(): void, count: number}|null} null without a pen
 */
const createFloorPenLayer = ({model, mechanism, built, colors = null}) => {
    const pens = model.parts.filter(p => p.pen);
    if (!pens.length) return null;
    const floorY = built.ground ? new Box3().setFromObject(built.ground).max.y : 0;
    const group = new Group();
    group.name = 'pen-drawing';
    built.scene.add(group);
    const tips = [];
    for (const pl of pens) {
        const body = (mechanism.bodies || []).find(b => b.parts.includes(pl.id));
        const g = body && built.bodyGroups.get(body.id);
        const lowest = body && lowestPoint(body, pl.id);
        if (!g || !lowest) continue;
        // The tip in the body's own frame (its group as it is at t = 0).
        g.updateMatrixWorld(true);
        // a ball's centre (its tip is found below it each frame), else the tip itself
        const local = lowest.point.clone().applyMatrix4(new Matrix4().copy(g.matrixWorld).invert());
        local.sphere = lowest.sphere;
        const colour = colors && colors.get(pl.color ?? 16);
        const material = new LineBasicMaterial({color: colour ? colour.value : '#1e293b'});
        tips.push({id: pl.id, g, local, material, strokes: [], current: null, line: null});
    }
    if (!tips.length) { group.removeFromParent(); return null; }
    let total = 0;
    const p = new Vector3();
    const startStroke = tip => {
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(3 * 1024), 3));
        geometry.setDrawRange(0, 0);
        const line = new Line(geometry, tip.material);
        line.frustumCulled = false;
        line.renderOrder = 5;
        group.add(line);
        tip.current = [];
        tip.line = line;
        tip.strokes.push(tip.current);
    };
    const append = (tip, x, z) => {
        const pts = tip.current;
        pts.push([x, z]);
        total++;
        let attr = tip.line.geometry.getAttribute('position');
        if (pts.length > attr.count) {
            const bigger = new Float32Array(attr.array.length * 2);
            bigger.set(attr.array);
            tip.line.geometry.setAttribute('position', new Float32BufferAttribute(bigger, 3));
            attr = tip.line.geometry.getAttribute('position');
        }
        // just above the floor, so the floor does not hide it
        attr.setXYZ(pts.length - 1, x, floorY + 0.0003, z);
        attr.needsUpdate = true;
        tip.line.geometry.setDrawRange(0, pts.length);
    };
    return {
        update () {
            for (const tip of tips) {
                tip.g.updateMatrixWorld(true);
                p.copy(tip.local).applyMatrix4(tip.g.matrixWorld);
                p.y -= tip.local.sphere;
                const down = p.y - floorY <= PEN_DOWN_M;
                if (!down) { tip.current = null; continue; }
                if (total >= MAX_POINTS) continue;
                if (!tip.current) startStroke(tip);
                const last = tip.current[tip.current.length - 1];
                if (!last || Math.hypot(p.x - last[0], p.z - last[1]) >= STEP_M) append(tip, p.x, p.z);
            }
        },
        /** Every stroke drawn so far: [[x, z], ...] on the floor (world metres), per pen in model order. */
        strokes: () => tips.flatMap(t => t.strokes.filter(s => s.length > 1).map(s => s.map(q => q.slice()))),
        get count () { return tips.length; },
        get pointCount () { return total; },
        /** Each pen tip's height above the floor now (m): for the browser gate's messages. */
        heights: () => tips.map(t => { t.g.updateMatrixWorld(true); return p.copy(t.local).applyMatrix4(t.g.matrixWorld).y - t.local.sphere - floorY; }),
        dispose () {
            for (const c of [...group.children]) { group.remove(c); c.geometry.dispose(); }
            for (const t of tips) t.material.dispose();
            group.removeFromParent();
        }
    };
};

export const createPenLayer = args => {
    const layers = [createFloorPenLayer(args), createSurfaceDrawing(args)].filter(Boolean);
    if (!layers.length) return null;
    return {
        update: () => layers.forEach(l => l.update()),
        strokes: () => layers.flatMap(l => l.strokes()),
        heights: () => layers.flatMap(l => l.heights()),
        get count () { return layers.reduce((n, l) => n + l.count, 0); },
        get pointCount () { return layers.reduce((n, l) => n + l.pointCount, 0); },
        dispose: () => layers.forEach(l => l.dispose())
    };
};
