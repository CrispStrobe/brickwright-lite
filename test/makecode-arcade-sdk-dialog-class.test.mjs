import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
import {runProgram, stepFrames, clearStrayTimers} from './helpers/bw-vm.mjs';
import BW from '../overlay/scratch-vm/src/util/bw-values.js';
import {dialogOriginalSource} from './fixtures/arcade-sdk-dialog-game.mjs';

const names = ['sameImage','replaced','width','height','resizedWidth','resizedHeight','oldWidth','oldHeight','textColor','cursorCount'];
function globals(run) {
    return Object.fromEntries(run.vm.runtime.targets.flatMap(target => Object.values(target.variables))
        .map(variable => [variable.name.replace(/^Game_/, ''), variable.value]));
}
function check(run, original, label) {
    const state = globals(run);
    for (const name of names) assert.equal(BW.decode(state[name] ?? state[name + '_']), original[name], label + ' ' + name);
    // These are readonly assertions on the real native image API; execution
    // and image mutation above occur through actual converted source blocks.
    for (const name of ['initial', 'resized']) {
        const ref = state[name] ?? state[name + '_'], expected = original.$images[name];
        assert.equal(run.vm.runtime._primitives.arcade_imageProperty({IMAGE:ref, PROPERTY:'width'}, {}), expected.width);
        assert.equal(run.vm.runtime._primitives.arcade_imageProperty({IMAGE:ref, PROPERTY:'height'}, {}), expected.height);
        const actual = Array.from({length:expected.width * expected.height}, (_, i) =>
            run.vm.runtime._primitives.arcade_imagePixel({IMAGE:ref, X:i % expected.width, Y:Math.floor(i / expected.width)}, {}));
        assert.deepEqual(actual, expected.pixels, label + ' full live image ' + name);
    }
}
async function execute(imported, runs) {
    assert.deepEqual(imported.unsupported, []); assert.deepEqual(imported.warnings, []);
    const run = await runProgram(imported.code, {frames:0, storage:true, uploads:imported.costumes || []}); runs.push(run);
    assert.deepEqual(run.creator.warnings, []);
    await stepFrames(run.vm, 150, 0); assert.deepEqual(run.errors, []); return run;
}

test('real SDK SplashDialog retains fields, image identity/pixels, resize and all authoring routes', async () => {
    const original = await runPxtArcade(dialogOriginalSource, {inspectImageGlobals:['initial','resized']});
    const runs = [];
    try {
        const imported = arcadeToPseudocode(dialogOriginalSource), run = await execute(imported, runs);
        check(run, original, 'native');
        check(await execute({...imported, code:run.creator.decompile()}, runs), original, 'Code');
        const exported = projectToArcade(run.creator.project, {costumeSvg:(target,costume) => run.creator.assets.get(costume.assetId)?.data});
        assert.deepEqual(exported.unsupported, []); assert.match(exported.ts, /new game\.SplashDialog/);
        const exportedOriginal = await runPxtArcade(exported.files, {inspectImageGlobals:['initial','resized']});
        for (const name of names) assert.equal(exportedOriginal[name], original[name], 'original export ' + name);
        assert.deepEqual(exportedOriginal.$images, original.$images, 'original export full images');
        check(await execute(arcadeToPseudocode(exported.files), runs), original, 'reimport');
        const bytes = Buffer.from(await (await run.vm.saveProjectSb3()).arrayBuffer());
        await run.vm.loadProject(bytes); run.vm.greenFlag(); await stepFrames(run.vm,150,0);
        assert.deepEqual(run.errors, []); check(run, original, 'same VM SB3');
        const fresh = await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide', {frames:0,storage:true}); runs.push(fresh);
        fresh.vm.stopAll(); await fresh.vm.loadProject(bytes); fresh.vm.greenFlag(); await stepFrames(fresh.vm,150,0);
        assert.deepEqual(fresh.errors, []); check(fresh, original, 'fresh VM SB3');
    } finally {for (const run of runs) run.vm.quit(); clearStrayTimers();}
});

