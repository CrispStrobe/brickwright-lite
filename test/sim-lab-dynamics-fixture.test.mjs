// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalogFrom, prepareModel} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';
import {forkliftDiagnosticTargets} from '../scripts/lib/sim-lab-measurement-dynamics-gate.mjs';

// Compile authored structure only: no physics world, controller or browser.
const catalog = catalogFrom(JSON.parse(readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-sim/part-meta/parts.json', import.meta.url), 'utf8')));
const prepared = prepareModel(readFileSync(new URL('../overlay/scratch-gui/static/sim-lab/models/forklift.ldr', import.meta.url), 'utf8'), catalog, {mat: 'plain', autoPorts: false});
const fixture = () => ({joints: structuredClone(prepared.mechanism.joints), bodies: structuredClone(prepared.mechanism.bodies),
    partIds: (prepared.runModel || prepared.model).parts.map(part => part.id)});

test('the actual Forklift diagnostic fixture resolves motor C and distinct authored chassis/fork bodies', () => {
    assert.equal(prepared.issues.filter(issue => issue.severity === 'error').length, 0);
    const input = fixture(), targets = forkliftDiagnosticTargets(input);
    assert.ok(targets);
    assert.deepEqual(targets.parts, ['hub', 'forkArm']);
    assert.equal(targets.hinge, input.joints.find(joint => joint.motor?.port === 'C').id);
});

test('wrong or duplicate motor ports cannot silently select another Forklift hinge', () => {
    const wrong = fixture();
    wrong.joints.find(joint => joint.motor?.port === 'C').motor.port = 'A';
    assert.equal(forkliftDiagnosticTargets(wrong), null);
    const duplicate = fixture();
    duplicate.joints.push({...duplicate.joints.find(joint => joint.motor?.port === 'C'), id: 'ambiguous'});
    assert.equal(forkliftDiagnosticTargets(duplicate), null);
});

test('missing or multiply owned contact parts refuse the diagnostic fixture', () => {
    const missing = fixture(); missing.partIds = missing.partIds.filter(id => id !== 'forkArm');
    assert.equal(forkliftDiagnosticTargets(missing), null);
    const ambiguous = fixture(); ambiguous.bodies.push({id: 'ambiguous', parts: ['hub']});
    assert.equal(forkliftDiagnosticTargets(ambiguous), null);
});
