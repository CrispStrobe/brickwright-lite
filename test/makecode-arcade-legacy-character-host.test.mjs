import BWValues from '../overlay/scratch-vm/src/util/bw-values.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram, stepFrames, clearStrayTimers} from './helpers/bw-vm.mjs';
import {restartTimedArcadeRun} from './helpers/arcade-timed-native.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const require = createRequire(import.meta.url);
const dir = '../overlay/scratch-vm/src/extensions/crispstrobe/arcade/';
const initializeOriginal = require(dir + 'legacy-character-pxt.js');
const original = readFileSync(new URL(dir + 'legacy-character-source/main.ts', import.meta.url), 'utf8');
const files = source => ({'main.ts': source, 'legacy-character.ts': original,
    'pxt.json': JSON.stringify({name: 'owned-legacy-character-control', dependencies: {device: '*'},
        files: ['legacy-character.ts', 'main.ts']})});
const values = run => Object.fromEntries(run.vm.runtime.targets.flatMap(t => Object.values(t.variables))
    .map(v => [v.name.replace(/^Game_/, ''), v.value]));
const entries = trace => String(trace).split(';').filter(Boolean).map(entry => entry.split(','));
const palette = ['#000000', '#ffffff', '#ff2121', '#ff93c4', '#ff8135', '#fff609', '#249ca3', '#78dc52',
    '#003fad', '#87f2ff', '#8e2ec4', '#a4839f', '#5c406c', '#e5cdc4', '#91463d', '#000000'];
