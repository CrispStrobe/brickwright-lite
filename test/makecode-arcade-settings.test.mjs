import test from 'node:test';
import Module from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import JSZip from 'jszip';
import {INTEGRATED} from './helpers/bw-integrated.mjs';
import {patchArcadeSettingsSB3} from '../scripts/lib/arcade-settings-sb3-hooks.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const require=createRequire(import.meta.url),settings=require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/program-settings.js');
const values=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value?.bwUndefined===true?undefined:v.value]));
const source=`settings.clear()
settings.writeNumber("nullable",null)
let nullable=settings.readNumber("nullable")
settings.remove("nullable")
settings.writeNumber("n",1.25)
settings.writeString("text","A€🙂")
let numbers=[-31,-32,127,128,65536,3.141592653589793]
settings.writeNumberArray("numbers",numbers)
numbers[0]=99
let stored=settings.readNumberArray("numbers")
let first=stored[0]
stored[0]=77
let detached=settings.readNumberArray("numbers")[0]
let count=settings.readNumber("n")
let text=settings.readString("text")
let bytes=settings.readBuffer("numbers")
let packed=bytes.toHex()
bytes[0]=1
let independent=settings.readNumberArray("numbers")[0]
let missing=settings.readNumber("missing")
let missingText=settings.readString("missing")
let exists=settings.exists("numbers")
let names=settings.list()
let listed=names[0]+","+names[1]+","+names[2]
settings.writeNumber("#keep",4)
settings.remove("text")
let removed=settings.exists("text")
settings.clear()
let cleared=settings.exists("numbers")
let kept=settings.readNumber("#keep")
let after=settings.list().length
let done=1
done+=0`;
const keys=['nullable','first','detached','count','text','packed','independent','missing','missingText','exists','listed','removed','cleared','kept','after','done'];

test('Settings codecs and byte backend regenerate exactly from pinned original inputs',()=>{execFileSync(process.execPath,['scripts/generate-arcade-settings.mjs','--check'],{stdio:'pipe'});});
test('native typed Settings matches original bytes, missing values, detached reads, ordering and operations through editable roundtrips',async()=>{
    const original=await runPxtArcade(source);assert.equal(original.first,-31);assert.equal(original.detached,-31);assert.equal(original.text,'A€🙂');assert.equal(original.listed,'n,text,numbers');assert.equal(original.missing,undefined);assert.equal(original.kept,4);
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    try{
        const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);for(const key of keys)assert.equal(values(run)[key],original[key],key);};
        const run=await runProgram(imported.code,{frames:100,storage:true});check(run);
        check(await runProgram(run.creator.decompile(),{frames:100,storage:true}));
        const exported=projectToArcade(run.creator.project);assert.deepEqual(exported.unsupported,[]);
        const pxt=await runPxtArcade(exported.files);for(const key of keys)assert.equal(pxt[key]??pxt['Game_'+key],original[key],key+' exported');
        const again=arcadeToPseudocode(exported.ts);assert.deepEqual(again.unsupported,[]);check(await runProgram(again.code,{frames:100,storage:true}));
    }finally{clearStrayTimers();}
});
test('persistent program Settings shares records with Carnival and reports refused device writes honestly',()=>{
    const entries=new Map(),device={getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value)},target={isStage:true};
    const first=settings.createProgramSettings(target,{storage:device}),second=settings.createProgramSettings(target,{storage:device});
    first.writeNumber('high-score',9);second.call('writeString','name','Ada');assert.equal(first.readNumber('high-score'),9);
    first.writeNumber('low-score',4);assert.equal(second.call('readString','name'),'Ada');
    second.call('writeNumberArray','scores',[3,8,12]);const snapshot={isStage:true};settings.save(target,snapshot);
    second.call('writeNumber','high-score',10);const restored={isStage:true};settings.restore(JSON.parse(JSON.stringify(snapshot)),restored);
    const reopened=settings.createProgramSettings(restored,{storage:device});assert.equal(reopened.call('readNumber','high-score'),10);assert.deepEqual(reopened.call('readNumberArray','scores'),[3,8,12]);
    const other=settings.createProgramSettings({isStage:true},{storage:device});assert.equal(other.call('readString','name'),undefined);
    const brokenTarget={isStage:true},broken=settings.createProgramSettings(brokenTarget,{storage:{getItem:()=>null,setItem:()=>{throw new Error('quota');}}});const before=JSON.stringify(brokenTarget.bwArcadeSettings);
    assert.throws(()=>broken.call('writeString','x','text'),/quota/);assert.equal(JSON.stringify(brokenTarget.bwArcadeSettings),before);assert.equal(broken.call('readString','x'),undefined);
    assert.throws(()=>settings.createProgramSettings(target,{storage:{getItem:()=>'{bad'}}),/malformed/);
    assert.equal(settings.validated({version:1,id:'valid-id',values:{},buffers:{'S/x':'%%%'}}),null);
});
test('settings survive Stop and greenFlag with stable program identity',async()=>{
    const imported=arcadeToPseudocode('let count=settings.readNumber("counter");if(!settings.exists("counter")){count=0}count+=1;settings.writeNumber("counter",count)');assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:25,storage:true});const id=run.vm.runtime.getTargetForStage().bwArcadeSettings.id;assert.equal(values(run).count,1);
    run.vm.stopAll();run.vm.greenFlag();await stepFrames(run.vm,25);assert.equal(values(run).count,2);assert.equal(run.vm.runtime.getTargetForStage().bwArcadeSettings.id,id);assert.deepEqual(run.errors,[]);clearStrayTimers();
});
test('unsupported settings methods and the unreviewed StringArray dependency stay named gaps',()=>{
    for(const source of ['settings.writeJSON("x",{})','blockSettings.writeStringArray("x",["A"])','settings.writeNumber("x")','settings.readString()'])assert.ok(arcadeToPseudocode(source).unsupported.length,source);
});


