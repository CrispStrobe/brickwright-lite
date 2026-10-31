import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram, stepFrames, clearStrayTimers} from './helpers/bw-vm.mjs';

// A procedure parameter whose call site passes a Sprite field read (a Number producer) has a proven
// primitive domain; the call used to raise "connected input lacks complete primitive domain evidence".
const variable = (run, name) => run.vm.runtime.targets.flatMap(t => Object.values(t.variables)).find(v => v.name === name)?.value;

for (const property of ['ay', 'vx', 'x']) {
    test('a procedure parameter fed by sprite.' + property + ' runs without a domain error', async () => {
        try {
            const source = `function f(a: number) {
    let s = sprites.create(img\`1 1\`)
    s.ay = a
    seen = a
}
let seen = -1
let o = sprites.create(img\`1 1\`)
o.${property} = 7
f(o.${property})`;
            const imported = arcadeToPseudocode(source);
            assert.deepEqual(imported.unsupported, []);
            const run = await runProgram(imported.code, {frames: 3, uploads: imported.costumes});
            await stepFrames(run.vm, 3, 20);
            assert.deepEqual(run.errors, []);
            assert.equal(variable(run, 'seen'), 7);
        } finally { clearStrayTimers(); }
    });
}

// Number-only operators and Number-returning reporters complete with a Number whatever their operands
// are, so a parameter fed by them has a proven domain even when an operand's own producer is opaque.
for (const [label, expression] of [
    ['a shift of an array element', 'items[0] >> 1'],
    ['a bitwise mask of an array element', 'items[0] & 255'],
    ['the sign of the controller step', 'Math.sign(controller.dx(100))']
]) {
    test('a procedure parameter fed by ' + label + ' runs without a domain error', async () => {
        try {
            const source = `let items = [6, 7]
let seen = -1
function f(a: number) {
    seen = a
}
game.onUpdate(function () {
    let x = ${expression}
    f(x)
})`;
            const imported = arcadeToPseudocode(source);
            assert.deepEqual(imported.unsupported, []);
            const run = await runProgram(imported.code, {frames: 3, uploads: imported.costumes, keys: ['ArrowRight']});
            await stepFrames(run.vm, 6, 33);
            assert.deepEqual(run.errors, []);
            assert.equal(typeof variable(run, 'seen'), 'number');
            assert.notEqual(variable(run, 'seen'), -1);
        } finally { clearStrayTimers(); }
    });
}
