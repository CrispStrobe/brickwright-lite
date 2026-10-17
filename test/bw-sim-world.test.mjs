// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// M9 — the world in the scene: mat texture and obstacles.
// Proves compile obstacles, physics collision with static obstacle, scene mat texture and dispose.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {validateCompiledMechanism} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {createMat} from '../overlay/scratch-gui/src/lib/bw-sim/world/mats.js';
import {buildSimScene} from '../overlay/scratch-gui/src/lib/bw-sim/view/sim-scene3d.js';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';
import {Box3, Vector3} from 'three';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const CATALOG = new Map(json('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json').parts.map(p => [p.part, p]));
const MODEL = json('test/fixtures/bw-sim/driving-base.json');
const J = await loadJolt();

const TOL = 1e-9;

// 1. compile with two obstacles
test('1. compile obstacles: two static bodies, bad obstacle diagnostics, passes validator', () => {
    const emptyModel = {version: 1, parts: []};
    const emptyCatalog = new Map();
    const obstacles = [
        {id: 'a', shape: 'box', size: [0.2, 0.1, 0.15], position: [0.3, 0, 0], yawDeg: 0, color: 9},
        {id: 'b', shape: 'box', size: [0.1, 0.2, 0.1], position: [-0.2, 0.05, 0.1], yawDeg: 45, color: 3},
    ];
    const mech = compile(emptyModel, emptyCatalog, {obstacles});
    const ground = mech.bodies.find(b => b.id === 'ground');
    assert.ok(ground, 'ground exists');
    const groundTop = ground.position[1] + 0.01;
    const a = mech.bodies.find(b => b.id === 'obstacle:a');
    const b = mech.bodies.find(b => b.id === 'obstacle:b');
    assert.ok(a && b, 'both obstacles present');
    assert.equal(a.motion, 'static');
    assert.equal(b.motion, 'static');
    assert.deepEqual(a.colliders[0].halfExtents, [0.1, 0.05, 0.075]);
    assert.deepEqual(b.colliders[0].halfExtents, [0.05, 0.1, 0.05]);
    // bottom on ground top within 1e-9
    const bottomA = a.position[1] - a.colliders[0].halfExtents[1];
    const bottomB = b.position[1] - b.colliders[0].halfExtents[1];
    assert.ok(Math.abs(bottomA - (groundTop + 0)) < TOL, `a bottom ${bottomA} vs groundTop ${groundTop}`);
    assert.ok(Math.abs(bottomB - (groundTop + 0.05)) < TOL, `b bottom ${bottomB} vs groundTop+0.05 ${groundTop+0.05}`);
    assert.equal(a.color, 9);
    assert.equal(b.color, 3);
    // yawDeg 45 for b
    const expectedQy = Math.sin(45 * Math.PI/180 /2);
    const expectedQw = Math.cos(45 * Math.PI/180 /2);
    assert.ok(Math.abs(b.rotation[0] - 0) < 1e-9);
    assert.ok(Math.abs(b.rotation[1] - expectedQy) < 1e-9);
    assert.ok(Math.abs(b.rotation[2] - 0) < 1e-9);
    assert.ok(Math.abs(b.rotation[3] - expectedQw) < 1e-9);

    // bad obstacles: duplicate id and negative size
    const bad = [
        {id: 'a', shape: 'box', size: [0.2, 0.1, 0.1], position: [0,0,0], yawDeg:0},
        {id: 'a', shape: 'box', size: [0.1, 0.1, 0.1], position: [0,0,0], yawDeg:0},
        {id: 'c', shape: 'box', size: [-0.1, 0.1, 0.1], position: [0,0,0], yawDeg:0},
    ];
    const mech2 = compile(emptyModel, emptyCatalog, {obstacles: bad});
    const diags = mech2.diagnostics.filter(d => d.code === 'bad-obstacle');
    assert.equal(diags.length, 2, `bad diagnostics ${JSON.stringify(diags)}`);
    assert.ok(diags.every(d => d.severity === 'error'));
    // others still compiled: only first a valid
    assert.ok(mech2.bodies.some(b => b.id === 'obstacle:a'));
    assert.equal(mech2.bodies.filter(b => b.id.startsWith('obstacle:')).length, 1);
    assert.deepEqual(validateCompiledMechanism(mech), []);
    assert.deepEqual(validateCompiledMechanism(mech2), []);
});

