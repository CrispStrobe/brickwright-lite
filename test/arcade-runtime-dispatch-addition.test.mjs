import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {runtimeDispatchAddHelperSource,isRuntimeDispatchAddDeclaration,lowerRuntimeDispatchAddHelpers,nativeArrayAddHelperSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {runProgram,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

// Owner decision 2026-10-30: an addition whose operands the native proof
// cannot establish exports through one runtime-dispatch helper. PXT's
// Array.isArray selects the proven path's join; any other value keeps `+`.
const HELPER = runtimeDispatchAddHelperSource('__bwBinaryAdd');
const CASES = [
    ['arrayArray', '__bwBinaryAdd(a, b)', '1,23'],
    ['arrayNumber', '__bwBinaryAdd(a, 5)', '1,25'],
    ['numberArray', '__bwBinaryAdd(5, a)', '51,2'],
    ['numberNumber', '__bwBinaryAdd(2, 3)', 5],
    ['stringNumber', '__bwBinaryAdd("x", 4)', 'x4'],
    ['emptyArrayString', '__bwBinaryAdd(e, "")', ''],
    ['nullString', '__bwBinaryAdd(n, "s")', 'nulls'],
    ['nullNumber', '__bwBinaryAdd(n, 1)', 1],
    ['undefinedString', '__bwBinaryAdd(u, "s")', 'undefineds'],
];
const program = HELPER + `
let a: number[] = [1, 2]
let b: number[] = [3]
let e: number[] = []
let n: any = null
let u: any = undefined
` + CASES.map(([name, expression]) => `let ${name} = ${expression}`).join('\n') + `
let missing = __bwBinaryAdd(u, 1)
`;
const vmValues = run => Object.fromEntries(run.vm.runtime.targets.flatMap(target => Object.values(target.variables))
    .map(variable => [variable.name.replace(/^Game_/, ''), variable.value]));

test('the helper source is the exact Array.isArray dispatch over the proven join', () => {
    assert.equal(HELPER, 'function __bwBinaryAdd(left: any, right: any): any { ' +
        'let a: any = left; if (Array.isArray(left)) { let array: any[] = left; a = array.join(",") }; ' +
        'let b: any = right; if (Array.isArray(right)) { let array: any[] = right; b = array.join(",") }; return a + b }');
    assert.ok(nativeArrayAddHelperSource('__bwBinaryAdd', true, true).includes('array.join(",")'), 'same join as the proven Array path');
    assert.throws(() => runtimeDispatchAddHelperSource('not a name'));
    for (const options of [{}, {parameterDefaults: true, retainParentheses: true}]) {
        const parsed = parseMakeCodeTs(HELPER + '\nlet x = __bwBinaryAdd(1, 2)', options);
        assert.equal(isRuntimeDispatchAddDeclaration(parsed.body[0]), true);
    }
    const proven = parseMakeCodeTs(nativeArrayAddHelperSource('__bwBinaryAdd', true, true) + '\nlet x = __bwBinaryAdd(1, 2)');
    assert.equal(isRuntimeDispatchAddDeclaration(proven.body[0]), false, 'the typeof-object join body is not the dispatch body');
});

test('original PXT and the imported native program agree on Array, number, string and nullish operands', async () => {
    const original = await runPxtArcade(program);
    for (const [name, , expected] of CASES) assert.deepEqual(original[name], expected, name);
    const imported = arcadeToPseudocode(program);
    assert.deepEqual(imported.unsupported, []);
    assert.doesNotMatch(imported.code, /__bwBinaryAdd/, 'every call is restored to the native value operation');
    const run = await runProgram(imported.code, {frames: 20, uploads: imported.costumes, storage: true});
    try {
        assert.deepEqual(run.errors, []);
        const values = vmValues(run);
        for (const [name, , expected] of CASES) assert.deepEqual(values[name], expected, name);
        assert.deepEqual(values.missing, original.missing, 'Undefined + 1 matches the original');
    } finally { run.vm.quit(); clearStrayTimers(); }
});

test('only the exact dispatch body with direct calls is lowered on import', () => {
    const parse = source => parseMakeCodeTs(source, GENERATED_HELPER_PROFILES.ordinary);
    const lowered = lowerRuntimeDispatchAddHelpers(parse(HELPER + '\nlet x = __bwBinaryAdd(1, 2)'));
    assert.equal(lowered.body.some(node => node.type === 'FunctionDeclaration'), false);
    assert.equal(JSON.stringify(lowered).includes('"NativeArrayValueBinary"'), true);
    for (const source of [
        HELPER.replace('array.join(",")', 'array.join(";")') + '\nlet x = __bwBinaryAdd(1, 2)',
        HELPER + '\nlet alias = __bwBinaryAdd\nlet x = __bwBinaryAdd(1, 2)',
        HELPER + '\nlet Array: any = 0\nlet x = __bwBinaryAdd(1, 2)',
    ]) {
        const result = lowerRuntimeDispatchAddHelpers(parse(source));
        assert.equal(result.body.some(node => node.type === 'FunctionDeclaration' && node.name === '__bwBinaryAdd'), true, source);
    }
});

test('an unproved Blocks addition exports one dispatch helper that compiles, runs and reimports', async () => {
    const creator = new SB3Creator();
    creator.parse('DEVICE ARCADE\nGLOBAL result\nGLOBAL second\nSPRITE Game:\nWHEN flag clicked:\n' +
        '  set result to (calculate value (arcade background scroll offset x layer (0)) op "+" with (1))\n' +
        '  set second to (calculate value (result) op "+" with ("!"))');
    assert.deepEqual(creator.errors, []);
    const out = projectJsonToArcade(JSON.stringify(creator.project));
    assert.deepEqual(out.unsupported, []);
    assert.equal(out.ts.split('function __bwBinaryAdd(').length, 2, 'one helper per program');
    assert.ok(out.ts.includes(HELPER));
    const executed = await runPxtArcade(out.files);
    assert.equal(executed.result ?? executed.Game_result, 1);
    assert.equal(executed.second ?? executed.Game_second, '1!');
    const again = arcadeToPseudocode(out.ts);
    assert.deepEqual(again.unsupported, []);
    assert.doesNotMatch(again.code, /__bwBinaryAdd/);
});