const color = v => '#' + [v & 255, (v >>> 8) & 255, (v >>> 16) & 255].map(b => b.toString(16).padStart(2, '0')).join('');
async function native(source, {frameAuthority = 'manual'} = {}) {
    const imported = arcadeToPseudocode(source);
    assert.deepEqual(imported.unsupported, []);
    const run = await runProgram(imported.code, {frames: 0, uploads: imported.costumes, storage: true, frameAuthority});
    const {default: dispatch} = await importGuiDependency('scratch-vm/src/dispatch/central-dispatch.js');
    const adapter = Object.values(dispatch.services).findLast(s => s?._inst && s.getInfo?.().id === 'arcade');
    assert.ok(adapter?._inst, 'actual VM extension instance exists');
    const ext = adapter._inst;
    const before = [ext._frameHandlersOf().length, ext._scenePushHandlers.length, ext._scenePopHandlers.length];
    // Use the actual native selector before the first library operation.
    adapter.setCharacterAnimationVersion({VERSION: initializeOriginal.sourceIdentity.revision});
    assert.equal(ext._characterAnimationVersion, initializeOriginal.sourceIdentity.revision);
    ext._characterAnimations();
    assert.deepEqual([ext._frameHandlersOf().length, ext._scenePushHandlers.length, ext._scenePopHandlers.length], before,
        'constructing the complete original module does not initialize its lazy scene state');
    return {...run, ext, adapter};
}
test('complete old character source, package and MIT notice are pinned and reproducible', () => {
    assert.equal(createHash('sha256').update(original).digest('hex'), initializeOriginal.sourceIdentity.sourceSha256);
    execFileSync(process.execPath, ['scripts/generate-arcade-legacy-character.mjs', '--check'], {stdio: 'pipe'});
});
const setup = `let hero = sprites.create(img\`4 4\n4 4\`, SpriteKind.Player)
hero.setPosition(80,60)
let alias = hero`;
function recording(extra, actions, count = 12) {return `${setup}
${extra}
let trace = ""
let frame = 0
let traceDone = false
let totalTicks = 0
game.onUpdate(function () {
    totalTicks += 1
    if (frame < ${count}) {
        ${actions}
        trace = trace + hero.image.getPixel(0,0) + "," + (characterAnimations.matchesRule(alias,characterAnimations.rule(Predicate.MovingRight)) ? 1 : 0) + "," + control.eventContext().deltaTime + ";"
        frame += 1
    } else traceDone = true
})`;}
const scenarios = {
    destroyedCleanup: recording(`characterAnimations.loopFrames(alias,[img\`2 2\n2 2\`,img\`3 3\n3 3\`],30,characterAnimations.rule(Predicate.MovingRight))
characterAnimations.setCharacterState(hero,characterAnimations.rule(Predicate.MovingRight))`,
    `if (frame == 4) sprites.destroy(alias)`),
    legacyReenable: recording(`let p5Rule = characterAnimations.rule(Predicate.NotMoving,Predicate.FacingRight,Predicate.HittingWallUp,Predicate.HittingWallLeft,Predicate.Moving)
characterAnimations.loopFrames(alias,[img\`1 1\n1 1\`,img\`2 2\n2 2\`],100,characterAnimations.rule(Predicate.NotMoving))
characterAnimations.loopFrames(hero,[img\`3 3\n3 3\`,img\`5 5\n5 5\`],100,characterAnimations.rule(Predicate.MovingRight))`,
    `if (frame == 1) {characterAnimations.setCharacterAnimationsEnabled(alias,false); hero.x += 5; characterAnimations.setCharacterAnimationsEnabled(hero,true)}`),
    runLoopManual: recording(`characterAnimations.runFrames(hero,characterAnimations._animationFrames([img\`9 9\n9 9\`,img\`a a\na a\`]),30,characterAnimations._predicate(Predicate.MovingRight))
characterAnimations.loopFrames(alias,[img\`b b\nb b\`,img\`c c\nc c\`],50,characterAnimations.rule(Predicate.MovingRight))
characterAnimations.loopFrames(hero,[img\`7 7\n7 7\`],50,characterAnimations.rule(Predicate.NotMoving))`,
    `if (frame == 1) characterAnimations.setCharacterState(alias,characterAnimations.rule(Predicate.MovingRight))
        if (frame == 7) characterAnimations.clearCharacterState(hero)
        if (frame == 9) hero.vx = 40`, 16)
};
for (const [name, source] of Object.entries(scenarios)) {
    test(`old ${name} preserves actual original aliases, animation timing, and presented pixels`, async () => {
        const expected = await runPxtArcade(files(source), {waitForGlobals: {traceDone: true}, fakeClock: true,
            inspectDisplay: true, waitForDisplay: true});
        const trace = entries(expected.trace);
        const run = await native(source);
        try {
            for (let guard = 0; !(Number(values(run).frame) >= 1); guard++) {
                assert.ok(guard < 100, 'native recording begins');
                await stepFrames(run.vm, 1, Number(trace[0].at(-1)) * 1000);
            }
            for (let i = 1; i < trace.length; i++) await stepFrames(run.vm, 1, Number(trace[i].at(-1)) * 1000);
            assert.deepEqual(entries(values(run).trace), trace, 'every original callback frame and delta agrees');
            if (name === 'legacyReenable') assert.equal(values(run).p5Rule, expected.p5Rule, 'old fifth predicate remains ignored');
            // The original display helper polls completion in 100ms batches, then
            // observes a further actual presentation. Align by its measured callback count.
            for (let guard = 0; Number(values(run).totalTicks) < expected.totalTicks; guard++) {
                assert.ok(guard < 100, 'matching original presentation callback count');
                await stepFrames(run.vm, 1, Number(trace.at(-1).at(-1)) * 1000);
            }
            assert.equal(Number(values(run).totalTicks), expected.totalTicks);
            const screen = expected.$display.screen.map(color);
            const pixels = Array.from(run.vm.runtime.bwArcadeDeviceState.sceneFrame.pixels, n => palette[n]);
            assert.deepEqual(pixels, screen, 'all 19200 actual presented pixels agree');
            assert.deepEqual(run.errors, []);
            assert.equal(run.ext._scenePushHandlers.length, 1);
            assert.equal(run.ext._scenePopHandlers.length, 1);
            assert.ok(run.ext._frameHandlersOf().some(h => h.order === 15));
            const sprite = Object.values(run.ext._state().sprites)[0];
            const module = run.ext._characterAnimationModule;
            assert.equal(module.sprite(sprite), module.sprite(sprite), 'strict sprite identity is preserved');
        } finally {run.vm.quit(); clearStrayTimers();}
    });
}
const sceneIsolationSource = `${setup}
characterAnimations.loopFrames(alias,[img\`1\`],1000,characterAnimations.rule(Predicate.NotMoving))
characterAnimations.setCharacterState(hero,characterAnimations.rule(Predicate.MovingRight))
let rootMoving=characterAnimations.matchesRule(alias,characterAnimations.rule(Predicate.MovingRight))
pause(40)
game.pushScene()
let nextMoving=characterAnimations.matchesRule(alias,characterAnimations.rule(Predicate.MovingRight))
characterAnimations.loopFrames(alias,[img\`8\`],1000,characterAnimations.rule(Predicate.NotMoving))
pause(40)
game.popScene()
let restoredMoving=characterAnimations.matchesRule(hero,characterAnimations.rule(Predicate.MovingRight))
let restoredPixel=hero.image.getPixel(0,0)
let done=true`;
test('old public helpers, rule strings, and independent scene state preserve original behavior', async () => {
    const source = sceneIsolationSource;
    const expected = await runPxtArcade(files(source), {fakeClock: true});
    const helperExpected = await runPxtArcade(files(`let description=characterAnimations.ruleToString(Predicate.MovingRight | Predicate.FacingRight | Predicate.HittingWallLeft)
let negativeFraction=characterAnimations.ruleToString(-1.5)
let identity=characterAnimations._predicate(Predicate.MovingRight)
let frameArray=characterAnimations._animationFrames([img\`2\`])
let pixel=frameArray[0].getPixel(0,0)
let done=true`), {fakeClock: true});
    const run = await native(source, {frameAuthority: 'timed'});
    try {
        const clock = await restartTimedArcadeRun(run, 0, {beforeFirstFrame: () => {
            run.adapter.setCharacterAnimationVersion({VERSION: initializeOriginal.sourceIdentity.revision});
            run.ext._characterAnimations();
        }});
        for (let guard = 0; values(run).done !== true; guard++) {
            assert.ok(guard < 10, 'scene callbacks complete on the shared program timer');
            await clock.advanceTo(clock.now() + 20);
        }
        for (const key of ['rootMoving','nextMoving','restoredMoving','restoredPixel']) assert.equal(values(run)[key], expected[key], key);
        const module = run.ext._characterAnimationModule;
        const api = module.characterAnimations;
        assert.deepEqual(Object.keys(api).sort(), ['_animationFrames','_predicate','clearCharacterState','loopFrames',
            'matchesRule','rule','ruleToString','runFrames','setCharacterAnimationsEnabled','setCharacterState'].sort());
        assert.equal(run.adapter.characterRuleToString({RULE: module.Predicate.MovingRight | module.Predicate.FacingRight | module.Predicate.HittingWallLeft}), helperExpected.description);
        assert.equal(run.adapter.characterRuleToString({RULE: -1.5}), helperExpected.negativeFraction, 'original bitwise numeric conversion remains exact');
        assert.equal(api._predicate(module.Predicate.MovingRight), helperExpected.identity);
        const frames = [run.ext._imageHandle({width:1,height:1,pixels:new Uint8Array([2])})];
        assert.equal(api._animationFrames(frames), frames, 'frame-array identity is unchanged');
        assert.equal(run.ext._image(api._animationFrames(frames)[0]).pixels[0], helperExpected.pixel);
        assert.equal(run.ext._sceneStack.length, 0);
        assert.deepEqual(run.errors, []);
    } finally {run.vm.quit(); clearStrayTimers();}
});

