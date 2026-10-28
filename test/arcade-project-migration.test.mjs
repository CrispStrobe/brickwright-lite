import test from 'node:test';
import assert from 'node:assert/strict';
import install from '../overlay/scratch-gui/src/lib/arcade-project-migration.js';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {ARCADE_WORDS, compileArcadeWord} from '../overlay/scratch-gui/src/lib/arcadeDialect.js';

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

for (const opcode of ['arcade_settingsWrite', 'arcade_settingsRead']) {
    test(`${opcode} retains its legacy StringArray type and referenced values before native loading`, async () => {
        const menuName = opcode === 'arcade_settingsWrite' ? 'settingWriteTypes' : 'settingReadTypes';
        const block = {opcode, fields: {}, inputs: {TYPE: [1, 'menu'], VALUE: [3, 'items', [10, '']]}};
        const items = {opcode: 'data_variable', fields: {VARIABLE: ['items', 'actual-id']}, inputs: {}};
        const blocks = {setting: block, items, menu: {opcode: `arcade_menu_${menuName}`,
            fields: {[menuName]: ['StringArray', null]}, inputs: {}, parent: 'setting', shadow: true, topLevel: false}};
        const project = projectOf(blocks), zip = {}, calls = [];
        const vm = {deserializeProject: async (...args) => { calls.push(args); return 'loaded'; }};
        install(vm);
        assert.equal(await vm.deserializeProject(project, zip), 'loaded');
        assert.deepEqual(block.fields.TYPE, ['StringArray', null]);
        assert.equal(block.inputs.TYPE, undefined);
        assert.equal(blocks.menu, undefined);
        assert.equal(blocks.items, items);
        assert.deepEqual(block.inputs.VALUE, [3, 'items', [10, '']]);
        assert.equal(calls[0][0], project); assert.equal(calls[0][1], zip);
    });
}

for (const input of [[3, 'computed', 'menu'], [1, [10, 'Unknown']], [1, 'missing']]) {
    test(`invalid legacy Settings type is named before replacing the open project: ${JSON.stringify(input)}`, async () => {
        let loaded = false;
        const block = {opcode: 'arcade_settingsWrite', fields: {}, inputs: {TYPE: input}};
        const vm = {deserializeProject: async () => { loaded = true; }};
        install(vm);
        await assert.rejects(vm.deserializeProject(projectOf({setting: block})),
            /Cannot preserve arcade_settingsWrite\.TYPE in Game, block setting/);
        assert.equal(loaded, false);
        assert.deepEqual(block.inputs.TYPE, input);
        assert.equal(block.fields.TYPE, undefined);
    });
}

test('native Settings types remain unchanged without invoking a Number fallback', async () => {
    const block = {opcode: 'arcade_settingsRead', fields: {TYPE: ['Buffer', null]}, inputs: {KEY: [1, [10, 'bytes']]}};
    const project = projectOf({setting: block}), before = structuredClone(project);
    const vm = {deserializeProject: async value => value};
    install(vm);
    assert.equal(await vm.deserializeProject(project), project);
    assert.deepEqual(project, before);
});

test('Settings compiler field shapes match the actual native non-reporter menus', () => {
    const Arcade = loadExtensionClass('arcade');
    const info = new Arcade({on () {}, emit () {}}).getInfo();
    for (const opcode of ['settingsRead', 'settingsWrite']) {
        const native = info.blocks.find(block => block.opcode === opcode);
        const menu = info.menus[native.arguments.TYPE.menu];
        assert.equal(menu.acceptReporters, false);
        const canonical = ARCADE_WORDS.find(word => word.op === `arcade_${opcode}`);
        const slot = compileArcadeWord(canonical).parts.find(part => part.slot === 'TYPE');
        assert.equal(slot.field, true);
        assert.deepEqual(slot.choices, menu.items);
    }
});
