// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Big models drawn instanced (view/instanced-parts.js), headless. Proven:
//   - every placed part is exactly one instance, in a batch of its own part geometry
//     (a motor: housing and drive hub in two batches), and the instance matrix is the
//     part's LDraw placement in world metres, computed here from the model, not from
//     the scene; after a physics snapshot moves a body, its parts' instances follow;
//   - the instance colour is the placed LDraw colour, the edge tint its LDConfig EDGE,
//     and a tint or a highlight on a part's (invisible) mesh reaches its instance;
//   - instance ids map back to part ids, and the proxies still answer a raycast;
//   - the 2,054-part stress model (scripts/lib/sim-lab-stress-model.mjs) is instanced
//     automatically and draws in a few dozen objects instead of thousands.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Color, Matrix4, Quaternion, Raycaster, Vector3} from 'three';
import {parseLDConfig} from '../overlay/scratch-gui/src/lib/bw-sim/view/ldraw-colors.js';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {buildSimScene, applySnapshot} from '../overlay/scratch-gui/src/lib/bw-sim/view/sim-scene3d.js';
import {INSTANCE_FROM} from '../overlay/scratch-gui/src/lib/bw-sim/view/instanced-parts.js';
import {tintMaterial} from '../overlay/scratch-gui/src/lib/bw-sim/view/insight-layer.js';
import {prepareModel, catalogFrom} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {stressModel} from '../scripts/lib/sim-lab-stress-model.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LDRAW_DIR = path.join(ROOT, 'overlay', 'scratch-gui', 'static', 'ldraw');
const json = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const CATALOG = catalogFrom(json('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json'));
const MODEL = json('test/fixtures/bw-sim/driving-base.json');
const read = p => {
    try { return readFileSync(path.join(LDRAW_DIR, p), 'utf8'); } catch { return undefined; }
};
const colors = parseLDConfig(readFileSync(path.join(LDRAW_DIR, 'LDConfig.ldr'), 'utf8'));
const LDU_M = 0.0004;

/** A part's world matrix from its LDraw placement alone: x, −y, −z in metres; rotation F·R·F. */
const placement = p => {
    const [a, b, c, d, e, f, g, h, i] = p.rotation;
    const m = new Matrix4().set(
        a, -b, -c, p.position[0] * LDU_M,
        -d, e, f, -p.position[1] * LDU_M,
        -g, h, i, -p.position[2] * LDU_M,
        0, 0, 0, 1);
    return m;
};
const instances = built => {
    const out = new Map(); // part id → [{batch, index}]
    for (const batch of new Set(built.instanced.object.children.map(c => c.userData.batch))) {
        batch.entries.forEach((entry, index) => {
            const id = entry.proxy.name;
            out.set(id, [...(out.get(id) || []), {batch, index}]);
        });
    }
    return out;
};
const matrixOf = ({batch, index}) => new Matrix4().fromArray(batch.matrices.array, index * 16);
const sameMatrix = (a, b, msg, tol = 1e-6) => a.elements.forEach((v, k) => assert.ok(Math.abs(v - b.elements[k]) <= tol, `${msg}: [${k}] ${v} vs ${b.elements[k]}`));

test('the driving base instanced: one instance per part, at its LDraw placement, motors split', () => {
    const mech = compile(MODEL, CATALOG);
    const built = buildSimScene({model: MODEL, mechanism: mech, read, colors, catalog: CATALOG, instancing: true});
    assert.ok(built.instanced, 'instanced when asked');
    built.scene.updateMatrixWorld(true);
    built.instanced.sync();
    const byId = instances(built);
    const motors = MODEL.parts.filter(p => CATALOG.get(p.part)?.motor || /54696/.test(p.part));
    assert.ok(motors.length >= 2, 'the driving base has its two motors');
    for (const p of MODEL.parts) {
        const list = byId.get(p.id) || [];
        const hub = byId.get(`${p.id}#hub`) || [];
        assert.equal(list.length, 1, `${p.id}: one instance`);
        sameMatrix(matrixOf(list[0]), placement(p), `${p.id} placement`);
        if (motors.includes(p)) {
            assert.equal(hub.length, 1, `${p.id}: its drive hub is its own instance`);
            assert.notEqual(hub[0].batch, list[0].batch, `${p.id}: housing and hub are different geometry`);
            sameMatrix(matrixOf(hub[0]), placement(p), `${p.id} hub placement`);
        }
        // Proxies: invisible, in their body groups, and nothing draws per part any more.
        assert.equal(built.partMeshes.get(p.id).visible, false);
        assert.equal(built.partMeshes.get(p.id).children.length, 0, 'no per-part edge lines');
    }
    // Colours: the placed colour (three's linear working space) and the colour's EDGE for own-colour lines.
    for (const [id, [{batch, index}]] of byId) {
        if (id.endsWith('#hub')) continue;
        const p = MODEL.parts.find(q => q.id === id);
        const own = batch.colours.find(c => c.kind === 'own');
        if (!own) continue;
        const want = new Color(colors.get(p.color ?? 16).value);
        assert.deepEqual([...own.attribute.array.slice(index * 3, index * 3 + 3)].map(v => v.toFixed(5)), want.toArray().map(v => v.toFixed(5)), `${id} colour`);
        const lines = batch.meshes.find(m => m.kind === 'edges-own');
        if (lines) {
            const tint = lines.mesh.geometry.getAttribute('iTint').array.slice(index * 3, index * 3 + 3);
            assert.deepEqual([...tint].map(v => v.toFixed(5)), new Color(colors.get(p.color ?? 16).edge).toArray().map(v => v.toFixed(5)), `${id} edge`);
        }
    }
    // Instance ids → part ids, for every drawn object.
    for (const child of built.instanced.object.children) {
        child.userData.batch.entries.forEach((e, i) => assert.equal(built.instanced.partAt(child, i), e.proxy.name));
    }
    built.dispose();
});

