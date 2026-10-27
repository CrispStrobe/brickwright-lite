// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {roleMeasurementPacks} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/role-presets.js';
import {sha256Text} from '../overlay/scratch-gui/src/lib/bw-sim/measurements/binding-digest.js';

const expectedJointBinding = (mechanism, joint) => `sha256:${sha256Text(JSON.stringify([joint.type, ...[joint.body1, joint.body2].map(id =>
    mechanism.bodies.find(body => body.id === id)?.parts?.slice().sort() || [id])]))}`;
const expectedRopeBinding = rope => `sha256:${sha256Text(JSON.stringify(rope.parts || []))}`;

const makeSession = ({joints, couplings = [], parts, bodies} = {}) => ({
    model: {parts: (parts || ['groundPart', 'motorPart', 'motorBPart', 'sliderPart', 'springPart', 'ropeLeft', 'ropeRight', 'airPart']).map(id => ({id}))},
    mechanism: {
        joints: joints || [
            {id: 'hinge-A', type: 'hinge', body1: 'ground', body2: 'motor', motor: {port: 'A'}},
            {id: 'hinge-B', type: 'hinge', body1: 'ground', body2: 'motorB', motor: {port: 'B'}},
            {id: 'slider-plain', type: 'slider', body1: 'ground', body2: 'slider'},
            {id: 'slider-spring', type: 'slider', body1: 'ground', body2: 'spring', spring: {stiffness: 1}}
        ],
        bodies: bodies || [
            {id: 'ground', parts: ['groundPart']}, {id: 'motor', parts: ['motorPart']},
            {id: 'motorB', parts: ['motorBPart']}, {id: 'slider', parts: ['sliderPart']},
            {id: 'spring', parts: ['springPart']}, {id: 'rope-left', parts: ['ropeLeft']},
            {id: 'rope-right', parts: ['ropeRight']}, {id: 'air-body', parts: ['airPart']}
        ],
        couplings: couplings.length ? couplings : [
            {id: 'rope-1', kind: 'rope', parts: ['ropeLeft', 'ropeRight']},
            {id: 'air-1', kind: 'pneumatic', parts: ['airPart'], network: {id: 'network-1'}}
        ]
    }
});

const byTitle = (packs, fragment) => packs.find(pack => pack.title.includes(fragment));

test('creates bounded typed packs with current binding identities and explicit structural labels', () => {
    const session = makeSession();
    const packs = roleMeasurementPacks(session);
    assert.ok(packs.length <= 256);
    assert.deepEqual(packs.map(pack => pack.id), packs.map(pack => pack.id).slice().sort());
    assert.ok(packs.every(pack => pack.definitions.length > 0 && pack.definitions.length <= 4));

    const motor = byTitle(packs, 'Motor A');
    assert.ok(motor);
    assert.deepEqual(motor.definitions.map(definition => definition.kind), ['jointAngle', 'jointSpeed', 'motorTorque', 'motorPower']);
    assert.ok(motor.definitions.every(definition => definition.joint === 'hinge-A' &&
        definition.binding === expectedJointBinding(session.mechanism, session.mechanism.joints[0])));

    const slider = byTitle(packs, 'Slider readings: groundPart / sliderPart');
    assert.ok(slider);
    assert.deepEqual(slider.definitions.map(definition => definition.kind), ['travel', 'limitForce']);
    assert.equal(slider.definitions[0].binding, expectedJointBinding(session.mechanism, session.mechanism.joints[2]));
    const spring = byTitle(packs, 'Spring-slider travel');
    assert.deepEqual(spring.definitions.map(definition => definition.kind), ['travel']);
    assert.equal(spring.definitions[0].binding, expectedJointBinding(session.mechanism, session.mechanism.joints[3]));

    const rope = byTitle(packs, 'Rope tension');
    assert.equal(rope.definitions[0].kind, 'tension');
    assert.equal(rope.definitions[0].binding, expectedRopeBinding(session.mechanism.couplings[0]));
    const pressure = byTitle(packs, 'Network pressure');
    assert.deepEqual(pressure.definitions[0].targets, ['airPart']);
});

