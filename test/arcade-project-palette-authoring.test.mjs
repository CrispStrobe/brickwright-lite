import test from 'node:test';
import assert from 'node:assert/strict';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {inspectProjectPalette,applyProjectPalette,DEFAULT_PROJECT_PALETTE,paletteHex} from '../overlay/scratch-gui/src/lib/arcade-project-palette.js';
const colors=[...DEFAULT_PROJECT_PALETTE];colors[0]='#102030';colors[1]='#123456';colors[2]='#123456';
async function fixture(palette){
 const files={'main.ts':'let hero=sprites.create(img`1 2`,SpriteKind.Player)\nlet ready=true',
 'pxt.json':JSON.stringify({name:'palette-editor',dependencies:{device:'*'},files:['main.ts'],...(palette?{palette}:{})})};
 const imported=arcadeToPseudocode(files);assert.deepEqual(imported.unsupported,[]);
 return runProgram(imported.code,{frames:12,storage:true,uploads:imported.costumes});
}
const snapshot=vm=>JSON.stringify(vm.runtime.targets.map(t=>t.blocks._blocks));
test('palette authoring prepends real startup blocks and survives SB3 save/load and restart',async()=>{
 const run=await fixture();try{
  const before=inspectProjectPalette(run.vm);assert.equal(before.kind,'default');
  const after=await applyProjectPalette(run.vm,colors,before.signature);assert.equal(after.kind,'constant');
  assert.deepEqual(after.colors,colors);assert.deepEqual(run.vm.runtime.bwArcadeDeviceState.palette,colors);
  const saved=await run.vm.saveProjectSb3();await run.vm.loadProject(Buffer.from(await saved.arrayBuffer()));
  assert.deepEqual(inspectProjectPalette(run.vm).colors,colors);
  run.vm.greenFlag();await stepFrames(run.vm,12);assert.deepEqual(run.vm.runtime.bwArcadeDeviceState.palette,colors);
  assert.match(run.vm.toJSON(),/arcade_setPalette/);
 }finally{clearStrayTimers();}
});
test('updating a literal startup preserves authored later palette changes and other blocks',async()=>{
 const run=await fixture(colors);try{
  const before=inspectProjectPalette(run.vm);assert.equal(before.kind,'constant');
  const blocks=before.start.target.blocks,command=before.start.command;
  const oldNext=command.next,ids=Object.keys(blocks._blocks),textId=before.start.literal.text.id;
  const unchanged=JSON.stringify(Object.fromEntries(Object.entries(blocks._blocks).filter(([id])=>id!==textId)));
  await applyProjectPalette(run.vm,colors,before.signature);
  assert.equal(command.next,oldNext);assert.deepEqual(Object.keys(blocks._blocks),ids);
  assert.equal(JSON.stringify(Object.fromEntries(Object.entries(blocks._blocks).filter(([id])=>id!==textId))),unchanged);
  assert.equal(blocks.getBlock(textId).fields.TEXT.value,paletteHex(colors));
 }finally{clearStrayTimers();}
});
test('stale project edits, dynamic startup expressions and invalid colors reject without block mutation',async()=>{
 const run=await fixture(colors);try{
  const before=inspectProjectPalette(run.vm),blocks=before.start.target.blocks;
  blocks.changeBlock({id:before.start.literal.text.id,element:'field',name:'TEXT',value:'000000'.repeat(16)});
  const edited=snapshot(run.vm);await assert.rejects(applyProjectPalette(run.vm,colors,before.signature),/changed/);assert.equal(snapshot(run.vm),edited);
  await assert.rejects(applyProjectPalette(run.vm,colors.slice(1)),/16 RGB/);assert.equal(snapshot(run.vm),edited);
  blocks.getBlock(before.start.literal.text.id).shadow=false;
  const dynamic=inspectProjectPalette(run.vm);assert.equal(dynamic.kind,'dynamic');const frozen=snapshot(run.vm);
  await assert.rejects(applyProjectPalette(run.vm,colors,dynamic.signature),/expression/);assert.equal(snapshot(run.vm),frozen);
 }finally{clearStrayTimers();}
});

test('later palette commands remain intact and multiple startup palettes are rejected',async()=>{
 const run=await fixture(colors);try{
  const initial=inspectProjectPalette(run.vm),blocks=initial.start.target.blocks;
  const later={id:'laterPalette',opcode:'arcade_setPalette',inputs:{DATA:{name:'DATA',block:'laterText',shadow:'laterText'}},fields:{},next:null,parent:null,shadow:false,topLevel:false};
  blocks.createBlock({id:'laterText',opcode:'text',inputs:{},fields:{TEXT:{name:'TEXT',value:'010203'.repeat(16)}},next:null,parent:later.id,shadow:true,topLevel:false});
  blocks.createBlock(later);
  const first=initial.start.command.next;
  blocks.moveBlock({id:later.id,newParent:initial.start.command.id});
  if(first)blocks.moveBlock({id:first,newParent:later.id});
  const before=inspectProjectPalette(run.vm);assert.equal(before.laterChanges,true);
  await applyProjectPalette(run.vm,DEFAULT_PROJECT_PALETTE,before.signature);
  assert.equal(blocks.getBlock('laterText').fields.TEXT.value,'010203'.repeat(16));
  run.vm.greenFlag();await stepFrames(run.vm,12);assert.deepEqual(run.vm.runtime.bwArcadeDeviceState.palette,Array(16).fill('#010203'));
  blocks.createBlock({id:'otherFlag',opcode:'event_whenflagclicked',inputs:{},fields:{},next:null,parent:null,shadow:false,topLevel:true});
  blocks.moveBlock({id:later.id,oldParent:initial.start.command.id,newParent:'otherFlag'});
  const conflict=inspectProjectPalette(run.vm);assert.equal(conflict.kind,'conflict');const frozen=snapshot(run.vm);
  await assert.rejects(applyProjectPalette(run.vm,colors,conflict.signature),/multiple/);assert.equal(snapshot(run.vm),frozen);
 }finally{clearStrayTimers();}
});

test('extension load failure and project edits during extension loading do not mutate blocks',async()=>{
 const run=await fixture(colors);try{
  const before=inspectProjectPalette(run.vm),primitive=run.vm.runtime._primitives.arcade_setPalette;
  delete run.vm.runtime._primitives.arcade_setPalette;
  const frozen=snapshot(run.vm);
  run.vm.extensionManager.loadExtensionURL=async()=>{throw new Error('load failed');};
  await assert.rejects(applyProjectPalette(run.vm,colors,before.signature),/load failed/);assert.equal(snapshot(run.vm),frozen);
  run.vm.extensionManager.loadExtensionURL=async()=>{
   before.start.target.blocks.changeBlock({id:before.start.literal.text.id,element:'field',name:'TEXT',value:'000000'.repeat(16)});
   run.vm.runtime._primitives.arcade_setPalette=primitive;
  };
  await assert.rejects(applyProjectPalette(run.vm,colors,before.signature),/changed/);
  assert.equal(before.start.literal.text.fields.TEXT.value,'000000'.repeat(16));
 }finally{clearStrayTimers();}
});
