// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BufferGeometry, Euler, Float32BufferAttribute, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3} from 'three';
import {createInstancedParts} from '../overlay/scratch-gui/src/lib/bw-sim/view/instanced-parts.js';

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
        return g;
    };
    return {faces: new BufferGeometry(), edges: line(false), conditional: line(true)};
};
const fixture = () => {
    const parts = createInstancedParts({colors: new Map([[16, {value: '#7799cc', edge: '#223344', alpha: 1}]])});
    for (let i = 0; i < 2; i++) {
        const proxy = new Mesh(new BufferGeometry(), new MeshStandardMaterial({color: '#7799cc'}));
        proxy.position.set(i + 1 / 3, -0.2, 0.7);
        proxy.updateMatrixWorld(true);
        parts.add(proxy, visual(), 16);
    }
    parts.build();
    return {parts, regular: parts.object.children.filter(o => o.name === 'instanced:edges-own'),
        conditional: parts.object.children.filter(o => o.name === 'instanced:conditional-own')};
};
const pose = (x, y, z, angle = 0.3) => new Matrix4().compose(new Vector3(x, y, z),
    new Quaternion().setFromEuler(new Euler(angle, -0.4, 0.2)), new Vector3(1.2, 0.8, 1.1));
const projection = () => new Matrix4().makePerspective(-0.25, 0.5, 0.3, -0.35, 0.2, 40);
// Independent column-major scalar reference, rather than the production Matrix4 method.
const multiply = (a, b) => Array.from({length: 16}, (_, k) => {
    const row = k % 4, col = Math.floor(k / 4);
    return [0, 1, 2, 3].reduce((sum, i) => sum + a[i * 4 + row] * b[col * 4 + i], 0);
});
const transform = (m, p) => [0, 1, 2, 3].map(row => p.reduce((sum, v, i) => sum + m[i * 4 + row] * v, 0));
const near = (a, b) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) <= 1e-10 * Math.max(1, Math.abs(b[i])), `${i}: ${v} vs ${b[i]}`));
const draw = (object, camera, modelView) => {
    object.modelViewMatrix.copy(modelView); // the renderer refreshes this before the material callback
    object.material.onBeforeRender(null, null, camera, object.geometry, object, null);
    return object.material.uniforms.clipFromModel.value;
};
const discard = (m, c0, c1) => {
    const project = p => { const v = transform(m, [...p, 1]); return [v[0] / v[3], v[1] / v[3]]; };
    const a = project([0, 0, 0]), b = project([1, 0, 0]);
    const normal = [a[1] - b[1], b[0] - a[0]];
    const side = p => { const q = project(p); return normal[0] * (q[0] - a[0]) + normal[1] * (q[1] - a[1]); };
    return side(c0) * side(c1) < 0;
};

test('line uniforms use current noncommuting projection and model-view in the material draw callback', () => {
    const f = fixture(), camera = {projectionMatrix: projection()}, mv = pose(0.3, -0.4, -6);
    for (const object of [...f.regular, ...f.conditional]) {
        const actual = draw(object, camera, mv).elements;
        near(actual, multiply(camera.projectionMatrix.elements, mv.elements));
        assert.ok(actual.some((v, i) => Math.abs(v - multiply(mv.elements, camera.projectionMatrix.elements)[i]) > 0.001));
        assert.equal(object.material.uniformsNeedUpdate, true);
    }
    f.parts.dispose();
});

test('successive objects sharing a line material get their own fresh transform and uniform upload', () => {
    const f = fixture(), camera = {projectionMatrix: projection()};
    for (const objects of [f.regular, f.conditional]) {
        assert.equal(objects.length, 2);
        assert.equal(objects[0].material, objects[1].material);
        const storage = draw(objects[0], camera, pose(0, 0, -5));
        const previous = storage.elements.slice();
        objects[0].material.uniformsNeedUpdate = false; // reset by Three after the previous upload
        assert.equal(draw(objects[1], camera, pose(1.7, 0.2, -8, 0.7)), storage);
        near(storage.elements, multiply(camera.projectionMatrix.elements, objects[1].modelViewMatrix.elements));
        assert.notDeepEqual(storage.elements, previous);
        assert.equal(objects[1].material.uniformsNeedUpdate, true);
    }
    f.parts.dispose();
});

