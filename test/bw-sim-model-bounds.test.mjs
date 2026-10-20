// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, Scene} from 'three';
import {modelMeshBounds} from '../overlay/scratch-gui/src/lib/bw-sim/view/model-bounds.js';

const near = (a, b) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-7, `${a} ≈ ${b}`));
const make = () => {
    const scene = new Scene(); const body = new Group();
    body.position.set(1, 2, 3); scene.add(body);
    const part = new Mesh(new BoxGeometry(0.2, 0.4, 0.6), new MeshBasicMaterial());
    part.position.set(0.1, 0, 0); body.add(part);
    return {scene, body, part, partMeshes: new Map([['boom', part]]), hubMeshes: new Map()};
};

test('a first camera frame sees body-group transforms before Three has rendered', () => {
    const b = make();
    // Baseline defect: Box3 updates the part but its body's matrixWorld is still identity.
    const stale = new Box3().expandByObject(b.part);
    assert.ok(stale.max.y < 1, 'the old calculation omits the raised boom');
    const box = modelMeshBounds(b);
    near(box.min.toArray(), [1, 1.8, 2.7]);
    near(box.max.toArray(), [1.2, 2.2, 3.3]);
    b.part.geometry.dispose(); b.part.material.dispose();
});

test('bounds follow a newly moved and rotated body and include the separate motor hub', () => {
    const b = make();
    modelMeshBounds(b);
    b.body.position.set(-1, 3, 4);
    b.body.rotation.z = Math.PI / 2;
    const hub = new Mesh(new BoxGeometry(0.2, 0.2, 0.2), new MeshBasicMaterial());
    hub.position.set(-2, 1, 0); b.scene.add(hub); b.hubMeshes.set('motor', hub);
    // A floor must not make the camera zoom out to the size of the whole arena.
    const floor = new Mesh(new BoxGeometry(100, 0.1, 100), new MeshBasicMaterial()); b.scene.add(floor);
    const box = modelMeshBounds(b);
    near(box.min.toArray(), [-2.1, 0.9, -0.1]);
    near(box.max.toArray(), [-0.8, 3.2, 4.3]);
    for (const mesh of [b.part, hub, floor]) { mesh.geometry.dispose(); mesh.material.dispose(); }
});
