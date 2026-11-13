import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
// Transpile from the prepared GUI dependency scope, as the generator scripts do.
const ts = createRequire(new URL('../packages/scratch-gui/package.json', import.meta.url))('typescript');
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade, projectJsonToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';

function exportCode(code) {
    const creator = new SB3Creator();
    creator.parse(code);
    assert.deepEqual(creator.warnings, []);
    const direct = projectToArcade(creator.project);
    const json = projectJsonToArcade(JSON.stringify(creator.project));
    assert.deepEqual(direct.unsupported, []);
    assert.deepEqual(json.unsupported, []);
    assert.deepEqual(direct.files, json.files);
    return direct.ts;
}
function roundtrip(source) {
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    return exportCode(imported.code);
}
function evaluate(source, result) {
    // Host JS evaluation checks coercion/evaluation count only, not PXT or VM parity.
    const js = ts.transpileModule(source + '\nobserved = ' + result, {
        compilerOptions: {target: ts.ScriptTarget.ES2020}
    }).outputText;
    const context = {};
    vm.runInNewContext(js, context, {timeout: 1000});
    return JSON.parse(JSON.stringify(context.observed));
}

test('Arcade length and character coercions reach byte identity after first export', () => {
    // Explicit declarations isolate coercion from the separate initializer-growth gap.
    let source = 'let x:number; let n:number; let c:string; x=123; n=(""+x).length; c=(""+x).charAt(0);';
    const first = roundtrip(source);
    assert.match(first, /n = \(<string>__bwBinaryAdd\("", x_\)\)\.length/);
    assert.match(first, /c = \(<string>__bwBinaryAdd\("", x_\)\)\.charAt\(0\)/);
    assert.deepEqual(evaluate(first, '[n,c]'), [3, '1']);
    source = first;
    for (let generation = 0; generation < 3; generation++) {
        source = roundtrip(source);
        assert.equal(source, first);
        assert.deepEqual(evaluate(source, '[n,c]'), [3, '1']);
    }
});

test('text coercion evaluates an effectful operand once per use across exports', () => {
    let source = 'let reads:number; let n:number; let c:string; reads=0; function next():number { reads += 1; return 123; } n=(""+next()).length; c=(""+next()).charAt(1);';
    for (let generation = 0; generation < 3; generation++) {
        source = roundtrip(source);
        assert.match(source, /n = \(<string>__bwBinaryAdd\("", (?:Game_)+next\(\)\)\)\.length/);
        assert.match(source, /c = \(<string>__bwBinaryAdd\("", (?:Game_)+next\(\)\)\)\.charAt\(1\)/);
        assert.deepEqual(evaluate(source, '[reads,n,c]'), [2, 3, '2']);
    }
});