// Frozen actual selected-original matrix is independently recorded in the
// original reference lane: default-frame zero images exist, negative sizes
// return undefined. This does not admit arbitrary null receiver operations.
test('default-frame BaseDialog zero and negative allocation preserve original bounded observations', async () => {
    const cases = [[0,0,false,0,0],[0,3,false,0,3],[3,0,false,3,0],[-1,2,true,-1,-1],[2,-1,true,-1,-1]];
    const runs = [];
    try {
        for (const [width,height,missing,w,h] of cases) {
            const source = `let dialog=new game.BaseDialog(${width},${height})\nlet probeImage=dialog.image\nlet missing=probeImage==undefined\nlet w=missing?-1:probeImage.width\nlet h=missing?-1:probeImage.height`;
            const run = await execute(arcadeToPseudocode(source), runs);
            const actual = globals(run);
            for (const [name,value] of Object.entries({missing,w,h})) assert.equal(BW.decode(actual[name] ?? actual[name+'_']),value,`${width},${height} ${name}`);
        }
    } finally {for (const run of runs) run.vm.quit(); clearStrayTimers();}
});

test('Dialog source ownership and unqualified Font/subclass operations keep named diagnostics', () => {
    assert.deepEqual(arcadeToPseudocode('namespace game {let dialog=new SplashDialog(160,35);dialog.setText("TITLE")}').unsupported, []);
    assert.deepEqual(arcadeToPseudocode('class SplashDialog {value=3;constructor(){}}let dialog=new SplashDialog();let value=dialog.value;').unsupported, []);
    for (const source of ['let dialog=new SplashDialog(160,35)', 'let dialog=new __bwSDK_SplashDialog(160,35)']) assert.ok(arcadeToPseudocode(source).unsupported.length>0, source);
    assert.match(arcadeToPseudocode('class Custom extends game.SplashDialog {}let dialog=new Custom(160,35)').unsupported.join('\n'), /separate.*qualification|separately qualified/);
    for (const source of ['let dialog=new game.BaseDialog(160,35,undefined,image.font5)', 'let dialog=new game.BaseDialog(160,35);dialog.resize(160,35,undefined,image.font5)'])
        assert.match(arcadeToPseudocode(source).unsupported.join('\n'), /Font/);
});

test('zero and negative default-frame dimensions survive Code, original export and same/fresh SB3', async () => {
    const cases = [[0,0],[0,3],[3,0],[-1,2],[2,-1]];
    const source = cases.map(([w,h],i) => `let d${i}=new game.BaseDialog(${w},${h});let missing${i}=d${i}.image==undefined;let width${i}=missing${i}?-1:d${i}.image.width;let height${i}=missing${i}?-1:d${i}.image.height;`).join('\n');
    const reference = await runPxtArcade(source), runs = [];
    const compare = (actual,label) => {for(let i=0;i<cases.length;i++)for(const prefix of ['missing','width','height']){
        const key=prefix+i;assert.equal(BW.decode(actual[key] ?? actual[key+'_']), reference[key], label+' '+key);
    }};
    try {
        const imported=arcadeToPseudocode(source), run=await execute(imported,runs);compare(globals(run),'native');
        compare(globals(await execute({...imported,code:run.creator.decompile()},runs)),'Code');
        const exported=projectToArcade(run.creator.project,{costumeSvg:(t,c)=>run.creator.assets.get(c.assetId)?.data});assert.deepEqual(exported.unsupported,[]);
        compare(await runPxtArcade(exported.files),'original export');compare(globals(await execute(arcadeToPseudocode(exported.files),runs)),'reimport');
        const bytes=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
        await run.vm.loadProject(bytes);run.vm.greenFlag();await stepFrames(run.vm,150,0);assert.deepEqual(run.errors,[]);compare(globals(run),'same SB3');
        const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(bytes);fresh.vm.greenFlag();await stepFrames(fresh.vm,150,0);assert.deepEqual(fresh.errors,[]);compare(globals(fresh),'fresh SB3');
    } finally {for(const run of runs)run.vm.quit();clearStrayTimers();}
});
