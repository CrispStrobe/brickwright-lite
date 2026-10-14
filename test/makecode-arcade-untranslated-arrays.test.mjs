/** Legacy tile queries return real array references, including empty scenes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram} from './helpers/bw-vm.mjs';

test('a legacy tile query on an empty scene returns an empty array without a runtime failure', async () => {
    const imported = arcadeToPseudocode([
        'let count = 0',
        'let player = sprites.create(img`1`, SpriteKind.Player)',
        'for (let value of scene.getTilesByType(4)) {',
        '    value.place(player)',
        '    count += 1',
        '}',
        'count += 10'
    ].join('\n'));
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /arcade color tile array index/);
    const run = await runProgram(imported.code, {frames: 6, uploads: imported.costumes, storage: true});
    assert.deepEqual(run.errors, []);
    const values = new Map(run.vm.runtime.targets.flatMap(t => Object.values(t.variables || {}).map(v => [v.name, v.value])));
    assert.equal(Number(values.get('count')), 10, 'the loop body ran, or the code after it did not');
});