test('actual selector metadata, defaults, invalid/late refusal and modern-only APIs stay explicit', async () => {
    const boot = arcadeToPseudocode('scene.setBackgroundColor(1)');
    assert.deepEqual(boot.unsupported, []);
    const run = await runProgram(boot.code, {frames: 0, storage: true});
    const {default: dispatch} = await importGuiDependency('scratch-vm/src/dispatch/central-dispatch.js');
    const adapter = Object.values(dispatch.services).findLast(s => s?._inst && s.getInfo?.().id === 'arcade');
    const ext = adapter._inst;
    try {
        const info = adapter.getInfo();
        const selector = info.blocks.find(b => b.opcode === 'setCharacterAnimationVersion');
        const reporter = info.blocks.find(b => b.opcode === 'characterRuleToString');
        assert.equal(selector.blockType, 'command');
        assert.equal(selector.arguments.VERSION.type, 'string');
        assert.equal(selector.arguments.VERSION.defaultValue, 'v0.1.0');
        assert.equal(reporter.blockType, 'reporter');
        assert.equal(reporter.arguments.RULE.type, 'number');
        assert.equal(ext._characterAnimationVersion, 'v0.1.0');
        adapter.setCharacterAnimationVersion({VERSION: 'unknown'});
        assert.equal(ext._characterAnimationVersion, 'v0.1.0');
        assert.ok(ext._characterAnimationModule == null);
        adapter.setCharacterAnimationVersion({VERSION: initializeOriginal.sourceIdentity.revision});
        assert.ok(ext._characterAnimationModule == null);
        adapter.setCharacterController({SPRITE: '', ENABLED: true});
        adapter.lockCharacterFacing({SPRITE: '', DIRECTION: 'Left'});
        adapter.unlockCharacterFacing({SPRITE: ''});
        assert.equal(ext._scenePushHandlers.length, 0, 'unsupported calls do not initialize library scene callbacks');
        const module = ext._characterAnimationModule;
        adapter.setCharacterAnimationVersion({VERSION: 'v0.1.0'});
        assert.equal(ext._characterAnimationVersion, initializeOriginal.sourceIdentity.revision);
        assert.equal(ext._characterAnimationModule, module);
        adapter.setCharacterAnimationVersion({VERSION: initializeOriginal.sourceIdentity.revision});
        assert.equal(ext._characterAnimationModule, module);
        assert.equal(run.errors.length, 5);
        for (const api of ['setController','lockFacingDirection','unlockFacingDirection']) assert.ok(run.errors.some(e => String(e).includes(api)));
        assert.ok(run.errors.some(e => String(e).includes('before its first operation')));
        assert.ok(run.errors.some(e => String(e).includes('not implemented: unknown')));
    } finally {run.vm.quit(); clearStrayTimers();}
});
test('default modern module retains all modern APIs and exact original rule-to-string result', async () => {
    const boot = arcadeToPseudocode('scene.setBackgroundColor(1)');
    assert.deepEqual(boot.unsupported, []);
    const run = await runProgram(boot.code, {frames: 0, storage: true});
    const {default: dispatch} = await importGuiDependency('scratch-vm/src/dispatch/central-dispatch.js');
    const adapter = Object.values(dispatch.services).findLast(s => s?._inst && s.getInfo?.().id === 'arcade');
    const ext = adapter._inst;
    try {
        assert.equal(ext._characterAnimationVersion, 'v0.1.0');
        const module = ext._characterAnimations();
        for (const api of ['setController','lockFacingDirection','unlockFacingDirection']) assert.equal(typeof module.characterAnimations[api], 'function');
        assert.equal(module.characterAnimations.rule(module.Predicate.NotMoving,0,0,0,module.Predicate.Moving), 0);
        assert.equal(adapter.characterRuleToString({RULE: module.Predicate.MovingRight | module.Predicate.FacingRight}), 'facing-right moving-right');
        assert.equal(ext._scenePushHandlers.length, 0);
        assert.deepEqual(run.errors, []);
    } finally {run.vm.quit(); clearStrayTimers();}
});

