import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import Module from 'node:module';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram, stepFrames, INTEGRATED} from './helpers/bw-vm.mjs';
import {patchArcadeSettingsSB3} from '../scripts/lib/arcade-settings-sb3-hooks.mjs';
const require=createRequire(import.meta.url);
const settings=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/program-settings.js');
const memoryDevice=()=>{const entries=new Map();return {getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value)};};

test('program number settings survive snapshots/devices with isolated identities and exact numbers',()=>{
    const target={isStage:true},storage=memoryDevice();
    const first=settings.createProgramSettings(target,{storage});
    for(const [key,value] of [['high-score',9],['NaN',NaN],['Infinity',Infinity],['negative-zero',-0],['__proto__',2]])first.writeNumber(key,value);
    const snapshot={isStage:true};settings.save(target,snapshot);
    const reopened={isStage:true};settings.restore(JSON.parse(JSON.stringify(snapshot)),reopened);
    const otherDevice=settings.createProgramSettings(reopened,{storage:memoryDevice()});
    assert.equal(otherDevice.id,first.id);assert.equal(otherDevice.readNumber('high-score'),9);
    assert.ok(Number.isNaN(otherDevice.readNumber('NaN')));assert.equal(otherDevice.readNumber('Infinity'),Infinity);
    assert.ok(Object.is(otherDevice.readNumber('negative-zero'),-0));assert.equal(otherDevice.readNumber('__proto__'),2);
    first.writeNumber('high-score',10);
    const local=settings.createProgramSettings(reopened,{storage});assert.equal(local.readNumber('high-score'),10);
    assert.notEqual(settings.createProgramSettings({isStage:true},{storage}).id,first.id);
    assert.equal(settings.createProgramSettings({isStage:true},{storage}).readNumber('high-score'),undefined);
});

test('device write failures and malformed records never silently change live snapshots',()=>{
    const target={isStage:true},storage={getItem:()=>null,setItem:()=>{throw new Error('quota');}};
    const store=settings.createProgramSettings(target,{storage});const before=JSON.stringify(target.bwArcadeSettings);
    assert.throws(()=>store.writeNumber('high-score',9),/quota/);
    assert.equal(store.readNumber('high-score'),undefined);assert.equal(JSON.stringify(target.bwArcadeSettings),before);
    assert.throws(()=>settings.createProgramSettings(target,{storage:{getItem:()=>'{broken'}}),/malformed/);
    assert.equal(settings.validated({version:1,id:'valid-identity',values:{x:null}}),null);
});

