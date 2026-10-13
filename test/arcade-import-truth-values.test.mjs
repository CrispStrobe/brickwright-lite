/**
 * MakeCode truth values retain their Boolean type in value slots, including
 * sprite-free programs. Native comparison/value words preserve that type;
 * predicates without a value reporter are chosen at their actual test site.
 * Conditions requiring an unrepresentable predicate value on every pass stay
 * explicitly unsupported. Controls compare original PXT, actual native VM,
 * editable Code, fresh SB3, original export and reimport execution.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {arcadeSimAvailable, compileArcade, runArcadeSim} from '../scripts/lib/makecode-arcade-sim.mjs';
import {SB3Creator, runProgram, stepFrames, clearStrayTimers} from './helpers/bw-vm.mjs';

const FORMS = {
    not: '!flag', notcmp: '!(n < 3)', lt: 'n < 3', le: 'n <= 3', eq: 'n == 3', ne: 'n != 3', seq: 'n === 3',
    and: 'flag && n > 1', or: 'flag || n > 1', t: 'true', f: 'false', key: 'controller.left.isPressed()',
    notkey: '!controller.left.isPressed()', over: 'mySprite.overlapsWith(other)', life: 'info.player2.hasLife()',
    notnot: '!!n', notnum: '!n', notcall: '!isOk()'
};
const SLOTS = {
    letdecl: v => `let r = ${v}`,
    assign: v => `let r = 0\nr = ${v}`,
    arg: v => `takes(${v})`,
    say: v => `mySprite.say(${v})`,
    score: v => `info.setScore(${v} ? 1 : 0)`,
    array: v => `let arr = [${v}, 1]`,
    ret: v => `function ret(): boolean { return ${v} }\nlet q = ret()`,
    prop: v => `mySprite.x = ${v} ? 5 : 6`,
    ifc: v => `if (${v}) { n = 1 }`,
    whilec: v => `while (${v}) { n += 1 }`,
    tern: v => `let r2 = (${v}) ? 1 : 0`,
    arith: v => `let r3 = n + (${v} ? 1 : 0)`
};
const PRE = 'let flag = false\nlet n = 0\nlet mySprite = sprites.create(img`1`, SpriteKind.Player)\n' +
    'let other = sprites.create(img`2`, SpriteKind.Enemy)\nfunction isOk(): boolean { return n > 0 }\n' +
    'function takes(v: any) { n = 1 }\n';
const SHAPES = {
    top: s => s,
    created: s => `${s}\nsprites.onCreated(SpriteKind.Player, function (s) { n += 1 })`,
    update: s => `game.onUpdate(function () {\n${s}\n})`,
    button: s => `controller.A.onEvent(ControllerButtonEvent.Pressed, function () {\n${s}\n})`,
    fn: s => `function body() {\n${s}\n}\ngame.onUpdate(function () { body() })`
};

const parse = code => {
    const c = new SB3Creator();
    try {
        c.parse(code);
        return {c, unread: []};
    } catch (e) {
        if (e.code !== 'DIALECT_UNPARSED_LINES') throw e;
        return {c, unread: e.lines};
    }
};
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';

const AS_VALUE = /is a (COMPARISON|CONDITION) used where a value is expected/;

test('every truth-value form in every value slot imports as a value across all callback shapes', () => {
    const bad = [];
    const paths = {handle: 0, fixed: 0};
    for (const [shape, wrap] of Object.entries(SHAPES)) {
        for (const [form, value] of Object.entries(FORMS)) {
            for (const [slot, write] of Object.entries(SLOTS)) {
                const {code} = arcadeToPseudocode(`${PRE}${wrap(write(value))}\n`);
                paths[/arcade create template/.test(code) ? 'handle' : 'fixed']++;
                const {c, unread} = parse(code);
                const warned = c.warnings.filter(w => AS_VALUE.test(w));
                if (warned.length || unread.length) bad.push(`${shape}/${form}/${slot}: ${[...warned, ...unread.map(l => l.text)].join(' | ')}`);
            }
        }
    }
    assert.deepEqual(bad, []);
    // Sprite-bearing programs now use native handles for every callback shape.
    // The separate sprite-free fixture below still checks the fixed value path.
    assert.equal(paths.handle + paths.fixed, 1080);
    assert.equal(paths.handle, 1080, JSON.stringify(paths));
});

// Logs truth values passed through a function's argument (a value slot).
const LOGGED = `let flag = false
let n = 0
let s = ""
function id(v: any) { return v }
console.log(id(!flag))
console.log(id(!n))
console.log(id(n < 3))
console.log(id(!(n < 3)))
console.log(id(n != 0))
console.log(id(controller.left.isPressed()))
console.log(id(!controller.left.isPressed()))
`;
// The handle path also takes text, whose truthiness is JavaScript's there.
const HANDLE = `let mySprite = sprites.create(img\`1\`, SpriteKind.Player)
${LOGGED}console.log(id(!s))
console.log(id(info.player2.hasLife()))
console.log(id(!info.player2.hasLife()))
`;
// A sprite-free program also retains real Boolean values.
const FIXED = `${LOGGED}info.player2.setLife(3)
console.log(id(info.player2.hasLife()))
`;

const pxtLog = async files => {
    const run = await runArcadeSim(await compileArcade(files), {ms: 500});
    assert.equal(run.error ?? null, null);
    return run.serial.map(line => line.text).join('');
};
const SIM = arcadeSimAvailable() ? false : 'MakeCode runtime not synced (npm run sync:makecode) — no pxt-arcade compiler and simulator';

async function importAndRun (source) {
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    const creator = new SB3Creator();
    creator.parse(imported.code);
    for (const art of imported.costumes || []) creator.applyCustomSVG(art.sprite, art.svg);
    assert.deepEqual(creator.warnings, []);
    const run = await runProgram(imported.code, {frames: 6, uploads: imported.costumes});
    assert.deepEqual(run.errors, []);
    return {imported, creator, lite: run.vm.runtime.bwArcadeDeviceState?.serial ?? ''};
}

test('handle path: the import logs what MakeCode logs, and so does its export', {skip: SIM, timeout: 300000}, async () => {
    const {imported, creator, lite} = await importAndRun(HANDLE);
    assert.match(imported.code, /arcade create template/, 'the handle path');
    assert.match(imported.code, /IF key left arrow pressed\? THEN:\n\s+set _mc\d+ to \(compare value \(0\) op "<" with \(1\)\)/);
    assert.match(imported.code, /arcade player \(2\) has life/);
    const original = await pxtLog(HANDLE);
    assert.equal(original, 'truetruetruefalsefalsefalsetruetruefalsetrue');
    assert.equal(lite.replace(/\n/g, ''), original);
    const exported = projectToArcade(creator.project, {costumeSvg: (_t, c) => creator.assets.get(c.assetId)?.data ?? null});
    assert.equal(await pxtLog(exported.files), original);
    await assertNativeRoutes(imported, creator, original);
});

test('sprite-free path: typed Boolean arguments retain original values through authoring and export', {skip: SIM, timeout: 300000}, async () => {
    const {imported, creator, lite} = await importAndRun(FIXED);
    assert.doesNotMatch(imported.code, /arcade create template/, 'the fixed-sprite path');
    assert.match(imported.code, /arcade function argument \(compare value \(truthiness of value \(flag\)\) op "===" with \(\(compare value \(1\) op "<" with \(0\)\)\)\)/);
    assert.match(imported.code, /arcade function argument \(arcade player \(2\) has life\)/);
    const original = await pxtLog(FIXED);
    assert.equal(original, 'truetruetruefalsefalsefalsetruetrue');
    assert.equal(lite.replace(/\n/g, ''), original);
    const exported = projectToArcade(creator.project, {costumeSvg: (_t, c) => creator.assets.get(c.assetId)?.data ?? null});
    assert.deepEqual(exported.unsupported, []);
    assert.equal(await pxtLog(exported.files), original);
    await assertNativeRoutes(imported, creator, original);
});

test('predicate choices stay at each source-loop test and unrepresentable repeated values are named', () => {
    // A lazy for-condition on the handle path is tested before the loop AND at
    // the end of its body: each test chooses its own value, in place.
    const {code} = arcadeToPseudocode('let mySprite = sprites.create(img`1`, SpriteKind.Player)\nlet n = 0\n' +
        'for (let i = 0; i < 3 && !controller.left.isPressed(); i++) { n += 1 }\n');
    const lines = code.split('\n');
    const loop = lines.findIndex(l => /^\s*arcade repeat while /.test(l));
    const depth = l => l.match(/^ */)[0].length;
    const chosen = lines.map((l, i) => [l, i]).filter(([l]) => /^\s*IF key left arrow pressed\? THEN:/.test(l));
    assert.equal(chosen.length, 2);
    assert.ok(chosen[0][1] < loop, 'the first test, before the loop');
    assert.ok(chosen[1][1] > loop && depth(chosen[1][0]) > depth(lines[loop]), 'the next ones, inside its body');
    assert.deepEqual(parse(code).c.warnings, []);

    // pauseUntil's condition, and the condition of a for loop over a local
    // (written by the Arcade translator itself, not the base), are tested on
    // every pass: nothing is chosen first, and the import says so.
    const refusedIn = source => {
        const r = arcadeToPseudocode(source);
        assert.ok(r.unsupported.some(u => /pressed\? as a value in a condition tested on every pass/.test(u)), JSON.stringify(r.unsupported));
        assert.doesNotMatch(r.code, /set _mc\d+ to/);
    };
    refusedIn('let n = 0\npauseUntil(() => controller.A.isPressed() == (n > 1))\n');
    refusedIn('let mySprite = sprites.create(img`1`, SpriteKind.Player)\nlet n = 0\nfunction id(v: any) { return v }\n' +
        'function f() {\n  for (let k = 0; k < id(controller.left.isPressed()); k++) { n += 1 }\n}\nf()\n');
});