// Complete callback rows retained from the actual original observations printed
// by the hosted test; this native control does not execute an original program.
const observedRecordingTraces={"destroyedCleanup":[["4","1","0"],["2","1","0.02"],["3","1","0.02"],["2","1","0.02"],["2","1","0.02"],["3","0","0.02"],["3","0","0.02"],["3","0","0.02"],["3","0","0.02"],["3","0","0.02"],["3","0","0.02"],["3","0","0.02"]],"legacyReenable":[["4","0","0"],["1","0","0.02"],["3","1","0.02"],["1","0","0.02"],["1","0","0.02"],["1","0","0.02"],["1","0","0.02"],["2","0","0.02"],["2","0","0.02"],["2","0","0.02"],["2","0","0.02"],["2","0","0.02"]],"runLoopManual":[["4","0","0"],["7","1","0.02"],["9","1","0.02"],["10","1","0.02"],["11","1","0.02"],["11","1","0.02"],["11","1","0.02"],["12","0","0.02"],["7","0","0.02"],["7","0","0.02"],["9","1","0.02"],["10","1","0.02"],["11","1","0.02"],["11","1","0.02"],["11","1","0.02"],["12","1","0.02"]]};
test("native legacy character recordings observe Undefined startup and every original callback frame",async()=>{
 for(const [name,expected]of Object.entries(observedRecordingTraces)){
  const source=scenarios[name];const run=await native(source);
  try {
   assert.equal(BWValues.decode(values(run).frame),undefined);
   for(let guard=0;!(Number(values(run).frame)>=1);guard++){assert.ok(guard<100,"native recording starts");await stepFrames(run.vm,1,Number(expected[0].at(-1))*1000);}
   assert.equal(Number(values(run).frame),1);assert.equal(entries(values(run).trace).length,1);
   assert.equal(Number(entries(values(run).trace)[0].at(-1)),Number(expected[0].at(-1)),"actual first callback observes original zero delta exactly once");
   for(let i=1;i<expected.length;i++)await stepFrames(run.vm,1,Number(expected[i].at(-1))*1000);
   assert.deepEqual(entries(values(run).trace),expected,"complete original trace including every numeric delta");
   assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
  }finally{run.vm.stopAll();run.vm.quit();clearStrayTimers();}
 }
});


test('legacy scene callbacks consume both actual pause deadlines without a wall clock race', async () => {
    const run = await native(sceneIsolationSource, {frameAuthority: 'timed'});
    try {
        const clock = await restartTimedArcadeRun(run, 0, {beforeFirstFrame: () => {
            run.adapter.setCharacterAnimationVersion({VERSION: initializeOriginal.sourceIdentity.revision});
            run.ext._characterAnimations();
        }});
        await clock.advanceTo(39);assert.equal(run.ext._sceneStack.length,0);assert.equal(values(run).rootMoving,true);
        await clock.advanceTo(40);assert.equal(run.ext._sceneStack.length,1);assert.equal(values(run).nextMoving,false);
        await clock.advanceTo(79);assert.equal(run.ext._sceneStack.length,1);assert.notEqual(values(run).done,true);
        await clock.advanceTo(80);assert.equal(run.ext._sceneStack.length,0);assert.equal(values(run).done,true);
        assert.equal(values(run).restoredMoving,true);assert.equal(values(run).restoredPixel,8);assert.deepEqual(run.errors,[]);
    } finally {run.vm.stopAll();run.vm.quit();clearStrayTimers();}
});
