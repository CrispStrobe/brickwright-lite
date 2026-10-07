/**
 * An array value the Arcade importer cannot translate is already a named gap.
 * What stands in for it must not then fail at run time: a `for … of` over
 * `scene.getTilesByType(4)` (no stage equivalent) iterated the placeholder 0
 * and raised "Array reference is null or expired" (task F7 of
 * docs/OPEN-TASKS-2026-09-29.md; corpus arcade-6782c0ed…, -5eb37c86…).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram} from './helpers/bw-vm.mjs';

test('a for-of over an untranslated array runs no times instead of failing at run time', async () => {
    const imported = arcadeToPseudocode([
        'let count = 0',
        'let player = sprites.create(img`1`, SpriteKind.Player)',
        'for (let value of scene.getTilesByType(4)) {',
        '    value.place(player)',
        '    count += 1',
        '}',
        'count += 10'
    ].join('\n'));
    assert.ok(imported.unsupported.some(u => /scene\.getTilesByType\(\)/.test(u)), imported.unsupported.join('; '));
    assert.match(imported.code, /new array reference from \("\[\]"\)/);
    const run = await runProgram(imported.code, {frames: 6, uploads: imported.costumes, storage: true});
    assert.deepEqual(run.errors, []);
    const values = new Map(run.vm.runtime.targets.flatMap(t => Object.values(t.variables || {}).map(v => [v.name, v.value])));
    assert.equal(Number(values.get('count')), 10, 'the loop body ran, or the code after it did not');
});
