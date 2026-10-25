import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
import {runPxtArcade} from './helpers/pxt-arcade-runtime.mjs';
const save=(name,value)=>{if(process.env.NAMED_ITEM_EVIDENCE){fs.mkdirSync(process.env.NAMED_ITEM_EVIDENCE,{recursive:true});fs.writeFileSync(path.join(process.env.NAMED_ITEM_EVIDENCE,name),JSON.stringify(value,(_key,v)=>v===undefined?{evidenceUndefined:true}:v,2));}};
const saveBinary=(name,bytes)=>{if(process.env.NAMED_ITEM_EVIDENCE){fs.mkdirSync(process.env.NAMED_ITEM_EVIDENCE,{recursive:true});fs.writeFileSync(path.join(process.env.NAMED_ITEM_EVIDENCE,name),bytes);}};
const BW=(await importGuiDependency('scratch-vm/src/util/bw-values.js')).default;
const code=`DEVICE ARCADE
SPRITE Game:
WHEN flag clicked:
  hide
  new array "items" = [12,true,null,"word","[1,2]","{\\"x\\":1}","arcade:1","","é雪",[2,3]]
  set numberItem to item 0 of array "items"
  set booleanItem to item 1 of array "items"
  set nullItem to item 2 of array "items"
  set textItem to item 3 of array "items"
  set jsonLookingText to item 4 of array "items"
  set objectLookingText to item 5 of array "items"
  set tokenLookingText to item 6 of array "items"
  set emptyText to item 7 of array "items"
  set unicodeText to item 8 of array "items"
  set aggregateText to item 9 of array "items"
  push "[4,5]" to array "items"
  set appendedAggregate to item 10 of array "items"
  set absentItem to item 99 of array "items"
  set complete to convert value ("1") op "+"`;
const expected={numberItem:12,booleanItem:true,nullItem:null,textItem:'word',jsonLookingText:'[1,2]',objectLookingText:'{"x":1}',tokenLookingText:'arcade:1',emptyText:'',unicodeText:'é雪',aggregateText:'[2,3]',appendedAggregate:'[4,5]',absentItem:undefined,complete:1};
let observationSequence=0;
const read=run=>Object.fromEntries(run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name,v.value && typeof v.value==='object'?BW.decode(v.value):v.value]));
const check=run=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);const values=read(run);save('native-observations-'+(++observationSequence)+'.json',values);for(const [name,value] of Object.entries(expected)){const found=Object.entries(values).filter(([key])=>key===name || key===`Game_${name}`);assert.equal(found.length,1,name);assert.equal(found[0][1],value,name);}};
test('named Array getters preserve typed scalar text and aggregate JSON across native Code SB3 and export reimport',async()=>{
    const runs=[];const execute=async(code,options={})=>{const run=await runProgram(code,{frames:40,storage:true,...options});runs.push(run);check(run);return run;};
    try{
        save("source-code.json",code);const first=await execute(code);const replay=first.creator.decompile();save("replay-code.json",replay);await execute(replay);
        const saved=Buffer.from(await(await first.vm.saveProjectSb3()).arrayBuffer());saveBinary("project.sb3",saved);first.vm.stopAll();await first.vm.loadProject(saved);first.vm.greenFlag();await stepFrames(first.vm,40);check(first);
        const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(saved);fresh.vm.greenFlag();await stepFrames(fresh.vm,40);check(fresh);
        const exported=projectToArcade(first.creator.project);assert.deepEqual(exported.unsupported,[]);save('export-files.json',exported.files);
        if(!process.env.NAMED_ITEM_NATIVE_ONLY){const original=await runPxtArcade(exported.files,{fakeClock:true,waitForGlobals:{Game_complete:1},onCompilation:packet=>save('export-compilation.json',packet)});save('export-observations.json',original);for(const [name,value] of Object.entries(expected)){const found=Object.entries(original).filter(([key])=>key===name || key===`Game_${name}`);assert.equal(found.length,1,name);assert.equal(found[0][1],value,name);}}
        const imported=arcadeToPseudocode(exported.files);assert.deepEqual(imported.unsupported,[]);save("reimport-code.json",imported.code);await execute(imported.code);
    }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});

test('a real canonical Array reference stays a reference and receives an export refusal',async()=>{
    const run=await runProgram(`DEVICE ARCADE
SPRITE Game:
WHEN flag clicked:
  new array "other" = [1]
  new array "items"
  push (reference to named array ("other")) to array "items"
  set actual to item 0 of array "items"
  set expectedReference to reference to named array ("other")`,{frames:20});
    try{
        assert.deepEqual(run.errors,[]);const values=read(run);
        assert.equal(BW.isReference(values.actual),true);
        assert.equal(BW.equal(values.actual,values.expectedReference),true);
        const exported=projectToArcade(run.creator.project);
        assert.ok(exported.unsupported.some(message=>/opaque or native reference writers/.test(message)));
    }finally{run.vm.stopAll();run.vm.quit();clearStrayTimers();}
});

test('actual owned native getMulti uses JSON while get2D and pop retain aggregate objects',async()=>{
    const run=await runProgram('SPRITE Game:\nWHEN flag clicked:\n  new array "matrix" = [[["word",false,null]]]',{frames:10});
    try{
        const dispatch=(await importGuiDependency('scratch-vm/src/dispatch/central-dispatch.js')).default;
        const label=run.vm.extensionManager._loadedExtensions.get('arrays'),adapter=dispatch.services[label],actual=adapter._inst;
        assert.equal(actual._runtime,run.vm.runtime,'capture the actual instance owned by this VM');
        assert.equal(actual.getMulti({NAME:'matrix',INDICES:'[0,0]'}),'["word",false,null]');
        const row=actual.get2D({NAME:'matrix',ROW:0,COL:0});assert.equal(Array.isArray(row),true);assert.equal(BW.isReference(row),false);assert.deepEqual(row,['word',false,null]);
        const popped=actual.pop({NAME:'matrix'});assert.equal(Array.isArray(popped),true);assert.equal(BW.isReference(popped),false);assert.equal(popped[0],row);
    }finally{run.vm.stopAll();run.vm.quit();clearStrayTimers();}
});