test('camera changes and an unchanged repeated draw refresh uniforms without changing instance buffers', () => {
    const f = fixture(), object = f.regular[0], mv = pose(0.1, 0.7, -4);
    const attributes = ['iMatrix', 'iTint', 'position', 'color'].map(name => object.geometry.getAttribute(name));
    const before = attributes.map(a => ({bytes: Buffer.from(a.array.buffer).toString('hex'), version: a.version}));
    const camera = {projectionMatrix: projection()};
    const storage = draw(object, camera, mv), previous = storage.elements.slice();
    camera.projectionMatrix = new Matrix4().makePerspective(-0.4, 0.35, 0.2, -0.5, 0.3, 60);
    object.material.uniformsNeedUpdate = false;
    assert.equal(draw(object, camera, mv), storage);
    assert.notDeepEqual(storage.elements, previous);
    const current = storage.elements.slice();
    object.material.uniformsNeedUpdate = false;
    draw(object, camera, mv);
    assert.deepEqual(storage.elements, current);
    assert.equal(object.material.uniformsNeedUpdate, true);
    attributes.forEach((a, i) => {
        assert.equal(Buffer.from(a.array.buffer).toString('hex'), before[i].bytes);
        assert.equal(a.version, before[i].version);
    });
    f.parts.dispose();
});

test('regular line shader preserves instance projection with the per-draw matrix', () => {
    const f = fixture(), object = f.regular[0], camera = {projectionMatrix: projection()}, mv = pose(0.5, -0.7, -7);
    assert.match(object.material.vertexShader, /uniform mat4 clipFromModel/);
    assert.match(object.material.vertexShader, /gl_Position\s*=\s*clipFromModel\s*\*\s*\(iMatrix\s*\*\s*vec4\(position, 1\.0\)\)/);
    const instance = Array.from(object.geometry.getAttribute('iMatrix').array.slice(0, 16));
    const actual = draw(object, camera, mv).elements;
    const oldMvp = multiply(multiply(camera.projectionMatrix.elements, mv.elements), instance);
    for (const point of [[0, 0, 0, 1], [1.3, -0.4, 0.2, 1], [-0.7, 0.9, -0.1, 1]]) {
        near(transform(actual, transform(instance, point)), transform(oldMvp, point));
    }
    f.parts.dispose();
});

test('conditional lines retain the four-point perspective projection and visible/hidden edge rule', () => {
    const f = fixture(), object = f.conditional[0], camera = {projectionMatrix: projection()}, mv = pose(0.5, 0.2, -7);
    const shader = object.material.vertexShader;
    assert.match(shader, /mat4 mvp\s*=\s*clipFromModel\s*\*\s*iMatrix/);
    for (const term of ['control0', 'control1', 'position', 'position + direction']) assert.ok(shader.includes(`mvp * vec4(${term}, 1.0)`));
    assert.match(shader, /vDiscard\s*=\s*d0 \* d1 < 0\.0 \? 1\.0 : 0\.0/);
    const instance = Array.from(object.geometry.getAttribute('iMatrix').array.slice(0, 16));
    const actual = multiply(draw(object, camera, mv).elements, instance);
    const oldMvp = multiply(multiply(camera.projectionMatrix.elements, mv.elements), instance);
    for (const [c0, c1, hidden] of [[[0, 1, 0], [0, -1, 0], true], [[0, 1, 0], [0, 2, 0], false]]) {
        assert.equal(discard(oldMvp, c0, c1), hidden);
        assert.equal(discard(actual, c0, c1), hidden);
        near(transform(actual, [...c0, 1]), transform(oldMvp, [...c0, 1]));
    }
    f.parts.dispose();
});
