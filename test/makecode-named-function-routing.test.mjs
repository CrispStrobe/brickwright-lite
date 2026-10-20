import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {STATIC_CALLBACK_SOURCE} from './fixtures/arcade-static-callback-helpers.mjs';
import {runProgram, stepFrames, clearStrayTimers} from './helpers/bw-vm.mjs';

// Existing source inputs and their authored effect invariants. This regression
// suite never compiles or replays their previously qualified SDK originals.
const REGISTRATION_SOURCE = "let pressed=0;let overlaps=0;\nfunction onA(handler:()=>void){controller.A.onEvent(ControllerButtonEvent.Pressed,handler)}\nfunction onGoal(handler:()=>void){if(!handler)return;sprites.onOverlap(SpriteKind.Player,SpriteKind.Enemy,function(first,second){first.destroy();handler()})}\nfunction keyHandler(){pressed+=1;pause(20);pressed+=1}\nonA(keyHandler);onGoal(function(){overlaps+=1});\nlet first=sprites.create(img`1`,SpriteKind.Player);let second=sprites.create(img`2`,SpriteKind.Enemy);\nlet ready=1;ready+=0;";
const SCENE_SOURCE = "let pushes=0;let destroyed=0;function handler(){pushes++};game.addScenePushHandler(handler);game.pushScene();let kind=7;let hero=sprites.create(img`1`,kind);sprites.onDestroyed(kind,function(sprite){destroyed++;});hero.destroy();";

const cases = [
    {name: 'forwarded registrations', source: REGISTRATION_SOURCE, expected: {pressed: 2, overlaps: 1, ready: 1}, press: true},
    {name: 'static helper procedures', source: STATIC_CALLBACK_SOURCE, expected: {trace: 123, total: 12, recursive: 20, chosen: 12, buttonResult: 0}},
    {name: 'named scene procedure', source: SCENE_SOURCE, expected: {pushes: 1, destroyed: 1}}
];
const values = run => Object.fromEntries(run.vm.runtime.targets.flatMap(target => Object.values(target.variables))
    .map(variable => [variable.name.replace(/^Game_/, ''), variable.value]));
async function drive(run, fixture) {
    let now = 0;
    run.vm.stopAll();
    run.vm.runtime.bwArcadeProgramClock = {now: () => now};
    run.vm.runtime.updateCurrentMSecs = () => {run.vm.runtime.currentMSecs = now;};
    run.vm.runtime.currentMSecs = 0;
    run.vm.greenFlag();
    for (let index = 0; index < 25; index++) {
        now = index * 20;
        if (fixture.press && index === 3) run.vm.postIOData('keyboard', {key: ' ', isDown: true});
        if (fixture.press && index === 10) run.vm.postIOData('keyboard', {key: ' ', isDown: false});
        await stepFrames(run.vm, 1, index ? 20 : 0);
    }
    const observed = values(run);
    for (const [name, expected] of Object.entries(fixture.expected)) assert.equal(observed[name], expected, fixture.name + ':' + name);
    assert.deepEqual(run.errors, []);
    assert.deepEqual(run.creator.warnings, []);
}

for (const fixture of cases) test('existing ' + fixture.name + ' keeps native Code/same/fresh SB3/current export routes', async () => {
    const runs = [];
    const execute = async imported => {
        assert.deepEqual(imported.unsupported, []);
        assert.deepEqual(imported.warnings || [], []);
        const run = await runProgram(imported.code, {frames: 0, uploads: imported.costumes, storage: true});
        runs.push(run);
        await drive(run, fixture);
        return run;
    };
    try {
        const imported = arcadeToPseudocode(fixture.source), run = await execute(imported);
        assert.doesNotMatch(imported.code, /arcade declare callable/);
        await execute({...imported, code: run.creator.decompile()});
        const saved = Buffer.from(await (await run.vm.saveProjectSb3()).arrayBuffer());
        await run.vm.loadProject(saved);
        await drive(run, fixture);
        const fresh = await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide', {frames: 0, storage: true});
        runs.push(fresh);
        fresh.vm.stopAll();
        await fresh.vm.loadProject(saved);
        await drive(fresh, fixture);
        // Export the current authoring Blocks, as the existing roundtrip gates
        // do. A running Sprite's transformed costume size is not an editor edit.
        const project = run.creator.project;
        const exported = projectToArcade(project, {costumeSvg: (_target, costume) => run.creator.assets.get(costume.assetId)?.data});
        assert.deepEqual(exported.unsupported, []);
        await execute(arcadeToPseudocode(exported.files));
    } finally {
        for (const run of runs) run.vm.quit();
        clearStrayTimers();
    }
});

test('unconsumed stored values and escaping helpers retain strict named diagnostics', () => {
    for (const source of [
        'function read():number{return 7}let label=read;controller.A.onEvent(ControllerButtonEvent.Pressed,function(){})',
        'function handler(){let local=1}game.addScenePushHandler(handler);let stored=handler',
        'function handler(){let local=1}foreign(handler)',
        'function invoke(action:()=>number){return action()}let invoke:any=0;function read(){return 7}let result=invoke(read)',
        'function invoke(action:()=>number){return action()}function read(){return 7}invoke=other;let result=invoke(read)',
        'function invoke(action:()=>number){return action()}function read(){return 7}let result=invoke(read);invoke=other',
        'function apply(handler:()=>number){let stored=handler;return 7}function read(){return 3}let out=apply(read)',
        'function apply(handler:()=>number){return handler()}let callback:any=0;let out=apply(callback)'
    ]) assert.ok(arcadeToPseudocode(source).unsupported.length, source);
});

test('legacy registration routing cannot borrow a shadowed, changed or escaped SDK receiver', () => {
    for (const setup of [
        'let game:any=0;',
        'game=other;',
        'game.addScenePushHandler=other;',
        'let saved=game;',
        'let saved=game.addScenePushHandler;',
        'game[unknown]=other;'
    ]) {
        const source = setup + 'function handler(){let local=1}game.addScenePushHandler(handler)';
        assert.ok(arcadeToPseudocode(source).unsupported.length, source);
    }
    const nested = 'function register(game:any){function handler(){}game.addScenePushHandler(handler)}register(0)';
    assert.ok(arcadeToPseudocode(nested).unsupported.length);
});

test('an unrelated scoped SDK-name formal does not poison a real static helper route', () => {
    const source = 'function invoke(action:()=>number){return action()}function read(){return 7}' +
        'function unrelated(game:number){return game}let result=invoke(read)';
    assert.deepEqual(arcadeToPseudocode(source).unsupported, []);
});