async function assertNativeRoutes(imported, creator, expected) {
    const runs = [];
    const check = run => {
        assert.deepEqual(run.errors, []);
        assert.deepEqual(run.creator.warnings, []);
        assert.equal((run.vm.runtime.bwArcadeDeviceState?.serial ?? '').replace(/\n/g, ''), expected);
    };
    try {
        const code = await runProgram(creator.decompile(), {frames: 6, uploads: imported.costumes});
        runs.push(code); check(code);
        const fresh = await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide', {frames: 0});
        runs.push(fresh);
        await fresh.vm.loadProject(Buffer.from(await (await creator.generateSB3()).arrayBuffer()));
        fresh.vm.greenFlag(); await stepFrames(fresh.vm, 6); check(fresh);
        const exported = projectToArcade(creator.project, {
            costumeSvg: (_target, costume) => creator.assets.get(costume.assetId)?.data ?? null
        });
        assert.deepEqual(exported.unsupported, []);
        const reimported = arcadeToPseudocode(exported.files);
        assert.deepEqual(reimported.unsupported, []);
        const again = await runProgram(reimported.code, {frames: 6, uploads: reimported.costumes});
        runs.push(again); check(again);
    } finally { for (const run of runs) run.vm.quit(); clearStrayTimers(); }
}

