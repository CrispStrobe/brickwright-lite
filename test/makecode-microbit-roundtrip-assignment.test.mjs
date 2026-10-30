import test from 'node:test';
import assert from 'node:assert/strict';
import {importProjectFiles} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';
import {exportToMakeCode} from '../overlay/scratch-gui/src/lib/bw-makecode/export.js';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';

const count = (creator, opcode) => creator.project.targets.reduce((sum, target) =>
    sum + Object.values(target.blocks || {}).filter(block => block?.opcode === opcode).length, 0);

function roundTrip (main) {
    const files = {'main.ts': main, 'pxt.json': JSON.stringify({name: 'rt', dependencies: {core: '*'}, files: ['main.ts']})};
    const first = new SB3Creator();
    first.parse(importProjectFiles(files, {target: 'microbit', name: 'rt'}).code);
    const exported = exportToMakeCode(first.project, {name: 'roundtrip'});
    const second = new SB3Creator();
    second.parse(importProjectFiles(exported.files, {target: 'microbit', name: 'roundtrip'}).code);
    return {first, second, ts: exported.files['main.ts']};
}

test('an authored assignment that repeats the declaration value is not folded away', () => {
    const {first, second, ts} = roundTrip('let item = 0;\nitem = 0;\nbasic.showNumber(item + 1);\n');
    assert.equal(count(first, 'data_setvariableto'), 2);
    assert.equal(count(second, 'data_setvariableto'), 2, ts);
});

test('the importer\'s own leading assignment still folds into the declaration', () => {
    const {first, second, ts} = roundTrip('let item = 5;\nbasic.showNumber(item + 1);\n');
    assert.equal(count(first, 'data_setvariableto'), 1);
    assert.equal(count(second, 'data_setvariableto'), 1);
    assert.match(ts, /let item = 5\n/);
    assert.doesNotMatch(ts, /\nitem = 5/);
});
