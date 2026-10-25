// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalogFrom, prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {teachingMeasurementPreset} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/teaching-presets.js';
import {createMeasurementReader} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/readings.js';

const catalog = catalogFrom(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', import.meta.url))));
const prepared = name => prepareModel(readFileSync(new URL(`../overlay/scratch-gui/static/sim-lab/models/${name}.ldr`, import.meta.url), 'utf8'), catalog);
const families = [
    ['gearbox', ['jointAngle', 'jointAngle', 'jointSpeed']],
    ['sky-courier', ['tension', 'tension', 'weight']],
    ['snapgate', ['jointAngle', 'jointAngle', 'travel']],
    ['pneumatic-press', ['jointAngle', 'travel', 'pressure']]
];

for (const [name, kinds] of families) test(`${name}: authored selectors resolve bound lesson readings and bilingual help`, () => {
    const s = prepared(name), before = JSON.stringify(s), p = teachingMeasurementPreset(s, `${name}.ldr`);
    assert.deepEqual(p.definitions.map(d => d.kind), kinds);
    assert.ok(p.help?.length > 20);
    assert.notEqual(teachingMeasurementPreset(s, `${name}.ldr`, 'de').help, p.help);
    assert.equal(JSON.stringify(s), before, 'preset resolution is observational');
    assert.ok(p.definitions.every(d => d.binding || d.targets));
    assert.equal(teachingMeasurementPreset(s, 'other.ldr'), null);
    s.runModel.parts[0].id = 'changed';
    assert.equal(teachingMeasurementPreset(s, `${name}.ldr`), null, 'authored part fingerprint guards the lesson');
});

test('gearbox refuses wrong drive role and duplicate output hinge', () => {
    const s = prepared('gearbox'), name = 'gearbox.ldr';
    const p = teachingMeasurementPreset(s, name), input = s.mechanism.joints.find(j => j.id === p.definitions[0].joint);
    input.motor.port = 'C'; assert.equal(teachingMeasurementPreset(s, name), null);
    input.motor.port = 'A';
    const output = s.mechanism.joints.find(j => j.id === p.definitions[1].joint);
    s.mechanism.joints.push({...output, id: 'duplicate'});
    assert.equal(teachingMeasurementPreset(s, name), null);
});

test('Sky Courier rope identity and drum role must remain unique', () => {
    const s = prepared('sky-courier'), name = 'sky-courier.ldr';
    const rope = s.mechanism.couplings.find(c => c.kind === 'rope');
    rope.parts = rope.parts.slice().reverse();
    assert.equal(teachingMeasurementPreset(s, name), null);
    rope.parts.reverse();
    rope.drumJoint = 'missing';
    assert.equal(teachingMeasurementPreset(s, name), null);
});

test('Snapgate requires a real spring slider', () => {
    const s = prepared('snapgate'), name = 'snapgate.ldr';
    const spring = s.mechanism.joints.find(j => j.spring);
    spring.spring = null;
    assert.equal(teachingMeasurementPreset(s, name), null);
});

test('pneumatic lesson pressure target follows its connected network, not a generated coupling index', () => {
    const s = prepared('pneumatic-press'), name = 'pneumatic-press.ldr';
    const p = teachingMeasurementPreset(s, name);
    assert.deepEqual(p.definitions[2].targets, ['cylinder']);
    const fakeCore = {bodyPose: () => ({position: [0, 0, 0], rotation: [0, 0, 0, 1]}),
        jointState: () => ({angle: 0, velocity: 0, position: 0}),
        airState: () => [{id: 'decoy', kPa: 900}, {id: s.mechanism.couplings.find(c => c.kind === 'pneumatic').network.id, kPa: 123}]};
    assert.equal(createMeasurementReader({...s, core: fakeCore}).read(p.definitions)[2].value, 123);
    s.mechanism.couplings.find(c => c.kind === 'pneumatic').network = null;
    assert.equal(teachingMeasurementPreset(s, name), null);
});
