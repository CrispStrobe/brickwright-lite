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
import {BufferGeometry, Color, Euler, Float32BufferAttribute, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Raycaster, Vector3, Vector4, PerspectiveCamera, Scene} from 'three';
import {parseLDConfig} from '../overlay/scratch-gui/src/lib/bw-sim/view/ldraw-colors.js';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {buildSimScene, applySnapshot} from '../overlay/scratch-gui/src/lib/bw-sim/view/sim-scene3d.js';
import {createInstancedParts, INSTANCE_FROM} from '../overlay/scratch-gui/src/lib/bw-sim/view/instanced-parts.js';
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

/** A tiny real Three.js batch isolates upload invalidation from geometry loading. */
const uploadFixture = t => {
    const faces = new BufferGeometry();
    faces.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    faces.addGroup(0, 3, 0);
    const proxy = new Mesh(faces, new MeshStandardMaterial({color: new Color(0.1, 0.2, 0.3)}));
    proxy.matrixWorld.makeTranslation(0.1, 0.2, 0.3);
    const instanced = createInstancedParts({colors});
    instanced.add(proxy, {faces, edges: new BufferGeometry(), conditional: new BufferGeometry()}, 16);
    instanced.build();
    const batch = instanced.object.children[0].userData.batch;
    t.after(() => { instanced.dispose(); faces.dispose(); proxy.material.dispose(); });
    return {proxy, instanced, matrix: batch.matrices, color: batch.colours[0].attribute};
};

test('unchanged GPU-precision transforms and colors retain bytes and attribute versions', t => {
    const {proxy, instanced, matrix, color} = uploadFixture(t);
    const before = {matrix: matrix.array.slice(), color: color.array.slice(), mv: matrix.version, cv: color.version};
    instanced.sync();
    assert.deepEqual(matrix.array, before.matrix);
    assert.deepEqual(color.array, before.color);
    assert.equal(matrix.version, before.mv, 'No upload for identical stored matrix bytes');
    assert.equal(color.version, before.cv, 'No upload for identical stored color bytes');
    proxy.matrixWorld.elements[12] += 1e-10;
    proxy.material.color.r += 1e-10;
    instanced.sync();
    assert.deepEqual(matrix.array, before.matrix, 'Sub-float32 movement leaves the existing GPU bytes');
    assert.deepEqual(color.array, before.color, 'Sub-float32 tint leaves the existing GPU bytes');
    assert.equal(matrix.version, before.mv);
    assert.equal(color.version, before.cv);
});

test('representable changes and forced uploads remain live after precision-aware caching', t => {
    const {proxy, instanced, matrix, color} = uploadFixture(t);
    let mv = matrix.version, cv = color.version;
    proxy.matrixWorld.elements[12] = 0.1001;
    proxy.material.color.r = 0.25;
    instanced.sync();
    assert.ok(matrix.version > mv);
    assert.ok(color.version > cv);
    assert.equal(matrix.array[12], new Float32Array([0.1001])[0]);
    assert.equal(color.array[0], new Float32Array([0.25])[0]);
    mv = matrix.version; cv = color.version;
    instanced.sync(true);
    assert.ok(matrix.version > mv, 'Explicit forced matrix upload retained');
    assert.ok(color.version > cv, 'Explicit forced color upload retained');
    const visible = matrix.array.slice();
    proxy.userData.hidden = true; instanced.sync();
    assert.ok(matrix.array.every(value => value === 0));
    proxy.userData.hidden = false; instanced.sync();
    assert.deepEqual(matrix.array, visible, 'Unhide restores the same placement');
    proxy.material.emissive.setRGB(0.15, 0.01, 0.07); instanced.sync();
    assert.equal(color.array[0], new Float32Array([0.4])[0], 'Emissive highlight still reaches the GPU');
    const lit = color.array.slice();
    proxy.userData.dim = true; instanced.sync();
    assert.notDeepEqual(color.array, lit, 'Dimming still reaches the GPU');
});

