import test from 'node:test';
import assert from 'node:assert/strict';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';

const program = () => {
    const creator = new SB3Creator();
    creator.parse('DEVICE ARCADE\nSPRITE Game:\nWHEN flag clicked:\n  arcade write setting ("key") type String value ("text")\n  set [result] to (arcade read setting ("key") type String)');
    assert.deepEqual(creator.warnings, []);
    return creator.project;
};

for (const shape of ['native field', 'old inline literal', 'old menu shadow']) {
    test(`Settings ${shape} exports its String type without a numeric replacement`, () => {
        const project = program();
        const target = project.targets.find(target => target.name === 'Game');
        for (const [id, block] of Object.entries(target.blocks)) {
            if (!['arcade_settingsRead', 'arcade_settingsWrite'].includes(block.opcode) || shape === 'native field') continue;
            delete block.fields.TYPE;
            if (shape === 'old inline literal') block.inputs.TYPE = [1, [10, 'String']];
            else {
                const name = block.opcode === 'arcade_settingsWrite' ? 'settingWriteTypes' : 'settingReadTypes';
                const shadow = `${id}-legacy`;
                block.inputs.TYPE = [1, shadow];
                target.blocks[shadow] = {opcode: `arcade_menu_${name}`, fields: {[name]: ['String', null]},
                    inputs: {}, shadow: true, topLevel: false, parent: id};
            }
        }
        const result = projectToArcade(project);
        assert.deepEqual(result.unsupported, []);
        assert.match(result.ts, /settings\.writeString\("key", "text"\)/);
        assert.match(result.ts, /settings\.readString\("key"\)/);
        assert.doesNotMatch(result.ts, /settings\.(?:write|read)Number\(/);
    });
}

test('a computed historical Settings type with a valid fallback is refused by export', () => {
    const project = program();
    const target = project.targets.find(target => target.name === 'Game');
    const block = Object.values(target.blocks).find(block => block.opcode === 'arcade_settingsWrite');
    delete block.fields.TYPE;
    block.inputs.TYPE = [3, 'computed', [10, 'String']];
    target.blocks.computed = {opcode: 'data_variable', fields: {VARIABLE: ['computed', 'type-id']}, inputs: {}};
    const result = projectToArcade(project);
    assert.ok(result.unsupported.includes('Settings requires a fixed supported write type'));
    assert.doesNotMatch(result.ts, /settings\.write(?:Number|String)\(/);
});
