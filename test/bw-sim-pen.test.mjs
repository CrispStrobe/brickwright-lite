// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Pen and paper (architecture M15): a part marked `pen` (`0 !BW PEN`) draws on the floor in
// Simulate (view/pen-layer.js) wherever its tip touches it; lifted, the stroke ends.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {BoxGeometry, Group, Mesh, MeshBasicMaterial, Scene} from 'three';
import {parseModel, serializeModel} from '../overlay/scratch-gui/src/lib/bw-sim/model/ldraw-model.js';
import {createEditor} from '../overlay/scratch-gui/src/lib/bw-sim/editor/editor-state.js';
import {validatePlacedModel} from '../overlay/scratch-gui/src/lib/bw-sim/contracts.js';
import {createPenLayer, PEN_DOWN_M} from '../overlay/scratch-gui/src/lib/bw-sim/view/pen-layer.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = new Map(JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'), 'utf8')).parts.map(p => [p.part, p]));
const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];

test('a pen part: through LDraw and back, set and cleared in the editor, checked by the contract', () => {
    const model = {version: 1, parts: [{id: 'a', part: '3001.dat', position: [0, 0, 0], rotation: I, pen: true},
        {id: 'b', part: '3001.dat', position: [40, 0, 0], rotation: I}]};
    assert.deepEqual(validatePlacedModel(model, CATALOG), []);
    const text = serializeModel(model);
    assert.match(text, /0 !BW ID a\r?\n0 !BW PEN\r?\n1 /);
    const back = parseModel(text).model;
    assert.equal(back.parts[0].pen, true);
    assert.equal(back.parts[1].pen, undefined, 'only the part after the PEN line');
    const ed = createEditor({model: back, catalog: CATALOG});
    ed.apply({type: 'setPen', id: 'b', pen: true});
    ed.apply({type: 'setPen', id: 'a', pen: false});
    assert.deepEqual(ed.model.parts.map(p => Boolean(p.pen)), [false, true]);
    ed.undo();
    assert.equal(ed.model.parts[0].pen, true);
    assert.ok(validatePlacedModel({...model, parts: [{...model.parts[0], pen: 'yes'}]}, CATALOG).some(p => /pen/.test(p)));
});

test('the pen draws while its tip is on the floor, and a lifted pen starts a new stroke', () => {
    const scene = new Scene();
    const ground = new Mesh(new BoxGeometry(2, 0.01, 2), new MeshBasicMaterial());
    ground.position.y = -0.005; // its top at y 0
    scene.add(ground);
    const body = new Group();
    scene.add(body);
    // a 1 cm cube whose bottom just touches the floor
    const mesh = new Mesh(new BoxGeometry(0.01, 0.01, 0.01), new MeshBasicMaterial());
    mesh.position.y = 0.005;
    body.add(mesh);
    const built = {scene, ground, bodyGroups: new Map([['b0', body]]), partMeshes: new Map([['pen', mesh]])};
    const model = {parts: [{id: 'pen', part: '3001.dat', position: [0, 0, 0], rotation: I, pen: true}, {id: 'x', part: '3001.dat', position: [0, 0, 0], rotation: I}]};
    // its body: the cube's collider, the part's (the tip is the colliders' lowest point, as the physics has it)
    const mechanism = {bodies: [{id: 'b0', parts: ['pen'], position: [0, 0, 0],
        colliders: [{shape: 'box', halfExtents: [0.005, 0.005, 0.005], position: [0, 0.005, 0], part: 'pen'}]}]};
    const layer = createPenLayer({model, mechanism, built});
    assert.equal(layer.count, 1);
    const go = (x, lift = 0) => { body.position.set(x, lift, 0); layer.update(); };
    for (let i = 0; i <= 10; i++) go(i * 0.01); // 10 cm along x, on the floor
    go(0.1, PEN_DOWN_M * 3); // lifted
    go(0.15, PEN_DOWN_M * 3);
    for (let i = 0; i <= 5; i++) go(0.15 + i * 0.01); // 5 cm more, down again
    const strokes = layer.strokes();
    assert.equal(strokes.length, 2, JSON.stringify(strokes.map(s => s.length)));
    assert.ok(Math.abs(strokes[0][0][0]) < 1e-9 && Math.abs(strokes[0].at(-1)[0] - 0.1) < 1e-9, 'the first stroke runs 0 to 10 cm');
    assert.ok(Math.abs(strokes[1][0][0] - 0.15) < 1e-9 && Math.abs(strokes[1].at(-1)[0] - 0.2) < 1e-9, 'the second 15 to 20 cm');
    assert.ok(strokes.flat().every(([, z]) => Math.abs(z) < 1e-9));
    layer.dispose();
    assert.equal(createPenLayer({model: {parts: [model.parts[1]]}, mechanism: {bodies: []}, built}), null, 'no pen, no layer');
});

test('a ball that rolls keeps drawing: its tip is under its centre whichever way it has turned', async () => {
    const {SphereGeometry, Quaternion, Vector3} = await import('three');
    const scene = new Scene();
    const ground = new Mesh(new BoxGeometry(2, 0.01, 2), new MeshBasicMaterial());
    ground.position.y = -0.005;
    scene.add(ground);
    const body = new Group();
    body.position.y = 0.01; // a 1 cm ball resting on the floor
    scene.add(body);
    const mesh = new Mesh(new SphereGeometry(0.01), new MeshBasicMaterial());
    body.add(mesh);
    const built = {scene, ground, bodyGroups: new Map([['ball', body]]), partMeshes: new Map([['b', mesh]])};
    const mechanism = {bodies: [{id: 'ball', parts: ['b'], position: [0, 0.01, 0], colliders: [{shape: 'sphere', radius: 0.01, part: 'b'}]}]};
    const layer = createPenLayer({model: {parts: [{id: 'b', part: '3001.dat', position: [0, 0, 0], rotation: I, pen: true}]}, mechanism, built});
    // Rolls 6.3 cm along x: one whole turn about z.
    for (let i = 0; i <= 40; i++) {
        const turn = 2 * Math.PI * i / 40;
        body.position.set(0.01 * turn, 0.01, 0);
        body.quaternion.copy(new Quaternion().setFromAxisAngle(new Vector3(0, 0, -1), turn));
        layer.update();
    }
    const strokes = layer.strokes();
    assert.equal(strokes.length, 1, 'one unbroken stroke');
    assert.ok(Math.abs(strokes[0].at(-1)[0] - 0.02 * Math.PI) < 1e-9, `to ${strokes[0].at(-1)[0]}`);
});