test('loop condition choices observe actual held input through original, Code, SB3 and export', {skip: SIM, timeout: 300000}, async () => {
    const source = 'let ready=0;let n=-1;controller.A.onEvent(ControllerButtonEvent.Pressed,function(){if(ready==1){n=0;for(let i=0;i<3 && !controller.left.isPressed();i++){n++}}});ready=1;';
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    const creator = new SB3Creator(); creator.parse(imported.code);
    const exported = projectToArcade(creator.project, {costumeSvg: (_t, c) => creator.assets.get(c.assetId)?.data ?? null});
    assert.deepEqual(exported.unsupported, []);
    const reimported = arcadeToPseudocode(exported.files);
    assert.deepEqual(reimported.unsupported, []);
    for (const held of [false, true]) {
        const options = {fakeClock: true, waitForGlobals: {n: held ? 0 : 3}, buttonActions: {afterGlobals: {ready: 1}, steps: [{button: 1, held}, {button: 5, held: true}, {delay: 40}]}};
        const original = await runPxtArcade(source, options);
        assert.equal(original.n, held ? 0 : 3);
        const back = await runPxtArcade(exported.files, {...options, waitForGlobals: {n: held ? 0 : 3}, buttonActions: {...options.buttonActions, afterGlobals: {ready: 1}}});
        assert.equal(back.n ?? back.Game_n, original.n);
        for (const code of [imported.code, creator.decompile(), reimported.code]) {
            const run = await runProgram(code, {frames: 6});
            run.vm.postIOData('keyboard', {key: 'ArrowLeft', isDown: held});
            run.vm.postIOData('keyboard', {key: ' ', isDown: true});
            await stepFrames(run.vm, 6);
            try {
                assert.deepEqual(run.errors, []);
                const values = run.vm.runtime.targets.flatMap(t => Object.values(t.variables));
                assert.equal(values.find(v => /^(?:Game_)?n$/.test(v.name))?.value, original.n);
                await run.vm.loadProject(run.buffer); run.vm.greenFlag();
                await stepFrames(run.vm, 6);
                run.vm.postIOData('keyboard', {key: ' ', isDown: false});
                run.vm.postIOData('keyboard', {key: 'ArrowLeft', isDown: held});
                run.vm.postIOData('keyboard', {key: ' ', isDown: true});
                await stepFrames(run.vm, 6);
                const savedValues = run.vm.runtime.targets.flatMap(t => Object.values(t.variables));
                assert.equal(savedValues.find(v => /^(?:Game_)?n$/.test(v.name))?.value, original.n);
            } finally { run.vm.quit(); clearStrayTimers(); }
        }
    }
});