for (const [name, expression, expected] of [
    ['numeric addition', 'calculate value (12) op "+" with (3)', 2],
    ['different operator', 'calculate value ("") op "-" with (3)', 2],
    ['variable text producer', 'calculate value (prefix) op "+" with (123)', 3]
]) test('length retains coercion for ' + name, () => {
    const source = exportCode('DEVICE ARCADE\nGLOBAL n\nGLOBAL prefix\nSPRITE Game:\nWHEN arcade source starts:\n  set prefix to ("")\n  set n to (length of (' + expression + '))');
    assert.match(source, /n = \("" \+ /);
    assert.equal(evaluate(source, 'n'), expected);
});

for (const [name, expression, expected] of [
    ['numeric addition', 'arcade source value (12) op "+" with (3)', 2],
    ['different operator', 'arcade source value ("") op "-" with (3)', 2],
    ['variable text producer', 'arcade source value (prefix) op "+" with (123)', 3]
]) test('source length retains coercion for ' + name, () => {
    const source = exportCode('DEVICE ARCADE\nGLOBAL n\nGLOBAL prefix\nSPRITE Game:\nWHEN arcade source starts:\n  set prefix to ("")\n  set n to (length of (' + expression + '))');
    assert.match(source, /n = \("" \+ /);
    assert.equal(evaluate(source, 'n'), expected);
});

test('stock joins remain text, including a numeric first operand', () => {
    const source = exportCode('DEVICE ARCADE\nGLOBAL n\nSPRITE Game:\nWHEN arcade source starts:\n  set n to (length of (join (12) (3)))');
    assert.equal(evaluate(source, 'n'), 3);
    assert.doesNotMatch(source, /\("" \+ \("" \+/);
});

// Native addition's Array conversion belongs to its helper. Typing the result
// must preserve that helper rather than reconstructing a bare source addition.
test('native Array text coercion retains the addition helper and actual member values', () => {
    const imported = arcadeToPseudocode('let a:number[]; let arrayLength:number; let arrayChar:string; a=[12,3]; arrayLength=(""+a).length; arrayChar=(""+a).charAt(2);');
    assert.deepEqual(imported.unsupported, []);
    const native = imported.code.replaceAll('arcade source value ("") op "+" with (a)', 'calculate value ("") op "+" with (a)');
    assert.notEqual(native, imported.code);
    let source = exportCode(native);
    assert.match(source, /array\.join\(","\)/);
    assert.match(source, /arrayLength = \(<string>__bwBinaryAdd\("", a\)\)\.length/);
    assert.deepEqual(evaluate(source, '[arrayLength,arrayChar]'), [4, ',']);
    source = roundtrip(source);
    assert.deepEqual(evaluate(source, '[arrayLength,arrayChar]'), [4, ',']);
});

// PXT source additions preserve collection-object conversion, independently
// from the native Array helper's element conversion. Neither helper may be
// reconstructed as a bare addition just to avoid a redundant text wrapper.
test('source Array text coercion keeps its helper without wrapper growth', () => {
    const source = 'let a:number[]; let arrayLength:number; let arrayChar:string; a=[12,3]; arrayLength=(""+a).length; arrayChar=(""+a).charAt(2);';
    const first = roundtrip(source);
    assert.match(first, /arrayLength = \(<string>__bwSourceBinaryAdd\("", a\)\)\.length/);
    assert.match(first, /arrayChar = \(<string>__bwSourceBinaryAdd\("", a\)\)\.charAt\(2\)/);
    assert.doesNotMatch(first, /array\.join\(","\)/);
    let current = first;
    for (let generation = 0; generation < 3; generation++) {
        current = roundtrip(current);
        // Procedure-name drift is a separate E18 issue. Check only the text
        // receiver boundary rather than declaring whole-export identity.
        assert.match(current, /arrayLength = \(<string>__bwSourceBinaryAdd\("", a\)\)\.length/);
        assert.match(current, /arrayChar = \(<string>__bwSourceBinaryAdd\("", a\)\)\.charAt\(2\)/);
        assert.doesNotMatch(current, /array\.join\(","\)/);
    }
});

test('inferred string member initializers do not add saved-default writes on reimport',()=>{
    const first=roundtrip('let x=123;let n=(""+x).length;let c=(""+x).charAt(0);');
    assert.match(first,/let n: number\nlet c: string/);
    assert.equal((first.match(/\bn = /g)||[]).length,1);
    assert.equal((first.match(/\bc = /g)||[]).length,1);
    let current=first;
    for(let generation=0;generation<3;generation++) {
        current=roundtrip(current);
        assert.equal(current,first);
        assert.deepEqual(evaluate(current,'[n,c]'),[3,'1']);
    }
});

test('member override and indexed-call spellings keep importer refusals',()=>{
    for(const source of [
        'let text="a";text.charAt=function(n:number){return 1};let c=text.charAt(0)',
        'String.prototype.charAt=function(n:number){return 1};let c="a".charAt(0)',
        'let c="a"["charAt"](0)'
    ]) assert.ok(arcadeToPseudocode(source).unsupported.length>0);
});