test('actual SB3 save/reopen retains byte records and device latest values without resetting identity',async()=>{
    const filename=path.join(INTEGRATED,'node_modules/scratch-vm/src/serialization/sb3.js'),serializer=(await import(pathToFileURL(filename).href)).default;
    const saved={serialize:serializer.serialize,deserialize:serializer.deserialize},patched=new Module(filename);patched.filename=filename;patched.paths=Module._nodeModulePaths(path.dirname(filename));
    const loader=patched.require.bind(patched);patched.require=name=>name==='../extensions/crispstrobe/arcade/program-settings'?settings:loader(name);
    patched._compile(patchArcadeSettingsSB3(fs.readFileSync(filename,'utf8')),filename);serializer.serialize=patched.exports.serialize;serializer.deserialize=patched.exports.deserialize;
    const data=new Map(),device={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
    const imported=arcadeToPseudocode('let count=settings.readNumber("counter");if(!settings.exists("counter")){count=0}count+=1;settings.writeNumber("counter",count)');
    let run,reopened;
    try{
        run=await runProgram(imported.code,{frames:0,storage:true});run.vm.runtime.bwArcadeSettingsStorage=device;await stepFrames(run.vm,30);assert.equal(values(run).count,1);
        const id=run.vm.runtime.getTargetForStage().bwArcadeSettings.id,archive=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());
        const json=JSON.parse(await(await JSZip.loadAsync(archive)).file('project.json').async('string')),snapshot=json.targets.find(t=>t.isStage).bwArcadeSettings;
        assert.ok(snapshot.buffers['S/counter']);assert.equal(snapshot.id,id);
        run.vm.stopAll();run.vm.greenFlag();await stepFrames(run.vm,30);assert.equal(values(run).count,2);
        reopened=await runProgram('SPRITE Empty:\nWHEN flag clicked:\n  wait 0 seconds\n',{frames:0,storage:true});reopened.vm.stopAll();reopened.vm.runtime.bwArcadeSettingsStorage=device;
        await reopened.vm.loadProject(archive);assert.equal(reopened.vm.runtime.getTargetForStage().bwArcadeSettings.id,id);
        reopened.vm.greenFlag();await stepFrames(reopened.vm,30);assert.equal(values(reopened).count,3,'device latest record supersedes the older portable snapshot');assert.deepEqual(reopened.errors,[]);
        assert.throws(()=>settings.restore({isStage:true,bwArcadeSettings:{...snapshot,buffers:{'S/counter':'invalid'}}},{isStage:true}),/malformed/);
    }finally{run?.vm.quit?.();reopened?.vm.quit?.();Object.assign(serializer,saved);clearStrayTimers();}
});

test('original logical capacity panic clears user settings while retaining bounded system records',()=>{
    const target={isStage:true},store=settings.createProgramSettings(target,{storage:null});
    store.call('writeNumber','user',3);store.call('writeNumber','#keep',4);
    assert.throws(()=>store.call('writeString','large','x'.repeat(20000)),error=>error.settingsPanic===920);
    assert.equal(store.call('exists','user'),false);assert.equal(store.call('readNumber','#keep'),4);
    store.call('writeString','cross','abc');assert.equal(store.call('readNumber','cross'),97,'read APIs decode actual bytes without a guessed stored type');
    store.call('writeNumber','nan',NaN);assert.ok(Number.isNaN(store.call('readNumber','nan')));
    store.call('writeNumber','infinity',Infinity);assert.equal(store.call('readNumber','infinity'),Infinity);
});