// 2. physics core: driving base driven into box obstacle stops
test('2. physics: driving base hits static box and stops (<1cm over next second)', async () => {
    // Compile driving base with obstacle in front (forward is -Z)
    const obstacles = [
        {id: 'wall', shape: 'box', size: [0.5, 0.2, 0.02], position: [0, 0, -0.15], yawDeg: 0, color: 10},
    ];
    const mech = compile(MODEL, CATALOG, {obstacles, mat: 'plain'});
    const ground = mech.bodies.find(b => b.id === 'ground');
    const groundTop = ground.position[1] + 0.01;
    const wall = mech.bodies.find(b => b.id === 'obstacle:wall');
    const bottom = wall.position[1] - wall.colliders[0].halfExtents[1];
    assert.ok(Math.abs(bottom - groundTop) < 1e-9, 'wall bottom on ground');

    const {createPhysicsCore: cpc} = await import('../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js');
    // Use SimHubBridge like S1 test for driving
    const {SimHubBridge} = await import('../overlay/scratch-gui/src/lib/bw-sim/hub-bridge.js');
    const VirtualSpikeHubState = (await import('../overlay/scratch-gui/src/lib/virtual-hub/spike-hub-state.js')).default;
    const core = createPhysicsCore(J, mech, {stepHz: 1000 / 50});
    const hubBody = mech.bodies.find(b => b.parts.includes('hub')).id;
    const hubState = new VirtualSpikeHubState();
    const bridge = new SimHubBridge({hubState, core, mechanism: mech, hubBody});
    // Drive forward: left -555, right +555 as per S1
    hubState.motors.runAtSpeed('A', -555);
    hubState.motors.runAtSpeed('B', 555);
    // Step 2s to hit wall
    for (let t = 0; t < 2000; t += 50) bridge.tick(50);
    const hitPos = core.bodyPose(hubBody).position.slice();
    // Next second should move <1cm forward (-Z is forward, so dz negative, but we check overall distance)
    for (let t = 0; t < 1000; t += 50) bridge.tick(50);
    const endPos = core.bodyPose(hubBody).position.slice();
    const travel = Math.hypot(endPos[0]-hitPos[0], endPos[2]-hitPos[2]);
    assert.ok(travel < 0.01, `travel after hit ${travel} should be <0.01`);
    bridge.dispose();
    core.destroy();
});

