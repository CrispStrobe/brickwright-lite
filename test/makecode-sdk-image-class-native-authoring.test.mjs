import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runArcadeSourceCode} from './helpers/arcade-source-program.mjs';
import {stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {source} from './fixtures/arcade/sdk-image-class-callables.mjs';
const check=run=>{
 assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
 const vars=run.vm.runtime.targets.flatMap(target=>Object.values(target.variables));
 assert.deepEqual(['width','height','same','different'].map(name=>vars.find(variable=>variable.name===name).value),[2,2,true,true]);
};
test('opt-in SDK Image class callbacks preserve actual values through Code and same/fresh saved projects',async()=>{
 const ordinary=arcadeToPseudocode(source);assert.ok(ordinary.unsupported.length);
 const imported=arcadeToPseudocode(source,{sdkImagePrototype:true});assert.deepEqual(imported.unsupported,[]);assert.deepEqual(imported.warnings,[]);
 const runs=[];
 try{
  const run=await runArcadeSourceCode(imported.code,{frames:48});runs.push(run);check(run);
  const code=await runArcadeSourceCode(run.creator.decompile(JSON.parse(run.vm.toJSON())),{frames:48});runs.push(code);check(code);
  const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer());run.vm.stopAll();await run.vm.loadProject(saved);run.vm.runtime.bwArcadeFrameAuthority='manual';run.vm.greenFlag();await stepFrames(run.vm,48,20);check(run);
  const fresh=await runArcadeSourceCode('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(saved);fresh.vm.runtime.bwArcadeFrameAuthority='manual';fresh.vm.greenFlag();await stepFrames(fresh.vm,48,20);check(fresh);
  run.vm.stopAll();run.vm.greenFlag();await stepFrames(run.vm,48,20);check(run);
 }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});

test('current Image role removals refuse before constructor allocation, including unused slots and callback-only roles',async()=>{
 const runs=[];
 try{
  const variant=source.replace('constructor(picture:Image)','constructor(picture:Image,unused:Image)').replace('new Picture(imageValue)','new Picture(imageValue,imageValue)');
  const imported=arcadeToPseudocode(variant,{sdkImagePrototype:true});assert.deepEqual(imported.unsupported,[]);
  const baseline=await runArcadeSourceCode(imported.code,{frames:48});runs.push(baseline);check(baseline);
  for(const mutation of ['both','unused','callback']){
   const project=JSON.parse(baseline.vm.toJSON());
   for(const target of project.targets)for(const block of Object.values(target.blocks))if(block.opcode==='arcade_declareClass'){
    const read=name=>{const slot=block.inputs[name]?.[1];return Array.isArray(slot)?slot:target.blocks[slot];};
    const text=value=>Array.isArray(value)?value[1]:value.fields.TEXT[0];
    const name=text(read('NAME'));if(name!==(mutation==='callback'?'Holder':'Picture'))continue;
    for(const key of mutation==='callback'?['FIELDS']:mutation==='unused'?['PARAMETERS']:['FIELDS','PARAMETERS']){
     const input=read(key),rows=JSON.parse(text(input));
     if(mutation==='callback')rows[0].callableSignature.result={kind:'named',name:'number'};
     else for(const row of rows)if(mutation==='both'||row.name==='unused'){delete row.sdkType;if(row.valueKind==='sdk')delete row.valueKind;}
     if(Array.isArray(input))input[1]=JSON.stringify(rows);else input.fields.TEXT[0]=JSON.stringify(rows);
    }
   }
   const edited=await runArcadeSourceCode(baseline.creator.decompile(project),{frames:48});runs.push(edited);
   assert.ok(edited.errors.some(error=>/SDK class roles differ/.test(error)),mutation);
   const vars=edited.vm.runtime.targets.flatMap(target=>Object.values(target.variables));
   if(mutation!=='callback')assert.equal(vars.find(variable=>variable.name==='same').value,false,mutation+' must not construct Picture');
   else assert.equal(vars.find(variable=>variable.name==='height').value,0,'callback-only Holder roles must not construct a receiver');
  }
 }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});

test('an actual nominal class named Image stays an ordinary class through native dispatch',async()=>{
 const nominal='class Image{value:number;constructor(value:number){this.value=value}}class Holder{read:(picture:Image)=>number;constructor(){this.read=(picture:Image)=>{return picture.value}}}let picture=new Image(5);let holder=new Holder();let n=holder.read(picture);';
 const imported=arcadeToPseudocode(nominal,{sdkImagePrototype:true});assert.deepEqual(imported.unsupported,[]);
 let run;try{run=await runArcadeSourceCode(imported.code,{frames:48});assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);assert.equal(run.vm.runtime.targets.flatMap(target=>Object.values(target.variables)).find(variable=>variable.name==='n').value,5);}
 finally{if(run){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