// Per-draw line transform lifecycle and projection controls.
{
const visual = () => {
    const line = conditional => {
        const g = new BufferGeometry();
        g.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0], 3));
        g.setAttribute('color', new Float32BufferAttribute([1, 1, 1, 1, 1, 1], 3));
        if (conditional) {
            g.setAttribute('control0', new Float32BufferAttribute([0, 1, 0, 0, 1, 0], 3));
            g.setAttribute('control1', new Float32BufferAttribute([0, -1, 0, 0, -1, 0], 3));
            g.setAttribute('direction', new Float32BufferAttribute([1, 0, 0, 1, 0, 0], 3));
        }
        g.addGroup(0, 2, 0);
        g.computeBoundingBox();g.computeBoundingSphere();
        return g;
    };
    const faces = new BufferGeometry();
    faces.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    faces.addGroup(0, 3, 0);
    return {faces, edges: line(false), conditional: line(true)};
};
const hook = (scene, parts, view = 'view/sim-scene3d.js') => {
    const text = readFileSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-sim', view), 'utf8');
    const callback = text.match(/(?:scene|s)\.onBeforeRender = ([^\n]+);/);
    assert.ok(callback, 'Actual early scene hook must exist');
    scene.onBeforeRender = new Function('instanced', `return ${callback[1]};`)(parts);
};
const fixture = (view) => {
    const parts = createInstancedParts({colors: new Map([
        [16, {value: '#7799cc', edge: '#223344', alpha: 1}],
        [40, {value: '#6688aa', edge: '#112233', alpha: 0.5}]
    ])});
    const source = visual(), proxies = [];
    for (let i = 0; i < 4; i++) {
        const proxy = new Mesh(new BufferGeometry(), new MeshStandardMaterial({color: '#7799cc'}));
        proxy.position.set(i / 3, -0.2, 0.7);proxy.rotation.set(0.1, i / 10, -0.2);
        proxy.updateMatrixWorld(true);proxies.push(proxy);parts.add(proxy, source, i < 2 ? 16 : 40);
    }
    parts.build();
    const scene = new Scene();scene.add(parts.object);
    parts.object.position.set(0.2, -0.1, 0.3);parts.object.rotation.set(0.2, 0.3, -0.1);
    const lines = parts.object.children.filter(o => o.isLineSegments);
    lines.forEach((o, i) => {o.position.set(i / 11, 0, -i / 13);o.rotation.z = i / 7;});
    const camera = new PerspectiveCamera(48, 1.6, 0.2, 50);
    camera.position.set(0.3, 0.2, 6);camera.rotation.set(-0.1, 0.15, 0.05);
    hook(scene, parts, view);
    const frame = (selected = camera) => {
        scene.updateMatrixWorld(true);selected.updateMatrixWorld(true);
        scene.onBeforeRender(null, scene, selected);
    };
    return {parts, source, proxies, scene, lines, camera, frame};
};
const clipOf = (line, i = 0) => new Matrix4().fromArray(line.geometry.getAttribute('iClipFromInstance').array, i * 16);
const originalProjection = (line, camera, point, i = 0) => new Vector4(...point, 1)
    .applyMatrix4(new Matrix4().fromArray(line.userData.batch.matrices.array, i * 16))
    .applyMatrix4(line.matrixWorld).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
const nearPoint = (actual, expected) => ['x', 'y', 'z', 'w'].forEach(k => {
    assert.ok(Number.isFinite(actual[k]) && Number.isFinite(expected[k]));
    assert.ok(Math.abs(actual[k] - expected[k]) <= 2e-5 * Math.max(1, Math.abs(expected[k])), `${k}: ${actual[k]} vs ${expected[k]}`);
});
const assertProjection = (line, camera) => {
    for (let i = 0; i < line.geometry.instanceCount; i++) for (const point of [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, -1, 0]])
        nearPoint(new Vector4(...point, 1).applyMatrix4(clipOf(line, i)), originalProjection(line, camera, point, i));
};

