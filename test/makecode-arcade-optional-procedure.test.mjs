import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {SB3Creator, projectOpcodes, runProgram} from './helpers/bw-vm.mjs';

// MakeCode passes `undefined` for an omitted optional argument. The dialect
// refuses a call that leaves an argument out (E0), so the importer writes the
// missing one explicitly as `undefined value`, and the procedure's own
// `if (!times)` default then runs as it does in MakeCode.
test('a call omitting an optional argument passes undefined explicitly and runs', async () => {
    const source = `function repeatIt(message: string, times?: number) {
    if (!times) times = 3
    for (let i = 0; i < times; i++) console.log(message)
}
repeatIt("Hello")`;
    const translated = arcadeToPseudocode(source);
    assert.deepEqual(translated.unsupported, []);
    assert.match(translated.code, /repeatIt "Hello" \(undefined value\)/);
    const creator = new SB3Creator();
    creator.parse(translated.code);
    assert.ok(projectOpcodes(creator.project).has('procedures_call'));
    assert.deepEqual(creator.warnings, []);
    const run = await runProgram(translated.code, {frames: 5});
    assert.deepEqual(run.errors, []);
    assert.equal(run.vm.runtime.bwArcadeDeviceState?.serial, 'Hello\nHello\nHello\n');
});
