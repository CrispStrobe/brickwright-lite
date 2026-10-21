// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalogFrom, prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {compile} from '../overlay/scratch-gui/src/lib/bw-sim/mech/compile.js';
import {derivePart, insideCollider, colliderFit} from '../overlay/scratch-gui/src/lib/bw-sim/part-meta/derive.js';
import {flattenPart} from '../overlay/scratch-gui/src/lib/bw-sim/ldraw/ldraw-geometry.js';
import {loadJolt, createPhysicsCore} from '../overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js';

const root = new URL('../', import.meta.url);
const catalog = catalogFrom(JSON.parse(readFileSync(new URL('overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', root))));
const read = name => {
    try { return readFileSync(new URL('overlay/scratch-gui/static/ldraw/' + name.toLowerCase(), root), 'latin1'); }
    catch { return undefined; }
};
for (const part of ['18938.dat', '18939.dat', '99010.dat', '99009.dat']) {
    test(`${part}: derived collision surfaces enclose the mesh and preserve its central opening`, () => {
        const derived = derivePart(part, read), meta = catalog.get(part), flat = flattenPart(part, read);
        assert.deepEqual(derived.problems, []);
        assert.deepEqual(derived.meta.colliders, meta.colliders);
        assert.deepEqual(flat.missing, []);
        assert.ok(flat.polys.flat().every(v => meta.colliders.some(c => insideCollider(c, v, 0.03))), 'every official surface vertex stays enclosed');
        assert.ok(colliderFit(meta.colliders, flat.polys.flat()).ratio <= 1.1);
        assert.equal(meta.colliders.some(c => insideCollider(c, [0, 0, 0], 0)), false, 'the actual opening is empty');
    });
}

test('unsupported tooth contact still warns, while disjoint face planes do not', () => {
    const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    const pairs = z => compile({version: 1, parts: [
        {id: 'spur', part: '3648.dat', color: 0, position: [0, 0, 0], rotation: identity},
        {id: 'bevel', part: '6589.dat', color: 0, position: [45, 0, z], rotation: identity}
    ]}, catalog, {ground: false, version: 2});
    assert.ok(pairs(0).diagnostics.some(d => d.code === 'unsupported-gear'), 'nearby incompatible tooth forms still warn');
    assert.equal(pairs(30).diagnostics.some(d => d.code === 'unsupported-gear'), false, 'separated surfaces are not a tooth contact');
});

test('Counterturn retains its bevel coupling without warning about distant turntable teeth', () => {
    const text = readFileSync(new URL('test/fixtures/model-files/counterturn-source/counterturn.ldr', root), 'utf8');
    const p = prepareModel(text, catalog);
    assert.equal(p.mechanism.couplings.length, 1);
    assert.equal(p.mechanism.couplings[0].ratio, -0.6);
    assert.deepEqual(p.issues.filter(d => d.code !== 'gear-not-on-hinge'), []);
    assert.equal(p.issues.length, 8, 'the eight real ballast gears retain their declared notes');
});

for (const [part, ringX] of [['18938.dat', 74], ['18939.dat', 64]]) {
    for (const throughOpening of [true, false]) {
        test(`${part}: a shaft ${throughOpening ? 'clears the opening' : 'still contacts the surrounding ring'}`, async () => {
            const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
            const mechanism = compile({version: 1, parts: [
                {id: 'bearing', part, color: 0, position: [0, 0, 0], rotation: identity},
                {id: 'shaft', part: '3708.dat', color: 0, position: [throughOpening ? 0 : ringX, 0, 0], rotation: [0, 1, 0, 1, 0, 0, 0, 0, -1]}
            ]}, catalog, {ground: false, version: 2});
            const bearing = mechanism.bodies.find(b => b.parts.includes('bearing'));
            const shaft = mechanism.bodies.find(b => b.parts.includes('shaft'));
            assert.notEqual(bearing, shaft);
            // A fixed part is a diagnostic bench, not the delivered free-carrier model.
            bearing.motion = 'static'; bearing.massKg = 0;
            const core = createPhysicsCore(await loadJolt(), mechanism, {stepHz: 200, recordContacts: true});
            try {
                core.setBodyVelocity(shaft.id, [0, 0, 0], [0, 4, 0]);
                for (let i = 0; i < 20; i++) core.step(0.005);
                const key = [bearing.id, shaft.id].sort().join('|');
                const contacts = core.contactPairs().pairs[key] || 0;
                if (throughOpening) {
                    assert.equal(contacts, 0, 'a free shaft must not touch a filled-in central disc');
                    assert.ok(core.bodyAngularVelocity(shaft.id)[1] > 3.8, 'its spin remains free');
                    assert.ok(core.bodyPose(shaft.id).position[1] < -0.02, 'gravity carries it through the opening');
                } else assert.ok(contacts > 0, 'the real ring remains a physical obstacle');
            } finally { core.destroy(); }
        });
    }
}
