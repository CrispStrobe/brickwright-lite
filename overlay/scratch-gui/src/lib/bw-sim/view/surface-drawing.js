// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
// Virtual paper and marker attachments; ink is sampled from simulated part poses, never a preset curve.
import {BufferGeometry, CircleGeometry, CylinderGeometry, DoubleSide, Float32BufferAttribute,
    Group, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, Quaternion, Vector3} from 'three';
import {lduToWorld, LDU_M} from '../contracts.js';
const STEP = 0.0003;
const MAX_POINTS = 50000;
const GAP = 0.0012;

export const createSurfaceDrawing = ({model, built}) => {
    if (!model.drawings?.length) return null;
    built.scene.updateMatrixWorld(true);
    const traces = [];
    for (const d of model.drawings) {
        const surface = built.partMeshes.get(d.surface); const pen = built.partMeshes.get(d.pen);
        if (!surface || !pen) continue;
        // In large models the source meshes are invisible instancing proxies. Attach visuals
        // beside them in the body group, so their children are not hidden with the proxy.
        const anchor = proxy => {
            const group = new Group(); group.matrix.copy(proxy.matrix); group.matrixAutoUpdate = false;
            proxy.parent.add(group); return group;
        };
        const surfaceAnchor = anchor(surface); const penAnchor = anchor(pen);
        const paper = new Group(); paper.name = `paper:${d.surface}`;
        paper.position.fromArray(lduToWorld(d.center)); surfaceAnchor.add(paper);
        const radius = d.radiusLdu * LDU_M;
        const disk = new Mesh(new CircleGeometry(radius, 96), new MeshBasicMaterial({color: '#fffdf7', side: DoubleSide}));
        disk.rotation.x = -Math.PI / 2; disk.renderOrder = 3; paper.add(disk);
        const tip = new Vector3(...lduToWorld(d.tip));
        // A non-LEGO marker attachment is drawn up from the nib along the paper normal.
        const normal = new Vector3(0, 1, 0).applyQuaternion(surface.getWorldQuaternion(new Quaternion()))
            .applyQuaternion(pen.getWorldQuaternion(new Quaternion()).invert());
        const marker = new Mesh(new CylinderGeometry(0.0016, 0.0016, 0.12, 12), new MeshBasicMaterial({color: '#242936'}));
        marker.position.copy(tip).addScaledVector(normal, 0.06);
        marker.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), normal); penAnchor.add(marker);
        traces.push({surface, pen, tip, paper, disk, marker, surfaceAnchor, penAnchor, radius, strokes: [], current: null, line: null,
            material: new LineBasicMaterial({color: '#9f1239', depthTest: true}), height: Infinity});
    }
    if (!traces.length) return null;
    let total = 0;
    const p = new Vector3();
    const append = (t, point) => {
        if (!t.current) {
            t.current = []; t.strokes.push(t.current);
            const geometry = new BufferGeometry();
            geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(3072), 3));
            geometry.setDrawRange(0, 0);
            t.line = new Line(geometry, t.material); t.line.frustumCulled = false; t.line.renderOrder = 5;
            t.paper.add(t.line);
        }
        const last = t.current.at(-1);
        if (last && Math.hypot(point.x - last[0], point.z - last[1]) < STEP) return;
        t.current.push([point.x, point.z]); total++;
        let attr = t.line.geometry.getAttribute('position');
        if (t.current.length > attr.count) {
            const bigger = new Float32Array(attr.array.length * 2); bigger.set(attr.array);
            t.line.geometry.setAttribute('position', new Float32BufferAttribute(bigger, 3));
            attr = t.line.geometry.getAttribute('position');
        }
        attr.setXYZ(t.current.length - 1, point.x, 0.00015, point.z); attr.needsUpdate = true;
        t.line.geometry.setDrawRange(0, t.current.length);
    };
    return {
        update () {
            built.scene.updateMatrixWorld(true);
            for (const t of traces) {
                t.surfaceAnchor.matrix.copy(t.surface.matrix); t.surfaceAnchor.matrixWorldNeedsUpdate = true;
                t.penAnchor.matrix.copy(t.pen.matrix); t.penAnchor.matrixWorldNeedsUpdate = true;
                p.copy(t.tip); t.pen.localToWorld(p); t.paper.worldToLocal(p); t.height = p.y;
                if (Math.abs(p.y) > GAP || Math.hypot(p.x, p.z) > t.radius) { t.current = null; continue; }
                if (total < MAX_POINTS) append(t, p);
            }
        },
        // Metres relative to the paper centre. Existing floor drawings retain world x/z coordinates.
        strokes: () => traces.flatMap(t => t.strokes.filter(s => s.length > 1).map(s => s.map(p => p.slice()))),
        heights: () => traces.map(t => t.height),
        get count () { return traces.length; },
        get pointCount () { return total; },
        dispose () {
            for (const t of traces) {
                for (const line of t.paper.children.filter(c => c.isLine)) line.geometry.dispose();
                t.disk.geometry.dispose(); t.disk.material.dispose(); t.material.dispose();
                t.marker.geometry.dispose(); t.marker.material.dispose();
                t.surfaceAnchor.removeFromParent(); t.penAnchor.removeFromParent();
            }
        }
    };
};