test('motor slider gets only its typed drive readings; the pack still has at most four definitions', () => {
    const session = makeSession();
    session.mechanism.joints[2].motor = {port: 'D'};
    const pack = byTitle(roleMeasurementPacks(session), 'Slider readings: groundPart / sliderPart');
    assert.deepEqual(pack.definitions.map(definition => definition.kind), ['travel', 'motorForce', 'sliderPower', 'limitForce']);
});

test('a compiled motor may share its authored part across stator and rotor endpoints', () => {
    const session = makeSession({parts: ['base', 'motor', 'shaft'],
        bodies: [{id: 'stator', parts: ['base', 'motor']}, {id: 'rotor', parts: ['motor', 'shaft']}],
        joints: [{id: 'drive', type: 'hinge', body1: 'stator', body2: 'rotor', motor: {port: 'A'}}]});
    const pack = byTitle(roleMeasurementPacks(session), 'Motor A');
    assert.ok(pack, 'joint selection resolves the constraint, not one body for the authored motor part');
    assert.ok(pack.definitions.every(d => d.joint === 'drive' &&
        d.binding === expectedJointBinding(session.mechanism, session.mechanism.joints[0])));
    session.mechanism.joints.push({...session.mechanism.joints[0], id: 'duplicate', motor: {port: 'B'}});
    assert.deepEqual(roleMeasurementPacks(session), [], 'shared membership cannot excuse duplicate semantic joint bindings');
});

test('passive hinges expose their own bounded kinematics and effort without inventing a motor', () => {
    const session = makeSession({parts: ['base', 'link'],
        bodies: [{id: 'base', parts: ['base']}, {id: 'link', parts: ['link']}],
        joints: [{id: 'pivot', type: 'hinge', body1: 'base', body2: 'link'}]});
    const packs = roleMeasurementPacks(session), pack = byTitle(packs, 'Passive hinge');
    assert.equal(packs.length, 1);
    assert.deepEqual(pack.definitions.map(d => d.kind), ['jointAngle', 'jointSpeed', 'passiveTorque', 'limitTorque']);
    assert.ok(pack.definitions.every(d => d.joint === 'pivot' &&
        d.binding === expectedJointBinding(session.mechanism, session.mechanism.joints[0])));
    assert.equal(byTitle(roleMeasurementPacks(session, 'de'), 'Passives Drehgelenk').id, pack.id);
    session.mechanism.bodies.push({id: 'link', parts: ['link']});
    assert.deepEqual(roleMeasurementPacks(session), [], 'duplicate endpoint records remain ambiguous');
});

test('duplicate motor ports refuse only that port pack; they never choose the first hinge', () => {
    const session = makeSession();
    session.mechanism.joints.push({id: 'hinge-A-duplicate', type: 'hinge', body1: 'unknown', body2: 'slider', motor: {port: 'A'}});
    const packs = roleMeasurementPacks(session);
    assert.equal(byTitle(packs, 'Motor A'), undefined);
    assert.ok(byTitle(packs, 'Motor B'));
});

test('duplicate authored part ids refuse all packs instead of collapsing through a Set', () => {
    const session = makeSession({parts: ['groundPart', 'groundPart', 'motorPart', 'motorBPart', 'sliderPart', 'springPart', 'ropeLeft', 'ropeRight', 'airPart']});
    assert.deepEqual(roleMeasurementPacks(session), []);
});

test('duplicate bound joint identities and missing authored membership are refused', () => {
    const duplicate = makeSession();
    duplicate.mechanism.joints.push({id: 'hinge-A-copy', type: 'hinge', body1: 'ground', body2: 'motor', motor: {port: 'C'}});
    const duplicatePacks = roleMeasurementPacks(duplicate);
    assert.equal(byTitle(duplicatePacks, 'Motor A'), undefined);
    assert.equal(byTitle(duplicatePacks, 'Motor C'), undefined);

    const duplicateId = makeSession();
    duplicateId.mechanism.joints.push({id: 'hinge-A', type: 'hinge', body1: 'ground', body2: 'slider', motor: {port: 'C'}});
    const duplicateIdPacks = roleMeasurementPacks(duplicateId);
    assert.equal(byTitle(duplicateIdPacks, 'Motor A'), undefined);
    assert.equal(byTitle(duplicateIdPacks, 'Motor C'), undefined);

    const missing = makeSession({bodies: [{id: 'ground', parts: ['groundPart']}, {id: 'motor', parts: ['not-in-model']}]});
    assert.equal(roleMeasurementPacks(missing).filter(pack => /Motor|Slider/.test(pack.title)).length, 0);
});

