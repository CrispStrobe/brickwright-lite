import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {SB3Creator, runProgram} from './helpers/bw-vm.mjs';

test('a pinned PXT console example logs both lines in order', async () => {
    const source = readFileSync(join(import.meta.dirname, 'fixtures/makecode/arcade-console-log.ts'), 'utf8');
    const translated = arcadeToPseudocode(source);
    assert.deepEqual(translated.unsupported, []);
    assert.match(translated.code, /arcade log msg/);
    const creator = new SB3Creator();
    creator.parse(translated.code);
    assert.deepEqual(creator.warnings, []);
    assert.match(creator.decompile(), /arcade log "msg sent!"/);
    const run = await runProgram(translated.code, {frames: 5});
    assert.deepEqual(run.errors, []);
    assert.equal(run.vm.runtime.bwArcadeDeviceState?.serial, 'Hello World!\nmsg sent!\n');
});

test('multi-value console calls retain an explicit gap', () => {
    const result = arcadeToPseudocode('console.log("a", "b")');
    assert.ok(result.unsupported.some(gap => gap.includes('multiple values')));
});
