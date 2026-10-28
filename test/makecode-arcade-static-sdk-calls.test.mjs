import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {lowerLazyValues} from '../overlay/scratch-gui/src/lib/bw-makecode/lower-lazy-values.js';
import {staticSdkNamespaceReceivers} from '../overlay/scratch-gui/src/lib/bw-makecode/static-sdk-namespaces.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {runProgram, stepFrames, clearStrayTimers} from './helpers/bw-vm.mjs';

const nodes = root => {
    const result = [];
    const visit = node => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(visit); return; }
        result.push(node); Object.values(node).forEach(visit);
    };
    visit(root); return result;
};
const ast = source => parseMakeCodeTs(source, {parameterDefaults: true, retainParentheses: true});

test('static SDK receivers remain qualified names across conditional argument lifting', () => {
    const lowered = lowerLazyValues(ast('settings.writeNumber("key", flag ? 1 : 0); Buffer.fromHex(flag ? "01" : "02");'));
    const calls = nodes(lowered).filter(node => node.type === 'Call');
    assert.deepEqual(calls.map(node => node.callee.object.name), ['settings', 'Buffer']);
    assert.equal(nodes(lowered).filter(node => node.type === 'Declaration').some(node =>
        node.decls.some(declaration => ['settings', 'Buffer'].includes(declaration.init?.name))), false);
});

test('SDK-looking parameters, lexical locals and unknown roots remain ordinary receivers', () => {
    const program = ast('function f(settings:any){settings.writeNumber("key", flag ? 1 : 0)}; {let Math:any=other;Math.max(1,flag ? 2 : 3)}; settings.writeNumber("key",flag ? 1 : 0); unknown.method(flag ? 1 : 0);');
    const known = staticSdkNamespaceReceivers(program);
    const calls = nodes(program).filter(node => node.type === 'Call');
    assert.deepEqual(calls.map(node => known.has(node.callee.object)), [false, false, true, false]);
    const lowered = lowerLazyValues(program);
    const receivers = nodes(lowered).filter(node => node.type === 'Call').map(node => node.callee.object.name);
    assert.match(receivers[0], /^__bwValue/);
    assert.match(receivers[1], /^__bwValue/);
    assert.equal(receivers[2], 'settings');
    assert.match(receivers[3], /^__bwValue/);
});

test('function-scoped var and switch lexical declarations shadow SDK namespace names', () => {
    const program = ast('function f(){if(flag){var settings=other};settings.writeNumber("key",flag?1:0)};switch(flag){case 1:let Buffer=other;Buffer.fromHex(flag?"01":"02");break;default:Buffer.fromHex("03")}');
    const known = staticSdkNamespaceReceivers(program);
    const calls = nodes(program).filter(node => node.type === 'Call');
    assert.deepEqual(calls.map(node => known.has(node.callee.object)), [false, false, false]);
});

test('actual SDK settings calls preserve argument order, selected effects and authoring routes', {timeout: 300000}, async () => {
    // Independently authored public fixture; no BetterSettings source or assets.
    // Conditional arguments use a bound key. Separate ordinary arguments carry
    // effects. An earlier effectful argument followed by a conditional has a
    // distinct selected-PXT staging discrepancy and is not qualified here.
    const source = `let trace=0
function key(){trace=trace*10+1;return "bw-static-number"}
function tap(n:number){trace=trace*10+n;return n}
let name="bw-static-number"
settings.writeNumber(name,true?tap(2):tap(9))
let got=settings.readNumber(name)
settings.writeNumber(key(),tap(4))
let ordered=settings.readNumber(name)
function textKey(){trace=trace*10+3;return "bw-static-text"}
settings.writeString(textKey(),false?"unused":"done")
let text=settings.readString("bw-static-text")
settings.remove("bw-static-number")
settings.remove("bw-static-text")`;
    const original = await runPxtArcade(source, {fakeClock: true});
    const expected = {trace: 2143, got: 2, ordered: 4, text: 'done'};
    for (const [key, value] of Object.entries(expected)) assert.equal(original[key], value, key);
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    assert.match(imported.code, /arcade write setting/);
    assert.doesNotMatch(imported.code, /set local __bwValue\d+ to \(settings\)|unsupported/);
    const runs = [];
    const check = run => {
        assert.deepEqual(run.errors, []); assert.deepEqual(run.creator.warnings, []);
        const vars = Object.fromEntries(run.vm.runtime.targets.flatMap(target => Object.values(target.variables))
            .map(variable => [variable.name.replace(/^Game_/, ''), variable.value]));
        for (const [key, value] of Object.entries(expected)) assert.equal(vars[key], value, key);
    };
    try {
        const run = await runProgram(imported.code, {frames: 12, storage: true}); runs.push(run); check(run);
        const code = await runProgram(run.creator.decompile(), {frames: 12, storage: true}); runs.push(code); check(code);
        const fresh = await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide', {frames: 0, storage: true});
        runs.push(fresh);
        await fresh.vm.loadProject(Buffer.from(await (await run.vm.saveProjectSb3()).arrayBuffer()));
        fresh.vm.greenFlag(); await stepFrames(fresh.vm, 12); check(fresh);
        const exported = projectToArcade(run.creator.project);
        assert.deepEqual(exported.unsupported, []); assert.deepEqual(exported.warnings, []);
        const back = await runPxtArcade(exported.files, {fakeClock: true});
        for (const [key, value] of Object.entries(expected)) assert.equal(back[key] ?? back['Game_' + key], value, key);
        const reimported = arcadeToPseudocode(exported.files);
        assert.deepEqual(reimported.unsupported, []);
        const again = await runProgram(reimported.code, {frames: 12, storage: true}); runs.push(again); check(again);
    } finally { for (const run of runs) run.vm.quit(); clearStrayTimers(); }
});
