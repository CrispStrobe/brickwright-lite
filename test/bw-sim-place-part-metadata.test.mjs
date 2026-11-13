import test from 'node:test';
import assert from 'node:assert/strict';
import {placePart} from '../overlay/scratch-gui/src/lib/bw-sim/editor/snap.js';

const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];

test('placing a part retains and isolates the existing model data', () => {
    const model = {
        version: 2,
        parts: [{id: 'p1', part: 'old.dat', position: [0, 0, 0], rotation: identity.slice()}],
        groups: [{id: 'g1', name: 'assembly', parts: ['p1']}],
        steps: [['p1']],
        belts: [{id: 'b1', band: 'belt', around: ['p1', 'p2']}],
        hoses: [{id: 'h1', a: {part: 'p1'}, b: {part: 'p2'}}],
        files: {'submodel.ldr': 'contents'},
        metadata: {settings: ['retained']}
    };
    const original = structuredClone(model);
    const pose = [1, 2, 3];
    const placed = placePart(model, {id: 'p1', part: 'new.dat', position: pose, rotation: identity});
    assert.deepEqual(model, original);
    assert.deepEqual({...placed, parts: placed.parts.slice(0, 1)}, original);
    assert.equal(placed.parts[1].id, 'p2');
    placed.steps[0].push('p2');
    placed.belts[0].around.push('p3');
    placed.hoses[0].a.part = 'changed';
    placed.groups[0].parts.push('p2');
    placed.metadata.settings.push('changed');
    placed.parts[0].position[0] = 99;
    pose[0] = 99;
    assert.deepEqual(model, original);
    assert.deepEqual(placed.parts[1].position, [1, 2, 3]);
});