test('instances follow a physics snapshot, a tint and a highlight on the part', () => {
    const mech = compile(MODEL, CATALOG);
    const built = buildSimScene({model: MODEL, mechanism: mech, read, colors, catalog: CATALOG, instancing: true});
    // Move and turn every body: each part's new world matrix is body_new · body_old⁻¹ · placement.
    const bodies = new Float32Array(mech.bodies.length * 7);
    const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.7);
    const moved = new Map();
    mech.bodies.forEach((b, i) => {
        const q = new Quaternion(...b.rotation).premultiply(turn);
        const pos = new Vector3(...b.position).add(new Vector3(0.1 * i, 0.02, -0.05));
        bodies.set([pos.x, pos.y, pos.z, q.x, q.y, q.z, q.w], i * 7);
        const before = new Matrix4().compose(new Vector3(...b.position), new Quaternion(...b.rotation), new Vector3(1, 1, 1));
        const after = new Matrix4().compose(pos, q, new Vector3(1, 1, 1));
        moved.set(b.id, after.multiply(before.invert()));
    });
    applySnapshot(built, {bodyIds: mech.bodies.map(b => b.id), bodies});
    built.scene.updateMatrixWorld(true);
    built.instanced.sync();
    const byId = instances(built);
    for (const p of MODEL.parts) {
        const body = built.partMeshes.get(p.id).parent.name;
        sameMatrix(matrixOf(byId.get(p.id)[0]), moved.get(body).clone().multiply(placement(p)), `${p.id} after the snapshot`, 1e-5);
    }
    // A tint (Show how it moves) and a pulse (emissive) are written to the part's own material.
    const wheel = MODEL.parts.find(p => /39367/.test(p.part));
    const [{batch, index}] = byId.get(wheel.id);
    const own = batch.colours.find(c => c.kind === 'own').attribute;
    for (const m of built.partMeshes.get(wheel.id).material) tintMaterial(m, '#ff00ff');
    built.instanced.sync();
    assert.deepEqual([...own.array.slice(index * 3, index * 3 + 3)].map(v => v.toFixed(4)), new Color('#ff00ff').toArray().map(v => v.toFixed(4)));
    for (const m of built.partMeshes.get(wheel.id).material) { tintMaterial(m, null); m.emissive.setHex(0x404000); }
    built.instanced.sync();
    const base = new Color(colors.get(wheel.color).value);
    const glow = new Color(0x404000);
    assert.deepEqual([...own.array.slice(index * 3, index * 3 + 3)].map(v => v.toFixed(4)),
        [base.r + glow.r, base.g + glow.g, base.b + glow.b].map(v => v.toFixed(4)), 'the highlight brightens the instance');
    built.dispose();
});

test('the proxies still answer a raycast with their part id (Build picks parts through them)', () => {
    const mech = compile(MODEL, CATALOG);
    const built = buildSimScene({model: MODEL, mechanism: mech, read, colors, catalog: CATALOG, instancing: true});
    built.scene.updateMatrixWorld(true);
    const hub = MODEL.parts.find(p => p.part === '45601.dat');
    const centre = new Vector3(...[hub.position[0], -hub.position[1], -hub.position[2]].map(v => v * LDU_M));
    const ray = new Raycaster(centre.clone().add(new Vector3(0, 1, 0)), new Vector3(0, -1, 0));
    const hits = ray.intersectObjects([...built.partMeshes.values()], false);
    assert.ok(hits.length > 0, 'a ray straight down onto the hub hits');
    assert.equal(hits[0].object.name, hub.id);
    built.dispose();
});

test('the 2,054-part stress model is instanced automatically and draws in a few dozen objects', () => {
    const text = stressModel(readFileSync(path.join(ROOT, 'overlay/scratch-gui/static/sim-lab/models/driving-base.ldr'), 'utf8'));
    const {runModel, mechanism} = prepareModel(text, CATALOG);
    assert.ok(runModel.parts.length > 2000, `${runModel.parts.length} parts`);
    assert.ok(runModel.parts.length >= INSTANCE_FROM);
    const built = buildSimScene({model: runModel, mechanism, read, colors, catalog: CATALOG});
    assert.ok(built.instanced, 'auto: instanced');
    const stats = built.instanced.stats();
    const motors = runModel.parts.filter(p => /54696/.test(p.part)).length;
    assert.equal(stats.instances, runModel.parts.length + motors, 'every part once, plus each motor\'s drive hub');
    const ids = [...instances(built).keys()];
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(stats.drawObjects < 80, `${stats.drawObjects} drawn objects`);
    let drawn = 0;
    built.scene.traverseVisible(o => { if (o.isMesh || o.isLineSegments) drawn++; });
    assert.ok(drawn < 100, `${drawn} visible meshes and line sets in the whole scene`);
    built.dispose();
    // The same model per part (instancing off) is thousands of drawn objects: what instancing saves.
    const flat = buildSimScene({model: runModel, mechanism, read, colors, catalog: CATALOG, instancing: false});
    let perPart = 0;
    flat.scene.traverseVisible(o => { if (o.isMesh || o.isLineSegments) perPart++; });
    assert.ok(perPart > 4000, `${perPart} per-part objects`);
    flat.dispose();
});

test('small models keep one mesh per part (auto stays off below INSTANCE_FROM)', () => {
    const mech = compile(MODEL, CATALOG);
    const built = buildSimScene({model: MODEL, mechanism: mech, read, colors, catalog: CATALOG});
    assert.equal(built.instanced, null);
    assert.ok([...built.partMeshes.values()].every(m => m.visible && m.children.length > 0));
    built.dispose();
});
