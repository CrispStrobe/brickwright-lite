/**
 * Arithmetic grouping and Math.idiv through the whole micro:bit loop:
 * MakeCode TypeScript -> pseudocode -> blocks -> MakeCode TypeScript.
 *
 * Each expression is evaluated on both sides with the same inputs, so a
 * dropped grouping shows up as a different number rather than a different
 * string. `(v / 4) | 0` used to come back as `v / (4 | 0)`: the bitwise
 * words bind tighter than arithmetic, and the operand lost its parentheses.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {join} from 'node:path';

import {SOURCE} from './helpers/bw-integrated.mjs';
import {projectToMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/export.js';
import {microbitToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/microbit-translate.js';

const COMPILER = join(SOURCE, 'src', 'lib', 'sb3-creator.js');
const canCompile = existsSync(COMPILER);
const SB3Creator = canCompile ? (await import(COMPILER)).default : null;
const skip = !canCompile && 'sb3-creator not integrated';

// pxt-core's simulator Math_.idiv; the device shim is C `int idiv(int, int)`.
const PXT_MATH = {idiv: (x, y) => ((x | 0) / (y | 0)) | 0};
const INPUTS = [
    {a: 7, b: 2, c: 3, v: 13}, {a: -7.5, b: 2.25, c: -3, v: -13.5},
    {a: 0.5, b: 3.5, c: 0.25, v: 3.9}, {a: 6, b: 6, c: 1, v: 0}
];
const evaluate = (expression, scope) =>
    Function('Math', 'a', 'b', 'c', 'v', `return (${expression})`)(PXT_MATH, scope.a, scope.b, scope.c, scope.v);

function roundTrip (expression) {
    const source = `let a = 1\nlet b = 2\nlet c = 3\nlet v = 0\nlet w = 0\nbasic.forever(function () {\n    w = ${expression}\n})\n`;
    const imported = microbitToPseudocode(source);
    assert.deepEqual(imported.unsupported, [], 'the import refused something');
    const {ts, unsupported} = projectToMakeCodeTs(new SB3Creator().parse(imported.code));
    assert.deepEqual(unsupported, [], 'the export refused something');
    const line = ts.split('\n').filter(l => /^\s*w = /.test(l)).pop();
    assert.ok(line, `no assignment to w in:\n${ts}`);
    return {pseudocode: imported.code, exported: line.trim().replace(/^w = /, '')};
}

for (const expression of ['(v / 4) | 0', 'v / 4 | 0', '(a + b) * c', 'a - (b - c)', '(a | b) & c', '-(a + b)',
    'Math.idiv(a, b)', 'Math.idiv(v + 1, b - c)', '~(a + b)', 'a << (b - 1)']) {
    test(`\`${expression}\` keeps its value through import, blocks and export`, {skip}, () => {
        const {exported} = roundTrip(expression);
        for (const scope of INPUTS) {
            assert.equal(evaluate(exported, scope), evaluate(expression, scope),
                `${expression} came back as ${exported} at ${JSON.stringify(scope)}`);
        }
    });
}

test('(v / 4) | 0 is not read back as v / (4 | 0)', {skip}, () => {
    const {pseudocode, exported} = roundTrip('(v / 4) | 0');
    assert.match(pseudocode, /set w to \(\(v \/ 4\) bitor 0\)/, pseudocode);
    assert.equal(exported, '((v / 4) | 0)');
});

test('Math.idiv imports as ((a | 0) / (b | 0)) | 0 and that shape exports as Math.idiv, byte-stably', {skip}, () => {
    const first = roundTrip('Math.idiv(3.5, 0.5)');
    assert.match(first.pseudocode, /set w to \(\(\(3\.5 bitor 0\) \/ \(0\.5 bitor 0\)\) bitor 0\)/, first.pseudocode);
    assert.equal(first.exported, 'Math.idiv(3.5, 0.5)');
    assert.equal(evaluate(first.exported, INPUTS[0]), 0, 'MakeCode truncates both operands: 3 / 0');
    for (const expression of ['Math.idiv(v, 4)', 'Math.idiv(v + 1, b - c)']) {
        const once = roundTrip(expression).exported;
        assert.equal(roundTrip(once).exported, once, `${expression} is not a fixed point`);
    }
});

test('only the full truncating shape is named Math.idiv', {skip}, () => {
    for (const expression of ['(v / 4) | 0', '((v | 0) / 4) | 0', '(v / (4 | 0)) | 0', '((v | 0) / (4 | 0)) | 1']) {
        assert.doesNotMatch(roundTrip(expression).exported, /Math\.idiv/, expression);
    }
});
