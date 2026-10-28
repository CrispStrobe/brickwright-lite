import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const Thread = require('../packages/scratch-gui/node_modules/scratch-vm/src/engine/thread.js');
const make = (stack, managed) => {
    const thread = new Thread(stack[0]);
    thread.stack = stack;
    thread.target = {blocks: {getBlock: id => ({
        ordinary: {opcode: 'procedures_call', mutation: {proccode: 'ordinary'}},
        body: {opcode: 'control_repeat'}, current: {opcode: 'procedures_call'}
    })[id]}};
    if (managed) thread.bwFunctionNames = new Set(managed);
    return thread;
};
test('real Scratch procedure recursion remains visible inside a managed Arcade invocation', () => {
    const thread = make([null, 'ordinary', 'body', 'current'], ['managed']);
    assert.equal(thread.isRecursiveCall('managed'), true);
    assert.equal(thread.isRecursiveCall('ordinary'), true);
    assert.equal(thread.isRecursiveCall('different'), false);
    assert.equal(make(['ordinary', 'body', 'current']).isRecursiveCall('ordinary'), true);
});
test('only the owned managed root may lack an executable block', () => {
    assert.equal(make([null, 'body', 'current'], ['managed']).isRecursiveCall('different'), false);
    assert.throws(() => make([null, 'body', 'current']).isRecursiveCall('different'), TypeError);
    assert.throws(() => make(['missing', 'body', 'current'], ['managed']).isRecursiveCall('different'), TypeError);
    assert.throws(() => make([null, null, 'current'], ['managed']).isRecursiveCall('different'), TypeError);
});
