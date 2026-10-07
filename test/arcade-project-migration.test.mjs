import test from 'node:test';
import assert from 'node:assert/strict';
import install from '../overlay/scratch-gui/src/lib/arcade-project-migration.js';

const legacy = (opcode, slot, value) => ({opcode, fields: {}, inputs: {[slot]: [1, [10, value]]}});
const projectOf = blocks => ({targets: [{name: 'Game', blocks}]});

test('old saved menu values reach deserialization in native shape, with the same archive', async () => {
    const blocks = {
        multiply: legacy('arrays_valueBinary', 'OP', '*'),
        negate: legacy('arrays_valueUnary', 'OP', '-'),
        compare: legacy('arrays_valueCompare', 'OP', '>='),
        empty: legacy('arrays_specialValue', 'KIND', 'null'),
        axis: {opcode: 'arcade_controllerStep', fields: {AXIS: ['y', null]}, inputs: {STEP: [1, [4, 10]]}}
    };
    const zip = {}, project = projectOf(blocks), calls = [];
    const vm = {deserializeProject: async (input, archive) => { calls.push([input, archive]); return 'loaded'; }};
    assert.equal(install(vm), true);
    assert.equal(install(vm), false);
    assert.equal(await vm.deserializeProject(project, zip), 'loaded');
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], project);
    assert.equal(calls[0][1], zip);
    for (const [id, slot, value] of [['multiply', 'OP', '*'], ['negate', 'OP', '-'],
        ['compare', 'OP', '>='], ['empty', 'KIND', 'null']]) {
        assert.deepEqual(blocks[id].fields[slot], [value, null]);
        assert.equal(blocks[id].inputs[slot], undefined);
    }
    assert.deepEqual(blocks.axis.inputs.AXIS, [1, [10, 'y']]);
    assert.equal(blocks.axis.fields.AXIS, undefined);
    const once = structuredClone(project);
    await vm.deserializeProject(project, zip);
    assert.deepEqual(project, once, 'a second load must preserve the already native values');
});

test('actual native selections take precedence over obsolete saved slots', async () => {
    const value = legacy('arrays_valueBinary', 'OP', '*');
    value.fields.OP = ['/', null];
    const axis = {opcode: 'arcade_controllerStep', fields: {AXIS: ['y', null]}, inputs: {AXIS: [1, [10, 'x']]}};
    const vm = {deserializeProject: async project => project};
    install(vm);
    await vm.deserializeProject(projectOf({value, axis}));
    assert.deepEqual(value.fields.OP, ['/', null]);
    assert.equal(value.inputs.OP, undefined);
    assert.deepEqual(axis.inputs.AXIS, [1, [10, 'x']]);
    assert.equal(axis.fields.AXIS, undefined);
});

for (const input of [[1, [10, 'not-an-operator']], [3, 'computedOperator', [10, '+']]]) {
    test(`unrepresentable saved operator is named before the project can be replaced: ${JSON.stringify(input)}`, async () => {
        let loaded = false;
        const block = {opcode: 'arrays_valueBinary', inputs: {OP: input}, fields: {}};
        const vm = {deserializeProject: async () => { loaded = true; }};
        install(vm);
        await assert.rejects(vm.deserializeProject(projectOf({broken: block})),
            /Cannot preserve arrays_valueBinary\.OP in Game, block broken/);
        assert.equal(loaded, false);
        assert.deepEqual(block.inputs.OP, input, 'do not guess a replacement');
    });
}

test('unrelated projects retain original synchronous return and failures', () => {
    const error = new Error('original load failed');
    const project = projectOf({motion: {opcode: 'motion_movesteps', inputs: {STEPS: [1, [4, 10]]}}});
    const vm = {deserializeProject: () => { throw error; }};
    install(vm);
    assert.throws(() => vm.deserializeProject(project), actual => actual === error);
    assert.equal(install(null), false);
    assert.equal(install({}), false);
});
