import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {ARCADE_PALETTE} from '../overlay/scratch-gui/src/lib/bw-makecode/pixel-image.js';
import {blankLayer,composeLayers,layersDocument,layersToSvg} from '../overlay/scratch-gui/src/lib/bw-pixel-layers.js';
import {setCostumeDocument,syncAnimationResources} from '../overlay/scratch-gui/src/lib/bw-artwork-bundle.js';
import {importGuiDependency} from './helpers/bw-integrated.mjs';
import {scopeAfter} from './helpers/js-scope.mjs';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {source} from './fixtures/arcade/sdk-image-literal-callables.mjs';
const wanted={imageLiteralCalls:3,imageLiteralChanged:7,imageLiteralOriginal:1,imageLiteralLater:1,imageLiteralOutside:0,imageLiteralAliasSame:true,imageLiteralFresh:true,imageLiteralLaterFresh:true,imageLiteralScore:19};
const dispatch=(await importGuiDependency('scratch-vm/src/dispatch/central-dispatch.js')).default;
const instances=new WeakMap();
const captureOwner=run=>{const service=run.vm.extensionManager._loadedExtensions.get('arcade'),arcade=dispatch.services[service]?._inst;assert.ok(arcade);assert.ok(arcade._runtime===run.vm.runtime,'actual per-VM Arcade instance');instances.set(run.vm,arcade);};
const observe=(run,corner=2)=>{
 assert.deepEqual(run.errors,[]);assert.deepEqual(run.creator.warnings,[]);
 const vars=run.vm.runtime.targets.flatMap(t=>Object.values(t.variables));
 const arcade=instances.get(run.vm);assert.ok(arcade);assert.ok(arcade._runtime===run.vm.runtime,'actual per-VM Arcade instance');
 for(const [name,pixels]of [['imageLiteralFirst',[7,0,0,corner]],['imageLiteralAlias',[7,0,0,corner]],['imageLiteralSecond',[corner===2?1:3,0,0,corner]],['imageLiteralThird',[corner===2?1:3,0,0,corner]]]){
  const image=arcade._image(vars.find(v=>v.name===name)?.value);assert.ok(image,name);assert.equal(image.width,2);assert.equal(image.height,2);assert.deepEqual(Array.from(image.pixels),pixels,name);
 }
 return Object.fromEntries(Object.keys(wanted).map(name=>[name,vars.find(v=>v.name===name)?.value]));
};
const reader=run=>(target,costume)=>{
 const targets=run.vm.runtime.targets.filter(t=>t.isOriginal&&t.getName()===target.name);if(targets.length!==1)return null;
 const matches=targets[0].getCostumes().filter(c=>c.assetId===costume.assetId&&c.dataFormat===costume.dataFormat);
 return matches.length===1&&matches[0].asset?.data?new TextDecoder().decode(matches[0].asset.data):null;
};
const execute=async(input,runs)=>{
 const imported=arcadeToPseudocode(input);assert.deepEqual(imported.unsupported,[]);
 const run=await runProgram(imported.code,{frames:80,storage:true,uploads:imported.costumes});captureOwner(run);runs.push(run);return run;
};
const reopen=async(saved,runs)=>{
 const run=await runProgram('SPRITE Placeholder:\nWHEN flag clicked:\n  hide',{frames:0,storage:true});runs.push(run);
 run.vm.stopAll();await run.vm.loadProject(saved);captureOwner(run);run.vm.runtime.bwArcadeFrameAuthority='manual';run.vm.greenFlag();await stepFrames(run.vm,80,20);return run;
};
const editorSource=readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/pixel-art-editor.jsx',import.meta.url),'utf8');
const save=new Function('layersDocument','layersToSvg','setCostumeDocument','syncAnimationResources',`return function(resourceOverride) ${scopeAfter(editorSource,'save (resourceOverride) {')}`)(layersDocument,layersToSvg,setCostumeDocument,syncAnimationResources);
test('literal Image repeated factory calls preserve fresh allocation, alias mutation and current export through portable routes',async()=>{
 const runs=[];try{
  const first=await execute(source,runs);assert.deepEqual(observe(first),wanted);
  const project=JSON.parse(first.vm.toJSON());const code=await runProgram(first.creator.decompile(project),{frames:80,storage:true,uploads:arcadeToPseudocode(source).costumes});captureOwner(code);runs.push(code);assert.deepEqual(observe(code),wanted);
  const exported=projectToArcade(project,{costumeSvg:reader(first)});assert.deepEqual(exported.unsupported,[]);assert.deepEqual(exported.warnings,[]);assert.doesNotMatch(exported.ts,/__bwFrames_/);assert.match(exported.ts,/return img`/);
  const again=await execute(exported.files,runs);assert.deepEqual(observe(again),wanted);
  const saved=Buffer.from(await(await first.vm.saveProjectSb3()).arrayBuffer());first.vm.stopAll();await first.vm.loadProject(saved);first.vm.runtime.bwArcadeFrameAuthority='manual';first.vm.greenFlag();await stepFrames(first.vm,80,20);assert.deepEqual(observe(first),wanted);
  const fresh=await reopen(saved,runs);assert.deepEqual(observe(fresh),wanted);assert.deepEqual(projectToArcade(JSON.parse(fresh.vm.toJSON()),{costumeSvg:reader(fresh)}).unsupported,[]);
 }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
test('actual pixel editor save and costume rename preserve current SVG pixels after asset remapping and fresh SB3',async()=>{
 const runs=[];try{
  const run=await execute(source,runs),frame=run.creator.project.targets.flatMap(t=>Object.values(t.blocks)).find(b=>b.opcode==='arcade_frameImage'),resourceName=frame.inputs.TEMPLATE[1][1],target=run.vm.runtime.targets.find(t=>t.isOriginal&&t.getName()===resourceName);
  assert.ok(target);run.vm.setEditingTarget(target.id);run.vm.renameCostume(0,'Edited literal resource');const oldId=target.getCostumes()[0].assetId;
  const layer=blankLayer('pixels','Pixels',2,2);layer.pixels=Uint8Array.from([3,0,0,4]);const layers=[layer],frames=[{id:'one',durationMs:100,layers,activeLayerId:'pixels'}];
  const editor={props:{vm:run.vm,costumeIndex:0},state:{image:composeLayers(layers,2,2),layers,frames,scale:4,activeLayerId:'pixels',activeFrameId:'one',palette:ARCADE_PALETTE,animationResource:null,animationName:''},stopPlayback(){},materializeFrames(){return frames;},costume:()=>target.getCostumes()[0],setState(patch){Object.assign(this.state,patch);}};
  assert.equal(save.call(editor),true);assert.equal(editor.state.status,'saved');assert.notEqual(target.getCostumes()[0].assetId,oldId);
  run.vm.renameSprite(target.id,'RenamedImageResource');const renamed=target.getName();assert.notEqual(renamed,resourceName);
  let references=0;for(const owner of run.vm.runtime.targets)for(const frame of Object.values(owner.blocks._blocks))if(frame.opcode==='arcade_frameImage'){
   const input=owner.blocks.getBlock(frame.inputs.TEMPLATE.block);if(input?.fields.TEXT?.value===resourceName){owner.blocks.changeBlock({id:input.id,element:'field',name:'TEXT',value:renamed});references++;}
  }assert.ok(references,'actual connected resource references follow the target rename');
  const current=JSON.parse(run.vm.toJSON()),exported=projectToArcade(current,{costumeSvg:reader(run)});assert.deepEqual(exported.unsupported,[]);assert.deepEqual(exported.warnings,[]);assert.match(exported.ts,/img`\s*3 \.\s*\. 4\s*`/);
  const expected={...wanted,imageLiteralOriginal:3,imageLiteralLater:3,imageLiteralScore:23};
  const again=await execute(exported.files,runs);assert.deepEqual(observe(again,4),expected);
  const saved=Buffer.from(await(await run.vm.saveProjectSb3()).arrayBuffer()),fresh=await reopen(saved,runs);assert.deepEqual(observe(fresh,4),expected);
  assert.ok(fresh.vm.runtime.targets.some(t=>t.getCostumes().some(c=>c.name==='Edited literal resource')));
  const final=projectToArcade(JSON.parse(fresh.vm.toJSON()),{costumeSvg:reader(fresh)});assert.deepEqual(final.unsupported,[]);assert.match(final.ts,/img`\s*3 \.\s*\. 4\s*`/);
 }finally{for(const run of runs){run.vm.stopAll();run.vm.quit();}clearStrayTimers();}
});
