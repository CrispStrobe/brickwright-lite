import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {runProgram,stepFrames,clearStrayTimers,SB3Creator} from './helpers/bw-vm.mjs';
import {source} from './fixtures/arcade/sdk-image-fill-callables.mjs';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
const dispatch=(await importGuiDependency('scratch-vm/src/dispatch/central-dispatch.js')).default;
const owners=new WeakMap();
const captureOwner=run=>{const service=run.vm.extensionManager._loadedExtensions.get('arcade'),arcade=dispatch.services[service]?._inst;assert.ok(arcade?._runtime===run.vm.runtime);owners.set(run.vm,arcade);};
const qualifiedExport=JSON.parse(fs.readFileSync(new URL('./fixtures/arcade/sdk-image-fill-current-export.json',import.meta.url),'utf8'));
const wanted={fillCalls:1,fillTop:2,fillLeft:5,fillBottom:5,fillRight:2};
const imported=()=>{const result=arcadeToPseudocode(source);assert.deepEqual(result.unsupported,[]);assert.deepEqual(result.warnings,[]);return result;};
const inspect=(run,color=5)=>{assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);const vars=run.vm.runtime.targets.flatMap(t=>Object.values(t.variables));for(const [name,value]of Object.entries({...wanted,fillLeft:color,fillBottom:color}))assert.equal(vars.find(v=>v.name===name)?.value,value,name);const arcade=owners.get(run.vm);assert.ok(arcade?._runtime===run.vm.runtime);const image=arcade._image(vars.find(v=>v.name==='fillImage')?.value);assert.equal(image.width,3);assert.equal(image.height,3);assert.deepEqual(Array.from(image.pixels),[2,2,2,color,color,2,color,color,2]);};
test('actual owned Image fill and clipped fillRect preserve callback effects through native Code and portable roundtrips',async()=>{
 const runs=[];const start=async(code,color=5)=>{const run=await runProgram(code,{frames:80,storage:true});runs.push(run);captureOwner(run);inspect(run,color);return run;};
 try{
  const first=await start(imported().code),project=JSON.parse(first.vm.toJSON());
  await start(first.creator.decompile(project));
  const out=projectToArcade(project);assert.deepEqual(out.unsupported,[]);assert.deepEqual(out.warnings,[]);assert.match(out.ts,/\.fill\(/);assert.match(out.ts,/\.fillRect\(/);
  const again=arcadeToPseudocode(out.files);assert.deepEqual(again.unsupported,[]);await start(again.code);
  const saved=Buffer.from(await(await first.vm.saveProjectSb3()).arrayBuffer());
  first.vm.stopAll();await first.vm.loadProject(saved);first.vm.runtime.bwArcadeFrameAuthority='manual';first.vm.greenFlag();await stepFrames(first.vm,80,20);inspect(first);
  const fresh=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(fresh);fresh.vm.stopAll();await fresh.vm.loadProject(saved);fresh.vm.runtime.bwArcadeFrameAuthority='manual';fresh.vm.greenFlag();await stepFrames(fresh.vm,80,20);captureOwner(fresh);inspect(fresh);
  assert.deepEqual(projectToArcade(JSON.parse(fresh.vm.toJSON())).unsupported,[]);
  const target=first.vm.runtime.targets.find(t=>Object.values(t.blocks._blocks).some(b=>b.opcode==='arcade_drawImage'));
  const draw=Object.values(target.blocks._blocks).find(b=>b.opcode==='arcade_drawImage'),color=target.blocks.getBlock(draw.inputs.COLOR.block);
  assert.equal(color.opcode,'math_number');target.blocks.changeBlock({id:color.id,element:'field',name:'NUM',value:'9'});
  first.vm.stopAll();first.vm.greenFlag();await stepFrames(first.vm,80,20);inspect(first,9);
  const edited=projectToArcade(JSON.parse(first.vm.toJSON()));assert.deepEqual(edited.unsupported,[]);assert.deepEqual(edited.files,qualifiedExport);assert.match(edited.ts,/\.fillRect\([^;]+9\)/);
  const reimport=arcadeToPseudocode(edited.files);assert.deepEqual(reimport.unsupported,[]);await start(reimport.code,9);
  const editedSave=Buffer.from(await(await first.vm.saveProjectSb3()).arrayBuffer());fresh.vm.stopAll();await fresh.vm.loadProject(editedSave);fresh.vm.runtime.bwArcadeFrameAuthority='manual';fresh.vm.greenFlag();await stepFrames(fresh.vm,80,20);inspect(fresh,9);

 }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
test('Image drawing methods require actual Number operands and exact source shapes',()=>{
 imported();for(const changed of [source.replace('fill(this.color())','fill("2")'),source.replace('fill(this.color())','fill(this.color(),2)'),source.replace('fillRect(-1,1,3,2,5)','fillRect(-1,"1",3,2,5)'),source.replace('fillRect(-1,1,3,2,5)','fillRect(-1,1,3,2)'),source.replace('fillRect(-1,1,3,2,5)','drawLine(-1,1,3,2,5)')]){assert.notEqual(changed,source);assert.ok(arcadeToPseudocode(changed).unsupported.length,changed);}
});
test('current Image drawing cannot borrow producer authority or erase an evaluated replacement reporter',()=>{
 const fixture=()=>{const c=new SB3Creator();c.parse(imported().code);assert.deepEqual(c.warnings,[]);return c.project;};
 const original=fixture();assert.deepEqual(projectToArcade(original).unsupported,[]);
 for(const mutate of [
  b=>{b.inputs.COLOR=[1,[10,'2']];},b=>{b.inputs.IMAGE=[1,[10,'@image_1']];},b=>{b.fields.OP[0]='replace';},b=>{b.inputs.EXTRA=[1,[4,'0']];},
  (b,t)=>{b.inputs.TO=structuredClone(b.inputs.COLOR);b.inputs.COLOR=[1,[4,'2']];},b=>{b.inputs.TO=[1,[10,'0']];}
 ]){const p=fixture(),t=p.targets.find(t=>Object.values(t.blocks).some(b=>b.opcode==='arcade_mutateImage')),b=Object.values(t.blocks).find(b=>b.opcode==='arcade_mutateImage');mutate(b,t);assert.ok(projectToArcade(p).unsupported.length,String(mutate));}
});
