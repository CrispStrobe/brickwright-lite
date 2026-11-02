import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';

// A closed parameterless getter that only returns a global yields that global
// at its call. The receiver is an initialized Array only when the global's
// writer definitely precedes THAT call; original PXT faults otherwise.
const exported = source => {
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, [], source);
    const creator = new Creator(); creator.parse(imported.code);
    return projectToArcade(creator.project, {}).unsupported;
};

test('a getter call after the global Array writer is an initialized receiver', () => {
    assert.deepEqual(exported('function read(){return numbers}let early=read()===undefined;let numbers=[1,2];let alias=read();alias[0]=7;let value=numbers[0];early=!!early;'), []);
});

test('a getter call before the writer, a writing getter or a later reset keeps the refusal', () => {
    for (const source of [
        'function read(){return numbers}let alias=read();let numbers=[1,2];alias[0]=7;let value=numbers[0];',
        'function read(){numbers=null;return numbers}let numbers=[1,2];let alias=read();alias[0]=7;let value=numbers[0];',
        'function read(){return numbers}let numbers=[1,2];numbers=null;let alias=read();alias[0]=7;',
        'function read(n:number){return numbers}let numbers=[1,2];numbers=null;let alias=read(1);alias[0]=7;']) {
        assert.ok(exported(source).some(row => /Array reference/.test(row)), source);
    }
});