test('both actual early scene hooks prepare first-frame clip buffers before any material callback', () => {
    for (const view of ['view/sim-scene3d.js', 'editor/editor-view3d.js']) {
        const f = fixture(view);
        for (const line of f.lines) {
            assert.ok(line.geometry.getAttribute('iClipFromInstance').array.every(v => v === 0));
            line.modelViewMatrix.makeTranslation(1000, 2000, 3000); // deliberately stale until the later draw boundary
        }
        f.frame();
        for (const line of f.lines) {
            const a = line.geometry.getAttribute('iClipFromInstance');
            assert.ok(a.version > 0, 'Prepared before the renderer creates/uploads attribute buffers');
            assertProjection(line, f.camera);
            const version = a.version;
            line.material.onBeforeRender(null, f.scene, f.camera, line.geometry, line);
            assert.equal(a.version, version, 'No too-late material-stage writes');
        }
        f.parts.dispose();
    }
});

test('clip shaders retain one active instance matrix and the original four-point conditional predicate', () => {
    const f = fixture();f.frame();
    for (const line of f.lines) {
        const shader = line.material.vertexShader;
        assert.equal((shader.match(/attribute mat4 /g) || []).length, 1);
        assert.match(shader, /attribute mat4 iClipFromInstance/);
        assert.doesNotMatch(shader, /clipFromModel|projectionMatrix|modelViewMatrix|iMatrix/);
        assert.equal(line.geometry.getAttribute('iClipFromInstance').meshPerAttribute, 1);
        assert.equal(line.geometry.getAttribute('iClipFromInstance').itemSize, 16);
        assert.equal(line.geometry.instanceCount, line.userData.batch.entries.length);
        assert.equal(line.frustumCulled, false);
        if (line.name.startsWith('instanced:edges-')) assert.match(shader, /gl_Position\s*=\s*iClipFromInstance\s*\*\s*vec4\(position, 1\.0\)/);
        else {
            assert.match(shader, /mat4 mvp\s*=\s*iClipFromInstance/);
            for (const expression of ['control0', 'control1', 'position', 'position + direction']) assert.ok(shader.includes(`mvp * vec4(${expression}, 1.0)`));
            assert.match(shader, /vDiscard\s*=\s*d0 \* d1 < 0\.0 \? 1\.0 : 0\.0/);
        }
    }
    f.parts.dispose();
});

test('camera-only, projection-only and second-camera changes refresh clip data without dirtying face buffers', () => {
    const f = fixture();f.frame();
    const faces = f.parts.object.children.filter(o => o.isInstancedMesh);
    const worldVersions = faces.map(o => o.instanceMatrix.version), colorVersions = faces.map(o => o.instanceColor.version);
    const a = f.lines[0].geometry.getAttribute('iClipFromInstance');let version = a.version;
    f.camera.position.x += 0.4;f.frame();assert.ok(a.version > version);assertProjection(f.lines[0], f.camera);
    version = a.version;f.camera.fov = 55;f.camera.updateProjectionMatrix();f.frame();assert.ok(a.version > version);assertProjection(f.lines[0], f.camera);
    version = a.version;const other = f.camera.clone();other.position.y -= 0.6;f.frame(other);assert.ok(a.version > version);
    for (const line of f.lines) assertProjection(line, other);
    assert.deepEqual(faces.map(o => o.instanceMatrix.version), worldVersions);
    assert.deepEqual(faces.map(o => o.instanceColor.version), colorVersions);
    f.parts.dispose();
});

test('shared source geometry and material retain distinct per-object clip buffers and current parent transforms', () => {
    const f = fixture();f.frame();
    const regular = f.lines.filter(o => o.name.startsWith('instanced:edges-'));
    assert.equal(regular[0].material, regular[1].material);
    assert.equal(new Set(f.lines.map(o => o.geometry.getAttribute('iClipFromInstance').array)).size, f.lines.length);
    for (const line of regular) assert.equal(line.geometry.getAttribute('position'), f.source.edges.getAttribute('position'));
    assert.equal(f.source.edges.getAttribute('iClipFromInstance'), undefined);
    const snapshot = Array.from(regular[0].geometry.getAttribute('iClipFromInstance').array);
    regular[1].position.x += 0.5;f.frame();
    assert.deepEqual(Array.from(regular[0].geometry.getAttribute('iClipFromInstance').array), snapshot);
    for (const line of f.lines) assertProjection(line, f.camera);
    f.parts.object.rotation.y += 0.7;f.frame();
    for (const line of f.lines) assertProjection(line, f.camera);
    f.parts.dispose();
});