test('ambiguous rope IDs, rope memberships, and pneumatic targets refuse their pack', () => {
    const base = makeSession();
    base.mechanism.couplings.push({id: 'rope-1', kind: 'rope', parts: ['ropeLeft', 'ropeRight', 'airPart']});
    assert.equal(byTitle(roleMeasurementPacks(base), 'Rope tension'), undefined);

    const sameParts = makeSession({couplings: [
        {id: 'rope-1', kind: 'rope', parts: ['ropeLeft', 'ropeRight']},
        {id: 'rope-2', kind: 'rope', parts: ['ropeRight', 'ropeLeft']}
    ]});
    assert.equal(byTitle(roleMeasurementPacks(sameParts), 'Rope tension'), undefined);

    const ambiguousPressure = makeSession({couplings: [
        {id: 'air-1', kind: 'pump', parts: ['airPart', 'sliderPart'], network: {id: 'network-1'}}
    ]});
    const pressureChoices = roleMeasurementPacks(ambiguousPressure).filter(pack => pack.title.includes('Network pressure'));
    assert.deepEqual(pressureChoices.map(pack => pack.definitions[0].targets[0]), ['airPart', 'sliderPart']);

    const sharedPressurePart = makeSession({couplings: [
        {id: 'air-1', kind: 'pump', parts: ['airPart'], network: {id: 'network-1'}},
        {id: 'air-2', kind: 'pneumatic', parts: ['airPart'], network: {id: 'network-2'}}
    ]});
    assert.equal(roleMeasurementPacks(sharedPressurePart).filter(pack => pack.title.includes('Network pressure')).length, 0);
});

test('refuses excessive output instead of silently truncating the role list', () => {
    const parts = [], bodies = [], couplings = [];
    for (let i = 0; i < 257; i++) {
        const left = `rope-${i}-left`, right = `rope-${i}-right`;
        parts.push(left, right);
        bodies.push({id: `body-${i}-left`, parts: [left]}, {id: `body-${i}-right`, parts: [right]});
        couplings.push({id: `rope-${i}`, kind: 'rope', parts: [left, right]});
    }
    const session = makeSession({parts, bodies, couplings, joints: []});
    assert.deepEqual(roleMeasurementPacks(session), []);
});

test('German labels are localized without changing selectors or bindings', () => {
    const session = makeSession();
    const en = roleMeasurementPacks(session, 'en');
    const de = roleMeasurementPacks(session, 'de');
    const enMotor = byTitle(en, 'Motor A');
    const deMotor = byTitle(de, 'Motor A');
    assert.ok(deMotor.title.includes('Messreihe'));
    assert.deepEqual(deMotor.definitions.map(definition => definition.id), enMotor.definitions.map(definition => definition.id));
    assert.deepEqual(deMotor.definitions.map(definition => definition.binding), enMotor.definitions.map(definition => definition.binding));
});


test('long authored membership labels keep valid slider packs and full binding identities', () => {
    const a='frame-'+ 'a'.repeat(100),b='rod-'+ 'b'.repeat(100);
    const session=makeSession({parts:[a,b],bodies:[{id:'frame',parts:[a]},{id:'rod',parts:[b]}],joints:[{id:'slide',type:'slider',body1:'frame',body2:'rod'}]});
    const packs=roleMeasurementPacks(session),slider=packs.find(p=>p.id.startsWith('role-slider-'));
    assert.ok(slider,'display length must not hide an unambiguous structural role');
    assert.ok(slider.title.length<=160&&slider.definitions.every(d=>d.label.length<=80));
    assert.ok(slider.definitions.every(d=>d.binding===expectedJointBinding(session.mechanism,session.mechanism.joints[0])));
    assert.ok(slider.definitions.every(d=>d.joint==='slide'));
});