// 3. Scene: ground with mat line-oval has DataTexture pixel black at (0,0.25) white at (0,0), obstacle meshes exist
test('3. scene: mat texture pixels and obstacle meshes world bounding boxes', () => {
    const emptyModel = {version: 1, parts: []};
    const emptyCatalog = new Map();
    const obstacles = [
        {id: 'a', shape: 'box', size: [0.2, 0.1, 0.1], position: [0.3, 0, 0], yawDeg: 0, color: 9},
        {id: 'b', shape: 'box', size: [0.1, 0.2, 0.1], position: [-0.2, 0, 0.1], yawDeg: 30, color: 3},
    ];
    const mech = compile(emptyModel, emptyCatalog, {mat: 'line-oval', obstacles});
    const colors = new Map([[16, {value:'#ffffff', edge:'#000000', alpha:1}]]);
    const built = buildSimScene({model: emptyModel, mechanism: mech, read: ()=>undefined, colors});
    // Find DataTexture
    let tex = built.matTexture;
    if (!tex && built.ground && built.ground.userData && built.ground.userData.matTexture) tex = built.ground.userData.matTexture;
    // Also check ground.material.map
    if (!tex && built.ground && built.ground.material && built.ground.material.map) tex = built.ground.material.map;
    assert.ok(tex, 'mat texture exists');
    assert.ok(tex.image && tex.image.data, 'texture has image data');
    const w = tex.image.width, h = tex.image.height;
    assert.ok(w > 0 && h > 0, `texture size ${w}x${h}`);
    const matDef = createMat('line-oval');
    const pxPerM = w / matDef.sizeM[0];
    // sample helper as in mats test
    const sample = (x, z) => {
        const px = Math.round(x * pxPerM + w / 2 - 0.5);
        const py = Math.round(z * pxPerM + h / 2 - 0.5);
        assert.ok(px >=0 && px < w && py >=0 && py < h, `px ${px},${py} for world ${x},${z} in ${w}x${h}`);
        const idx = (py * w + px) * 4;
        const r = tex.image.data[idx], g = tex.image.data[idx+1], b = tex.image.data[idx+2];
        return [r,g,b];
    };
    const black = sample(0, 0.25);
    assert.deepEqual(black, [15,15,15], `pixel at (0,0.25) should be black (15,15,15 from honest mats rgb 60), got ${black}`);
    const white = sample(0, 0);
    assert.deepEqual(white, [255,255,255], `pixel at (0,0) should be white, got ${white}`);

    // Obstacle meshes exist with right world bounding boxes
    assert.ok(built.obstacleMeshes && built.obstacleMeshes.size === 2, `obstacleMeshes ${built.obstacleMeshes?.size}`);
    for (const obs of obstacles) {
        const id = `obstacle:${obs.id}`;
        const mesh = built.obstacleMeshes.get(id);
        assert.ok(mesh, `mesh for ${id}`);
        mesh.updateMatrixWorld(true);
        const box = new Box3().setFromObject(mesh);
        // Expected bounding box from body
        const body = mech.bodies.find(b => b.id === id);
        assert.ok(body, `body ${id}`);
        // Compute expected AABB by transforming box corners
        const he = body.colliders[0].halfExtents;
        const corners = [];
        for (const sx of [-1,1]) for (const sy of [-1,1]) for (const sz of [-1,1]) {
            const local = [sx*he[0], sy*he[1], sz*he[2]];
            // rotate by body quaternion (yaw about Y only)
            const q = body.rotation;
            // quaternion rotate vector: q * v * q_conj, for yaw only we can compute simpler: 2D rotation in XZ
            const yaw = 2 * Math.atan2(q[1], q[3]); // extract yaw
            const cos = Math.cos(yaw), sin = Math.sin(yaw);
            const rx = local[0]*cos + local[2]*sin;
            const rz = -local[0]*sin + local[2]*cos;
            const world = [body.position[0]+rx, body.position[1]+local[1], body.position[2]+rz];
            corners.push(world);
        }
        const min = [Math.min(...corners.map(c=>c[0])), Math.min(...corners.map(c=>c[1])), Math.min(...corners.map(c=>c[2]))];
        const max = [Math.max(...corners.map(c=>c[0])), Math.max(...corners.map(c=>c[1])), Math.max(...corners.map(c=>c[2]))];
        const eps = 1e-6;
        assert.ok(Math.abs(box.min.x - min[0]) < eps, `bbox min.x ${box.min.x} vs ${min[0]} for ${id}`);
        assert.ok(Math.abs(box.min.y - min[1]) < eps, `bbox min.y ${box.min.y} vs ${min[1]} for ${id}`);
        assert.ok(Math.abs(box.min.z - min[2]) < eps, `bbox min.z ${box.min.z} vs ${min[2]} for ${id}`);
        assert.ok(Math.abs(box.max.x - max[0]) < eps, `bbox max.x ${box.max.x} vs ${max[0]} for ${id}`);
        assert.ok(Math.abs(box.max.y - max[1]) < eps, `bbox max.y ${box.max.y} vs ${max[1]} for ${id}`);
        assert.ok(Math.abs(box.max.z - max[2]) < eps, `bbox max.z ${box.max.z} vs ${max[2]} for ${id}`);
    }
    built.dispose();
});

// 4. dispose() disposes the texture (spy on texture.dispose)
test('4. dispose() disposes the texture', () => {
    const emptyModel = {version: 1, parts: []};
    const mech = compile(emptyModel, new Map(), {mat: 'line-oval', obstacles: [{id:'a', shape:'box', size:[0.1,0.1,0.1], position:[0,0,0], yawDeg:0}]});
    const colors = new Map([[16, {value:'#ffffff', edge:'#000000', alpha:1}]]);
    const built = buildSimScene({model: emptyModel, mechanism: mech, read: ()=>undefined, colors});
    let tex = built.matTexture || (built.ground && built.ground.userData && built.ground.userData.matTexture);
    assert.ok(tex, 'texture exists for dispose test');
    let disposed = false;
    const orig = tex.dispose.bind(tex);
    tex.dispose = () => { disposed = true; orig(); };
    built.dispose();
    assert.ok(disposed, 'texture.dispose was called');
});