for(const [style,score,low] of [['Win',2,undefined],['Score',2,undefined],['Multi',9,undefined],['Timed',undefined,0]]) {
    test('native carnival '+style+' countdown reaches the real dialog scene and retains records',async()=>{
        const source=`info.player1.setScore(2)\ninfo.player2.setScore(9)\ncarnival.startCountdownGame(0.1,carnival.WinTypes.${style})`;
        const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
        const run=await runProgram(imported.code,{frames:90,storage:true});
        try {
            assert.deepEqual(run.errors,[]);
            const state=run.vm.runtime.bwArcadeDeviceState;
            assert.ok(state.sceneFrame?.pixels.some(x=>x),'a rendered native frame');
            assert.ok(state.backgroundImage,'custom game-over cloned the old screen');
            const snapshot=run.vm.runtime.getTargetForStage().bwArcadeSettings;
            assert.ok(snapshot?.id);
            if(score!==undefined)assert.equal(snapshot.values['high-score'],9,'original saveHighScore judges all scoring players');
            if(low!==undefined)assert.equal(snapshot.values['low-score'],low);
            const exported=projectToArcade(JSON.parse(run.vm.toJSON()));
            assert.match(exported.ts,/carnival\.startCountdownGame\(0\.1, carnival\.WinTypes\./);
            assert.equal(JSON.parse(exported.files['pxt.json']).dependencies['arcade-carnival'],'github:microsoft/arcade-carnival#v0.0.7');
            assert.deepEqual(arcadeToPseudocode(exported.ts).unsupported,[]);
        }finally{run.vm.quit?.();}
    });
}

test('stop cancels carnival waits and a new run gets a fresh callback',async()=>{
    const imported=arcadeToPseudocode('info.setScore(4)\ncarnival.startCountdownGame(0.1,carnival.WinTypes.Score)');
    const run=await runProgram(imported.code,{frames:12,storage:true});
    try {
        run.vm.stopAll();await stepFrames(run.vm,100,20);
        assert.deepEqual(run.errors,[]);
        run.vm.greenFlag();await stepFrames(run.vm,90,20);
        assert.ok(run.vm.runtime.bwArcadeDeviceState.backgroundImage);
        assert.deepEqual(run.errors,[]);
    }finally{run.vm.quit?.();}
});

test('button input restarts a finished carnival dialog while retaining program records',async()=>{
    const imported=arcadeToPseudocode('info.setScore(9)\ncarnival.startCountdownGame(2,carnival.WinTypes.Score)');
    const run=await runProgram(imported.code,{frames:0,storage:true});
    try {
        await stepFrames(run.vm,180,20);
        const first=run.vm.runtime.getTargetForStage().bwArcadeSettings;
        assert.ok(run.vm.runtime.bwArcadeDeviceState.backgroundImage);
        assert.ok(run.vm.runtime.bwArcadeDeviceState.elapsedMs>1100);
        run.vm.postIOData('keyboard',{key:' ',isDown:true});
        run.vm.postIOData('keyboard',{key:' ',isDown:false});
        await stepFrames(run.vm,2,20);
        assert.ok(!run.vm.runtime.bwArcadeDeviceState.backgroundImage);
        assert.equal(run.vm.runtime.getTargetForStage().bwArcadeSettings.id,first.id);
        assert.deepEqual(run.vm.runtime.getTargetForStage().bwArcadeSettings.values,first.values);
        assert.deepEqual(run.errors,[]);
    }finally{run.vm.quit?.();}
});

test('unsupported carnival calls, dynamic styles and shadowed namespaces remain diagnosed',()=>{
    for(const source of ['carnival.startCountdownGame(1, 4)','carnival.customGameOverExpanded("Hi")',
        'let carnival=1; carnival.startCountdownGame(1, carnival.WinTypes.Multi)']) {
        assert.ok(arcadeToPseudocode(source).unsupported.length,source);
    }
});


test('countdown retains its first carnival style and later info registration replaces it',async()=>{
    const first=arcadeToPseudocode('carnival.startCountdownGame(0.1,carnival.WinTypes.Timed)\ncarnival.startCountdownGame(0.1,carnival.WinTypes.Score)');
    assert.deepEqual(first.unsupported,[]);
    const run=await runProgram(first.code,{frames:90,storage:true});
    try {
        assert.deepEqual(run.errors,[]);
        assert.equal(run.vm.runtime.getTargetForStage().bwArcadeSettings.values['low-score'],0);
    }finally{run.vm.quit?.();}
    const replaced=arcadeToPseudocode('let seen = 0\ncarnival.startCountdownGame(0.1,carnival.WinTypes.Timed)\ninfo.onCountdownEnd(function () { info.setScore(12); seen = info.score() })');
    assert.deepEqual(replaced.unsupported,[]);
    const next=await runProgram(replaced.code,{frames:90,storage:true});
    try {
        assert.deepEqual(next.errors,[]);
        const stage=next.vm.runtime.getTargetForStage();
        assert.equal(stage.bwArcadeSettings.values['low-score'],undefined);
        assert.equal(Object.values(stage.variables).find(v=>v.name==='seen').value,12);
        assert.ok(!next.vm.runtime.bwArcadeDeviceState.backgroundImage);
    }finally{next.vm.quit?.();}
});

test('direct carnival game-over command exports its effect and uses a native dialog',async()=>{
    const imported=arcadeToPseudocode('info.setScore(7)\ncarnival.onGameOverExpanded(carnival.WinTypes.Score,effects.hearts)');
    assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:90,storage:true});
    try {
        assert.deepEqual(run.errors,[]);
        assert.equal(run.vm.runtime.getTargetForStage().bwArcadeSettings.values['high-score'],7);
        assert.ok(run.vm.runtime.bwArcadeDeviceState.backgroundImage);
        const exported=projectToArcade(JSON.parse(run.vm.toJSON()));
        assert.match(exported.ts,/carnival\.onGameOverExpanded\(carnival\.WinTypes\.Score, effects\.hearts\)/);
        assert.deepEqual(arcadeToPseudocode(exported.ts).unsupported,[]);
    }finally{run.vm.quit?.();}
});

test('actual SB3 save/load pipeline carries program settings without learner variables',async()=>{
    // Isolated in-memory injection of the exact production serializer hooks.
    // The shared installed dependency files are never modified by this test.
    const filename=path.join(INTEGRATED,'node_modules/scratch-vm/src/serialization/sb3.js');
    const serializer=(await import(pathToFileURL(filename).href)).default,original={serialize:serializer.serialize,deserialize:serializer.deserialize};
    const patched=new Module(filename);patched.filename=filename;patched.paths=Module._nodeModulePaths(path.dirname(filename));
    const loader=patched.require.bind(patched);
    patched.require=name=>name==='../extensions/crispstrobe/arcade/program-settings'?settings:loader(name);
    const source=fs.readFileSync(filename,'utf8');
    assert.equal(patchArcadeSettingsSB3(patchArcadeSettingsSB3(source)),patchArcadeSettingsSB3(source),'hooks are idempotent');
    patched._compile(patchArcadeSettingsSB3(source),filename);
    serializer.serialize=patched.exports.serialize;serializer.deserialize=patched.exports.deserialize;
    let run,reopened;
    try {
        const imported=arcadeToPseudocode('info.setScore(4)\ncarnival.startCountdownGame(0.1,carnival.WinTypes.Score)');
        run=await runProgram(imported.code,{frames:90,storage:true});
        const before=run.vm.runtime.getTargetForStage().bwArcadeSettings;
        const archive=Buffer.from(await (await run.vm.saveProjectSb3()).arrayBuffer());
        const json=JSON.parse(await (await JSZip.loadAsync(archive)).file('project.json').async('string'));
        const stage=json.targets.find(t=>t.isStage);
        assert.deepEqual(stage.bwArcadeSettings,JSON.parse(JSON.stringify(before)));
        assert.ok(!Object.values(stage.variables).some(v=>v[0].includes('bwArcadeSettings')));
        reopened=(await runProgram(imported.code,{frames:0,storage:true})).vm;
        reopened.stopAll();await reopened.loadProject(archive);
        assert.deepEqual(JSON.parse(JSON.stringify(reopened.runtime.getTargetForStage().bwArcadeSettings)),stage.bwArcadeSettings);
        reopened.greenFlag();await stepFrames(reopened,90,20);
        assert.equal(reopened.runtime.getTargetForStage().bwArcadeSettings.values['high-score'],4);
    }finally{
        run?.vm.quit?.();reopened?.quit?.();Object.assign(serializer,original);
    }
});
