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

// Inspect the actual value graph, independent of generated temporary names.
const descendants = (blocks, id, followNext = false, result = new Set()) => {
    if (!id || result.has(id) || !blocks[id]) return result;
    result.add(id);
    for (const input of Object.values(blocks[id].inputs || {})) if (typeof input[1] === 'string') descendants(blocks, input[1], true, result);
    if (followNext) descendants(blocks, blocks[id].next, true, result);
    return result;
};
const pressedSites = creator => creator.project.targets.flatMap(target => Object.entries(target.blocks || {})
    .filter(([, block]) => block.opcode === 'arcade_playerButtonPressed')
    .map(([id, block]) => ({target, id, block})));

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
    const buttons = pressedSites(creator);
    assert.equal(buttons.length, 2, 'positive and negated controller values');
    for (const {target, id, block} of buttons) {
        assert.equal(block.inputs.BUTTON[1][1], '5', 'actual Left button value');
        const argument = Object.entries(target.blocks).find(([, value]) => value.opcode === 'arcade_functionArgument' &&
            descendants(target.blocks, value.inputs.VALUE?.[1]).has(id));
        assert.ok(argument, 'typed controller Boolean remains in the function argument value graph');
    }
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

test('controller values are reevaluated at lazy loop tests and unsupported lexical receivers are named', () => {
    const imported = arcadeToPseudocode('let mySprite = sprites.create(img`1`, SpriteKind.Player)\nlet n = 0\n' +
        'for (let i = 0; i < 3 && !controller.left.isPressed(); i++) { n += 1 }\n');
    assert.deepEqual(imported.unsupported, []);
    const {c, unread} = parse(imported.code);
    assert.deepEqual(unread, []); assert.deepEqual(c.warnings, []);
    const sites = pressedSites(c); assert.equal(sites.length, 2);
    const target = sites[0].target, blocks = target.blocks;
    assert.ok(sites.every(site => site.target === target));
    const [loopId, loop] = Object.entries(blocks).find(([, block]) => block.opcode === 'arcade_sourceWhile');
    const body = descendants(blocks, loop.inputs.SUBSTACK[1], true);
    const tail = sites.filter(site => body.has(site.id));
    assert.equal(tail.length, 1, 'one controller read is reevaluated inside the body tail');
    const header = sites.find(site => !body.has(site.id));
    assert.ok(header, 'another read occurs before entering the loop');
    for (const site of [header, tail[0]]) {
        const write = Object.entries(blocks).find(([, block]) => block.opcode === 'arcade_setLocal' &&
            descendants(blocks, block.inputs.VALUE?.[1]).has(site.id));
        assert.ok(write, 'actual controller value feeds the current lazy condition');
        const branch = blocks[write[1].parent];
        assert.equal(branch.opcode, 'control_if', 'the RHS read stays behind the current LHS guard');
        if (site === header) assert.equal(branch.next, loopId, 'header choice precedes this loop');
    }
    // These repeated values have native Boolean reporters now; none is
    // hoisted once into an old Scratch keyboard choice.
    for (const source of ['let n=0;pauseUntil(()=>controller.A.isPressed()==(n>1))',
        'let n=0;function id(v:any){return v}function f(){for(let k=0;k<id(controller.left.isPressed());k++){n+=1}}f()']) {
        const result = arcadeToPseudocode(source); assert.deepEqual(result.unsupported, []);
        const parsed = parse(result.code); assert.deepEqual(parsed.unread, []); assert.deepEqual(parsed.c.warnings, []);
        assert.ok(pressedSites(parsed.c).length);
    }
    // Unsupported source receiver identity remains a named refusal at the
    // repeated test site. No SDK-looking name bypasses its lexical binding.
    for (const source of ['let controller:any;let n=0;pauseUntil(()=>controller.A.isPressed()==(n>1))',
        'function f(controller:any){pauseUntil(()=>controller.left.isPressed())}f(0)']) {
        const result = arcadeToPseudocode(source);
        assert.ok(result.unsupported.some(message => /shadowed controller binding/.test(message)), JSON.stringify(result.unsupported));
    }
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


test('controller lexical shadowing cannot grant keyboard or native button state on either source path',()=>{
    const shadows=[
        'function f(controller:any){pauseUntil(()=>controller.left.isPressed())}f(0)',
        'let controller=0;pauseUntil(()=>controller.left.isPressed())',
        'function f(){let controller=0;pauseUntil(()=>controller.left.isPressed())}f()',
    ];
    for(const prefix of ['', 'let hero=sprites.create(img`1`,SpriteKind.Player);']){
        for(const source of shadows){
            const imported=arcadeToPseudocode(prefix+source);
            assert.ok(imported.unsupported.some(message=>/shadowed controller binding/.test(message)),prefix+source);
            assert.doesNotMatch(imported.code,/key left arrow pressed\?|arcade player .*button .* pressed/);
        }
        const supported=arcadeToPseudocode(prefix+'pauseUntil(()=>controller.left.isPressed())');
        assert.deepEqual(supported.unsupported,[]);
        assert.deepEqual(parse(supported.code).c.warnings,[]);
    }
});


test('native pauseUntil consumes actual held controller input after readiness', {timeout:15000}, async () => {
    const imported = arcadeToPseudocode('let n=2;let ready=1;let done=0;pauseUntil(()=>controller.A.isPressed()==(n>1));done=1;');
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 0});
    const values = () => Object.fromEntries(run.vm.runtime.targets.flatMap(target => Object.values(target.variables))
        .map(variable => [variable.name.replace(/^(?:Game_)+/, ''), variable.value]));
    try {
        const pending = stepFrames(run.vm, 1);
        for (let count=0; count<30 && values().ready!==1; count++) await new Promise(resolve => setImmediate(resolve));
        assert.equal(values().ready, 1, 'actual authored initialization completed');
        assert.equal(values().done, 0, 'the false held predicate remains pending');
        run.vm.postIOData('keyboard', {key: ' ', isDown: true});
        await pending;
        assert.equal(values().done, 1); assert.deepEqual(run.errors, []);
    } finally {run.vm.quit(); clearStrayTimers();}
});
