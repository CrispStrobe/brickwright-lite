import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {SB3Creator, projectOpcodes} from './helpers/bw-vm.mjs';

test('a call omitting an argument still creates a runnable procedure block', () => {
    const source = `function repeatIt(message: string, times?: number) {
    if (!times) times = 3
    for (let i = 0; i < times; i++) console.log(message)
}
repeatIt("Hello")`;
    const translated = arcadeToPseudocode(source);
    const creator = new SB3Creator();
    creator.parse(translated.code);
    assert.ok(projectOpcodes(creator.project).has('procedures_call'));
    assert.ok(creator.warnings.some(warning => warning.includes('missing argument')));
    assert.ok(!creator.warnings.some(warning => warning.includes('Unknown command')));
});