test('unchanged Float32 clip values do not request repeated uploads', () => {
    const f = fixture();f.frame();
    const versions = f.lines.map(o => o.geometry.getAttribute('iClipFromInstance').version);
    const bytes = f.lines.map(o => Array.from(o.geometry.getAttribute('iClipFromInstance').array));
    for (let i = 0; i < 5; i++) f.frame();
    assert.deepEqual(f.lines.map(o => o.geometry.getAttribute('iClipFromInstance').version), versions);
    assert.deepEqual(f.lines.map(o => Array.from(o.geometry.getAttribute('iClipFromInstance').array)), bytes);
    f.parts.dispose();
});

test('proxy movement and hide/unhide still drive effective world and clip matrices', () => {
    const f = fixture();f.frame();const proxy = f.proxies[0];
    const line = f.lines.find(o => o.userData.batch.entries.some(e => e.proxy === proxy));
    const i = line.userData.batch.entries.findIndex(e => e.proxy === proxy);
    proxy.position.x += 0.75;proxy.updateMatrixWorld(true);f.frame();assertProjection(line, f.camera);
    const visible = Array.from(line.geometry.getAttribute('iClipFromInstance').array.slice(i * 16, i * 16 + 16));
    proxy.userData.hidden = true;f.frame();
    assert.ok(line.userData.batch.matrices.array.slice(i * 16, i * 16 + 16).every(v => v === 0));
    assert.ok(line.geometry.getAttribute('iClipFromInstance').array.slice(i * 16, i * 16 + 16).every(v => v === 0));
    proxy.userData.hidden = false;f.frame();
    assert.deepEqual(Array.from(line.geometry.getAttribute('iClipFromInstance').array.slice(i * 16, i * 16 + 16)), visible);
    f.parts.dispose();
});

test('conditional visible and hidden sides match the original independently projected point rule', () => {
    const f = fixture();f.frame();const line = f.lines.find(o => o.name.startsWith('instanced:conditional-'));
    const discard = p => {
        const [c0, c1, p0, p1] = p.map(v => [v.x / v.w, v.y / v.w]);
        const n = [p0[1] - p1[1], p1[0] - p0[0]];
        return (n[0] * (c0[0] - p0[0]) + n[1] * (c0[1] - p0[1])) * (n[0] * (c1[0] - p0[0]) + n[1] * (c1[1] - p0[1])) < 0;
    };
    for (const [control, expected] of [[[0, -1, 0], true], [[0, 2, 0], false]]) {
        const points = [[0, 1, 0], control, [0, 0, 0], [1, 0, 0]];
        const old = points.map(p => originalProjection(line, f.camera, p));
        const prepared = points.map(p => new Vector4(...p, 1).applyMatrix4(clipOf(line)));
        prepared.forEach((p, i) => nearPoint(p, old[i]));
        assert.equal(discard(old), expected);assert.equal(discard(prepared), expected);
    }
    f.parts.dispose();
});

test('clip buffers belong to disposable mirrors while cached source geometry stays unchanged', () => {
    const f = fixture();f.frame();let disposed = 0;
    const original = Array.from(f.source.edges.getAttribute('position').array);
    for (const line of f.lines) line.geometry.addEventListener('dispose', () => disposed++);
    f.parts.dispose();assert.equal(disposed, f.lines.length);assert.equal(f.parts.object.children.length, 0);
    assert.deepEqual(Array.from(f.source.edges.getAttribute('position').array), original);
    assert.equal(f.source.edges.getAttribute('iClipFromInstance'), undefined);
});
}
